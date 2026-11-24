-- PDV: exportação DETALHADA do histórico de caixa (PDF e Excel), por caixa e por período.
--
-- POR QUE. A cliente reclamou que "não aparecem as vendas" no relatório do caixa.
-- Não é bug de tela: o relatório (pdv_cash_session_report_v2 -> pdv_cash_session_projection_v3)
-- lista SÓ pdv_cash_custody_entries, que é o livro da GAVETA (dinheiro físico).
-- Venda em PIX, cartão, fiado, vale e saldo do cliente nunca gera linha de custódia,
-- então some do relatório. E venda cancelada some por decisão de produto (18/10).
--
-- O QUE ESTA MIGRATION FAZ. Só funções novas de LEITURA, nenhuma tabela/coluna/policy:
--   * pdv_cash_export_session_build_v1(session, company)  construtor interno (sem EXECUTE p/ authenticated)
--   * pdv_cash_session_export_v1(session)                 um caixa fechado
--   * pdv_cash_export_period_v1(from, to, terminal, operator)  caixas fechados no período (fuso da empresa)
--
-- O cabeçalho é o objeto do próprio pdv_cash_session_projection_v3(id, true) (mesma função do
-- relatório atual), então bate 1:1 com ele e herda a trava de acesso (dono da sessão OU
-- pdv_can_operate_other_cash_v2) e o contexto (usuário ativo, assinatura, módulo, permissão de tela).
--
-- entries[] = fatos da gaveta (custódia, affects_drawer=true) + pagamentos de venda que NÃO passaram
-- pela gaveta (kind='sale_payment', affects_drawer=false) + venda sem pagamento registrado
-- (kind='sale_without_payment', affects_drawer=false). Vendas canceladas entram marcadas.
-- Reconstrução do esperado: soma de signed_amount com affects_drawer AND NOT is_closing_adjustment
-- = expected_amount; soma de todas com affects_drawer = final_position.

