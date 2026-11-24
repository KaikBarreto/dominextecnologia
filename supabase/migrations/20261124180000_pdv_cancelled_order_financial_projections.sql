-- Exclui vendas integralmente canceladas da fonte canônica da DRE do PDV.
-- Não altera livros append-only, snapshots, contagens ou fatos financeiros.
-- Mantém cancelamento parcial, devoluções/reversões e o adaptador legado.
CREATE OR REPLACE FUNCTION public.pdv_financial_projection_rows_v2(p_company_id uuid)
 RETURNS TABLE(projection_kind text, event_id uuid, event_date date, source_type text, revenue numeric, cmv numeric, expense numeric, cash_flow numeric, metadata jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  -- Cancelamento integral desfaz a venda também no período original, como
  -- cancelled_at já faz no Financeiro. Cancelamento parcial mantém entregas:
  -- ele também preenche cancelled_at, portanto a regra usa o status canônico.
  WITH eligible_orders AS (
    SELECT sale.id
      FROM public.pdv_orders sale
     WHERE sale.company_id = p_company_id
       AND sale.status <> 'cancelado'
  )
  -- Competencia v2: entrega/prestacao. Devoluções comerciais por fatia
  -- pertencem à onda W5 e não são inferidas de estorno financeiro.
  SELECT 'dre_competence', item.id, item.recognition_date,
         'delivery_v2', item.commercial_amount_snapshot,
         item.cmv_amount_snapshot, 0::numeric, 0::numeric,
         jsonb_build_object('delivery_item_id', item.id, 'contract_version', 2)
    FROM public.pdv_delivery_items item
   WHERE item.company_id = p_company_id
     AND item.recognition_contract_version = 2
     AND EXISTS (
       SELECT 1
         FROM public.pdv_deliveries delivery
         JOIN eligible_orders sale ON sale.id = delivery.order_id
        WHERE delivery.id = item.delivery_id
          AND delivery.company_id = item.company_id
     )

  UNION ALL
  SELECT 'dre_competence', item.id, header.occurred_on,
         CASE WHEN header.event_kind='return' THEN 'commercial_return_v2' ELSE 'commercial_return_reversal_v2' END,
         item.commercial_amount, item.cmv_amount, 0::numeric, 0::numeric,
         jsonb_build_object('commercial_return_id',header.id,'delivery_item_id',item.delivery_item_id,'contract_version',2)
    FROM public.pdv_commercial_return_items item
    JOIN public.pdv_commercial_returns header ON header.id=item.commercial_return_id
   WHERE item.company_id=p_company_id
     AND header.company_id = p_company_id
     AND header.order_id IN (SELECT id FROM eligible_orders)

  UNION ALL
  SELECT 'dre_competence', transaction.id, transaction.transaction_date,
         transaction.pdv_financial_role, 0::numeric, 0::numeric,
         CASE WHEN transaction.pdv_financial_role = 'pdv_cash_surplus'
              THEN -transaction.amount ELSE transaction.amount END,
         0::numeric,
         jsonb_build_object('financial_transaction_id', transaction.id, 'contract_version', 2)
    FROM public.financial_transactions transaction
   WHERE transaction.company_id = p_company_id
     AND transaction.cancelled_at IS NULL
     AND transaction.pdv_financial_role IN ('pdv_card_fee','pdv_cash_shortage','pdv_cash_surplus')

  UNION ALL
  -- Caixa gerencial v2: somente aplicacoes persistidas.
  SELECT 'dre_cash', application.id, application.effective_date,
         CASE WHEN application.application_kind = 'settlement'
              THEN 'settlement_application_v2' ELSE 'payment_reversal_application_v2' END,
         application.commercial_amount, application.cmv_amount,
         0::numeric, 0::numeric,
         jsonb_build_object('settlement_transaction_id', application.settlement_transaction_id,
                            'contract_version', 2)
    FROM public.pdv_settlement_applications application
   WHERE application.company_id = p_company_id
     AND application.order_id IN (SELECT id FROM eligible_orders)

  UNION ALL
  -- Material bonificado/preço zero não possui valor a alocar no FIFO. Seu
  -- CMV conhecido é reconhecido uma única vez pela própria entrega v2.
  SELECT 'dre_cash', item.id, item.recognition_date,
         'zero_value_delivery_cmv_v2', 0::numeric,
         item.cmv_amount_snapshot, 0::numeric, 0::numeric,
         jsonb_build_object('delivery_item_id', item.id, 'contract_version', 2)
    FROM public.pdv_delivery_items item
   WHERE item.company_id = p_company_id
     AND item.recognition_contract_version = 2
     AND EXISTS (
       SELECT 1
         FROM public.pdv_deliveries delivery
         JOIN eligible_orders sale ON sale.id = delivery.order_id
        WHERE delivery.id = item.delivery_id
          AND delivery.company_id = item.company_id
     )
     AND item.commercial_amount_snapshot = 0
     AND item.cmv_amount_snapshot > 0

  UNION ALL
  SELECT 'dre_cash', transaction.id,
         COALESCE(transaction.paid_date, transaction.transaction_date),
         transaction.pdv_financial_role, 0::numeric, 0::numeric,
         CASE WHEN transaction.pdv_financial_role = 'pdv_cash_surplus'
              THEN -transaction.amount ELSE transaction.amount END,
         0::numeric,
         jsonb_build_object('financial_transaction_id', transaction.id, 'contract_version', 2)
    FROM public.financial_transactions transaction
   WHERE transaction.company_id = p_company_id
     AND transaction.cancelled_at IS NULL
     AND transaction.is_paid IS TRUE
     AND transaction.pdv_financial_role IN ('pdv_card_fee','pdv_cash_shortage','pdv_cash_surplus')

  UNION ALL
  -- DFC v2: fatos financeiros realizados; custodia e obrigacoes nao entram.
  SELECT 'dfc', transaction.id,
         COALESCE(transaction.paid_date, transaction.transaction_date),
         transaction.pdv_financial_role, 0::numeric, 0::numeric, 0::numeric,
         CASE
           WHEN transaction.pdv_financial_role IN (
             'pdv_receivable_settlement','pdv_cash_surplus','pdv_refund_reversal'
           ) THEN transaction.amount
           ELSE -transaction.amount
         END,
         jsonb_build_object('financial_transaction_id', transaction.id, 'contract_version', 2)
    FROM public.financial_transactions transaction
   WHERE transaction.company_id = p_company_id
     AND transaction.cancelled_at IS NULL
     AND transaction.is_paid IS TRUE
     AND transaction.paid_date IS NOT NULL
     AND transaction.pdv_financial_role IN (
       'pdv_receivable_settlement','pdv_receivable_reversal',
       'pdv_card_fee','pdv_cash_shortage','pdv_cash_surplus',
       'pdv_refund','pdv_refund_reversal','pdv_supplier_payment'
     )

  UNION ALL
  -- Adaptador legado: exclui qualquer fato estruturalmente pertencente ao v2.
  SELECT projection.kind, transaction.id,
         CASE WHEN projection.kind = 'dre_competence'
              THEN transaction.transaction_date
              ELSE COALESCE(transaction.paid_date, transaction.transaction_date) END,
         'legacy_financial',
         CASE WHEN transaction.transaction_type::text = 'entrada' THEN transaction.amount ELSE 0 END,
         0::numeric,
         CASE WHEN transaction.transaction_type::text = 'saida' THEN transaction.amount ELSE 0 END,
         CASE WHEN projection.kind = 'dfc' THEN
           CASE WHEN transaction.transaction_type::text = 'entrada'
                THEN transaction.amount ELSE -transaction.amount END
           ELSE 0 END,
         jsonb_build_object('financial_transaction_id', transaction.id, 'contract_version', 1)
    FROM public.financial_transactions transaction
    CROSS JOIN (VALUES ('dre_competence'),('dre_cash'),('dfc')) projection(kind)
   WHERE transaction.company_id = p_company_id
     AND transaction.pdv_financial_role IS NULL
     AND transaction.origin = 'pdv'
     AND transaction.cancelled_at IS NULL
     AND (projection.kind = 'dre_competence' OR (
       transaction.is_paid IS TRUE AND transaction.paid_date IS NOT NULL
     ))
     AND transaction.transfer_pair_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pdv_order_payments payment
        WHERE payment.company_id = p_company_id
          AND payment.contract_version = 2
          AND transaction.id IN (
            payment.receivable_transaction_id,
            payment.settlement_transaction_id,
            payment.financial_transaction_id
          )
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
        WHERE allocation.company_id = p_company_id
          AND transaction.id IN (
            allocation.receivable_transaction_id,
            allocation.settlement_transaction_id
          )
     )
     -- Competencia reconhece a obrigacao, nunca a filha de recebimento.
     AND (
       projection.kind = 'dre_competence'
       OR NOT EXISTS (
         SELECT 1 FROM public.pdv_party_credit_entries credit_entry
          WHERE credit_entry.target_financial_transaction_id = transaction.id
       )
     )
     AND NOT (
       projection.kind = 'dre_competence'
       AND transaction.parent_transaction_id IS NOT NULL
       AND transaction.category = 'Recebimento parcial'
       AND transaction.transaction_type::text = 'entrada'
     )
     -- Caixa/DFC usam as filhas realizadas. Quando elas existem, a mae nao
     -- pode entrar novamente; quitacao direta sem filha continua pela mae.
     AND NOT (
       projection.kind IN ('dre_cash','dfc')
       AND transaction.parent_transaction_id IS NULL
       AND EXISTS (
         SELECT 1 FROM public.financial_transactions child
          WHERE child.parent_transaction_id = transaction.id
            AND child.category = 'Recebimento parcial'
            AND child.transaction_type::text = 'entrada'
            AND child.cancelled_at IS NULL
       )
     );
