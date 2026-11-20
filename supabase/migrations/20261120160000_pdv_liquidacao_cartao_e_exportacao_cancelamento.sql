-- =============================================================================
-- PDV: liquidação de cartão em venda entregue + linha de cancelamento na
-- exportação do caixa.
--
-- 1) pdv_block_paid_order_header_change
--    A venda direta v2 no débito/crédito nasce 'entregue' com paid_at vazio e
--    o cartão em aberto (coverage_kind='card_authorization'). Ao liquidar,
--    pdv_settle_card_authorization_v3 grava paid_at quando nada mais está em
--    aberto, e o guard do cabeçalho barrava ("O cabeçalho do pedido nº N não
--    pode ser alterado depois da finalização"). Resultado: NENHUMA venda direta
--    no cartão conseguia ser liquidada (o mesmo valia para balcão depois da
--    entrega). O guard já trabalha com transições estreitas e nomeadas
--    (entrega, commit de estoque, cancelamento); acrescentamos mais uma:
--    paid_at NULL -> valor, sem mudar nenhum outro campo protegido, e só quando
--    o pedido não tem mais cobertura v2 em aberto/parcial. Não abre edição
--    livre: authenticated só tem SELECT em pdv_orders.
--
-- 2) pdv_cash_export_session_build_v1
--    A linha da gaveta gravada no cancelamento de venda em dinheiro
--    (source_type='pdv_order_cancellation', sem financial_transaction_id) saía
--    sem descrição e sem forma de pagamento na exportação PDF/Excel. Agora usa
--    os dados da própria linha (metadata), igual à tela do caixa
--    (pdv_cash_session_projection_v3). Nenhuma outra linha muda.
--
-- Definições recriadas a partir da versão viva em produção (2026-11-20).
-- Sem mudança de assinatura, SECURITY, search_path ou grants.
-- =============================================================================

