-- ============================================================================
-- Correção de segurança: falta de checagem de posse por tenant em duas RPCs
-- SECURITY DEFINER, e fechamento de 4 RPCs mortas ainda abertas para anon.
--
-- CONTEXTO (auditoria 2026-09-12 fechou o EXECUTE de anon nas RPCs SECURITY
-- DEFINER, mas não mexeu em NENHUM corpo de função). Duas delas continuam
-- abertas ENTRE usuários logados porque nunca tiveram checagem de posse:
--
--   generate_ponto_slug(uuid)               — gera/retorna o link público de
--                                              ponto de QUALQUER employee_id.
--   reassign_contract_pending_orders(uuid,uuid,uuid) — reatribui technician_id
--                                              /team_id de TODAS as OSs não
--                                              realizadas de QUALQUER contract_id.
--
-- As duas são SECURITY DEFINER: a RLS não protege (o corpo roda como dono da
-- função, não como o chamador). Sem guarda, um usuário autenticado da empresa
-- A, sabendo um UUID de contrato/funcionário da empresa B, conseguia:
--   - reatribuir as OSs da empresa B pra um técnico à escolha (sabotagem/DoS
--     operacional), e
--   - gerar/ler o link público de ponto de um funcionário de outra empresa.
--
-- ⚠️ ARMADILHA EVITADA (já derrubou pay_payroll_transaction nesta base —
-- 20260912140000, linha ~100): NÃO escrever a guarda como
--   `IF auth.uid() IS NOT NULL AND <checagem> THEN RAISE`
-- Isso é FAIL-OPEN: com anon OU com service_role, auth.uid() é NULL, a
-- condição inteira vira FALSE e a guarda é PULADA (a exceção nunca dispara).
-- Também NÃO usar `IF NOT (get_user_company_id(auth.uid()) = v_company_id OR
-- is_super_admin(...))` puro: get_user_company_id(NULL) é NULL, `NULL = x` é
-- NULL, `NULL OR false` é NULL, `NOT NULL` é NULL, e um IF com NULL PULA o
-- bloco (plpgsql trata NULL como false só pro ramo THEN, não dispara o ELSE
-- implícito de exceção) — outro fail-open silencioso pro mesmo cenário.
--
-- PADRÃO USADO AQUI (fail-closed de verdade): variável booleana que NASCE
-- false e só vira true por condição EXPLÍCITA e nunca-NULL:
--   - auth.role() = 'service_role'   → detecta backend PELO PAPEL, não por
--     auth.uid() ser NULL (auth.role() nunca é NULL numa chamada via
--     PostgREST — vem do JWT claim role, presente em toda chamada anon/
--     authenticated/service_role).
--   - get_user_company_id(auth.uid()) IS NOT NULL AND = v_company_id → posse
--     comprovada (comparação só acontece depois de confirmar não-NULL).
--   - is_super_admin(auth.uid()) → sempre boolean (EXISTS), nunca NULL.
-- `IF NOT v_is_authorized` no fim: v_is_authorized é sempre true/false,
-- nunca NULL — não há caminho de fuga.
--
-- QUEM CHAMA HOJE (grep em src/ e supabase/functions/, zero achado em edge
-- function ou cron):
--   - generate_ponto_slug            → src/pages/Employees.tsx:365 (client,
--     supabase.rpc, usuário autenticado logado no painel).
--   - reassign_contract_pending_orders → src/hooks/useContracts.ts:2501
--     (client, supabase.rpc, no save de edição de contrato).
-- Nenhum caller service_role encontrado — mas o ramo service_role foi mantido
-- na guarda por precaução (mesmo padrão de guard_profiles_is_active e
-- pay_payroll_transaction) e porque o GRANT já inclui service_role.
--
-- ⚠️ CREATE OR REPLACE SEM MUDAR ASSINATURA (DROP levaria os GRANTs junto).
-- Corpo abaixo partiu de pg_get_functiondef() da DEFINIÇÃO VIVA (conferida em
-- 2026-09-16), não do arquivo de migration antigo — as duas bateram
-- byte-a-byte com a migration original (generate_ponto_slug(uuid) 1 param;
-- reassign_contract_pending_orders(uuid,uuid,uuid) 3 params), então não há
-- risco de sobrecarga aqui, mas a checagem foi feita mesmo assim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) reassign_contract_pending_orders — guarda de posse por tenant
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reassign_contract_pending_orders(
  p_contract_id uuid,
  p_technician_id uuid,
  p_team_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id     uuid;
  v_count          integer := 0;
  v_is_authorized  boolean := false;
BEGIN
  IF p_contract_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Deriva o tenant a partir do contrato (fonte da verdade do isolamento).
  SELECT company_id INTO v_company_id
  FROM public.contracts
  WHERE id = p_contract_id;

  IF v_company_id IS NULL THEN
    -- Contrato inexistente (ou sem company) → nada a fazer.
    RETURN 0;
  END IF;

  -- Guarda de posse (fail-closed): v_is_authorized nasce false, só vira true
  -- por condição explícita e nunca-NULL. Ver nota da migration no topo.
  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
        AND public.get_user_company_id(auth.uid()) = v_company_id THEN
    v_is_authorized := true;
  ELSIF public.is_super_admin(auth.uid()) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Sem permissao para reatribuir OSs do contrato %', p_contract_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.service_orders
  SET
    technician_id = p_technician_id,
    team_id = p_team_id,
    updated_at = now()
  WHERE contract_id = p_contract_id
    AND company_id = v_company_id
    AND status NOT IN ('concluida', 'cancelada');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.reassign_contract_pending_orders(uuid, uuid, uuid) IS
  'Propaga technician_id/team_id do contrato pras OSs não realizadas (status NOT IN concluida/cancelada). company_id derivado do contrato pra isolamento multi-tenant. Guarda de posse fail-closed: só service_role, dono da mesma empresa do contrato, ou super_admin (2026-09-16 — fechou vazamento entre tenants via SECURITY DEFINER). Retorna a qtd de OSs atualizadas.';

GRANT EXECUTE ON FUNCTION public.reassign_contract_pending_orders(uuid, uuid, uuid)
  TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) generate_ponto_slug — guarda de posse por tenant
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_ponto_slug(p_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_name          text;
  v_existing      text;
  v_company_id    uuid;
  v_is_authorized boolean := false;
  v_base          text;
  v_alphabet      text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, sem 0/O/1/I/L
  v_code          text;
  v_candidate     text;
  v_bytes         bytea;
  v_attempt       int;
  i               int;
  v_taken         boolean;
BEGIN
  -- Lê nome, slug atual e o tenant dono do funcionário.
  SELECT name, ponto_slug, company_id INTO v_name, v_existing, v_company_id
  FROM public.employees
  WHERE id = p_employee_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado.';
  END IF;

  -- Guarda de posse (fail-closed): v_is_authorized nasce false, só vira true
  -- por condição explícita e nunca-NULL. Ver nota da migration no topo.
  IF auth.role() = 'service_role' THEN
    v_is_authorized := true;
  ELSIF public.get_user_company_id(auth.uid()) IS NOT NULL
        AND public.get_user_company_id(auth.uid()) = v_company_id THEN
    v_is_authorized := true;
  ELSIF public.is_super_admin(auth.uid()) THEN
    v_is_authorized := true;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Sem permissao para gerar o link de ponto deste funcionario'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotente: já tem slug → retorna o existente, não regenera.
  IF v_existing IS NOT NULL AND v_existing <> '' THEN
    RETURN v_existing;
  END IF;

  -- slugify do nome:
  --   1) minúsculas
  --   2) remove acentos (translate — unaccent não está instalado)
  --   3) troca não-alfanumérico por '-'
  --   4) colapsa hífens repetidos
  --   5) trim de hífens nas pontas
  --   6) trunca em ~40 chars
  v_base := lower(v_name);
  v_base := translate(
    v_base,
    'áàâãäåçéèêëíìîïñóòôõöúùûüýÿ',
    'aaaaaaceeeeiiiinooooouuuuyy'
  );
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '-+', '-', 'g');
  v_base := trim(both '-' from v_base);
  v_base := left(v_base, 40);
  v_base := trim(both '-' from v_base); -- caso o corte tenha deixado hífen na ponta
  IF v_base = '' THEN
    v_base := 'funcionario';
  END IF;

  -- Loop até achar slug único (máx. 50 tentativas)
  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;

    -- Código base32 de 8 chars usando gen_random_bytes
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    FOR i IN 0..7 LOOP
      -- 1 byte (0..255) mapeado pra índice 1..31 do alfabeto
      v_code := v_code || substr(
        v_alphabet,
        (get_byte(v_bytes, i) % 31) + 1,
        1
      );
    END LOOP;

    v_candidate := v_base || '-' || v_code;

    SELECT EXISTS (
      SELECT 1 FROM public.employees WHERE ponto_slug = v_candidate
    ) INTO v_taken;

    EXIT WHEN NOT v_taken;

    IF v_attempt >= 50 THEN
      RAISE EXCEPTION 'Não foi possível gerar um link de ponto único após 50 tentativas. Tente novamente.';
    END IF;
  END LOOP;

  UPDATE public.employees
  SET ponto_slug = v_candidate
  WHERE id = p_employee_id;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.generate_ponto_slug(uuid) IS
  'Gera (ou retorna existente, idempotente) o slug público de ponto do funcionário. Guarda de posse fail-closed: só service_role, dono da mesma empresa do funcionário, ou super_admin (2026-09-16 — fechou vazamento entre tenants via SECURITY DEFINER).';