$function$
;

-- Helper continua restrito ao owner: a entrada pública valida usuário/empresa.
REVOKE ALL ON FUNCTION public.pdv_financial_projection_rows_v2(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- A fonte comercial alimenta vendas, ABC, materiais e painel gerencial.
-- Usa a mesma regra da DRE para que todas as visões reconciliem.
CREATE OR REPLACE FUNCTION public.pdv_commercial_facts_v2(p_company_id uuid)
 RETURNS TABLE(event_id uuid, event_kind text, event_date date, delivery_item_id uuid, order_id uuid, inventory_id uuid, stock_id uuid, customer_id uuid, delivered_quantity numeric, returned_quantity numeric, net_quantity numeric, delivered_revenue numeric, returned_revenue numeric, net_revenue numeric, net_cmv numeric, cost_known boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT item.id,'delivery'::text,item.recognition_date,item.id,
         delivery.order_id,order_item.inventory_id,
         COALESCE(reservation.stock_id,orders.stock_id),orders.customer_id,
         item.quantity,0::numeric,item.quantity,
         item.commercial_amount_snapshot,0::numeric,
         item.commercial_amount_snapshot,item.cmv_amount_snapshot,
         item.cmv_amount_snapshot IS NOT NULL
    FROM public.pdv_delivery_items item
    JOIN public.pdv_deliveries delivery
      ON delivery.id=item.delivery_id AND delivery.company_id=item.company_id
    JOIN public.pdv_order_items order_item
      ON order_item.id=item.order_item_id AND order_item.company_id=item.company_id
    JOIN public.pdv_orders orders
      ON orders.id=delivery.order_id AND orders.company_id=item.company_id
    LEFT JOIN public.pdv_stock_reservation_items reservation
      ON reservation.id=item.reservation_id AND reservation.company_id=item.company_id
   WHERE item.company_id=p_company_id
     AND orders.status <> 'cancelado'
     AND item.recognition_contract_version=2

  UNION ALL

  SELECT return_item.id,header.event_kind,header.occurred_on,delivery_item.id,
         delivery.order_id,order_item.inventory_id,
         COALESCE(reservation.stock_id,orders.stock_id),orders.customer_id,
         0::numeric,
         CASE header.event_kind WHEN 'return' THEN return_item.quantity
                                ELSE -return_item.quantity END,
         CASE header.event_kind WHEN 'return' THEN -return_item.quantity
                                ELSE return_item.quantity END,
         0::numeric,
         CASE header.event_kind WHEN 'return' THEN -return_item.commercial_amount
                                ELSE -return_item.commercial_amount END,
         return_item.commercial_amount,return_item.cmv_amount,
         return_item.cmv_amount IS NOT NULL
    FROM public.pdv_commercial_return_items return_item
    JOIN public.pdv_commercial_returns header
      ON header.id=return_item.commercial_return_id
     AND header.company_id=return_item.company_id
    JOIN public.pdv_delivery_items delivery_item
      ON delivery_item.id=return_item.delivery_item_id
     AND delivery_item.company_id=return_item.company_id
    JOIN public.pdv_deliveries delivery
      ON delivery.id=delivery_item.delivery_id
     AND delivery.company_id=return_item.company_id
    JOIN public.pdv_order_items order_item
      ON order_item.id=delivery_item.order_item_id
     AND order_item.company_id=return_item.company_id
    JOIN public.pdv_orders orders
      ON orders.id=delivery.order_id AND orders.company_id=return_item.company_id
    LEFT JOIN public.pdv_stock_reservation_items reservation
      ON reservation.id=delivery_item.reservation_id
     AND reservation.company_id=return_item.company_id
   WHERE return_item.company_id=p_company_id
     AND orders.status <> 'cancelado';
$function$
;
REVOKE ALL ON FUNCTION public.pdv_commercial_facts_v2(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_commercial_facts_v2(uuid) TO service_role;
