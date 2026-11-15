-- Read-only comparison. Never reclassifies purchases or replaces the company DRE.
BEGIN;
CREATE OR REPLACE FUNCTION public.finance_pdv_reconciliation_context_v3()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $fn$
DECLARE u uuid:=auth.uid(); c uuid;
BEGIN
  c:=public.get_user_company_id(u);
  IF u IS NULL OR c IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.user_id=u AND p.company_id=c AND p.is_active IS TRUE
  ) OR public.tenant_subscription_allows_access(c) IS DISTINCT FROM TRUE
    OR public.company_has_module(c,'pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Acesso indisponível para esta empresa.' USING ERRCODE='42501',DETAIL='code=finance_reconciliation_access_denied';
  END IF;
  -- Company-wide figures require the same nominal cross-cash capability as reports v3.
  IF public.pdv_current_actor_has_explicit_permission_v3('screen:finance') IS DISTINCT FROM TRUE
    OR public.pdv_current_actor_has_explicit_permission_v3('fn:view_finance_totals') IS DISTINCT FROM TRUE
    OR public.pdv_can_operate_other_cash_v2(u) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Seu perfil não permite consultar esta conferência.' USING ERRCODE='42501',DETAIL='code=finance_reconciliation_permission_denied';
  END IF;
  RETURN c;
END $fn$;
REVOKE ALL ON FUNCTION public.finance_pdv_reconciliation_context_v3() FROM PUBLIC,anon,authenticated,service_role;

-- Resolve provenance before exposing a commercial event or its source ID.
CREATE OR REPLACE FUNCTION public.finance_pdv_reconciliation_source_allowed_v3(c uuid,source text,event uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE order_ref uuid;
BEGIN
  IF c IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN RETURN false; END IF;
  IF source IN('delivery_v2','zero_value_delivery_cmv_v2') THEN
    SELECT oi.order_id INTO order_ref FROM public.pdv_delivery_items di JOIN public.pdv_order_items oi ON oi.id=di.order_item_id AND oi.company_id=di.company_id WHERE di.id=event AND di.company_id=c;
  ELSIF source IN('settlement_application_v2','payment_reversal_application_v2') THEN
    SELECT a.order_id INTO order_ref FROM public.pdv_settlement_applications a WHERE a.id=event AND a.company_id=c;
  ELSIF source IN('commercial_return_v2','commercial_return_reversal_v2') THEN
    SELECT h.order_id INTO order_ref FROM public.pdv_commercial_return_items i JOIN public.pdv_commercial_returns h ON h.id=i.commercial_return_id AND h.company_id=i.company_id WHERE i.id=event AND i.company_id=c;
  ELSIF source IN('legacy_financial','pdv_card_fee','pdv_cash_shortage','pdv_cash_surplus',
    'pdv_receivable_settlement','pdv_receivable_reversal','pdv_refund','pdv_refund_reversal','pdv_supplier_payment') THEN
    RETURN public.pdv_can_read_financial_transaction_v3(auth.uid(),c,event);
  ELSE RETURN false;
  END IF;
  IF order_ref IS NULL OR public.pdv_order_actor_can_access_v2(order_ref,auth.uid()) IS DISTINCT FROM true THEN RETURN false; END IF;
  -- Check the complete provenance: header, reservations, delivery movements and
  -- every return destination. An unresolved material origin must fail closed.
  RETURN public.pdv_has_stock_access_scope_v2(auth.uid(),c,p_order_id=>order_ref) IS TRUE;
END $fn$;
REVOKE ALL ON FUNCTION public.finance_pdv_reconciliation_source_allowed_v3(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.finance_pdv_reconciliation_rows_v3(p_company uuid,p_projection text,p_from date,p_to date)
RETURNS TABLE(event_key text,event_date date,source_role text,source_id uuid,source_scope text,
  revenue numeric,cmv numeric,expense numeric,cash_flow numeric,purchase_amount numeric,purchase_paid_amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT p_projection||':'||p.source_type||':'||p.event_id::text,p.event_date,p.source_type,p.event_id,'pdv_commercial',
    p.revenue,p.cmv,p.expense,p.cash_flow,0::numeric,0::numeric
  FROM public.pdv_financial_projection_rows_v2(p_company) p
  WHERE p.projection_kind=p_projection AND p.event_date BETWEEN p_from AND p_to
    AND public.finance_pdv_reconciliation_source_allowed_v3(p_company,p.source_type,p.event_id)
  UNION ALL
  -- Acquisition diagnostics have their own columns: never added to commercial CMV/result.
  -- EXISTS deduplicates structurally even if an imported purchase has multiple links.
  SELECT p_projection||':inventory_acquisition:'||t.id::text,
    CASE WHEN p_projection='dre_competence' THEN t.transaction_date ELSE t.paid_date END,
    'inventory_acquisition',t.id,'inventory_acquisition',0::numeric,0::numeric,0::numeric,0::numeric,
    t.amount,CASE WHEN t.is_paid IS TRUE THEN t.amount ELSE 0::numeric END
  FROM public.financial_transactions t
  WHERE t.company_id=p_company AND t.cancelled_at IS NULL AND t.transaction_type::text='saida'
    AND t.transfer_pair_id IS NULL
    AND public.pdv_can_read_financial_transaction_v3(auth.uid(),p_company,t.id)
    AND EXISTS(SELECT 1 FROM public.compra_ordens oc JOIN public.compras c ON c.id=oc.compra_id AND c.company_id=oc.company_id
      WHERE oc.company_id=p_company AND oc.financial_transaction_id=t.id AND c.flow_type='compra_direta'
        AND c.stock_id IS NOT NULL
        AND public.pdv_has_stock_access_scope_v2(auth.uid(),p_company,p_stock_id=>c.stock_id) IS TRUE)
    AND CASE WHEN p_projection='dre_competence' THEN t.transaction_date BETWEEN p_from AND p_to
      ELSE t.is_paid IS TRUE AND t.paid_date BETWEEN p_from AND p_to END
$fn$;
REVOKE ALL ON FUNCTION public.finance_pdv_reconciliation_rows_v3(uuid,text,date,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.finance_get_pdv_reconciliation_v3(
  p_projection text,p_from date,p_to date,p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c uuid; result jsonb;
BEGIN
  c:=public.finance_pdv_reconciliation_context_v3();
  IF p_projection IS NULL OR p_projection NOT IN('dre_competence','dre_cash','dfc')
    OR p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200
    OR p_offset IS NULL OR p_offset<0 THEN
    RAISE EXCEPTION 'Revise o período e a paginação.' USING ERRCODE='22023',DETAIL='code=finance_reconciliation_input_invalid';
  END IF;
  WITH rows AS MATERIALIZED(SELECT * FROM public.finance_pdv_reconciliation_rows_v3(c,p_projection,p_from,p_to)),
  totals AS(SELECT count(*) count,
    COALESCE(sum(revenue) FILTER(WHERE source_scope='pdv_commercial'),0) revenue,
    CASE WHEN count(*) FILTER(WHERE source_scope='pdv_commercial' AND revenue<>0 AND cmv IS NULL)>0 THEN NULL
      ELSE COALESCE(sum(cmv) FILTER(WHERE source_scope='pdv_commercial'),0) END cmv,
    COALESCE(sum(expense) FILTER(WHERE source_scope='pdv_commercial'),0) expense,
    COALESCE(sum(cash_flow) FILTER(WHERE source_scope='pdv_commercial'),0) cash_flow,
    COALESCE(sum(purchase_amount),0) acquisition,
    COALESCE(sum(purchase_paid_amount),0) paid_acquisition,
    count(*) FILTER(WHERE source_scope='inventory_acquisition') acquisition_count FROM rows),
  page AS(SELECT * FROM rows ORDER BY event_date,event_key LIMIT p_limit OFFSET p_offset)
  SELECT jsonb_build_object('scope','company_shadow','coverage_status','incomplete',
    'company_result',NULL,'company_cash_flow',NULL,
    'coverage_reasons',jsonb_build_array('shared_inventory_consumption_not_reconciled','non_pdv_sources_not_integrated','partial_purchase_payments_not_integrated'),
    'snapshot',md5(COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.event_key)::text FROM rows r),'[]')),
    'projection',p_projection,'from',p_from,'to',p_to,
    'total_count',totals.count,'limit',p_limit,'offset',p_offset,
    'has_more',p_offset+(SELECT count(*) FROM page)<totals.count,
    'commercial',jsonb_build_object('revenue',round(totals.revenue,2),'cmv',round(totals.cmv,2),
      'expense',round(totals.expense,2),'result',round(totals.revenue-totals.cmv-totals.expense,2),'cash_flow',round(totals.cash_flow,2)),
    'acquisitions',jsonb_build_object('amount',round(totals.acquisition,2),'fully_paid_amount',round(totals.paid_acquisition,2),'count',totals.acquisition_count),
    'entries',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY event_date,event_key) FROM page),'[]'::jsonb)) INTO result FROM totals;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.finance_get_pdv_reconciliation_v3(text,date,date,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_get_pdv_reconciliation_v3(text,date,date,integer,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.finance_get_pdv_reconciliation_entry_v3(p_event_key text,p_projection text,p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c uuid; result jsonb;
BEGIN
  c:=public.finance_pdv_reconciliation_context_v3();
  IF p_projection IS NULL OR p_projection NOT IN('dre_competence','dre_cash','dfc')
    OR p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_event_key IS NULL OR length(p_event_key)>200 THEN
    RAISE EXCEPTION 'Revise o período e o evento.' USING ERRCODE='22023',DETAIL='code=finance_reconciliation_input_invalid';
  END IF;
  SELECT to_jsonb(r) INTO result FROM public.finance_pdv_reconciliation_rows_v3(c,p_projection,p_from,p_to) r WHERE r.event_key=p_event_key;
  IF result IS NULL THEN RAISE EXCEPTION 'Este evento não está disponível neste período.' USING ERRCODE='P0002',DETAIL='code=finance_reconciliation_entry_not_found'; END IF;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.finance_get_pdv_reconciliation_entry_v3(text,text,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_get_pdv_reconciliation_entry_v3(text,text,date,date) TO authenticated,service_role;
COMMENT ON FUNCTION public.finance_get_pdv_reconciliation_v3(text,date,date,integer,integer) IS
  'Conferência read-only PDV/estoque. Total global sempre indisponível enquanto consumo compartilhado/OS e demais origens não forem reconciliados. Não substitui DRE/DFC nem altera pagamentos.';
COMMIT;
