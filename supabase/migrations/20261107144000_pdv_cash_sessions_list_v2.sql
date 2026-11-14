-- Leituras publicas do caixa v2 por projecoes SECURITY DEFINER.
--
-- IMPORTANTE: o SELECT de authenticated em `pdv_cash_sessions` permanece por
-- enquanto. O fluxo legado ainda consulta a tabela diretamente em
-- `usePdvCashRegister`; retirar o privilegio antes de migrar esse consumidor
-- quebraria o caixa antigo. O V2 deixa de depender desse SELECT nesta entrega.

CREATE OR REPLACE FUNCTION public.pdv_list_cash_terminals_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', terminal.id, 'name', terminal.name)
      ORDER BY terminal.sort_order, terminal.name, terminal.id
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.pdv_terminals terminal
  WHERE terminal.company_id = v_context.company_id
    AND terminal.is_active IS TRUE;

  RETURN v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_list_cash_sessions_v2(
  p_status text,
  p_terminal_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_can_manage boolean := false;
  v_rows jsonb := '[]'::jsonb;
  v_has_more boolean := false;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  p_status := lower(btrim(COALESCE(p_status, '')));
  IF p_status NOT IN ('aberta', 'fechada') THEN
    RAISE EXCEPTION 'Estado de caixa inválido.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_LIST_STATUS_INVALID';
  END IF;
  IF p_page IS NULL OR p_page < 0
     OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'Paginação de caixas inválida.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_LIST_PAGE_INVALID';
  END IF;

  v_can_manage := public.is_admin_or_gestor(v_context.user_id)
    OR EXISTS (
      SELECT 1
        FROM public.user_permissions permission
       WHERE permission.user_id = v_context.user_id
         AND permission.is_active
         AND (
           permission.permissions ? '*'
           OR permission.permissions ? 'fn:edit_pdv_sales'
         )
    );

  IF p_terminal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.pdv_terminals terminal
     WHERE terminal.id = p_terminal_id
       AND terminal.company_id = v_context.company_id
  ) THEN
    RAISE EXCEPTION 'Terminal não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_TERMINAL_NOT_FOUND';
  END IF;

  IF p_operator_id IS NOT NULL THEN
    IF NOT v_can_manage AND p_operator_id IS DISTINCT FROM v_context.user_id THEN
      RAISE EXCEPTION 'Você não pode consultar os caixas de outro operador.'
        USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.profiles profile
       WHERE profile.user_id = p_operator_id
         AND profile.company_id = v_context.company_id
    ) THEN
      RAISE EXCEPTION 'Operador não encontrado.'
        USING ERRCODE = 'P0002', DETAIL = 'PDV_OPERATOR_NOT_FOUND';
    END IF;
  END IF;

  WITH authorized AS (
    SELECT
      session.id,
      session.company_id,
      session.terminal_id,
      session.opened_by,
      session.opened_at,
      session.opening_amount,
      session.cash_account_id,
      session.cash_account_name_snapshot,
      session.contract_version,
      session.status,
      session.closed_at,
      session.counted_amount,
      session.expected_amount,
      session.difference,
      session.notes,
      terminal.name AS terminal_name,
      COALESCE(
        NULLIF(btrim(profile.full_name), ''),
        NULLIF(btrim(profile.email), ''),
        'Operador'
      ) AS operator_name,
      row_number() OVER (
        ORDER BY
          CASE WHEN p_status = 'aberta' THEN session.opened_at END ASC,
          CASE WHEN p_status = 'fechada' THEN session.closed_at END DESC,
          session.id
      ) AS ordinal
    FROM public.pdv_cash_sessions session
    JOIN public.pdv_terminals terminal
      ON terminal.id = session.terminal_id
     AND terminal.company_id = session.company_id
    LEFT JOIN public.profiles profile
      ON profile.user_id = session.opened_by
     AND profile.company_id = session.company_id
    WHERE session.company_id = v_context.company_id
      AND session.contract_version = 2
      AND session.status = p_status
      AND (v_can_manage OR session.opened_by = v_context.user_id)
      AND (p_terminal_id IS NULL OR session.terminal_id = p_terminal_id)
      AND (p_operator_id IS NULL OR session.opened_by = p_operator_id)
  ), paged AS (
    SELECT *
      FROM authorized
     WHERE ordinal > (p_page * p_page_size)
       AND ordinal <= (p_page * p_page_size) + p_page_size + 1
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'company_id', row.company_id,
          'terminal_id', row.terminal_id,
          'terminal_name', row.terminal_name,
          'opened_by', row.opened_by,
          'operator_name', row.operator_name,
          'opened_at', row.opened_at,
          'opening_amount', round(row.opening_amount, 2),
          'cash_account_id', row.cash_account_id,
          'cash_account_name_snapshot', row.cash_account_name_snapshot,
          'contract_version', row.contract_version,
          'status', row.status,
          'closed_at', row.closed_at,
          'counted_amount', row.counted_amount,
          'expected_amount', row.expected_amount,
          'difference', row.difference,
          'notes', row.notes
        ) ORDER BY row.ordinal
      ) FILTER (
        WHERE row.ordinal <= (p_page * p_page_size) + p_page_size
      ),
      '[]'::jsonb
    ),
    count(*) > p_page_size
  INTO v_rows, v_has_more
  FROM paged row;

  RETURN jsonb_build_object('rows', v_rows, 'has_more', v_has_more);
