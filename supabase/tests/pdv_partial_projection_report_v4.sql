-- Contrato da projecao parcial agrupada por entrega (v4).
-- Executar depois de supabase db reset. Cobre ACL, SECURITY DEFINER/search_path,
-- fail-closed sem capacidade e a forma do payload agrupado. Nao cria venda:
-- a prova de que os totais batem com o v3 e feita contra dados reais comparando
-- pdv_financial_projection_page_v2 com pdv_partial_projection_groups_v4.
BEGIN;

DO $contract$
DECLARE v_fn text;
BEGIN
  -- Entrada publica: authenticated sim, anon nunca.
  v_fn:='public.pdv_partial_projection_report_v4(text,date,date,integer,integer)';
  IF has_function_privilege('anon',v_fn,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_fn,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_fn,'EXECUTE') THEN
    RAISE EXCEPTION 'ACL publica incorreta em %',v_fn; END IF;

  -- Nucleo interno: fechado para todo papel, igual rows_v2/page_v2.
  v_fn:='public.pdv_partial_projection_groups_v4(uuid,text,date,date,integer,integer)';
  IF has_function_privilege('anon',v_fn,'EXECUTE')
     OR has_function_privilege('authenticated',v_fn,'EXECUTE')
     OR has_function_privilege('service_role',v_fn,'EXECUTE') THEN
    RAISE EXCEPTION 'nucleo de agrupamento exposto em %',v_fn; END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.pdv_partial_projection_report_v4(text,date,date,integer,integer)',
    'public.pdv_partial_projection_groups_v4(uuid,text,date,date,integer,integer)'
  ] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc procedure
      WHERE procedure.oid=v_fn::regprocedure
        AND procedure.prosecdef
        AND procedure.provolatile='s'
        AND EXISTS(SELECT 1 FROM unnest(procedure.proconfig) setting
          WHERE setting LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'RPC sem STABLE/SECURITY DEFINER/search_path em %',v_fn; END IF;
    IF COALESCE(obj_description(v_fn::regprocedure,'pg_proc'),'') NOT ILIKE '%entrega%' THEN
      RAISE EXCEPTION 'funcao sem COMMENT explicando o agrupamento: %',v_fn; END IF;
  END LOOP;

  -- O v2 e o v3 continuam existindo e intactos: o v4 e adicao, nao troca.
  IF NOT EXISTS(SELECT 1 FROM pg_proc
    WHERE oid='public.pdv_partial_projection_report_v3(text,date,date,integer,integer)'::regprocedure)
   OR NOT EXISTS(SELECT 1 FROM pg_proc
    WHERE oid='public.pdv_partial_projection_report_v2(text,date,date,integer,integer)'::regprocedure) THEN
    RAISE EXCEPTION 'v2/v3 da projecao parcial desapareceram'; END IF;
END
$contract$;

DO $gate$
DECLARE v_detail text;
BEGIN
  -- Sem ator nao existe leitura: a trava de outros caixas vem antes de tudo.
  BEGIN
    PERFORM public.pdv_partial_projection_report_v4('dre_competence',
      current_date-30,current_date,100,0);
    RAISE EXCEPTION 'v4 respondeu sem capacidade de caixa';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_detail=PG_EXCEPTION_DETAIL;
    IF v_detail IS DISTINCT FROM 'code=pdv_cross_cash_report_denied' THEN
      RAISE EXCEPTION 'trava de caixa com detail inesperado: %',v_detail; END IF;
  END;
END
$gate$;

DO $shape$
DECLARE v_company uuid; v_kind text; v_groups jsonb; v_page jsonb; v_entry jsonb;
BEGIN
  FOR v_company IN SELECT company.id FROM public.companies company LOOP
  FOREACH v_kind IN ARRAY ARRAY['dre_competence','dre_cash','dfc'] LOOP
    v_page:=public.pdv_financial_projection_page_v2(
      v_company,v_kind,current_date-365,current_date,500,0);
    v_groups:=public.pdv_partial_projection_groups_v4(
      v_company,v_kind,current_date-365,current_date,500,0);

    -- Agrupar e apresentacao: nenhum total pode mover um centavo.
    IF (v_page->>'revenue')::numeric IS DISTINCT FROM (
         SELECT COALESCE(round(sum((entry->>'revenue')::numeric),2),0)
           FROM jsonb_array_elements(v_groups->'entries') entry)
       OR (v_page->>'expense')::numeric IS DISTINCT FROM (
         SELECT COALESCE(round(sum((entry->>'expense')::numeric),2),0)
           FROM jsonb_array_elements(v_groups->'entries') entry)
       OR (v_page->>'cash_flow')::numeric IS DISTINCT FROM (
         SELECT COALESCE(round(sum((entry->>'cash_flow')::numeric),2),0)
           FROM jsonb_array_elements(v_groups->'entries') entry) THEN
      RAISE EXCEPTION 'total divergente entre v2 e agrupamento v4 (% / %)',v_company,v_kind;
    END IF;

    -- Nenhuma linha some nem duplica no agrupamento.
    IF (v_page->>'total_count')::bigint IS DISTINCT FROM (
         SELECT COALESCE(sum((entry->>'item_count')::integer),0)
           FROM jsonb_array_elements(v_groups->'entries') entry) THEN
      RAISE EXCEPTION 'soma de item_count nao fecha com as linhas do v2 (% / %)',v_company,v_kind;
    END IF;

    FOR v_entry IN SELECT entry FROM jsonb_array_elements(v_groups->'entries') entry LOOP
      -- Ordinal sintetico, nunca id real nem deep link.
      IF v_entry->>'event_id' !~ '^grupo-[0-9]+$' THEN
        RAISE EXCEPTION 'event_id fora do padrao sintetico: %',v_entry->>'event_id'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_each_text(v_entry) field
        WHERE field.value ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
           OR field.key IN ('source_record_id','cash_session_id','order_id',
                            'transaction_id','deep_link','metadata')) THEN
        RAISE EXCEPTION 'id ou deep link vazou no resumo agrupado: %',v_entry; END IF;
      IF jsonb_typeof(v_entry->'details')<>'array'
         OR (v_entry->>'item_count')::integer<1 THEN
        RAISE EXCEPTION 'contrato de details/item_count violado: %',v_entry; END IF;
      -- Entrega vira grupo com numero do pedido e um detalhe por item;
      -- qualquer outro evento continua avulso e sem numero.
      IF v_entry->>'source_type' IN ('delivery_v2','zero_value_delivery_cmv_v2') THEN
        IF v_entry->'order_number'='null'::jsonb
           OR jsonb_array_length(v_entry->'details')<>(v_entry->>'item_count')::integer THEN
          RAISE EXCEPTION 'grupo de entrega mal formado: %',v_entry; END IF;
        -- CMV do grupo e NULL quando qualquer filho tem custo desconhecido.
        IF (v_entry->'cmv'='null'::jsonb) IS DISTINCT FROM EXISTS(
             SELECT 1 FROM jsonb_array_elements(v_entry->'details') detail
              WHERE detail->'cmv'='null'::jsonb) THEN
          RAISE EXCEPTION 'propagacao de CMV desconhecido quebrada: %',v_entry; END IF;
      ELSIF v_entry->'order_number'<>'null'::jsonb
            OR jsonb_array_length(v_entry->'details')<>0
            OR (v_entry->>'item_count')::integer<>1 THEN
        RAISE EXCEPTION 'evento avulso agrupado por engano: %',v_entry;
      END IF;
    END LOOP;
  END LOOP;
  END LOOP;
END
$shape$;

ROLLBACK;