-- 1) Guard do cabeçalho do pedido
CREATE OR REPLACE FUNCTION public.pdv_block_paid_order_header_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Cascades/FKs de limpeza e o expurgo auditado do PDV não são edição humana.
  IF pg_trigger_depth() > 1
     OR NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id)
     OR COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text THEN
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('pago', 'entregue') THEN
    RETURN NEW;
  END IF;

  -- A expedição precisa continuar conseguindo concluir o fluxo balcão. Esta é
  -- a única alteração de delivered_at aceita depois do pagamento: pago vira
  -- entregue, registra a data pela primeira vez e não muda nenhum valor ou
  -- vínculo financeiro do cabeçalho.
  IF OLD.status = 'pago'
     AND NEW.status = 'entregue'
     AND OLD.delivered_at IS NULL
     AND NEW.delivered_at IS NOT NULL
     AND NEW.customer_id       IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.id                IS NOT DISTINCT FROM OLD.id
     AND NEW.company_id        IS NOT DISTINCT FROM OLD.company_id
     AND NEW.number            IS NOT DISTINCT FROM OLD.number
     AND NEW.created_at        IS NOT DISTINCT FROM OLD.created_at
     AND NEW.salesperson_id    IS NOT DISTINCT FROM OLD.salesperson_id
     AND NEW.stock_id          IS NOT DISTINCT FROM OLD.stock_id
     AND NEW.terminal_id       IS NOT DISTINCT FROM OLD.terminal_id
     AND NEW.subtotal          IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.discount_amount   IS NOT DISTINCT FROM OLD.discount_amount
     AND NEW.coupon_id         IS NOT DISTINCT FROM OLD.coupon_id
     AND NEW.points_redeemed   IS NOT DISTINCT FROM OLD.points_redeemed
     AND NEW.total             IS NOT DISTINCT FROM OLD.total
     AND NEW.cash_session_id   IS NOT DISTINCT FROM OLD.cash_session_id
     AND NEW.client_request_id IS NOT DISTINCT FROM OLD.client_request_id
     AND NEW.notes             IS NOT DISTINCT FROM OLD.notes
     AND NEW.paid_at           IS NOT DISTINCT FROM OLD.paid_at
     AND NEW.stock_committed_at IS NOT DISTINCT FROM OLD.stock_committed_at
     AND NEW.cancelled_at      IS NOT DISTINCT FROM OLD.cancelled_at
     AND NEW.cancelled_by      IS NOT DISTINCT FROM OLD.cancelled_by
     AND NEW.cancelled_reason  IS NOT DISTINCT FROM OLD.cancelled_reason
     AND NEW.replaces_order_id IS NOT DISTINCT FROM OLD.replaces_order_id THEN
    RETURN NEW;
  END IF;

  IF NOT (
       NEW.status             IS DISTINCT FROM OLD.status
    OR NEW.id                 IS DISTINCT FROM OLD.id
    OR NEW.company_id         IS DISTINCT FROM OLD.company_id
    OR NEW.number             IS DISTINCT FROM OLD.number
    OR NEW.created_at         IS DISTINCT FROM OLD.created_at
    OR NEW.customer_id        IS DISTINCT FROM OLD.customer_id
    OR NEW.salesperson_id     IS DISTINCT FROM OLD.salesperson_id
    OR NEW.stock_id           IS DISTINCT FROM OLD.stock_id
    OR NEW.terminal_id        IS DISTINCT FROM OLD.terminal_id
    OR NEW.subtotal           IS DISTINCT FROM OLD.subtotal
    OR NEW.discount_amount    IS DISTINCT FROM OLD.discount_amount
    OR NEW.coupon_id          IS DISTINCT FROM OLD.coupon_id
    OR NEW.points_redeemed    IS DISTINCT FROM OLD.points_redeemed
    OR NEW.total              IS DISTINCT FROM OLD.total
    OR NEW.cash_session_id    IS DISTINCT FROM OLD.cash_session_id
    OR NEW.client_request_id  IS DISTINCT FROM OLD.client_request_id
    OR NEW.notes              IS DISTINCT FROM OLD.notes
    OR NEW.paid_at            IS DISTINCT FROM OLD.paid_at
    OR NEW.delivered_at       IS DISTINCT FROM OLD.delivered_at
    OR NEW.stock_committed_at IS DISTINCT FROM OLD.stock_committed_at
    OR NEW.cancelled_at       IS DISTINCT FROM OLD.cancelled_at
    OR NEW.cancelled_by       IS DISTINCT FROM OLD.cancelled_by
    OR NEW.cancelled_reason   IS DISTINCT FROM OLD.cancelled_reason
    OR NEW.replaces_order_id  IS DISTINCT FROM OLD.replaces_order_id
  ) THEN
    RETURN NEW;
  END IF;

  -- pdv_commit_order_stock preenche stock_committed_at e resolve stock_id
  -- somente quando ele estava vazio. Nenhum outro campo protegido pode mudar.
  IF OLD.stock_committed_at IS NULL
     AND NEW.stock_committed_at IS NOT NULL
     AND NEW.stock_id IS NOT NULL
     AND (OLD.stock_id IS NULL OR NEW.stock_id IS NOT DISTINCT FROM OLD.stock_id)
     AND NEW.id                IS NOT DISTINCT FROM OLD.id
     AND NEW.company_id        IS NOT DISTINCT FROM OLD.company_id
     AND NEW.number            IS NOT DISTINCT FROM OLD.number
     AND NEW.created_at        IS NOT DISTINCT FROM OLD.created_at
     AND NEW.customer_id       IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.salesperson_id    IS NOT DISTINCT FROM OLD.salesperson_id
     AND NEW.terminal_id       IS NOT DISTINCT FROM OLD.terminal_id
     AND NEW.subtotal          IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.discount_amount   IS NOT DISTINCT FROM OLD.discount_amount
     AND NEW.coupon_id         IS NOT DISTINCT FROM OLD.coupon_id
     AND NEW.points_redeemed   IS NOT DISTINCT FROM OLD.points_redeemed
     AND NEW.total             IS NOT DISTINCT FROM OLD.total
     AND NEW.cash_session_id   IS NOT DISTINCT FROM OLD.cash_session_id
     AND NEW.client_request_id IS NOT DISTINCT FROM OLD.client_request_id
     AND NEW.notes             IS NOT DISTINCT FROM OLD.notes
     AND NEW.paid_at           IS NOT DISTINCT FROM OLD.paid_at
     AND NEW.delivered_at      IS NOT DISTINCT FROM OLD.delivered_at
     AND NEW.status            IS NOT DISTINCT FROM OLD.status
     AND NEW.cancelled_at      IS NOT DISTINCT FROM OLD.cancelled_at
     AND NEW.cancelled_by      IS NOT DISTINCT FROM OLD.cancelled_by
     AND NEW.cancelled_reason  IS NOT DISTINCT FROM OLD.cancelled_reason
     AND NEW.replaces_order_id IS NOT DISTINCT FROM OLD.replaces_order_id THEN
    RETURN NEW;
  END IF;

  -- Liquidação do cartão (pdv_settle_card_authorization_v3) e baixa de
  -- recebível v2: a venda nasce entregue/paga com paid_at vazio enquanto o
  -- cartão (ou o fiado) está em aberto. Quando a última cobertura v2 do pedido
  -- é liquidada, paid_at é gravado pela primeira vez. Só essa transição passa:
  -- paid_at NULL -> valor, nenhum outro campo protegido muda, e o pedido não
  -- pode ter nenhuma cobertura v2 ainda em aberto. Edição livre continua barrada
  -- (authenticated nem tem UPDATE em pdv_orders; isto só vale para as RPCs).
  IF OLD.paid_at IS NULL
     AND NEW.paid_at IS NOT NULL
     AND NEW.status            IS NOT DISTINCT FROM OLD.status
     AND NEW.id                IS NOT DISTINCT FROM OLD.id
     AND NEW.company_id        IS NOT DISTINCT FROM OLD.company_id
     AND NEW.number            IS NOT DISTINCT FROM OLD.number
     AND NEW.created_at        IS NOT DISTINCT FROM OLD.created_at
     AND NEW.customer_id       IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.salesperson_id    IS NOT DISTINCT FROM OLD.salesperson_id
     AND NEW.stock_id          IS NOT DISTINCT FROM OLD.stock_id
     AND NEW.terminal_id       IS NOT DISTINCT FROM OLD.terminal_id
     AND NEW.subtotal          IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.discount_amount   IS NOT DISTINCT FROM OLD.discount_amount
     AND NEW.coupon_id         IS NOT DISTINCT FROM OLD.coupon_id
     AND NEW.points_redeemed   IS NOT DISTINCT FROM OLD.points_redeemed
     AND NEW.total             IS NOT DISTINCT FROM OLD.total
     AND NEW.cash_session_id   IS NOT DISTINCT FROM OLD.cash_session_id
     AND NEW.client_request_id IS NOT DISTINCT FROM OLD.client_request_id
     AND NEW.notes             IS NOT DISTINCT FROM OLD.notes
     AND NEW.delivered_at      IS NOT DISTINCT FROM OLD.delivered_at
     AND NEW.stock_committed_at IS NOT DISTINCT FROM OLD.stock_committed_at
     AND NEW.cancelled_at      IS NOT DISTINCT FROM OLD.cancelled_at
     AND NEW.cancelled_by      IS NOT DISTINCT FROM OLD.cancelled_by
     AND NEW.cancelled_reason  IS NOT DISTINCT FROM OLD.cancelled_reason
     AND NEW.replaces_order_id IS NOT DISTINCT FROM OLD.replaces_order_id
     AND NOT EXISTS (
       SELECT 1 FROM public.pdv_order_payments p
        WHERE p.order_id = OLD.id
          AND p.company_id = OLD.company_id
          AND p.contract_version = 2
          AND p.settlement_status IN ('open', 'partial')
     ) THEN
    RETURN NEW;
  END IF;

  -- pdv_cancel_order preserva a identidade e o cabeçalho comercial, registra
  -- a auditoria do cancelamento e limpa somente o marcador do commit de
  -- estoque. O guard financeiro abaixo ainda valida cobrança/conciliação/fiado.
  IF NEW.status = 'cancelado'
     AND NEW.cancelled_at IS NOT NULL
     AND NEW.cancelled_by IS NOT NULL
     AND NEW.stock_committed_at IS NULL
     AND NEW.id                IS NOT DISTINCT FROM OLD.id
     AND NEW.company_id        IS NOT DISTINCT FROM OLD.company_id
     AND NEW.number            IS NOT DISTINCT FROM OLD.number
     AND NEW.created_at        IS NOT DISTINCT FROM OLD.created_at
     AND NEW.customer_id       IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.salesperson_id    IS NOT DISTINCT FROM OLD.salesperson_id
     AND NEW.stock_id          IS NOT DISTINCT FROM OLD.stock_id
     AND NEW.terminal_id       IS NOT DISTINCT FROM OLD.terminal_id
     AND NEW.subtotal          IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.discount_amount   IS NOT DISTINCT FROM OLD.discount_amount
     AND NEW.coupon_id         IS NOT DISTINCT FROM OLD.coupon_id
     AND NEW.points_redeemed   IS NOT DISTINCT FROM OLD.points_redeemed
     AND NEW.total             IS NOT DISTINCT FROM OLD.total
     AND NEW.cash_session_id   IS NOT DISTINCT FROM OLD.cash_session_id
     AND NEW.client_request_id IS NOT DISTINCT FROM OLD.client_request_id
     AND NEW.notes             IS NOT DISTINCT FROM OLD.notes
     AND NEW.paid_at           IS NOT DISTINCT FROM OLD.paid_at
     AND NEW.delivered_at      IS NOT DISTINCT FROM OLD.delivered_at
     AND NEW.replaces_order_id IS NOT DISTINCT FROM OLD.replaces_order_id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'O cabeçalho do pedido nº % não pode ser alterado depois da finalização. Cancele e substitua a venda pela edição segura.', OLD.number
    USING ERRCODE = '42501';
END
$function$;

-- 2) Exportação do caixa
CREATE OR REPLACE FUNCTION public.pdv_cash_export_session_build_v1(p_session_id uuid, p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
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
           COALESCE(c.f_payment_method, c.pay_method,
                    CASE WHEN c.source_type = 'pdv_order_cancellation'
                         THEN NULLIF(c.metadata->>'payment_method', '') END) AS payment_method,
           COALESCE(c.f_description,
                    CASE WHEN c.source_type = 'pdv_order_cancellation'
                         THEN NULLIF(c.metadata->>'description', '') END) AS description,
           COALESCE(NULLIF(c.f_notes, ''), NULLIF(c.metadata->>'notes', '')) AS notes,
           c.created_by AS author_id,
           COALESCE(c.direct_order_id, orig.direct_order_id,
                    CASE WHEN c.source_type = 'pdv_order_cancellation' THEN c.source_id END) AS order_id,
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