-- ---------------------------------------------------------------------------
-- 1. Construtor interno
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_cash_export_session_build_v1(p_session_id uuid, p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_header jsonb;
  v_session public.pdv_cash_sessions%ROWTYPE;
  v_was_reopened boolean;
  v_entries jsonb := '[]'::jsonb;
  v_summary jsonb;
BEGIN
  -- Trava + cabeçalho idênticos ao relatório atual (contexto de histórico, exige caixa fechado).
  v_header := public.pdv_cash_session_projection_v3(p_session_id, true);

  SELECT s.* INTO v_session
    FROM public.pdv_cash_sessions s
   WHERE s.id = p_session_id AND s.company_id = p_company_id AND s.contract_version = 2;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa indisponível para este operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
  END IF;

  v_was_reopened := EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions n
     WHERE n.company_id = v_session.company_id AND n.reopened_from_session_id = v_session.id);

  WITH custody AS (
    SELECT e.*, f.description AS f_description, f.notes AS f_notes, f.payment_method AS f_payment_method
      FROM public.pdv_cash_custody_entries e
      LEFT JOIN public.financial_transactions f
        ON f.id = e.financial_transaction_id AND f.company_id = e.company_id
     WHERE e.company_id = p_company_id
       AND e.session_id = v_session.id
       AND e.cash_account_id = v_session.cash_account_id
  ),
  custody_linked AS (
    -- Venda ligada ao fato da gaveta: mesma regra do relatório (pagamento pelo lançamento financeiro)
    -- ou, no reembolso de devolução, pdv_refunds -> pdv_commercial_returns.order_id.
    SELECT c.*, COALESCE(pay.order_id, ret.order_id) AS direct_order_id, pay.method AS pay_method
      FROM custody c
      LEFT JOIN LATERAL (
        SELECT payment.order_id, payment.method
          FROM public.pdv_order_payments payment
         WHERE payment.company_id = c.company_id
           AND c.financial_transaction_id IS NOT NULL
           AND (payment.settlement_transaction_id = c.financial_transaction_id
             OR payment.financial_transaction_id = c.financial_transaction_id)
         ORDER BY CASE WHEN payment.settlement_transaction_id = c.financial_transaction_id THEN 0 ELSE 1 END,
                  payment.received_at, payment.id
         LIMIT 1
      ) pay ON true
      LEFT JOIN LATERAL (
        SELECT cr.order_id
          FROM public.pdv_refunds r
          JOIN public.pdv_commercial_returns cr
            ON cr.id = r.commercial_return_id AND cr.company_id = r.company_id
         WHERE c.source_type = 'pdv_refund'
           AND r.id = c.source_id AND r.company_id = c.company_id
         LIMIT 1
      ) ret ON true
  ),
  reversed AS (
    SELECT c.reversal_of_id AS id, min(NULLIF(btrim(c.metadata->>'reason'), '')) AS reason
      FROM custody c
     WHERE c.entry_kind = 'reversal'
     GROUP BY c.reversal_of_id
  ),
  drawer_rows AS (
    SELECT c.id,
           c.entry_kind AS kind,
           c.amount AS signed_amount,
           c.created_at AS occurred_at,
           COALESCE(c.f_payment_method, c.pay_method) AS payment_method,
           c.f_description AS description,
           COALESCE(NULLIF(c.f_notes, ''), NULLIF(c.metadata->>'notes', '')) AS notes,
           c.created_by AS author_id,
           COALESCE(c.direct_order_id, orig.direct_order_id) AS order_id,
           (rv.id IS NOT NULL) AS entry_reversed,
           rv.reason AS entry_reversed_reason,
           true AS affects_drawer,
           (c.entry_kind IN ('closing_return', 'shortage', 'surplus')) AS is_closing_adjustment,
           CASE WHEN c.entry_kind = 'opening' THEN 0
                WHEN c.entry_kind IN ('closing_return', 'shortage', 'surplus') THEN 2
                ELSE 1 END AS sort_rank
      FROM custody_linked c
      LEFT JOIN custody_linked orig ON orig.id = c.reversal_of_id
      LEFT JOIN reversed rv ON rv.id = c.id
  ),
  session_orders AS (
    SELECT o.*
      FROM public.pdv_orders o
     WHERE o.company_id = p_company_id
       AND o.cash_session_id = v_session.id
       AND o.contract_version = 2
  ),
  payment_rows AS (
    -- Pagamento que não virou fato da gaveta (PIX, cartão, fiado, vale, saldo do cliente...).
    SELECT p.id,
           'sale_payment'::text AS kind,
           p.amount AS signed_amount,
           p.received_at AS occurred_at,
           p.method AS payment_method,
           COALESCE(f.description, 'Venda PDV nº ' || o.number::text) AS description,
           NULLIF(btrim(o.notes), '') AS notes,
           p.created_by AS author_id,
           o.id AS order_id,
           false AS entry_reversed,
           NULL::text AS entry_reversed_reason,
           false AS affects_drawer,
           false AS is_closing_adjustment,
           1 AS sort_rank
      FROM session_orders o
      JOIN public.pdv_order_payments p ON p.order_id = o.id AND p.company_id = o.company_id
      LEFT JOIN public.financial_transactions f
        ON f.id = p.settlement_transaction_id AND f.company_id = p.company_id
     WHERE NOT EXISTS (
       SELECT 1 FROM custody c
        WHERE c.financial_transaction_id IS NOT NULL
          AND (c.financial_transaction_id = p.settlement_transaction_id
            OR c.financial_transaction_id = p.financial_transaction_id))
  ),
  unpaid_rows AS (
    SELECT o.id,
           'sale_without_payment'::text AS kind,
           o.total AS signed_amount,
           COALESCE(o.paid_at, o.created_at) AS occurred_at,
           NULL::text AS payment_method,
           'Venda PDV nº ' || o.number::text AS description,
           NULLIF(btrim(o.notes), '') AS notes,
           o.salesperson_id AS author_id,
           o.id AS order_id,
           false AS entry_reversed,
           NULL::text AS entry_reversed_reason,
           false AS affects_drawer,
           false AS is_closing_adjustment,
           1 AS sort_rank
      FROM session_orders o
     WHERE o.status NOT IN ('rascunho', 'aguardando_pagamento')
       AND NOT EXISTS (SELECT 1 FROM public.pdv_order_payments p
                        WHERE p.order_id = o.id AND p.company_id = o.company_id)
  ),
  all_rows AS (
    SELECT * FROM drawer_rows
    UNION ALL SELECT * FROM payment_rows
    UNION ALL SELECT * FROM unpaid_rows
  ),
  enriched AS (
    SELECT r.*,
           o.number AS order_number,
           o.status AS order_status,
           o.total AS order_total,
           o.cancelled_reason AS order_cancelled_reason,
           cu.name AS customer_name,
           COALESCE(NULLIF(btrim(sp.full_name), ''), NULLIF(btrim(sp.email), '')) AS salesperson_name,
           COALESCE(NULLIF(btrim(au.full_name), ''), NULLIF(btrim(au.email), '')) AS author_name,
           CASE WHEN r.order_id IS NULL THEN false
                ELSE row_number() OVER (PARTITION BY r.order_id
                                        ORDER BY r.occurred_at, r.sort_rank, r.id) = 1 END AS is_order_primary
      FROM all_rows r
      LEFT JOIN public.pdv_orders o ON o.id = r.order_id AND o.company_id = p_company_id
      LEFT JOIN public.customers cu ON cu.id = o.customer_id AND cu.company_id = p_company_id
      LEFT JOIN public.profiles sp ON sp.user_id = o.salesperson_id AND sp.company_id = p_company_id
      LEFT JOIN public.profiles au ON au.user_id = r.author_id AND au.company_id = p_company_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', x.id,
           'kind', x.kind,
           'direction', CASE WHEN x.signed_amount < 0 THEN 'out' ELSE 'in' END,
           'amount', round(abs(x.signed_amount), 2),
           'signed_amount', round(x.signed_amount, 2),
           'occurred_at', x.occurred_at,
           'payment_method', x.payment_method,
           'description', x.description,
           'notes', x.notes,
           'author_name', x.author_name,
           'affects_drawer', x.affects_drawer,
           'is_closing_adjustment', x.is_closing_adjustment,
           'order_id', x.order_id,
           'order_number', x.order_number,
           'order_status', x.order_status,
           'order_total', round(x.order_total, 2),
           'customer_name', x.customer_name,
           'salesperson_name', x.salesperson_name,
           'is_cancelled', (x.order_status = 'cancelado') OR x.entry_reversed,
           'cancelled_reason', CASE WHEN x.order_status = 'cancelado' THEN x.order_cancelled_reason
                                    WHEN x.entry_reversed THEN x.entry_reversed_reason END,
           'is_order_primary', x.is_order_primary,
           'items', CASE WHEN x.is_order_primary THEN COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'name', i.description,
                        'unit', i.unit,
                        'quantity', i.quantity,
                        'unit_price', round(i.unit_price, 2),
                        'discount', round(COALESCE(i.discount_amount, 0), 2),
                        'total', round(i.total, 2))
                      ORDER BY i.sort_order, i.id)
                 FROM public.pdv_order_items i
                WHERE i.order_id = x.order_id AND i.company_id = p_company_id), '[]'::jsonb)
             ELSE '[]'::jsonb END
         ) ORDER BY x.occurred_at, x.sort_rank, x.id), '[]'::jsonb)
    INTO v_entries
    FROM enriched x;

  SELECT jsonb_build_object(
           'orders_count', count(*) FILTER (WHERE o.status <> 'cancelado'),
           'cancelled_orders_count', count(*) FILTER (WHERE o.status = 'cancelado'),
           'orders_total', round(COALESCE(sum(o.total) FILTER (WHERE o.status <> 'cancelado'), 0), 2),
           'by_payment_method', COALESCE((
             SELECT jsonb_agg(jsonb_build_object('payment_method', m.method, 'amount', m.amount)
                              ORDER BY m.amount DESC, m.method)
               FROM (SELECT p.method, round(sum(p.amount), 2) AS amount
                       FROM public.pdv_orders oo
                       JOIN public.pdv_order_payments p ON p.order_id = oo.id AND p.company_id = oo.company_id
                      WHERE oo.company_id = p_company_id AND oo.cash_session_id = v_session.id
                        AND oo.contract_version = 2 AND oo.status <> 'cancelado'
                      GROUP BY p.method) m), '[]'::jsonb))
    INTO v_summary
    FROM public.pdv_orders o
   WHERE o.company_id = p_company_id AND o.cash_session_id = v_session.id
     AND o.contract_version = 2 AND o.status NOT IN ('rascunho', 'aguardando_pagamento');

  RETURN (v_header - 'entries') || jsonb_build_object(
    'terminal_id', v_session.terminal_id,
    'opened_by', v_session.opened_by,
    'closed_by', v_session.closed_by,
    'status', v_session.status,
    'was_reopened', v_was_reopened,
    'sales_summary', v_summary,
    'entries', v_entries);
