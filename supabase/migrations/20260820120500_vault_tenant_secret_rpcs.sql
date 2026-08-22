-- =====================================================================
-- RPCs de Vault por tenant (BYO Asaas) — guardar/ler/apagar segredo
-- =====================================================================
-- CONTEXTO: no modelo BYO ("traga sua conta Asaas"), cada tenant tem sua
-- própria API key e o token do webhook. São N segredos (1 por company),
-- então NÃO cabem em Deno.env (1 valor global por função). O mecanismo
-- canônico de segredo do projeto é o Supabase Vault (os crons já leem
-- vault.decrypted_secrets). Estas RPCs são a ponte: o schema `vault` não é
-- acessível via PostgREST/anon, então a edge (service_role) grava/lê/apaga
-- os segredos SÓ por estas funções SECURITY DEFINER.
--
-- Naming determinístico por company (§9.1 do plano):
--   API key    : tenant_asaas_key_<company_id>
--   webhook tok: tenant_asaas_webhook_token_<company_id>
-- A coluna tenant_payment_accounts.vault_secret_name / webhook_auth_token_name
-- guarda o NOME (estável, previsível), nunca o segredo em claro.
--
-- API REAL do Vault neste projeto (introspecção pg_proc 2026-08-20):
--   vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid) -> uuid
--   vault.update_secret(secret_id uuid, new_secret text, new_name text, new_description text, new_key_id uuid)
--   leitura: SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ...
--   (não existe vault.delete_secret → DELETE FROM vault.secrets WHERE name = ...)
-- update_secret recebe o UUID do secret, não o name → o upsert resolve o
-- uuid pelo name antes de decidir create vs update.
--
-- SEGURANÇA (INVARIANTE): funções novas no schema public ganham EXECUTE por
-- default para anon/authenticated (default privileges). REVOKE FROM PUBLIC
-- NÃO basta — sem o REVOKE por-role, a API key de Asaas de qualquer tenant
-- ficaria legível por qualquer usuário logado. Por isso: REVOKE explícito de
-- PUBLIC + anon + authenticated e GRANT só a service_role. A edge (service_role)
-- é o único caller; a validação de posse da company é responsabilidade da edge
-- (ela resolve company_id do JWT/profile, monta o name e chama a RPC).
-- Idempotente (CREATE OR REPLACE + REVOKE/GRANT repetíveis).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) UPSERT — grava (1ª vez) ou atualiza (re-ativação) o segredo por name
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vault_upsert_tenant_secret(
  p_name   text,
  p_secret text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'vault_upsert_tenant_secret: p_name obrigatório';
  END IF;
  IF p_secret IS NULL OR length(p_secret) = 0 THEN
    RAISE EXCEPTION 'vault_upsert_tenant_secret: p_secret obrigatório';
  END IF;

  -- name é UNIQUE no Vault; resolve o uuid existente (se houver).
  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = p_name
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    -- 1ª vez: cria. description ajuda auditoria; key_id NULL = chave default.
    v_secret_id := vault.create_secret(
      p_secret,
      p_name,
      'Tenant BYO Asaas secret (gerenciado por vault_upsert_tenant_secret)',
      NULL
    );
  ELSE
    -- re-ativação: rotaciona o valor mantendo o mesmo name/uuid.
    PERFORM vault.update_secret(
      v_secret_id,
      p_secret,
      p_name,
      'Tenant BYO Asaas secret (rotacionado por vault_upsert_tenant_secret)',
      NULL
    );
  END IF;

  RETURN v_secret_id;
END;
$$;

COMMENT ON FUNCTION public.vault_upsert_tenant_secret(text, text) IS
  'BYO Asaas: grava/rotaciona um segredo do tenant no Vault por name determinístico (tenant_asaas_key_<company_id> / tenant_asaas_webhook_token_<company_id>). SECURITY DEFINER, só service_role (edge tenant-asaas-provision). Retorna o uuid do vault.secrets. Nunca expor ao client.';

REVOKE ALL ON FUNCTION public.vault_upsert_tenant_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_upsert_tenant_secret(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.vault_upsert_tenant_secret(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vault_upsert_tenant_secret(text, text) TO service_role;

-- ---------------------------------------------------------------------
-- 2) READ — decripta e devolve o segredo pra edge ler no runtime
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vault_read_tenant_secret(
  p_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'vault_read_tenant_secret: p_name obrigatório';
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;

  -- Sem segredo pra esse name → NULL (edge trata como fail-closed).
  RETURN v_secret;
END;
$$;

COMMENT ON FUNCTION public.vault_read_tenant_secret(text) IS
  'BYO Asaas: decripta e retorna o segredo do tenant do Vault pelo name. SECURITY DEFINER, só service_role (edges tenant-asaas-*). A chave existe só na memória do isolate da edge; nunca vai pro client nem pra log. Nunca expor ao client.';

REVOKE ALL ON FUNCTION public.vault_read_tenant_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_read_tenant_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.vault_read_tenant_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vault_read_tenant_secret(text) TO service_role;

-- ---------------------------------------------------------------------
-- 3) DELETE — apaga o segredo no deactivate (não deixa chave órfã)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vault_delete_tenant_secret(
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'vault_delete_tenant_secret: p_name obrigatório';
  END IF;

  -- Não existe vault.delete_secret; o Vault mantém a linha em vault.secrets.
  DELETE FROM vault.secrets WHERE name = p_name;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- true se apagou algo, false se não existia (idempotente no deactivate).
  RETURN v_deleted > 0;
END;
$$;

COMMENT ON FUNCTION public.vault_delete_tenant_secret(text) IS
  'BYO Asaas: apaga o segredo do tenant no Vault pelo name (usado no deactivate, não deixa chave órfã). SECURITY DEFINER, só service_role. Retorna true se apagou, false se não existia. Nunca expor ao client.';

REVOKE ALL ON FUNCTION public.vault_delete_tenant_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_delete_tenant_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.vault_delete_tenant_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.vault_delete_tenant_secret(text) TO service_role;
