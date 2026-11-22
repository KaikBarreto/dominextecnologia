-- PDV / Relatorios: Resumo (pdv_partial_projection_report_v4) passa a respeitar
-- o ESCOPO DE ESTOQUE do usuario, nas linhas, no export e nos totais do topo.
--
-- Defeito: o v4 lia pdv_financial_projection_rows_v2 pela empresa inteira.
-- Um usuario com acesso a outros caixas e a totais financeiros, mas fora da
-- lista de stock_access de um estoque restrito, via a receita daquele estoque
-- (caso real: Glacial, R$ 3.983 no Resumo contra R$ 0 na aba Vendas). E o
-- mesmo vazamento da v1.19.11: a RLS estava certa, o agregado nao filtrava.
--
-- Regra (a mesma do get_inventory_abc_report e do pdv_sales_report_v1):
-- todo fato e filtrado pelo estoque acessivel (can_access_stock) ANTES de
-- agregar. Quem ja enxerga todo estoque (super_admin, admin, gestor: os ramos
-- que fazem can_access_stock liberar tudo) recebe a projecao inteira, sem
-- nenhum filtro, exatamente como antes.
--
-- Estoque de cada linha da projecao:
-- * entrega, CMV de bonificado, devolucao e estorno de devolucao: estoque do
--   item entregue, COALESCE(reserva.stock_id, pedido.stock_id), identico ao
--   pdv_commercial_facts_v2 (fonte da aba Vendas e do ABC);
-- * recebimento aplicado e estorno de aplicacao: o mesmo, pelo item entregue
--   da aplicacao (sem item, pelo estoque do pedido);
-- * lancamento financeiro do PDV (taxa de cartao, quebra/sobra de caixa,
--   recebimento, estorno, reembolso, pagamento a fornecedor, lancamento sem
--   papel): nao tem estoque proprio, entao herda TODOS os estoques a que esta
--   ligado: pedido(s) do pagamento (direto, pela mae do recebimento parcial,
--   pela baixa de conta a receber, pelo detalhe de cartao, pelo reembolso) e
--   o estoque do terminal da sessao de caixa (pdv_cash_session_id ou movimento
--   de caixa). O estoque do terminal e o estoque do caixa: a sessao so abre se
--   o operador acessa esse estoque (tg_pdv_open_session_stock_v1).
-- Um lancamento so aparece para usuario restrito se tiver pelo menos um
-- estoque resolvido e TODOS forem acessiveis a ele: valor financeiro nao se
-- divide entre estoques, e mostrar a parte de outro setor seria o vazamento.
-- Linha sem estoque resolvido (estoque excluido, pedido sem estoque,
-- lancamento antigo sem vinculo) fica so para quem enxerga todo estoque.
--
-- Contrato do v4 inalterado: mesma raiz, entries com o mesmo formato. Para
-- admin/gestor/super_admin os numeros sao identicos aos de hoje.
--
-- pdv_financial_projection_rows_v2 e pdv_financial_projection_page_v2 NAO
-- mudam: sao a projecao da empresa inteira usada pela conciliacao do
-- Financeiro e pelos wrappers dre/dfc internos.
--
-- Legados: pdv_partial_projection_report_v2 (sem EXECUTE para authenticated)
-- passa a ser escopado, entao o v3 tambem fica. O v3 tinha EXECUTE para
-- authenticated e ninguem o chama (front usa so o v4): o EXECUTE e revogado.
-- pdv_partial_projection_groups_v4 (interno, sem EXECUTE para authenticated)
-- deixa de ser chamado e fica como esta.
BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- 1. Linhas da projecao visiveis para o usuario.
CREATE OR REPLACE FUNCTION public.pdv_financial_projection_rows_visible_v1(
  p_company_id uuid,p_user_id uuid
)
RETURNS TABLE(projection_kind text,event_id uuid,event_date date,source_type text,
              revenue numeric,cmv numeric,expense numeric,cash_flow numeric,metadata jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
#variable_conflict use_column
BEGIN
  IF p_company_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Mesmos ramos que fazem can_access_stock liberar qualquer estoque: nada
  -- e escondido de super_admin, admin ou gestor.
  IF public.is_super_admin(p_user_id) IS TRUE
     OR public.is_admin_or_gestor(p_user_id) IS TRUE THEN
    RETURN QUERY
      SELECT source.projection_kind,source.event_id,source.event_date,source.source_type,
             source.revenue,source.cmv,source.expense,source.cash_flow,source.metadata
        FROM public.pdv_financial_projection_rows_v2(p_company_id) source;
    RETURN;
  END IF;

  RETURN QUERY
  WITH proj AS MATERIALIZED (
    SELECT source.* FROM public.pdv_financial_projection_rows_v2(p_company_id) source
  ), accessible AS MATERIALIZED (
    SELECT stock.id FROM public.stocks stock
     WHERE stock.company_id=p_company_id
       AND public.can_access_stock(p_user_id,stock.id) IS TRUE
  ), fin AS MATERIALIZED (
    -- Lancamentos financeiros distintos presentes na projecao.
    SELECT DISTINCT proj.source_type,tx.id,tx.parent_transaction_id,
           tx.pdv_cash_session_id,tx.pdv_settlement_group_id,tx.pdv_financial_role
      FROM proj
      JOIN public.financial_transactions tx
        ON tx.id=proj.event_id AND tx.company_id=p_company_id
     WHERE proj.source_type NOT IN (
       'delivery_v2','zero_value_delivery_cmv_v2','commercial_return_v2',
       'commercial_return_reversal_v2','settlement_application_v2',
       'payment_reversal_application_v2')
  ), payment_link AS MATERIALIZED (
    -- Cada lancamento ligado a um pagamento de pedido, com o estoque do pedido.
    SELECT linked.tx_id,orders.stock_id
      FROM public.pdv_order_payments payment
      JOIN public.pdv_orders orders
        ON orders.id=payment.order_id AND orders.company_id=p_company_id
     CROSS JOIN LATERAL unnest(ARRAY[payment.financial_transaction_id,
                                     payment.receivable_transaction_id,
                                     payment.settlement_transaction_id]) linked(tx_id)
     WHERE payment.company_id=p_company_id
       AND linked.tx_id IS NOT NULL
  ), attribution AS (
    -- Entrega e CMV de bonificado.
    SELECT proj.source_type,proj.event_id,
           COALESCE(reservation.stock_id,orders.stock_id) stock_id
      FROM proj
      JOIN public.pdv_delivery_items item
        ON item.id=proj.event_id AND item.company_id=p_company_id
      JOIN public.pdv_deliveries delivery
        ON delivery.id=item.delivery_id AND delivery.company_id=p_company_id
      JOIN public.pdv_orders orders
        ON orders.id=delivery.order_id AND orders.company_id=p_company_id
      LEFT JOIN public.pdv_stock_reservation_items reservation
        ON reservation.id=item.reservation_id AND reservation.company_id=p_company_id
     WHERE proj.source_type IN ('delivery_v2','zero_value_delivery_cmv_v2')
    UNION ALL
    -- Devolucao e estorno de devolucao: estoque do item entregue original.
    SELECT proj.source_type,proj.event_id,
           COALESCE(reservation.stock_id,orders.stock_id)
      FROM proj
      JOIN public.pdv_commercial_return_items return_item
        ON return_item.id=proj.event_id AND return_item.company_id=p_company_id
      JOIN public.pdv_delivery_items item
        ON item.id=return_item.delivery_item_id AND item.company_id=p_company_id
      JOIN public.pdv_deliveries delivery
        ON delivery.id=item.delivery_id AND delivery.company_id=p_company_id
      JOIN public.pdv_orders orders
        ON orders.id=delivery.order_id AND orders.company_id=p_company_id
      LEFT JOIN public.pdv_stock_reservation_items reservation
        ON reservation.id=item.reservation_id AND reservation.company_id=p_company_id
     WHERE proj.source_type IN ('commercial_return_v2','commercial_return_reversal_v2')
    UNION ALL
    -- Recebimento aplicado: item entregue da aplicacao; sem item, o pedido.
    SELECT proj.source_type,proj.event_id,
           CASE WHEN application.delivery_item_id IS NOT NULL
                THEN COALESCE(reservation.stock_id,item_order.stock_id)
                ELSE orders.stock_id END
      FROM proj
      JOIN public.pdv_settlement_applications application
        ON application.id=proj.event_id AND application.company_id=p_company_id
      LEFT JOIN public.pdv_delivery_items item
        ON item.id=application.delivery_item_id AND item.company_id=p_company_id
      LEFT JOIN public.pdv_deliveries delivery
        ON delivery.id=item.delivery_id AND delivery.company_id=p_company_id
      LEFT JOIN public.pdv_orders item_order
        ON item_order.id=delivery.order_id AND item_order.company_id=p_company_id
      LEFT JOIN public.pdv_stock_reservation_items reservation
        ON reservation.id=item.reservation_id AND reservation.company_id=p_company_id
      LEFT JOIN public.pdv_orders orders
        ON orders.id=application.order_id AND orders.company_id=p_company_id
     WHERE proj.source_type IN ('settlement_application_v2','payment_reversal_application_v2')
    UNION ALL
    -- Lancamento financeiro: pagamento do proprio lancamento ou da mae.
    SELECT fin.source_type,fin.id,link.stock_id
      FROM fin JOIN payment_link link ON link.tx_id=fin.id
    UNION ALL
    SELECT fin.source_type,fin.id,link.stock_id
      FROM fin JOIN payment_link link ON link.tx_id=fin.parent_transaction_id
    UNION ALL
    -- Baixa de conta a receber: pedido(s) das contas baixadas.
    SELECT fin.source_type,fin.id,link.stock_id
      FROM fin
      JOIN public.pdv_receivable_settlement_allocations allocation
        ON allocation.company_id=p_company_id
       AND fin.id IN (allocation.settlement_transaction_id,allocation.receivable_transaction_id)
      JOIN payment_link link ON link.tx_id=allocation.receivable_transaction_id
    UNION ALL
    -- Taxa de cartao e liquidacao do cartao: pedido do detalhe.
    SELECT fin.source_type,fin.id,orders.stock_id
      FROM fin
      JOIN public.pdv_card_settlement_details card
        ON card.company_id=p_company_id
       AND fin.id IN (card.fee_transaction_id,card.settlement_transaction_id)
      JOIN public.pdv_orders orders
        ON orders.id=card.order_id AND orders.company_id=p_company_id
    UNION ALL
    -- Reembolso e estorno de reembolso: pedido do pagamento original.
    SELECT fin.source_type,fin.id,orders.stock_id
      FROM fin
      JOIN public.pdv_refunds refund
        ON refund.id=fin.pdv_settlement_group_id AND refund.company_id=p_company_id
      JOIN public.pdv_order_payments payment
        ON payment.id=refund.original_payment_id AND payment.company_id=p_company_id
      JOIN public.pdv_orders orders
        ON orders.id=payment.order_id AND orders.company_id=p_company_id
     WHERE fin.pdv_financial_role IN ('pdv_refund','pdv_refund_reversal')
    UNION ALL
    -- Estoque do caixa: terminal da sessao do lancamento.
    SELECT fin.source_type,fin.id,terminal.stock_id
      FROM fin
      JOIN public.pdv_cash_sessions session
        ON session.id=fin.pdv_cash_session_id AND session.company_id=p_company_id
      JOIN public.pdv_terminals terminal
        ON terminal.id=session.terminal_id AND terminal.company_id=p_company_id
    UNION ALL
    SELECT fin.source_type,fin.id,terminal.stock_id
      FROM fin
      JOIN public.pdv_cash_movements movement
        ON movement.financial_transaction_id=fin.id AND movement.company_id=p_company_id
      JOIN public.pdv_cash_sessions session
        ON session.id=movement.session_id AND session.company_id=p_company_id
      JOIN public.pdv_terminals terminal
        ON terminal.id=session.terminal_id AND terminal.company_id=p_company_id
  ), visible AS (
    -- Pelo menos um estoque resolvido e todos acessiveis. Linha sem
    -- atribuicao nenhuma nem entra aqui: falha fechada.
    SELECT attribution.source_type,attribution.event_id
      FROM attribution
      LEFT JOIN accessible ON accessible.id=attribution.stock_id
     GROUP BY attribution.source_type,attribution.event_id
    HAVING bool_and(accessible.id IS NOT NULL)
  )
  SELECT proj.projection_kind,proj.event_id,proj.event_date,proj.source_type,
         proj.revenue,proj.cmv,proj.expense,proj.cash_flow,proj.metadata
    FROM proj
    JOIN visible
      ON visible.source_type=proj.source_type AND visible.event_id=proj.event_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_financial_projection_rows_visible_v1(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON FUNCTION public.pdv_financial_projection_rows_visible_v1(uuid,uuid) IS
  'Interna. pdv_financial_projection_rows_v2 filtrada pelo estoque acessivel ao usuario (can_access_stock). super_admin/admin/gestor recebem tudo. Fato comercial: estoque do item entregue (mesma regra do pdv_commercial_facts_v2). Lancamento financeiro: todos os estoques ligados (pedidos e terminal da sessao) precisam ser acessiveis; sem estoque resolvido so aparece para quem ve todo estoque.';

-- 2. Pagina com totais, sobre as linhas visiveis. Mesmo contrato e mesmas
-- validacoes do pdv_financial_projection_page_v2 (que segue intocado para a
-- projecao da empresa inteira).
CREATE OR REPLACE FUNCTION public.pdv_financial_projection_page_visible_v1(
  p_company_id uuid,p_user_id uuid,p_projection text,p_from date,p_to date,
  p_limit integer,p_offset integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_total_count bigint;
  v_revenue numeric(14,2);
  v_cmv numeric(14,2);
  v_expense numeric(14,2);
  v_cash_flow numeric(14,2);
  v_entries jsonb;
  v_unknown_cmv_count integer;
BEGIN
  IF p_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.companies company WHERE company.id=p_company_id
  ) THEN
    RAISE EXCEPTION 'Empresa não encontrada.'
      USING ERRCODE='P0002',DETAIL='PDV_PROJECTION_COMPANY_NOT_FOUND';
  END IF;
  IF p_projection NOT IN ('dre_competence','dre_cash','dfc')
     OR p_from IS NULL OR p_to IS NULL OR p_from>p_to
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
     OR p_offset IS NULL OR p_offset<0
  THEN
    RAISE EXCEPTION 'Parâmetros de período ou paginação inválidos.'
      USING ERRCODE='22023',DETAIL='PDV_PROJECTION_INPUT_INVALID';
  END IF;

  -- Uma unica leitura das linhas visiveis alimenta totais e pagina: total e
  -- linhas nunca divergem de escopo.
  WITH projection_row AS MATERIALIZED (
    SELECT source.event_id,source.event_date,source.source_type,source.revenue,
           source.cmv,source.expense,source.cash_flow,source.metadata
      FROM public.pdv_financial_projection_rows_visible_v1(p_company_id,p_user_id) source
     WHERE source.projection_kind=p_projection
       AND source.event_date BETWEEN p_from AND p_to
  )
  SELECT count(*),round(COALESCE(sum(projection_row.revenue),0),2),
         round(COALESCE(sum(projection_row.cmv),0),2),
         round(COALESCE(sum(projection_row.expense),0),2),
         round(COALESCE(sum(projection_row.cash_flow),0),2),
         count(*) FILTER (WHERE projection_row.revenue<>0 AND projection_row.cmv IS NULL),
         (SELECT COALESCE(jsonb_agg(to_jsonb(page) ORDER BY page.event_date,page.event_id),'[]'::jsonb)
            FROM (SELECT inner_row.event_id,inner_row.event_date,inner_row.source_type,
                         inner_row.revenue,inner_row.cmv,inner_row.expense,
                         inner_row.cash_flow,inner_row.metadata
                    FROM projection_row inner_row
                   ORDER BY inner_row.event_date,inner_row.event_id
                   LIMIT p_limit OFFSET p_offset) page)
    INTO v_total_count,v_revenue,v_cmv,v_expense,v_cash_flow,v_unknown_cmv_count,v_entries
    FROM projection_row;
  IF p_projection IN ('dre_competence','dre_cash') AND v_unknown_cmv_count>0 THEN
    v_cmv:=NULL;
  END IF;

  RETURN jsonb_build_object(
    'scope','pdv_partial',
    'projection',p_projection,'from',p_from,'to',p_to,
    'total_count',v_total_count,'limit',p_limit,'offset',p_offset,
    'has_more',p_offset+jsonb_array_length(v_entries)<v_total_count,
    'revenue',v_revenue,'cmv',v_cmv,'expense',v_expense,
    'result',CASE WHEN v_cmv IS NULL AND p_projection IN ('dre_competence','dre_cash')
                  THEN NULL ELSE round(v_revenue-v_cmv-v_expense,2) END,
    'cash_flow',v_cash_flow,
    'initial_balance',NULL,
    'opening_availability',NULL,
    'closing_availability',NULL,
    'availability_status','not_calculated_for_partial_projection',
    'entries',v_entries
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_financial_projection_page_visible_v1(uuid,uuid,text,date,date,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON FUNCTION public.pdv_financial_projection_page_visible_v1(uuid,uuid,text,date,date,integer,integer) IS
  'Interna. Mesmo contrato do pdv_financial_projection_page_v2, sobre pdv_financial_projection_rows_visible_v1 (escopo de estoque do usuario). Totais e pagina saem da mesma leitura.';

-- 3. Agrupamento por entrega do v4, sobre as linhas visiveis. Corpo identico
-- ao pdv_partial_projection_groups_v4, so a fonte muda.
CREATE OR REPLACE FUNCTION public.pdv_partial_projection_groups_v5(
  p_company_id uuid,p_user_id uuid,p_projection text,p_from date,p_to date,
  p_limit integer,p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
  WITH projection_row AS (
    SELECT source.event_id,source.event_date,source.source_type,
           source.revenue,source.cmv,source.expense,source.cash_flow
      FROM public.pdv_financial_projection_rows_visible_v1(p_company_id,p_user_id) source
     WHERE source.projection_kind=p_projection
       AND source.event_date BETWEEN p_from AND p_to
  ), resolved AS (
    SELECT projection_row.event_id,projection_row.event_date,
           projection_row.source_type,projection_row.revenue,projection_row.cmv,
           projection_row.expense,projection_row.cash_flow,
           delivery_item.delivery_id,delivery_item.quantity,
           order_item.sort_order,
           COALESCE(NULLIF(btrim(order_item.description),''),'Item sem descrição') description,
           orders.number order_number
      FROM projection_row
      LEFT JOIN public.pdv_delivery_items delivery_item
        ON projection_row.source_type IN ('delivery_v2','zero_value_delivery_cmv_v2')
       AND delivery_item.id=projection_row.event_id
       AND delivery_item.company_id=p_company_id
      LEFT JOIN public.pdv_order_items order_item
        ON order_item.id=delivery_item.order_item_id
       AND order_item.company_id=p_company_id
      LEFT JOIN public.pdv_deliveries delivery
        ON delivery.id=delivery_item.delivery_id
       AND delivery.company_id=p_company_id
      LEFT JOIN public.pdv_orders orders
        ON orders.id=delivery.order_id
       AND orders.company_id=p_company_id
  ), grouped AS (
    SELECT resolved.delivery_id group_key,resolved.event_date,resolved.source_type,
           max(resolved.order_number) order_number,count(*)::integer item_count,
           round(sum(resolved.revenue),2) revenue,
           CASE WHEN bool_or(resolved.cmv IS NULL) THEN NULL
                ELSE round(sum(resolved.cmv),2) END cmv,
           round(sum(resolved.expense),2) expense,
           round(sum(resolved.cash_flow),2) cash_flow,
           jsonb_agg(jsonb_build_object(
             'description',resolved.description,
             'quantity',resolved.quantity,
             'revenue',round(resolved.revenue,2),
             'cmv',CASE WHEN resolved.cmv IS NULL THEN NULL ELSE round(resolved.cmv,2) END
           ) ORDER BY resolved.sort_order,resolved.description,resolved.event_id) details
      FROM resolved
     WHERE resolved.delivery_id IS NOT NULL
     GROUP BY resolved.delivery_id,resolved.event_date,resolved.source_type
    UNION ALL
    SELECT resolved.event_id,resolved.event_date,resolved.source_type,
           NULL::integer,1,round(resolved.revenue,2),
           CASE WHEN resolved.cmv IS NULL THEN NULL ELSE round(resolved.cmv,2) END,
           round(resolved.expense,2),round(resolved.cash_flow,2),'[]'::jsonb
      FROM resolved
     WHERE resolved.delivery_id IS NULL
  ), ranked AS (
    SELECT grouped.group_key,grouped.event_date,grouped.source_type,
           grouped.order_number,grouped.item_count,grouped.revenue,grouped.cmv,
           grouped.expense,grouped.cash_flow,grouped.details,
           row_number() OVER (
             ORDER BY grouped.event_date,grouped.order_number NULLS LAST,
                      grouped.group_key,grouped.source_type
           ) ordinality
      FROM grouped
  )
  SELECT jsonb_build_object(
    'total_count',(SELECT count(*) FROM grouped),
    'entries',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'event_id','grupo-'||(ranked.ordinality-p_offset)::text,
               'event_date',ranked.event_date,
               'source_type',ranked.source_type,
               'order_number',ranked.order_number,
               'item_count',ranked.item_count,
               'revenue',ranked.revenue,
               'cmv',ranked.cmv,
               'expense',ranked.expense,
               'cash_flow',ranked.cash_flow,
               'details',ranked.details
             ) ORDER BY ranked.ordinality)
        FROM ranked
       WHERE ranked.ordinality>p_offset
         AND ranked.ordinality<=p_offset+p_limit
    ),'[]'::jsonb)
  );
$fn$;

REVOKE ALL ON FUNCTION public.pdv_partial_projection_groups_v5(uuid,uuid,text,date,date,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON FUNCTION public.pdv_partial_projection_groups_v5(uuid,uuid,text,date,date,integer,integer) IS
  'Interna. Agrupamento por entrega do Resumo (mesmo corpo do groups_v4) sobre as linhas visiveis ao usuario (escopo de estoque).';

-- 4. Fonte dos totais do Resumo passa a ser escopada pelo usuario do contexto.
CREATE OR REPLACE FUNCTION public.pdv_partial_projection_report_v2(
  p_projection text,p_from date,p_to date,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:pdv_reports',true);
  -- Escopo de estoque do usuario aplicado antes de somar (20261122100000).
  v_result:=public.pdv_financial_projection_page_visible_v1(
    v_context.company_id,v_context.user_id,p_projection,p_from,p_to,p_limit,p_offset
  );
  IF v_result->>'scope'<>'pdv_partial' OR v_result->'initial_balance'<>'null'::jsonb
     OR v_result->'opening_availability'<>'null'::jsonb OR v_result->'closing_availability'<>'null'::jsonb THEN
    RAISE EXCEPTION 'A projecao parcial retornou um contrato invalido.' USING ERRCODE='55000';
  END IF;
  RETURN v_result;
END $fn$;

-- 5. Resumo v4: totais (via v2) e linhas agrupadas (via groups_v5) com o
-- mesmo escopo. Contrato identico.
CREATE OR REPLACE FUNCTION public.pdv_partial_projection_report_v4(
  p_projection text,p_from date,p_to date,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE v_context record; v_result jsonb; v_groups jsonb; v_total bigint;
BEGIN
  IF public.pdv_can_operate_other_cash_v2(auth.uid()) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar dados de outros caixas.'
      USING ERRCODE='42501',DETAIL='code=pdv_cross_cash_report_denied';
  END IF;
  IF public.pdv_current_actor_has_explicit_permission_v3('fn:view_finance_totals') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar totais financeiros.'
      USING ERRCODE='42501',DETAIL='code=pdv_finance_report_denied';
  END IF;
  -- A v2 permanece a fonte unica dos totais, da validacao de periodo/paginacao
  -- e da checagem de contrato. Totais e linhas leem o mesmo conjunto escopado
  -- pelo estoque acessivel ao usuario: agrupar nao move total e usuario
  -- restrito nao ve receita de outro estoque nem no topo.
  v_result:=public.pdv_partial_projection_report_v2(
    p_projection,p_from,p_to,p_limit,p_offset
  );
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:pdv_reports',true);
  v_groups:=public.pdv_partial_projection_groups_v5(
    v_context.company_id,v_context.user_id,p_projection,p_from,p_to,p_limit,p_offset
  );
  v_total:=(v_groups->>'total_count')::bigint;
  RETURN v_result || jsonb_build_object(
    'total_count',v_total,
    'has_more',(p_offset+jsonb_array_length(v_groups->'entries'))<v_total,
    'entries',v_groups->'entries'
  );
END
$fn$;

-- CREATE OR REPLACE preserva a ACL; reafirmada para o caso de banco novo.
REVOKE ALL ON FUNCTION public.pdv_partial_projection_report_v4(text,date,date,integer,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_partial_projection_report_v4(text,date,date,integer,integer)
  TO authenticated,service_role;

-- 6. v3 legado: ninguem chama (front usa o v4). Fecha a porta em vez de
-- manter duas superficies.
REVOKE EXECUTE ON FUNCTION public.pdv_partial_projection_report_v3(text,date,date,integer,integer)
  FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION public.pdv_partial_projection_report_v4(text,date,date,integer,integer) IS
  'Resumo dos relatorios do PDV (tela e export). Totais e linhas agrupadas por entrega filtrados pelo estoque acessivel ao usuario (can_access_stock); super_admin/admin/gestor veem tudo. Lancamento financeiro sem estoque proprio herda os estoques dos pedidos e do terminal da sessao.';

COMMIT;
