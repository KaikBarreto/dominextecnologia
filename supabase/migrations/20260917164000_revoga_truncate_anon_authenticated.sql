-- ============================================================================
-- Correcao 2: tirar TRUNCATE de authenticated e anon no schema public
--
-- POR QUE: TRUNCATE **ignora RLS**. Levantamento de 2026-09-17 no prod:
--   postgres      180 relacoes com TRUNCATE
--   service_role  180
--   authenticated 171   <-- aqui
--   anon          168   <-- e aqui
-- Nao foi ninguem que concedeu: vem do ACL DEFAULT do projeto Supabase
-- (pg_default_acl, role postgres, schema public => anon/authenticated com
-- arwdDxtm, onde 'D' e TRUNCATE). Toda tabela criada por migration nasce assim.
--
-- VERIFICADO ANTES DE APLICAR (nao quebra nada):
--   * `grep -rn TRUNCATE src/` => zero. As ocorrencias de "truncate" no front
--     sao a classe CSS do Tailwind e um helper de string em pmoc-portal-share.
--   * Nenhuma edge function emite TRUNCATE.
--   * pg_proc no prod: a UNICA funcao do schema public cujo corpo contem
--     "truncat" e public.upsert_compute_catalog — SECURITY DEFINER, owner
--     postgres, e postgres MANTEM o privilegio. Nao depende do chamador.
--   * "Zerar Sistema" (reset_system_audit_start / reset_system_step) e
--     SECURITY DEFINER com owner postgres e usa DELETE, nao TRUNCATE.
--   * service_role e postgres NAO sao tocados.
--
-- HONESTIDADE SOBRE O RISCO REAL: nao encontramos caminho de exploracao direto
-- pelo PostgREST (o gateway so expoe SELECT/INSERT/UPDATE/DELETE e RPC, nunca
-- DDL/TRUNCATE). Isto e endurecimento em profundidade: fecha o estrago caso
-- alguma RPC SECURITY INVOKER futura monte SQL dinamico com entrada do usuario.
-- O projeto ja fazia isso pontualmente — ver
-- 20260903182000_nfse_catalogos_tributacao_e_nbs.sql e
-- 20260912180000_tenant_charges_subscriptions_select_only.sql. Aqui a pratica
-- vira regra geral do schema.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Passado: revogar do que ja existe (tabelas + views do schema public)
--    REVOKE e naturalmente idempotente.
-- ---------------------------------------------------------------------------
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. Futuro: tabela nova nao nasce mais com TRUNCATE pra esses papeis.
--
--    ATENCAO: ALTER DEFAULT PRIVILEGES e POR PAPEL CRIADOR. Neste projeto as
--    174 tabelas do schema public sao TODAS owned by `postgres` — que e o papel
--    com que `supabase db push` e a Management API se conectam. Logo o default
--    de `postgres` cobre 100% do que as nossas migrations criam.
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM authenticated;

-- Existe TAMBEM um default ACL de `supabase_admin` no schema public com os
-- mesmos grants. `postgres` nao e membro de `supabase_admin` (superusuario da
-- plataforma), entao provavelmente NAO conseguimos altera-lo daqui. Tentamos e
-- registramos o resultado em vez de fingir que fechou: se falhar, tabela criada
-- PELA PLATAFORMA (instalacao de extensao, etc.) ainda pode nascer com TRUNCATE.
-- Tabela criada por migration nossa, nao.
DO $ta$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM authenticated';
  RAISE NOTICE 'default privileges de supabase_admin ajustados';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'NAO foi possivel alterar default privileges de supabase_admin (esperado, falta membership): %', SQLERRM;
END
$ta$;

-- ---------------------------------------------------------------------------
-- 3. Guarda: a migration falha se sobrar qualquer TRUNCATE pra anon/authenticated
--    e tambem se service_role/postgres tiverem sido atingidos por engano.
-- ---------------------------------------------------------------------------
DO $guard$
DECLARE
  v_leak       integer;
  v_privileged integer;
BEGIN
  SELECT count(*) INTO v_leak
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND privilege_type = 'TRUNCATE'
    AND grantee IN ('anon', 'authenticated');

  IF v_leak <> 0 THEN
    RAISE EXCEPTION 'Sobraram % relacoes com TRUNCATE para anon/authenticated', v_leak;
  END IF;

  SELECT count(*) INTO v_privileged
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND privilege_type = 'TRUNCATE'
    AND grantee IN ('service_role', 'postgres');

  IF v_privileged = 0 THEN
    RAISE EXCEPTION 'TRUNCATE foi removido de service_role/postgres — rotina privilegiada quebraria';
  END IF;

  RAISE NOTICE 'TRUNCATE: 0 para anon/authenticated, % preservadas para service_role+postgres', v_privileged;
END
$guard$;