GRANT EXECUTE ON FUNCTION public.generate_ponto_slug(uuid) TO authenticated, service_role;

-- ============================================================================
-- 3) Fecha as 4 RPCs mortas mantidas abertas "por precaução" na auditoria
--    20260912150000 (BLOCO 3). Confirmado nesta migration:
--      - única ocorrência de cada uma no repo é src/integrations/supabase/
--        types.ts (gerado automaticamente do schema — reflexo, não uso);
--      - zero chamada em src/ e em supabase/functions/;
--      - a migration que criou get_portal_by_token/get_quote_by_token/
--        get_rating_by_token (20260418165758) é anterior à que criou a
--        substituta viva get_portal_data + get_rating_with_os_by_token
--        (20260607140000/20260607150000/20260607160000), e o código atual
--        confirma a troca:
--          CustomerPortal.tsx:242  → get_portal_data
--          ProposalPublic.tsx:129  → get_quote_public_payload
--          useServiceRatings.ts:91 → submit_public_os_rating (leitura via
--                                     get_public_os, sem token)
--
-- DECISÃO SOBRE `authenticated`: revogado também. São 4 funções mortas de
-- ponta a ponta — nem anon, nem authenticated, nem edge function alguma as
-- chama hoje. Não faz sentido manter `authenticated` "por via das dúvidas":
-- se aparecer uso legítimo futuro, o GRANT volta numa migration nova com o
-- caller citado (arquivo:linha), do jeito que todo GRANT nesta base nasce.
-- `service_role` foi mantido (mesmo padrão do BLOCO 1 da 20260912150000, pra
-- funções sem caller de frontend: zero-custo, e não fecha a porta pra um
-- backfill/rotina futura que precise ler por token sem reimplementar).
-- ============================================================================
DO $$
DECLARE
  r        record;
  v_sig    text;
  v_pulou  int := 0;
  v_ok     int := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.get_portal_by_token(text)'),
      ('public.get_quote_by_token(text)'),
      ('public.get_rating_by_token(text)'),
      ('public.get_rating_with_os_by_token(text)')
    ) AS t(sig)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE NOTICE 'pulando (funcao inexistente neste ambiente): %', r.sig;
      v_pulou := v_pulou + 1;
      CONTINUE;
    END IF;
    v_sig := to_regprocedure(r.sig)::text;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    v_ok := v_ok + 1;
  END LOOP;
  RAISE NOTICE '[RPCs mortas fechadas] ajustadas: %, puladas: %', v_ok, v_pulou;
END $$;

-- ----------------------------------------------------------------------------
-- Verificação pós-aplicação (rodar manualmente):
--   SELECT p.oid::regprocedure::text AS sig,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  AS svc_exec
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('get_portal_by_token','get_quote_by_token',
--                         'get_rating_by_token','get_rating_with_os_by_token')
--    ORDER BY 1;
--   -- esperado: anon_exec = false, auth_exec = false, svc_exec = true nas 4.
-- ----------------------------------------------------------------------------
