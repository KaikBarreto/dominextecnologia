-- =============================================================================
-- PMOC v1.9.1 — Onda B: Portal Público PMOC + QR Code
-- =============================================================================
-- Plano mestre: docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md
-- Plano da onda: docs/planos/2026-05-23-pmoc-onda-B-portal-publico.md
-- Regras de RLS (VINCULANTE): docs/planos/2026-05-23-pmoc-portal-rls-rules.md
--
-- Escopo desta migration:
--   1. Coluna contracts.public_pmoc_token + índice único parcial.
--   2. Função generate_pmoc_token() — hex 32 chars (128 bits de entropia).
--   3. Trigger ensure_pmoc_token: cria/limpa token quando is_pmoc muda.
--   4. Backfill: gera token pros contratos PMOC já existentes (Onda A).
--   5. RPC regenerate_pmoc_token(uuid) — admin/gestor/super_admin.
--      Mensagens de erro unificadas em 'contract_not_found' (oracle blindado).
--
-- Toda a migration em uma transação. ROLLBACK automático se algo falhar.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Coluna public_pmoc_token + índice único parcial
-- -----------------------------------------------------------------------------

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS public_pmoc_token text;

COMMENT ON COLUMN public.contracts.public_pmoc_token IS
  'Token público estável (32 chars hex, 128 bits de entropia) usado pelo Portal PMOC público. '
  'Gerado automaticamente pelo trigger ensure_pmoc_token quando is_pmoc=true. '
  'Nullificado quando is_pmoc=false. Regenerável via RPC regenerate_pmoc_token.';

-- Índice único parcial: só contratos com token preenchido participam da unique-ness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_public_pmoc_token
  ON public.contracts(public_pmoc_token)
  WHERE public_pmoc_token IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Função generate_pmoc_token()
--    Hex 32 chars a partir de gen_random_bytes(16) — 128 bits criptograficamente
--    seguros, URL-safe, case-insensitive natural. Validável via regex
--    ^[0-9a-f]{32}$ no edge antes de tocar o banco.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_pmoc_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(gen_random_bytes(16), 'hex');
END;
$$;

COMMENT ON FUNCTION public.generate_pmoc_token() IS
  'Gera token público estável de 32 chars hex (128 bits). Usado pelo trigger '
  'ensure_pmoc_token e pela RPC regenerate_pmoc_token. NÃO chamar diretamente do client.';

-- -----------------------------------------------------------------------------
-- 3. Trigger ensure_pmoc_token
--    - is_pmoc=true E token NULL → gera token novo.
--    - is_pmoc=false → limpa token (RAISE NOTICE pra audit no log do Postgres).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_pmoc_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_pmoc = true AND NEW.public_pmoc_token IS NULL THEN
    NEW.public_pmoc_token := public.generate_pmoc_token();
  ELSIF NEW.is_pmoc = false AND NEW.public_pmoc_token IS NOT NULL THEN
    RAISE NOTICE '[pmoc-token] public_pmoc_token cleared for contract %', NEW.id;
    NEW.public_pmoc_token := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_pmoc_token ON public.contracts;
CREATE TRIGGER trg_ensure_pmoc_token
  BEFORE INSERT OR UPDATE OF is_pmoc ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_pmoc_token();

-- -----------------------------------------------------------------------------
-- 4. Backfill — contratos PMOC já existentes (Onda A) ganham token agora.
-- -----------------------------------------------------------------------------

DO $backfill$
DECLARE
  v_eligible int;
  v_updated int;
