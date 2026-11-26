-- Preço comercial e execução independentes; recibos de recebimentos confirmados.
BEGIN;

CREATE OR REPLACE FUNCTION public.generate_service_order_from_quote(
  p_quote_id uuid,
  p_equipment_services jsonb DEFAULT '[]'::jsonb
)
RETURNS public.service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_quote public.quotes%ROWTYPE;
  v_order public.service_orders%ROWTYPE;
  v_service_type_id uuid;
  v_services numeric(14,2) := 0;
  v_materials numeric(14,2) := 0;
  v_items_total numeric(14,2) := 0;
  v_final_total numeric(14,2) := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(v_user_id) OR public.is_admin_or_gestor(v_user_id)
          OR public.user_has_permission(v_user_id, 'fn:create_os')) THEN
    RAISE EXCEPTION 'Sem permissão para gerar uma ordem de serviço.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('os-commercial:'||p_quote_id::text,0));
  SELECT * INTO v_quote FROM public.quotes q
   WHERE q.id = p_quote_id
     AND (public.is_super_admin(v_user_id)
          OR (q.company_id = public.get_user_company_id(v_user_id)
              AND public.tenant_subscription_allows_access(q.company_id)))
   FOR UPDATE;
  IF v_quote.id IS NULL THEN RAISE EXCEPTION 'Orçamento não encontrado ou sem permissão.'; END IF;
  IF v_quote.converted_to_os_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.service_orders WHERE id = v_quote.converted_to_os_id;
    IF v_order.id IS NOT NULL THEN RETURN v_order; END IF;
  END IF;
  IF v_quote.status <> 'aprovado' THEN RAISE EXCEPTION 'Apenas orçamentos aprovados podem gerar uma OS.'; END IF;
  IF jsonb_typeof(COALESCE(p_equipment_services, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'A distribuição de serviços precisa ser uma lista.';
  END IF;
  IF v_quote.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = v_quote.customer_id AND c.company_id = v_quote.company_id
  ) THEN RAISE EXCEPTION 'O cliente do orçamento não pertence a esta empresa.'; END IF;

  DROP TABLE IF EXISTS pg_temp._quote_distribution;
  CREATE TEMP TABLE _quote_distribution (equipment_id uuid, service_type_id uuid) ON COMMIT DROP;
  INSERT INTO _quote_distribution (equipment_id, service_type_id)
  SELECT NULLIF(item->>'equipment_id', '')::uuid, NULLIF(service_id, '')::uuid
    FROM jsonb_array_elements(COALESCE(p_equipment_services, '[]'::jsonb)) item
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(item->'service_type_ids') = 'array'
           THEN item->'service_type_ids' ELSE '[]'::jsonb END
    ) service_id;
  DELETE FROM _quote_distribution a USING _quote_distribution b
   WHERE a.ctid > b.ctid AND a.equipment_id = b.equipment_id AND a.service_type_id = b.service_type_id;

  IF EXISTS (
    SELECT 1 FROM _quote_distribution d LEFT JOIN public.equipment e ON e.id = d.equipment_id
     WHERE e.id IS NULL OR e.company_id IS DISTINCT FROM v_quote.company_id
        OR e.customer_id IS DISTINCT FROM v_quote.customer_id
  ) THEN RAISE EXCEPTION 'Um equipamento não pertence ao cliente deste orçamento.'; END IF;
  IF EXISTS (
    SELECT 1 FROM _quote_distribution d
     WHERE NOT EXISTS (
       SELECT 1 FROM public.quote_items qi
        WHERE qi.quote_id = v_quote.id AND qi.service_type_id = d.service_type_id
     )
  ) THEN RAISE EXCEPTION 'Um serviço distribuído não pertence a este orçamento.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = v_quote.id
      AND qi.service_type_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.service_types st WHERE st.id = qi.service_type_id AND st.company_id = v_quote.company_id)
  ) THEN RAISE EXCEPTION 'Um dos serviços do orçamento não pertence a esta empresa.'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.quote_items qi WHERE qi.quote_id = v_quote.id
      AND qi.inventory_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.inventory i WHERE i.id = qi.inventory_id AND i.company_id = v_quote.company_id)
  ) THEN RAISE EXCEPTION 'Um dos materiais do orçamento não pertence a esta empresa.'; END IF;

  SELECT qi.service_type_id INTO v_service_type_id FROM public.quote_items qi
   WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL
   ORDER BY qi.position, qi.created_at LIMIT 1;
  SELECT COALESCE(SUM(total_price) FILTER (WHERE item_type IN ('servico','mao_de_obra')),0),
         COALESCE(SUM(total_price) FILTER (WHERE item_type='material'),0), COALESCE(SUM(total_price),0)
    INTO v_services, v_materials, v_items_total FROM public.quote_items WHERE quote_id = v_quote.id;
  v_final_total := COALESCE(v_quote.total_value, v_quote.total_price, v_items_total, 0);

  INSERT INTO public.service_orders
    (company_id, customer_id, equipment_id, service_type_id, status, labor_value, parts_value,
     total_value, description, notes, quote_id, created_by)
  VALUES
    (v_quote.company_id, v_quote.customer_id,
     (SELECT equipment_id FROM _quote_distribution ORDER BY equipment_id LIMIT 1),
     v_service_type_id, 'agendada', v_services, v_materials, v_final_total,
     format('Gerada do Orçamento #%s', v_quote.quote_number), v_quote.notes, v_quote.id, v_user_id)
  RETURNING * INTO v_order;

  INSERT INTO public.service_order_budget_items
    (service_order_id, company_id, position, item_type, description, details, quantity,
     unit_price, total_price, inventory_id, service_type_id, source_quote_item_id)
  SELECT v_order.id, v_quote.company_id, qi.position,
         CASE WHEN qi.item_type IN ('servico','mao_de_obra','material') THEN qi.item_type ELSE 'servico' END,
         qi.description, qi.details, qi.quantity, qi.unit_price, ROUND(qi.quantity * qi.unit_price,2),
         qi.inventory_id, qi.service_type_id, qi.id
    FROM public.quote_items qi WHERE qi.quote_id = v_quote.id ORDER BY qi.position, qi.created_at;

  INSERT INTO public.service_order_service_types (service_order_id, service_type_id, company_id, position)
  SELECT v_order.id, qi.service_type_id, v_quote.company_id,
         ROW_NUMBER() OVER (ORDER BY MIN(qi.position), qi.service_type_id)::integer - 1
    FROM public.quote_items qi WHERE qi.quote_id = v_quote.id AND qi.service_type_id IS NOT NULL
   GROUP BY qi.service_type_id;

  INSERT INTO public.service_order_equipment_service_types
    (service_order_id, equipment_id, service_type_id, company_id, position)
  SELECT v_order.id, d.equipment_id, d.service_type_id, v_quote.company_id,
         ROW_NUMBER() OVER (PARTITION BY d.equipment_id ORDER BY sost.position, d.service_type_id)::integer - 1
    FROM _quote_distribution d
    JOIN public.service_order_service_types sost
      ON sost.service_order_id = v_order.id AND sost.service_type_id = d.service_type_id;

  -- Um checklist ativo ligado a qualquer serviço daquele equipamento é aplicado
  -- uma única vez. Sem checklist vinculado, mantém o equipamento no escopo.
  INSERT INTO public.service_order_equipment (service_order_id, equipment_id, form_template_id)
  SELECT DISTINCT v_order.id, d.equipment_id, ftst.template_id
    FROM _quote_distribution d
    JOIN public.form_template_service_types ftst ON ftst.service_type_id = d.service_type_id
    JOIN public.form_templates ft ON ft.id = ftst.template_id
   WHERE ft.company_id = v_quote.company_id AND ft.is_active = true;
  INSERT INTO public.service_order_equipment (service_order_id, equipment_id, form_template_id)
  SELECT DISTINCT v_order.id, d.equipment_id, NULL::uuid
    FROM _quote_distribution d
   WHERE NOT EXISTS (
     SELECT 1 FROM public.service_order_equipment soe
      WHERE soe.service_order_id = v_order.id AND soe.equipment_id = d.equipment_id
   );

  UPDATE public.quotes SET converted_to_os_id = v_order.id, status = 'convertido' WHERE id = v_quote.id;
  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.generate_service_order_from_quote(uuid, jsonb) IS
  'Copia o comercial sem exigir execução. Distribuição legada somente quando explicitamente enviada.';



