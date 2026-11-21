-- PDV / Relatorios: resumo agrupado (v4) em ordem de venda dentro do dia.
--
-- A 20261121120000 ordenava os grupos de um mesmo dia pelo id da entrega
-- (uuid), entao a tela mostrava "Venda 11, Venda 14, Venda 5..." fora de
-- ordem. Agora o desempate e o numero da venda. So muda a ordem: totais,
-- contagem, travas de permissao e formato do payload ficam identicos.
BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.pdv_partial_projection_groups_v4(
  p_company_id uuid,p_projection text,p_from date,p_to date,
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
      FROM public.pdv_financial_projection_rows_v2(p_company_id) source
     WHERE source.projection_kind=p_projection
       AND source.event_date BETWEEN p_from AND p_to
  ), resolved AS (
    -- Somente as origens que carregam delivery_item resolvem entrega. Fato
    -- financeiro, aplicacao de liquidacao e legado seguem avulsos.
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
    -- Uma linha por (entrega, tipo de origem, data de reconhecimento). O tipo
    -- entra na chave para nunca misturar reconhecimento comercial com CMV de
    -- bonificado; a data entra para nenhum grupo atravessar a borda do periodo.
    -- CMV do grupo e NULL quando qualquer filho tem custo desconhecido: soma
    -- parcial silenciosa seria mentira contabil.
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
    -- Ordinal calculado sobre o conjunto agrupado inteiro: a pagina recorta
    -- grupos fechados e nenhum grupo fica partido entre duas paginas. Dentro
    -- do dia, as vendas saem pelo numero (sequencial por empresa); eventos sem
    -- venda vem depois. group_key so desempata, nunca decide a ordem visivel.
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
      -- event_id e ordinal sintetico da pagina. Nenhum id real, nenhum deep
      -- link: o alcance company-wide do relatorio nao autoriza navegacao.
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

REVOKE ALL ON FUNCTION public.pdv_partial_projection_groups_v4(uuid,text,date,date,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