BEGIN
  SELECT COUNT(*) INTO v_eligible
    FROM public.contracts
   WHERE is_pmoc = true AND public_pmoc_token IS NULL;

  RAISE NOTICE '[pmoc-token backfill] Contratos PMOC sem token: %', v_eligible;

  WITH bf AS (
    UPDATE public.contracts
       SET public_pmoc_token = public.generate_pmoc_token()
     WHERE is_pmoc = true AND public_pmoc_token IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO v_updated FROM bf;

  RAISE NOTICE '[pmoc-token backfill] Tokens gerados nesta execução: %', v_updated;

  IF v_updated <> v_eligible THEN
    RAISE EXCEPTION '[pmoc-token backfill] Esperado % updates, obteve %. ROLLBACK.', v_eligible, v_updated;
  END IF;
END
$backfill$;

-- -----------------------------------------------------------------------------
-- 5. RPC regenerate_pmoc_token(uuid)
--    Checagens (RLS rules §2.4 + §2.5):
--      a) auth.uid() não-null               → 'unauthorized'
--      b) Contrato existe E mesmo tenant    → senão 'contract_not_found'
--         (oracle blindado: contrato inexistente E cross-tenant retornam a
--          MESMA mensagem para evitar enumeração de IDs alheios)
--      c) Contrato é PMOC                   → senão 'not_a_pmoc_contract'
--      d) Role admin OU gestor OU super_admin → senão 'forbidden_role'
--    super_admin Auctus bypassa a checagem de tenant (b).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.regenerate_pmoc_token(p_contract_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract_company uuid;
  v_is_pmoc boolean;
  v_user_company uuid;
  v_is_super_admin boolean;
  v_new_token text;
BEGIN
  -- (a) auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_super_admin := public.has_role(auth.uid(), 'super_admin'::app_role);

  -- Lê contrato (só o necessário pras checagens)
  SELECT company_id, is_pmoc
    INTO v_contract_company, v_is_pmoc
    FROM public.contracts
   WHERE id = p_contract_id;

  -- (b) Oracle blindado: contrato não existe OU não é do tenant → mesma mensagem
  IF v_contract_company IS NULL THEN
    RAISE EXCEPTION 'contract_not_found'
      USING ERRCODE = 'no_data_found';
  END IF;

  v_user_company := public.get_user_company_id(auth.uid());

  IF v_contract_company IS DISTINCT FROM v_user_company
     AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'contract_not_found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- (c) Tem que ser PMOC (extra anti-oracle: a Plataforma exigiu este check)
  IF v_is_pmoc IS NOT TRUE THEN
    RAISE EXCEPTION 'not_a_pmoc_contract'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (d) Role admin OU gestor OU super_admin
  IF NOT (
       public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR v_is_super_admin
  ) THEN
    RAISE EXCEPTION 'forbidden_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gera e atualiza
  v_new_token := public.generate_pmoc_token();

  UPDATE public.contracts
     SET public_pmoc_token = v_new_token,
         updated_at = now()
   WHERE id = p_contract_id;

  RETURN v_new_token;
END;
$$;

COMMENT ON FUNCTION public.regenerate_pmoc_token(uuid) IS
  'Regenera o public_pmoc_token de um contrato PMOC. '
  'Permissão: admin/gestor do mesmo tenant ou super_admin. '
  'Mensagens de erro são constantes e unificadas (oracle blindado): '
  'contrato inexistente e cross-tenant retornam a mesma mensagem.';

GRANT EXECUTE ON FUNCTION public.regenerate_pmoc_token(uuid) TO authenticated;

COMMIT;

-- =============================================================================
-- FIM da migration PMOC v1.9.1 — Onda B (portal público + QR).
--
-- Próximos passos (não-SQL, fora desta migration):
--   1. Regenerar src/integrations/supabase/types.ts
--      → supabase gen types typescript --linked > src/integrations/supabase/types.ts
--   2. Deploy das edge functions:
--      → supabase functions deploy pmoc-portal-share --no-verify-jwt
--      → supabase functions deploy generate-pmoc-qr-pdf
--   3. Limpar @ts-expect-error em src/hooks/usePmocPortal.ts (2 lugares).
--   4. Audit: contar tokens preenchidos vs contratos PMOC ativos.
--   5. Executar os 12 cenários cross-tenant da §6 de docs/planos/2026-05-23-pmoc-portal-rls-rules.md.
-- =============================================================================
