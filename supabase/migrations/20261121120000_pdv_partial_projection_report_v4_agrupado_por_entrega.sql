-- PDV / Relatorios: resumo da projecao parcial agrupado por entrega (v4).
--
-- O resumo listava uma linha por item entregue, entao uma venda de balcao com
-- cinco produtos aparecia como cinco linhas "Entrega reconhecida" e o relatorio
-- ficava ilegivel para o dono da loja.
--
-- Agrupamos por ENTREGA (pdv_deliveries.id), nao por pedido: no balcao um mesmo
-- pedido pode ser retirado em datas diferentes, e agrupar por pedido produziria
-- uma linha unica carregando uma data falsa, quebrando o filtro de periodo.
-- Agrupando por entrega, a venda direta (uma entrega) vira uma linha sozinha e
-- a retirada parcial vira uma linha por retirada, cada uma na sua data. Nao
-- existe condicional de modo da empresa nesta logica.
--
-- Agrupar e apresentacao: os totais do periodo continuam vindo das funcoes v2,
-- sem recalculo. Somente a lista de lancamentos e a paginacao mudam.
BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Nucleo interno do agrupamento. Recebe a empresa ja resolvida e assume o
-- periodo/paginacao previamente validados pela v2 (a v4 chama a v2 antes).
-- Fechada para todos os papeis, igual rows_v2/page_v2: entra-se por uma
-- assinatura que declara o alcance company-wide e exige as capacidades.
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
    -- grupos fechados e nenhum grupo fica partido entre duas paginas.
    SELECT grouped.group_key,grouped.event_date,grouped.source_type,
           grouped.order_number,grouped.item_count,grouped.revenue,grouped.cmv,
           grouped.expense,grouped.cash_flow,grouped.details,
           row_number() OVER (
             ORDER BY grouped.event_date,grouped.group_key,grouped.source_type
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

-- Mesma assinatura e mesmas travas do v3. As duas capacidades sao conferidas
-- antes de qualquer leitura; admin/gestor nao e permissao implicita aqui.
-- Raiz identica a do v2/v3 (inclusive availability_status): so entries,
-- total_count e has_more mudam, porque agora contam grupos.
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
  -- e da checagem de contrato da projecao parcial. Nenhum centavo e recalculado
  -- aqui: agrupar nao pode mover total.
  v_result:=public.pdv_partial_projection_report_v2(
    p_projection,p_from,p_to,p_limit,p_offset
  );
  SELECT * INTO v_context FROM public.pdv_reports_context_v2('screen:pdv_reports',true);
  v_groups:=public.pdv_partial_projection_groups_v4(
    v_context.company_id,p_projection,p_from,p_to,p_limit,p_offset
  );
  v_total:=(v_groups->>'total_count')::bigint;
  RETURN v_result || jsonb_build_object(
    'total_count',v_total,
    'has_more',(p_offset+jsonb_array_length(v_groups->'entries'))<v_total,
    'entries',v_groups->'entries'
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_partial_projection_groups_v4(uuid,text,date,date,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_partial_projection_report_v4(text,date,date,integer,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_partial_projection_report_v4(text,date,date,integer,integer)
  TO authenticated,service_role;

COMMENT ON FUNCTION public.pdv_partial_projection_groups_v4(uuid,text,date,date,integer,integer) IS
  'Nucleo do agrupamento do resumo parcial do PDV. Agrupa por entrega (pdv_deliveries.id) + tipo de origem + data de reconhecimento, nunca por pedido: no balcao um pedido pode ser retirado em datas diferentes e uma linha so carregaria data falsa. Ordinal da pagina e sintetico; nenhum id real sai no payload. Interna: entrada publica e pdv_partial_projection_report_v4.';
COMMENT ON FUNCTION public.pdv_partial_projection_report_v4(text,date,date,integer,integer) IS
  'Projecao parcial do PDV com o resumo agrupado por entrega: uma linha por retirada, com os itens em details. Nao agrupa por pedido porque retirada parcial tem datas diferentes e isso falsificaria o filtro de periodo. Totais, validacao e contrato vem da v2 sem recalculo; total_count e has_more contam grupos e a paginacao e aplicada depois do agrupamento. Exige pdv_can_operate_other_cash_v2 e fn:view_finance_totals, como a v3.';

COMMIT;