END
$function$;

COMMENT ON FUNCTION public.pdv_cash_export_session_build_v1(uuid, uuid) IS
  'Interno: monta o objeto detalhado de um caixa fechado para exportação. A trava vem de pdv_cash_session_projection_v3. Sem EXECUTE para authenticated.';

-- ---------------------------------------------------------------------------
-- 2. Um caixa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_cash_session_export_v1(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE v_context record;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Informe o caixa que deseja exportar.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_SESSION_REQUIRED';
  END IF;
  SELECT * INTO v_context FROM public.pdv_cash_history_context_v2();
  RETURN public.pdv_cash_export_session_build_v1(p_session_id, v_context.company_id);
END
$function$;

COMMENT ON FUNCTION public.pdv_cash_session_export_v1(uuid) IS
  'Exportação detalhada de um caixa fechado (todas as vendas, todas as formas de pagamento, canceladas marcadas). Mesma autorização do relatório do caixa.';

-- ---------------------------------------------------------------------------
-- 3. Período
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_cash_export_period_v1(
  p_from date,
  p_to date,
  p_terminal_id uuid DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_context record;
  v_can_other boolean;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_ids uuid[];
  v_count integer;
  v_id uuid;
  v_sessions jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_history_context_v2();

  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'Informe o período da exportação.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_EXPORT_PERIOD_REQUIRED';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION 'A data final precisa ser igual ou posterior à inicial.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_EXPORT_PERIOD_INVALID';
  END IF;
  IF (p_to - p_from) + 1 > 92 THEN
    RAISE EXCEPTION 'O período máximo da exportação é de 92 dias.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_EXPORT_PERIOD_TOO_LONG';
  END IF;

  v_can_other := public.pdv_can_operate_other_cash_v2(v_context.user_id);
  IF NOT v_can_other THEN
    IF p_operator_id IS NOT NULL AND p_operator_id IS DISTINCT FROM v_context.user_id THEN
      RAISE EXCEPTION 'Você não pode consultar outro operador.'
        USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
    END IF;
    p_operator_id := v_context.user_id;
  END IF;

  -- Mesmo fuso de public.company_today (company_settings.timezone, fallback São Paulo).
  v_tz := COALESCE(
    NULLIF((SELECT cs.timezone FROM public.company_settings cs
             WHERE cs.company_id = v_context.company_id
             ORDER BY cs.updated_at DESC LIMIT 1), ''),
    'America/Sao_Paulo');
  v_start := p_from::timestamp AT TIME ZONE v_tz;
  v_end := (p_to + 1)::timestamp AT TIME ZONE v_tz;

  SELECT array_agg(s.id ORDER BY s.closed_at, s.id), count(*)
    INTO v_ids, v_count
    FROM public.pdv_cash_sessions s
   WHERE s.company_id = v_context.company_id
     AND s.contract_version = 2
     AND s.status = 'fechada'
     AND s.closed_at >= v_start AND s.closed_at < v_end
     AND (v_can_other OR s.opened_by = v_context.user_id)
     AND (p_terminal_id IS NULL OR s.terminal_id = p_terminal_id)
     AND (p_operator_id IS NULL OR s.opened_by = p_operator_id);

  IF v_count > 200 THEN
    RAISE EXCEPTION 'O período tem % caixas; o máximo por exportação é 200. Reduza o período ou filtre por terminal/operador.', v_count
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_EXPORT_TOO_MANY_SESSIONS';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(v_ids, ARRAY[]::uuid[]) LOOP
    v_sessions := v_sessions || jsonb_build_array(
      public.pdv_cash_export_session_build_v1(v_id, v_context.company_id));
  END LOOP;

  RETURN jsonb_build_object('from', p_from, 'to', p_to, 'timezone', v_tz, 'sessions', v_sessions);
END
$function$;

COMMENT ON FUNCTION public.pdv_cash_export_period_v1(date, date, uuid, uuid) IS
  'Exportação detalhada dos caixas fechados no período (data de fechamento no fuso da empresa). Máx. 92 dias e 200 caixas; acima disso erro 22023, nunca trunca.';

-- ---------------------------------------------------------------------------
-- 4. Privilégios (função nova nasce com EXECUTE explícito para anon)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pdv_cash_export_session_build_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_cash_session_export_v1(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pdv_cash_export_period_v1(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_cash_export_session_build_v1(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_cash_session_export_v1(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pdv_cash_export_period_v1(date, date, uuid, uuid) TO authenticated, service_role;

DO $$
DECLARE v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.pdv_cash_export_session_build_v1(uuid, uuid)',
    'public.pdv_cash_session_export_v1(uuid)',
    'public.pdv_cash_export_period_v1(date, date, uuid, uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_sig::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'Função % ficou executável por anon.', v_sig;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.pdv_cash_export_session_build_v1(uuid, uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'Construtor interno ficou executável por authenticated.';
  END IF;
END
$$;
