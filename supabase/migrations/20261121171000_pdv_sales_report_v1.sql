-- PDV / Relatorios: aba "Vendas" (o que eu vendi), v1.
--
-- O dono da loja quer ranking de vendas por PRODUTO, CLIENTE, VENDEDOR e
-- HORARIO do dia. Esta RPC devolve esse ranking ja agregado, paginado e com
-- os totais do periodo.
--
-- Fonte unica dos numeros: pdv_commercial_facts_v2, a mesma que alimenta a
-- competencia do Resumo (pdv_partial_projection_report_v4, linhas delivery_v2
-- e commercial_return*_v2) e o get_inventory_abc_report. Devolucao e estorno
-- de devolucao entram liquidos (net_*), como no Resumo. O que o Resumo soma
-- alem disso (lancamentos financeiros do PDV sem papel, como sobra/falta de
-- caixa, e taxas de cartao) nao e venda e fica fora daqui de proposito.
--
-- Travas: identicas ao Resumo v4 (outros caixas + totais financeiros +
-- tela screen:pdv_reports com modulo PDV ativo). Alem delas, ESCOPO DE
-- ESTOQUE: todo fato e filtrado pelo estoque acessivel ao usuario
-- (can_access_stock, mesma regra do ABC) antes de qualquer agregacao, entao
-- quem e restrito a um setor nao ve receita de outro setor em nenhuma
-- dimensao nem nos totais (vazamento real da v1.19.11). O espelho global
-- inventory.quantity nao e lido. Fato sem estoque (estoque excluido, FK SET
-- NULL) so aparece para quem ja enxerga todo estoque (super_admin,
-- admin, gestor), que e exatamente quem o can_access_stock libera sempre.
--
-- Horario: hora local da empresa (company_settings.timezone, mesma regra do
-- company_today) do REGISTRO do evento que gerou a receita: pdv_deliveries.
-- created_at para entrega e pdv_commercial_returns.created_at para devolucao
-- ou estorno. E o mesmo momento que define a data de reconhecimento usada no
-- filtro de periodo (competencia por entrega), entao hora e dia nunca se
-- contradizem; o horario do pedido/pagamento nao serve porque a retirada
-- pode acontecer em outro dia.
--
-- CMV desconhecido em qualquer fato do grupo => cmv e margem NULL no grupo
-- (e nos totais), nunca soma parcial.
BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.pdv_sales_report_v1(
  p_dimension text,p_from date,p_to date,
  p_limit integer DEFAULT 50,p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_context record;
  v_sees_all boolean;
  v_timezone text:='America/Sao_Paulo';
  v_result jsonb;
BEGIN
  -- Mesmas travas do Resumo v4, conferidas antes de qualquer leitura.
  IF public.pdv_can_operate_other_cash_v2(auth.uid()) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar dados de outros caixas.'
      USING ERRCODE='42501',DETAIL='code=pdv_cross_cash_report_denied';
  END IF;
  IF public.pdv_current_actor_has_explicit_permission_v3('fn:view_finance_totals') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar totais financeiros.'
      USING ERRCODE='42501',DETAIL='code=pdv_finance_report_denied';
  END IF;
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:pdv_reports',true);

  IF p_dimension IS NULL OR p_dimension NOT IN ('product','customer','salesperson','hour') THEN
    RAISE EXCEPTION 'Escolha como agrupar as vendas: por produto, cliente, vendedor ou horário.'
      USING ERRCODE='22023',DETAIL='code=pdv_sales_report_dimension_invalid';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from>p_to THEN
    RAISE EXCEPTION 'Período inválido: informe a data inicial e a final, com a inicial antes ou igual à final.'
      USING ERRCODE='22023',DETAIL='code=pdv_sales_report_period_invalid';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
     OR p_offset IS NULL OR p_offset<0 THEN
    RAISE EXCEPTION 'Paginação inválida: a página deve ter de 1 a 500 linhas e o deslocamento não pode ser negativo.'
      USING ERRCODE='22023',DETAIL='code=pdv_sales_report_page_invalid';
  END IF;

  -- Os mesmos ramos que fazem can_access_stock liberar qualquer estoque.
  v_sees_all:=public.is_super_admin(v_context.user_id) IS TRUE
    OR public.is_admin_or_gestor(v_context.user_id) IS TRUE;

  IF p_dimension='hour' THEN
    -- Mesma resolucao do company_today; fuso invalido cai no padrao em vez
    -- de derrubar o relatorio.
    v_timezone:=COALESCE(NULLIF((
      SELECT settings.timezone FROM public.company_settings settings
       WHERE settings.company_id=v_context.company_id
       ORDER BY settings.updated_at DESC LIMIT 1
    ),''),'America/Sao_Paulo');
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name=v_timezone) THEN
      v_timezone:='America/Sao_Paulo';
    END IF;
  END IF;

  WITH accessible AS MATERIALIZED (
    SELECT stock.id FROM public.stocks stock
     WHERE stock.company_id=v_context.company_id
       AND public.can_access_stock(v_context.user_id,stock.id) IS TRUE
  ), fact AS MATERIALIZED (
    -- Escopo de estoque aplicado no fato, antes de qualquer agregacao.
    SELECT fact.event_id,fact.event_kind,fact.order_id,fact.inventory_id,
           fact.customer_id,fact.net_quantity,fact.net_revenue,fact.net_cmv,
           fact.cost_known
      FROM public.pdv_commercial_facts_v2(v_context.company_id) fact
     WHERE fact.event_date BETWEEN p_from AND p_to
       AND (fact.stock_id IN (SELECT accessible.id FROM accessible)
            OR (fact.stock_id IS NULL AND v_sees_all))
  ), keyed AS (
    SELECT CASE p_dimension
             WHEN 'product' THEN fact.inventory_id::text
             WHEN 'customer' THEN fact.customer_id::text
             WHEN 'salesperson' THEN orders.salesperson_id::text
             ELSE extract(hour FROM (COALESCE(delivery.created_at,commercial_return.created_at)
                    AT TIME ZONE v_timezone))::integer::text
           END group_key,
           fact.event_kind,fact.order_id,fact.net_quantity,fact.net_revenue,
           fact.net_cmv,fact.cost_known
      FROM fact
      LEFT JOIN public.pdv_orders orders
        ON p_dimension='salesperson'
       AND orders.id=fact.order_id AND orders.company_id=v_context.company_id
      LEFT JOIN public.pdv_delivery_items delivery_item
        ON p_dimension='hour' AND fact.event_kind='delivery'
       AND delivery_item.id=fact.event_id AND delivery_item.company_id=v_context.company_id
      LEFT JOIN public.pdv_deliveries delivery
        ON delivery.id=delivery_item.delivery_id AND delivery.company_id=v_context.company_id
      LEFT JOIN public.pdv_commercial_return_items return_item
        ON p_dimension='hour' AND fact.event_kind<>'delivery'
       AND return_item.id=fact.event_id AND return_item.company_id=v_context.company_id
      LEFT JOIN public.pdv_commercial_returns commercial_return
        ON commercial_return.id=return_item.commercial_return_id
       AND commercial_return.company_id=v_context.company_id
  ), grouped AS (
    -- Venda = pedido com entrega reconhecida no periodo. Devolucao sozinha
    -- move receita, mas nao conta como venda.
    SELECT keyed.group_key,
           count(DISTINCT keyed.order_id) FILTER (WHERE keyed.event_kind='delivery')::integer orders_count,
           COALESCE(sum(keyed.net_quantity),0) quantity,
           round(COALESCE(sum(keyed.net_revenue),0),2) revenue,
           CASE WHEN bool_or(NOT keyed.cost_known) THEN NULL
                ELSE round(COALESCE(sum(keyed.net_cmv),0),2) END cmv
      FROM keyed
     GROUP BY keyed.group_key
  ), totals AS (
    SELECT count(DISTINCT fact.order_id) FILTER (WHERE fact.event_kind='delivery')::integer orders_count,
           COALESCE(sum(fact.net_quantity),0) quantity,
           round(COALESCE(sum(fact.net_revenue),0),2) revenue,
           CASE WHEN bool_or(NOT fact.cost_known) THEN NULL
                ELSE round(COALESCE(sum(fact.net_cmv),0),2) END cmv
      FROM fact
  ), labeled AS (
    SELECT grouped.*,
           CASE p_dimension
             WHEN 'product' THEN CASE
               WHEN grouped.group_key IS NULL THEN 'Item avulso sem produto cadastrado'
               ELSE COALESCE(NULLIF(btrim(inventory.name),''),'Produto sem nome') END
             WHEN 'customer' THEN CASE
               WHEN grouped.group_key IS NULL THEN 'Sem cliente identificado'
               ELSE COALESCE(NULLIF(btrim(customer.name),''),'Cliente sem nome') END
             WHEN 'salesperson' THEN CASE
               WHEN grouped.group_key IS NULL THEN 'Sem vendedor'
               ELSE COALESCE(NULLIF(btrim(seller.full_name),''),'Vendedor sem nome') END
             ELSE CASE
               WHEN grouped.group_key IS NULL THEN 'Horário não identificado'
               ELSE format('%sh às %sh',lpad(grouped.group_key,2,'0'),
                           lpad(((grouped.group_key::integer+1)%24)::text,2,'0')) END
           END label,
           CASE WHEN p_dimension='product' AND grouped.group_key IS NOT NULL THEN
             NULLIF(concat_ws(' · ',
               'SKU '||NULLIF(btrim(inventory.sku),''),
               COALESCE(NULLIF(btrim(inventory.unit),''),'un'),
               CASE WHEN inventory.archived_at IS NOT NULL THEN 'arquivado' END),'')
           END detail
      FROM grouped
      LEFT JOIN public.inventory inventory
        ON p_dimension='product' AND inventory.id::text=grouped.group_key
       AND inventory.company_id=v_context.company_id
      LEFT JOIN public.customers customer
        ON p_dimension='customer' AND customer.id::text=grouped.group_key
       AND customer.company_id=v_context.company_id
      LEFT JOIN public.profiles seller
        ON p_dimension='salesperson' AND seller.user_id::text=grouped.group_key
       AND seller.company_id=v_context.company_id
  ), ranked AS (
    SELECT labeled.*,
           row_number() OVER (ORDER BY
             CASE WHEN p_dimension='hour' THEN labeled.group_key::integer END,
             labeled.revenue DESC,labeled.label,labeled.group_key NULLS LAST
           ) ordinality
      FROM labeled
  )
  SELECT jsonb_build_object(
    'dimension',p_dimension,
    'from',p_from,
    'to',p_to,
    'totals',jsonb_build_object(
      'orders_count',totals.orders_count,
      'quantity',totals.quantity,
      'revenue',totals.revenue,
      'cmv',totals.cmv,
      'margin',CASE WHEN totals.cmv IS NULL THEN NULL ELSE round(totals.revenue-totals.cmv,2) END
    ),
    'total_count',(SELECT count(*) FROM grouped),
    'limit',p_limit,
    'offset',p_offset,
    'has_more',p_offset+(SELECT count(*) FROM ranked
                          WHERE ranked.ordinality>p_offset
                            AND ranked.ordinality<=p_offset+p_limit)
               <(SELECT count(*) FROM grouped),
    'rows',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'key',ranked.group_key,
               'label',ranked.label,
               'detail',ranked.detail,
               'orders_count',ranked.orders_count,
               'quantity',ranked.quantity,
               'revenue',ranked.revenue,
               'cmv',ranked.cmv,
               'margin',CASE WHEN ranked.cmv IS NULL THEN NULL ELSE round(ranked.revenue-ranked.cmv,2) END,
               'share',CASE WHEN totals.revenue=0 THEN 0
                            ELSE round(ranked.revenue/totals.revenue,4) END
             ) ORDER BY ranked.ordinality)
        FROM ranked
       WHERE ranked.ordinality>p_offset
         AND ranked.ordinality<=p_offset+p_limit
    ),'[]'::jsonb)
  ) INTO v_result
  FROM totals;

  RETURN v_result;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_sales_report_v1(text,date,date,integer,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_sales_report_v1(text,date,date,integer,integer)
  TO authenticated,service_role;

COMMENT ON FUNCTION public.pdv_sales_report_v1(text,date,date,integer,integer) IS
  'Aba Vendas dos relatorios do PDV: ranking por produto, cliente, vendedor ou hora do dia (hora local da empresa do registro da entrega/devolucao). Fonte unica pdv_commercial_facts_v2 (mesma da competencia do Resumo v4 e do ABC), devolucoes liquidas, CMV desconhecido no grupo => cmv/margem NULL. Mesmas travas do Resumo v4 e escopo de estoque por can_access_stock aplicado no fato antes de agregar: usuario restrito nunca ve receita de outro estoque. Nenhum id de pedido no payload.';

COMMIT;