END
$fn$;

-- Presenca empresarial sem expor operador, terminal ou valores. Esta funcao
-- impede o rollback do rollout enquanto qualquer sessao v2 ainda estiver
-- aberta, inclusive quando pertence a outro operador.
CREATE OR REPLACE FUNCTION public.pdv_has_open_cash_session_v2()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  RETURN EXISTS (
    SELECT 1
      FROM public.pdv_cash_sessions session
     WHERE session.company_id = v_context.company_id
       AND session.contract_version = 2
       AND session.status = 'aberta'
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_list_cash_terminals_v2()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_has_open_cash_session_v2()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pdv_list_cash_terminals_v2()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_has_open_cash_session_v2()
  TO authenticated;

COMMENT ON FUNCTION public.pdv_list_cash_sessions_v2(text,uuid,uuid,integer,integer) IS
  'Lista paginada e multi-tenant de sessoes v2. Operador ve apenas as proprias; gestor ou permissao explicita ve a empresa.';
COMMENT ON FUNCTION public.pdv_has_open_cash_session_v2() IS
  'Informa somente se a empresa possui sessao v2 aberta, sem expor detalhes de outro operador.';

-- ---------------------------------------------------------------------------
-- Gate financeiro dos eventos manuais do caixa.
-- ---------------------------------------------------------------------------
-- `pdv_record_cash_event_v2` grava fato financeiro e custodia na mesma
-- transacao. Supply/withdrawal sao operacao normal do dono da gaveta; receita,
-- despesa e estorno manuais exigem a mesma permissao do Financeiro. O trigger
-- roda dentro da RPC, antes da linha de custodia; se negar, o INSERT financeiro
-- anterior e revertido junto pela atomicidade da transacao.

CREATE OR REPLACE FUNCTION public.pdv_assert_manual_cash_event_permission_v2(
  p_user_id uuid,
  p_entry_kind text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF p_entry_kind NOT IN ('cash_receipt', 'cash_payment', 'refund') THEN
    RETURN;
  END IF;

  IF p_user_id IS NULL
     OR (
       NOT public.is_admin_or_gestor(p_user_id)
       AND NOT EXISTS (
         SELECT 1
           FROM public.user_permissions permission
          WHERE permission.user_id = p_user_id
            AND permission.is_active
            AND (
              permission.permissions ? '*'
              OR permission.permissions ? 'fn:manage_finance'
            )
       )
     )
  THEN
    RAISE EXCEPTION 'Você não tem permissão para lançar receitas, despesas ou estornos no caixa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_FINANCE_EVENT_FORBIDDEN';
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_guard_manual_cash_event_permission_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  -- Eventos criados pela RPC publica carregam a chave `notes`. Recebimentos de
  -- venda/baixa usam metadado proprio e continuam permitidos ao operador que
  -- possui acesso ao fluxo comercial.
  IF NEW.entry_kind IN ('cash_receipt', 'cash_payment', 'refund')
     AND NEW.metadata ? 'notes'
  THEN
    PERFORM public.pdv_assert_manual_cash_event_permission_v2(
      NEW.created_by,
      NEW.entry_kind
    );
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS tg_pdv_guard_manual_cash_event_permission_v2
  ON public.pdv_cash_custody_entries;
CREATE TRIGGER tg_pdv_guard_manual_cash_event_permission_v2
  BEFORE INSERT ON public.pdv_cash_custody_entries
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_manual_cash_event_permission_v2();

REVOKE ALL ON FUNCTION public.pdv_assert_manual_cash_event_permission_v2(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_guard_manual_cash_event_permission_v2()
  FROM PUBLIC, anon, authenticated, service_role;