CREATE FUNCTION public.generate_service_order_from_quote_prepared(
 p_quote_id uuid,p_execution jsonb DEFAULT '[]'::jsonb,p_show_values boolean DEFAULT false
) RETURNS public.service_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.quotes%ROWTYPE; so public.service_orders%ROWTYPE; e jsonb; template uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('os-commercial:'||p_quote_id::text,0));
 SELECT * INTO q FROM public.quotes WHERE id=p_quote_id AND
  (public.is_super_admin(auth.uid()) OR (company_id=public.get_user_company_id(auth.uid()) AND public.tenant_subscription_allows_access(company_id))) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sem acesso.' USING ERRCODE='42501'; END IF;
 -- A conversão base checa permissão e devolve a mesma OS no retry.
 so:=public.generate_service_order_from_quote_with_values(p_quote_id,'[]',p_show_values);
 IF q.converted_to_os_id IS NOT NULL THEN RETURN so; END IF;
 IF jsonb_typeof(p_execution) IS DISTINCT FROM 'array' OR jsonb_array_length(p_execution)>200 THEN
  RAISE EXCEPTION 'Revise os equipamentos e checklists selecionados.' USING ERRCODE='OSC03'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_execution) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.equipment WHERE id=(e->>'equipment_id')::uuid
    AND company_id=q.company_id AND customer_id=q.customer_id) THEN
   RAISE EXCEPTION 'O equipamento não pertence ao cliente do orçamento.' USING ERRCODE='OSC03'; END IF;
  IF jsonb_typeof(e->'form_template_ids') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'Revise os checklists selecionados.' USING ERRCODE='OSC03'; END IF;
  IF jsonb_array_length(e->'form_template_ids')=0 THEN
   INSERT INTO public.service_order_equipment(service_order_id,equipment_id,form_template_id)
    SELECT so.id,(e->>'equipment_id')::uuid,NULL WHERE NOT EXISTS(SELECT 1 FROM public.service_order_equipment
     WHERE service_order_id=so.id AND equipment_id=(e->>'equipment_id')::uuid);
  ELSE
   FOR template IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(e->'form_template_ids') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.form_templates WHERE id=template AND company_id=q.company_id AND is_active) THEN
     RAISE EXCEPTION 'O checklist não está disponível nesta empresa.' USING ERRCODE='OSC03'; END IF;
    DELETE FROM public.service_order_equipment WHERE service_order_id=so.id AND equipment_id=(e->>'equipment_id')::uuid AND form_template_id IS NULL;
    INSERT INTO public.service_order_equipment(service_order_id,equipment_id,form_template_id)
     SELECT so.id,(e->>'equipment_id')::uuid,template WHERE NOT EXISTS(SELECT 1 FROM public.service_order_equipment
      WHERE service_order_id=so.id AND equipment_id=(e->>'equipment_id')::uuid AND form_template_id=template);
   END LOOP;
  END IF;
 END LOOP;
 UPDATE public.service_orders SET equipment_id=(SELECT equipment_id FROM public.service_order_equipment
  WHERE service_order_id=so.id ORDER BY equipment_id LIMIT 1) WHERE id=so.id RETURNING * INTO so;
 RETURN so;
END;
$$;
REVOKE ALL ON FUNCTION public.generate_service_order_from_quote_prepared(uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_service_order_from_quote_prepared(uuid,jsonb,boolean) TO authenticated;

-- Helpers privados: allowlist de identidade e itens, sem custos/notas internas.
CREATE FUNCTION public._receipt_identity(p_company uuid,p_customer uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('currency',COALESCE(cs.currency,'BRL'),'company',jsonb_build_object(
  'name',COALESCE(NULLIF(cs.name,''),c.name),'document',CASE WHEN cs.show_cnpj_in_documents THEN cs.document END,
  'phone',CASE WHEN cs.show_phone_in_documents THEN cs.phone END,'email',CASE WHEN cs.show_email_in_documents THEN cs.email END,
  'address',CASE WHEN cs.show_address_in_documents THEN concat_ws(', ',cs.address,cs.city,cs.state) END,
  'logo_url',CASE WHEN public.company_has_module(c.id,'white_label') AND cs.white_label_enabled
   THEN COALESCE(NULLIF(cs.white_label_logo_url,''),cs.logo_url) END),
  'customer',(SELECT jsonb_build_object('name',name,'document',document) FROM public.customers WHERE id=p_customer AND company_id=p_company))
 FROM public.companies c LEFT JOIN public.company_settings cs ON cs.company_id=c.id WHERE c.id=p_company;
$$;
REVOKE ALL ON FUNCTION public._receipt_identity(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._os_receipt_context(p_os_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public._receipt_identity(so.company_id,so.customer_id)||jsonb_build_object('order_number',so.order_number,
  'source_description',COALESCE(NULLIF(so.description,''),format('Ordem de serviço #%s',so.order_number)),
  'source_total',CASE WHEN so.show_values_to_customer THEN so.total_value END,
  'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('description',b.description,'quantity',b.quantity)||
   CASE WHEN so.show_values_to_customer THEN jsonb_build_object('unit_price',b.unit_price,'total_price',b.total_price) ELSE '{}'::jsonb END ORDER BY b.position)
   FROM public.service_order_budget_items b WHERE b.service_order_id=so.id AND b.company_id=so.company_id),'[]'::jsonb))
 FROM public.service_orders so WHERE so.id=p_os_id;
$$;
REVOKE ALL ON FUNCTION public._os_receipt_context(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._quote_receipt_context(p_quote_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('source_description',format('Orçamento #%s',q.quote_number),'source_total',COALESCE(q.total_value,q.total_price),
  'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('description',description,'quantity',quantity,'unit_price',unit_price,'total_price',total_price) ORDER BY position)
   FROM public.quote_items WHERE quote_id=q.id),'[]')) FROM public.quotes q WHERE q.id=p_quote_id;
$$;
REVOKE ALL ON FUNCTION public._quote_receipt_context(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public._os_related_charges(p_os_id uuid)
RETURNS SETOF public.tenant_charges LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.* FROM public.tenant_charges c JOIN public.service_orders so ON so.company_id=c.company_id
 WHERE so.id=p_os_id AND ((c.source_type='service_order' AND c.source_id=so.id)
  OR (c.source_type='quote' AND c.source_id=so.quote_id)
  OR EXISTS(SELECT 1 FROM public._os_financial_roots(p_os_id) f WHERE c.id=f.tenant_charge_id OR (c.asaas_payment_id IS NOT NULL AND c.asaas_payment_id=f.asaas_payment_id)
   OR (c.source_type='receivable' AND c.source_id=f.id)
   OR EXISTS(SELECT 1 FROM public.financial_transactions child WHERE child.company_id=so.company_id
    AND child.parent_transaction_id=f.id AND (child.tenant_charge_id=c.id OR (c.asaas_payment_id IS NOT NULL AND c.asaas_payment_id=child.asaas_payment_id)))));
$$;
REVOKE ALL ON FUNCTION public._os_related_charges(uuid) FROM PUBLIC,anon,authenticated;

-- Venda de cartão parcelada: cada filha confirmada é um recebimento próprio.
-- A cobrança-mãe só confirma no fim e não pode antecipar o total no recibo.
CREATE FUNCTION public._is_confirmed_installment_payment(p_transaction_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.financial_transactions f
  JOIN public.financial_transactions parent ON parent.id=f.parent_transaction_id AND parent.company_id=f.company_id
  JOIN public.tenant_charges c ON c.id=f.tenant_charge_id AND c.company_id=f.company_id
  WHERE f.id=p_transaction_id AND f.transaction_type='entrada' AND f.category='Recebimento parcial'
   AND f.is_paid AND f.paid_date IS NOT NULL AND f.amount>0 AND f.cancelled_at IS NULL AND f.transfer_pair_id IS NULL
   AND parent.cancelled_at IS NULL AND parent.transaction_type='entrada' AND parent.tenant_charge_id=c.id
   AND c.asaas_installment_id IS NOT NULL AND upper(btrim(c.status)) IN ('PENDING','OVERDUE','RECEIVED','CONFIRMED','RECEIVED_IN_CASH'));
$$;
REVOKE ALL ON FUNCTION public._is_confirmed_installment_payment(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._os_confirmed_payments(p_os_id uuid)
RETURNS TABLE(reference text,amount numeric,paid_date date,method text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH roots AS (SELECT * FROM public._os_financial_roots(p_os_id)), charges AS (SELECT * FROM public._os_related_charges(p_os_id)),
 installments AS (SELECT f.* FROM public.financial_transactions f JOIN roots parent ON parent.id=f.parent_transaction_id AND parent.company_id=f.company_id
  WHERE public._is_confirmed_installment_payment(f.id)),
 settings AS (SELECT COALESCE(cs.timezone,'America/Sao_Paulo') tz FROM public.service_orders so LEFT JOIN public.company_settings cs ON cs.company_id=so.company_id WHERE so.id=p_os_id)
 SELECT c.id::text,c.value,(c.payment_date AT TIME ZONE settings.tz)::date,c.billing_type FROM charges c CROSS JOIN settings
  WHERE upper(btrim(c.status)) IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH') AND c.payment_date IS NOT NULL AND c.value>0
   AND NOT EXISTS(SELECT 1 FROM installments f WHERE f.tenant_charge_id=c.id)
 UNION ALL
 SELECT f.id::text,f.amount,f.paid_date,c.billing_type FROM installments f JOIN charges c ON c.id=f.tenant_charge_id
 UNION ALL
 SELECT f.id::text,GREATEST(0,f.amount-COALESCE(f.amount_received,0)),f.paid_date,f.payment_method FROM roots f
  WHERE f.is_paid AND f.paid_date IS NOT NULL AND f.transfer_pair_id IS NULL AND f.tenant_charge_id IS NULL AND f.asaas_payment_id IS NULL
   AND f.amount>COALESCE(f.amount_received,0)
 UNION ALL
 SELECT child.id::text,child.amount,child.paid_date,child.payment_method FROM public.financial_transactions child JOIN roots parent ON parent.id=child.parent_transaction_id
  WHERE child.company_id=parent.company_id AND child.transaction_type='entrada' AND child.category='Recebimento parcial'
   AND child.transfer_pair_id IS NULL AND child.tenant_charge_id IS NULL AND child.asaas_payment_id IS NULL AND child.cancelled_at IS NULL AND child.is_paid AND child.paid_date IS NOT NULL AND child.amount>0;
$$;
REVOKE ALL ON FUNCTION public._os_confirmed_payments(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_os_commercial_document(p_os_id uuid,p_public boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE so public.service_orders%ROWTYPE; summary jsonb; payments jsonb; received numeric; currency text;
BEGIN
 SELECT * INTO so FROM public.service_orders WHERE id=p_os_id;
 IF NOT FOUND OR so.entry_type='tarefa' OR so.customer_id IS NULL OR NOT public.pdv_company_access_entitled_internal(so.company_id) THEN RETURN NULL; END IF;
 IF NOT p_public AND NOT public.can_work_os_commercial(p_os_id) THEN RAISE EXCEPTION 'Sem acesso à ordem de serviço.' USING ERRCODE='42501'; END IF;
 IF so.status<>'concluida' THEN RETURN NULL; END IF;
 SELECT cs.currency INTO currency FROM public.company_settings cs WHERE cs.company_id=so.company_id;
 IF so.show_values_to_customer THEN
  SELECT jsonb_build_object('currency',COALESCE(currency,'BRL'),'items',COALESCE(jsonb_agg(jsonb_build_object(
   'description',b.description,'quantity',b.quantity,'unit_price',b.unit_price,'total_price',b.total_price,'item_type',b.item_type) ORDER BY b.position),'[]'),
   'total',COALESCE(so.total_value,0),'adjustment',COALESCE(so.total_value,0)-COALESCE(sum(b.total_price),0)) INTO summary
   FROM public.service_order_budget_items b WHERE b.service_order_id=so.id AND b.company_id=so.company_id;
 END IF;
 SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.paid_date,p.reference),'[]'),COALESCE(sum(p.amount),0) INTO payments,received FROM public._os_confirmed_payments(p_os_id) p;
 RETURN jsonb_build_object('summary',summary,'receipt',CASE WHEN received>0 THEN public._os_receipt_context(p_os_id)||jsonb_build_object(
  'received',received,'received_total',received,'remaining',CASE WHEN so.show_values_to_customer THEN GREATEST(0,so.total_value-received) END,
  'is_partial',received<so.total_value,'scope','consolidated','payments',payments) ELSE NULL END);
END;
$$;

-- Lançamentos legados podem ter vínculo com OS sem repetir customer_id.
-- O cliente explícito do financeiro prevalece; o fallback nunca cruza empresa.
CREATE FUNCTION public._financial_receipt_customer(p_transaction_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(f.customer_id,parent.customer_id,so.customer_id)
 FROM public.financial_transactions f
 LEFT JOIN public.financial_transactions parent ON parent.id=f.parent_transaction_id AND parent.company_id=f.company_id
 LEFT JOIN public.service_orders so ON so.id=COALESCE(f.service_order_id,parent.service_order_id) AND so.company_id=f.company_id
 WHERE f.id=p_transaction_id;
$$;
REVOKE ALL ON FUNCTION public._financial_receipt_customer(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._financial_payment_receipt(p_transaction_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.financial_transactions%ROWTYPE; parent public.financial_transactions%ROWTYPE; c public.tenant_charges%ROWTYPE;
 so public.service_orders%ROWTYPE; v_quote public.quotes%ROWTYPE; payment jsonb; context jsonb; amount numeric; total numeric; received numeric; tz text; ref text; v_customer uuid; v_installment boolean;
BEGIN
 SELECT * INTO f FROM public.financial_transactions WHERE id=p_transaction_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recebimento indisponível.' USING ERRCODE='ORC01'; END IF;
 IF f.transaction_type<>'entrada' OR f.cancelled_at IS NOT NULL OR f.transfer_pair_id IS NOT NULL OR NOT COALESCE(f.is_paid,false) OR f.paid_date IS NULL THEN
  RAISE EXCEPTION 'Selecione um recebimento confirmado e não cancelado.' USING ERRCODE='ORC01'; END IF;
 IF f.parent_transaction_id IS NOT NULL THEN
  SELECT * INTO parent FROM public.financial_transactions WHERE id=f.parent_transaction_id AND company_id=f.company_id AND cancelled_at IS NULL AND transaction_type='entrada';
  IF NOT FOUND OR f.category IS DISTINCT FROM 'Recebimento parcial' THEN
   RAISE EXCEPTION 'Selecione o recebimento original.' USING ERRCODE='ORC01'; END IF;
 ELSE parent:=f; END IF;
 v_customer:=public._financial_receipt_customer(f.id);
 v_installment:=public._is_confirmed_installment_payment(f.id);
 SELECT * INTO c FROM public.tenant_charges WHERE company_id=f.company_id AND
  (id=f.tenant_charge_id OR (f.asaas_payment_id IS NOT NULL AND asaas_payment_id=f.asaas_payment_id)) ORDER BY (id=f.tenant_charge_id) DESC NULLS LAST LIMIT 1;
 IF NOT v_installment AND (f.tenant_charge_id IS NOT NULL OR f.asaas_payment_id IS NOT NULL) AND (c.id IS NULL OR upper(btrim(c.status)) NOT IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH') OR c.payment_date IS NULL) THEN
  RAISE EXCEPTION 'A cobrança não tem recebimento confirmado.' USING ERRCODE='ORC01'; END IF;
 IF c.customer_id IS NOT NULL AND v_customer IS NOT NULL AND c.customer_id IS DISTINCT FROM v_customer THEN
  RAISE EXCEPTION 'Confira o cliente do recebimento original.' USING ERRCODE='ORC01'; END IF;
 ref:=CASE WHEN v_installment THEN f.id ELSE COALESCE(c.id,f.id) END::text;
 SELECT s.* INTO so FROM public.service_orders s WHERE s.company_id=f.company_id AND s.customer_id=v_customer AND (s.id=COALESCE(f.service_order_id,parent.service_order_id)
  OR (c.source_type='service_order' AND s.id=c.source_id)
  OR EXISTS(SELECT 1 FROM public.quotes q JOIN public.financial_transactions anchor ON anchor.id=q.financial_transaction_id AND anchor.company_id=q.company_id
    WHERE q.id=s.quote_id AND q.company_id=s.company_id AND (anchor.id=parent.id OR (anchor.installment_group_id IS NOT NULL AND anchor.installment_group_id=parent.installment_group_id)))
  OR (c.source_type='quote' AND s.quote_id=c.source_id)) ORDER BY s.id LIMIT 1;
 IF so.id IS NOT NULL THEN
  SELECT to_jsonb(p) INTO payment FROM public._os_confirmed_payments(so.id) p WHERE p.reference=ref;
  IF payment IS NULL THEN RAISE EXCEPTION 'Selecione o pagamento no histórico de recebimentos.' USING ERRCODE='ORC01'; END IF;
  SELECT COALESCE(sum(p.amount),0) INTO received FROM public._os_confirmed_payments(so.id) p;
  RETURN public._os_receipt_context(so.id)||jsonb_build_object('scope','payment','payments',jsonb_build_array(payment),
   'received',(payment->>'amount')::numeric,'received_total',received,'remaining',CASE WHEN so.show_values_to_customer THEN GREATEST(0,so.total_value-received) END,
   'is_partial',(payment->>'amount')::numeric<so.total_value);
 END IF;
 -- PDV pode quitar com crédito/troca: não declarar esse valor como dinheiro recebido.
 IF EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations WHERE receivable_transaction_id=parent.id)
  OR EXISTS(SELECT 1 FROM public.pdv_party_credit_entries WHERE target_financial_transaction_id=parent.id) THEN
  RAISE EXCEPTION 'Consulte os recebimentos desta venda no PDV.' USING ERRCODE='ORC01'; END IF;
 SELECT COALESCE(timezone,'America/Sao_Paulo') INTO tz FROM public.company_settings WHERE company_id=f.company_id;
 amount:=CASE WHEN v_installment THEN f.amount WHEN c.id IS NOT NULL THEN c.value ELSE GREATEST(0,f.amount-COALESCE(f.amount_received,0)) END;
 IF amount<=0 THEN RAISE EXCEPTION 'Selecione um pagamento no histórico de recebimentos.' USING ERRCODE='ORC01'; END IF;
 SELECT quote.* INTO v_quote FROM public.quotes quote JOIN public.financial_transactions anchor ON anchor.id=quote.financial_transaction_id AND anchor.company_id=quote.company_id
  WHERE quote.company_id=f.company_id AND quote.customer_id=v_customer
   AND (anchor.id=parent.id OR (anchor.installment_group_id IS NOT NULL AND anchor.installment_group_id=parent.installment_group_id)) ORDER BY quote.id LIMIT 1;
 total:=COALESCE(v_quote.total_value,v_quote.total_price,parent.amount);
 received:=CASE WHEN parent.is_paid THEN parent.amount ELSE COALESCE(parent.amount_received,0) END;
 context:=public._receipt_identity(f.company_id,v_customer);
 IF v_quote.id IS NOT NULL THEN context:=context||public._quote_receipt_context(v_quote.id); END IF;
 RETURN jsonb_build_object('source_description',parent.description,'items',jsonb_build_array(jsonb_build_object('description',parent.description,'quantity',1)))||context||jsonb_build_object('scope','payment','source_total',total,
  'received',amount,'received_total',CASE WHEN COALESCE(parent.installment_total,1)=1 THEN received END,'remaining',CASE WHEN COALESCE(parent.installment_total,1)=1 THEN GREATEST(0,total-received) END,'is_partial',amount<total,
  'payments',jsonb_build_array(jsonb_build_object('reference',ref,'amount',amount,
   'paid_date',CASE WHEN c.id IS NOT NULL AND NOT v_installment THEN (c.payment_date AT TIME ZONE COALESCE(tz,'America/Sao_Paulo'))::date ELSE f.paid_date END,
   'method',COALESCE(c.billing_type,f.payment_method))));
END;
$$;

REVOKE ALL ON FUNCTION public._financial_payment_receipt(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._charge_payment_receipt(p_charge_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.tenant_charges%ROWTYPE; so public.service_orders%ROWTYPE; q public.quotes%ROWTYPE;
 parent public.financial_transactions%ROWTYPE; context jsonb; payment jsonb; received numeric; total numeric; tz text; payments jsonb;
BEGIN
 SELECT * INTO c FROM public.tenant_charges WHERE id=p_charge_id;
 IF NOT FOUND OR upper(btrim(c.status)) NOT IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH') OR c.payment_date IS NULL OR c.value<=0 THEN
  RAISE EXCEPTION 'Selecione uma cobrança com pagamento confirmado.' USING ERRCODE='ORC01'; END IF;
 SELECT s.* INTO so FROM public.service_orders s WHERE s.company_id=c.company_id AND s.customer_id=c.customer_id AND EXISTS(
  SELECT 1 FROM public._os_related_charges(s.id) linked WHERE linked.id=c.id) ORDER BY s.id LIMIT 1;
 IF so.id IS NOT NULL THEN
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.paid_date,p.reference),'[]') INTO payments FROM public._os_confirmed_payments(so.id) p
   WHERE p.reference=c.id::text OR EXISTS(SELECT 1 FROM public.financial_transactions f WHERE f.id::text=p.reference AND f.tenant_charge_id=c.id AND f.company_id=c.company_id);
  SELECT COALESCE(sum(p.amount),0) INTO received FROM public._os_confirmed_payments(so.id) p;
  RETURN public._os_receipt_context(so.id)||jsonb_build_object('scope','payment','payments',payments,'received',c.value,
   'received_total',received,'remaining',CASE WHEN so.show_values_to_customer THEN GREATEST(0,so.total_value-received) END,'is_partial',c.value<so.total_value);
 END IF;
 IF c.source_type='quote' THEN SELECT * INTO q FROM public.quotes WHERE id=c.source_id AND company_id=c.company_id AND customer_id=c.customer_id; END IF;
 IF c.source_type='receivable' THEN SELECT * INTO parent FROM public.financial_transactions WHERE id=c.source_id AND company_id=c.company_id AND cancelled_at IS NULL; END IF;
 context:=public._receipt_identity(c.company_id,c.customer_id);
 total:=COALESCE(q.total_value,q.total_price,parent.amount,c.value);
 IF q.id IS NOT NULL THEN
  context:=context||public._quote_receipt_context(q.id);
 ELSE context:=context||jsonb_build_object('source_description',COALESCE(parent.description,c.description),
  'items',jsonb_build_array(jsonb_build_object('description',COALESCE(parent.description,c.description,'Pagamento de cobrança'),'quantity',1))); END IF;
 SELECT COALESCE(timezone,'America/Sao_Paulo') INTO tz FROM public.company_settings WHERE company_id=c.company_id;
 -- Saldo só é anunciado quando há uma dívida conhecida; cobrança isolada pode ser parcela.
 received:=CASE WHEN parent.id IS NOT NULL THEN CASE WHEN parent.is_paid THEN parent.amount ELSE parent.amount_received END ELSE NULL END;
 RETURN context||jsonb_build_object('scope','payment','received',c.value,'source_total',CASE WHEN q.id IS NOT NULL OR parent.id IS NOT NULL THEN total END,
  'received_total',received,'remaining',CASE WHEN received IS NOT NULL THEN GREATEST(0,total-received) END,
  'is_partial',c.value<total OR COALESCE(c.installment_total,1)>1,
  'payments',jsonb_build_array(jsonb_build_object('reference',c.id,'amount',c.value,'paid_date',(c.payment_date AT TIME ZONE COALESCE(tz,'America/Sao_Paulo'))::date,'method',c.billing_type)));
END;
$$;
REVOKE ALL ON FUNCTION public._charge_payment_receipt(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public._can_read_payment_receipt(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND p_company=public.get_user_company_id(auth.uid())
  AND public.tenant_subscription_allows_access(p_company)
  AND EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND is_active IS TRUE)
  AND (public.is_super_admin(auth.uid()) OR public.is_admin_or_gestor(auth.uid()) OR
   public.pdv_has_explicit_action_permission_v2(auth.uid(),'screen:finance'));
$$;
REVOKE ALL ON FUNCTION public._can_read_payment_receipt(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_financial_payment_receipt(p_transaction_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT COALESCE(public._can_read_payment_receipt((SELECT company_id FROM public.financial_transactions WHERE id=p_transaction_id)),false) THEN
  RAISE EXCEPTION 'Sem acesso ao recebimento.' USING ERRCODE='42501'; END IF;
 RETURN public._financial_payment_receipt(p_transaction_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_financial_payment_receipt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_financial_payment_receipt(uuid) TO authenticated;

CREATE FUNCTION public.get_charge_payment_receipt(p_charge_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT COALESCE(public._can_read_payment_receipt((SELECT company_id FROM public.tenant_charges WHERE id=p_charge_id)),false) THEN
  RAISE EXCEPTION 'Sem acesso ao recebimento.' USING ERRCODE='42501'; END IF;
 RETURN public._charge_payment_receipt(p_charge_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_charge_payment_receipt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_charge_payment_receipt(uuid) TO authenticated;

-- Reusa o gate completo do portal: tenant, vigência, módulo, privacidade,
-- sessão de senha e bloqueio da seção. Não confia em customer/company do cliente.
CREATE FUNCTION public._portal_receipt_customer(p_token text,p_session_token text) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE payload jsonb;
BEGIN
 payload:=public.get_portal_data(p_token,p_session_token);
 IF payload IS NULL OR payload->>'access' IS DISTINCT FROM 'granted'
  OR COALESCE((payload#>>'{permissions,charges}')::boolean,false) IS NOT TRUE
  OR COALESCE(payload->'locked_sections','[]'::jsonb) ? 'charges'
  OR NULLIF(payload#>>'{customer,id}','') IS NULL THEN
  RAISE EXCEPTION 'Seção financeira indisponível.' USING ERRCODE='42501'; END IF;
 RETURN (payload#>>'{customer,id}')::uuid;
END;
$$;
REVOKE ALL ON FUNCTION public._portal_receipt_customer(text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.get_customer_portal_payments(p_token text,p_session_token text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE customer uuid; company uuid; payments jsonb;
BEGIN
 customer:=public._portal_receipt_customer(p_token,p_session_token);
 SELECT company_id INTO company FROM public.customers WHERE id=customer;
 SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.paid_date DESC,p.id),'[]') INTO payments FROM (
  SELECT c.id,'charge'::text kind,c.description,c.value amount,(c.payment_date AT TIME ZONE COALESCE(cs.timezone,'America/Sao_Paulo'))::date paid_date,c.billing_type method,c.public_short_code
   FROM public.tenant_charges c LEFT JOIN public.company_settings cs ON cs.company_id=c.company_id
   WHERE c.company_id=company AND c.customer_id=customer AND upper(btrim(c.status)) IN ('RECEIVED','CONFIRMED','RECEIVED_IN_CASH') AND c.payment_date IS NOT NULL AND c.value>0
  UNION ALL
  SELECT f.id,'transaction',COALESCE(parent.description,f.description),GREATEST(0,f.amount-COALESCE(f.amount_received,0)),f.paid_date,COALESCE(f.payment_method,receipt_charge.billing_type),NULL::text
   FROM public.financial_transactions f LEFT JOIN public.financial_transactions parent ON parent.id=f.parent_transaction_id AND parent.company_id=f.company_id
   LEFT JOIN public.tenant_charges receipt_charge ON receipt_charge.id=f.tenant_charge_id AND receipt_charge.company_id=f.company_id
   WHERE f.company_id=company AND public._financial_receipt_customer(f.id)=customer
    AND f.transaction_type='entrada' AND f.is_paid AND f.paid_date IS NOT NULL AND f.cancelled_at IS NULL
    AND f.transfer_pair_id IS NULL AND ((f.tenant_charge_id IS NULL AND f.asaas_payment_id IS NULL) OR public._is_confirmed_installment_payment(f.id)) AND f.amount>COALESCE(f.amount_received,0)
    AND (f.parent_transaction_id IS NULL OR (parent.cancelled_at IS NULL AND parent.transaction_type='entrada' AND f.category='Recebimento parcial'))
    AND NOT EXISTS(SELECT 1 FROM public.pdv_receivable_settlement_allocations WHERE receivable_transaction_id=COALESCE(parent.id,f.id))
    AND NOT EXISTS(SELECT 1 FROM public.pdv_party_credit_entries WHERE target_financial_transaction_id=COALESCE(parent.id,f.id))
 ) p;
 RETURN payments;
END;
$$;
REVOKE ALL ON FUNCTION public.get_customer_portal_payments(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_payments(text,text) TO anon,authenticated;

CREATE FUNCTION public.get_customer_portal_payment_receipt(p_token text,p_session_token text,p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE customer uuid; company uuid;
BEGIN
 customer:=public._portal_receipt_customer(p_token,p_session_token);
 SELECT company_id INTO company FROM public.customers WHERE id=customer;
 IF p_kind='charge' AND EXISTS(SELECT 1 FROM public.tenant_charges WHERE id=p_id AND company_id=company AND customer_id=customer) THEN
  RETURN public._charge_payment_receipt(p_id);
 ELSIF p_kind='transaction' AND EXISTS(SELECT 1 FROM public.financial_transactions f LEFT JOIN public.financial_transactions parent
  ON parent.id=f.parent_transaction_id AND parent.company_id=f.company_id WHERE f.id=p_id AND f.company_id=company AND public._financial_receipt_customer(f.id)=customer) THEN
  RETURN public._financial_payment_receipt(p_id);
 END IF;
 RAISE EXCEPTION 'Recebimento indisponível.' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION public.get_customer_portal_payment_receipt(text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_portal_payment_receipt(text,text,text,uuid) TO anon,authenticated;
COMMIT;
