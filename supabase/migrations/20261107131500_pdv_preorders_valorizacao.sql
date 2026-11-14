-- W2-01 complemento: valorizacao CAS da fila encaminhada, sem reabrir a origem operacional.
BEGIN;

CREATE OR REPLACE FUNCTION public.pdv_value_preorder_v2(
  p_preorder_id uuid,
  p_expected_revision bigint,
  p_header jsonb,
  p_items jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_company uuid; v_uid uuid:=auth.uid(); v_claim record; v_pre public.pdv_preorders%ROWTYPE;
  v_item jsonb; v_existing public.pdv_preorder_items%ROWTYPE; v_ids uuid[]:='{}';
  v_customer uuid; v_notes text; v_discount numeric; v_subtotal numeric:=0;
  v_line_gross numeric; v_line_discount numeric; v_line_total numeric;
  v_has_missing boolean:=false; v_canonical_payload jsonb; v_result jsonb;
BEGIN
  v_company:=public.pdv_preorder_access_company_v2();
  IF public.user_has_permission(v_uid,'screen:pdv_orders') IS DISTINCT FROM true
     OR NOT (
       public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)
       OR public.pdv_has_explicit_action_permission_v2(v_uid,'fn:value_pdv_preorder')
     ) THEN
    RAISE EXCEPTION 'Você não tem permissão para valorizar pré-pedidos.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_value_denied';
  END IF;
  IF p_preorder_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<1
     OR jsonb_typeof(p_header)<>'object' OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Revise os valores do pré-pedido e tente novamente.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_value_payload_invalid';
  END IF;

  SELECT jsonb_build_object(
    'id',p_preorder_id,'revision',p_expected_revision,
    'header',jsonb_build_object(
      'customer_id',NULLIF(p_header->>'customer_id','')::uuid,
      'notes',NULLIF(btrim(COALESCE(p_header->>'notes','')),''),
      'discount_amount',trim_scale(COALESCE(NULLIF(p_header->>'discount_amount','')::numeric,0))
    ),
    'items',COALESCE(jsonb_agg(jsonb_build_object(
      'id',NULLIF(x.item->>'id','')::uuid,
      'unit_price',trim_scale(NULLIF(x.item->>'unit_price','')::numeric),
      'discount_amount',trim_scale(COALESCE(NULLIF(x.item->>'discount_amount','')::numeric,0))
    ) ORDER BY NULLIF(x.item->>'id','')::uuid),'[]'::jsonb)
  ) INTO v_canonical_payload FROM jsonb_array_elements(p_items) x(item);

  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_company,'preorder.value',p_idempotency_key,v_canonical_payload
  );
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result; END IF;
    RAISE EXCEPTION 'Esta valorização ainda está sendo processada. Aguarde e tente novamente.' USING ERRCODE='55000',DETAIL='code=pdv_preorder_operation_pending';
  END IF;

  SELECT * INTO v_pre FROM public.pdv_preorders WHERE id=p_preorder_id FOR UPDATE;
  IF NOT FOUND OR v_pre.company_id<>v_company OR NOT public.pdv_preorder_can_access_v2(v_pre) THEN
    RAISE EXCEPTION 'Pré-pedido não encontrado ou sem acesso.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_access_denied';
  END IF;
  IF v_pre.status<>'encaminhado' OR v_pre.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Este pré-pedido mudou. Atualize os dados antes de valorizar.' USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict';
  END IF;

  v_customer:=NULLIF(p_header->>'customer_id','')::uuid;
  v_notes:=NULLIF(btrim(COALESCE(p_header->>'notes','')),'');
  v_discount:=COALESCE(NULLIF(p_header->>'discount_amount','')::numeric,0);
  IF v_discount<0 OR v_discount<>round(v_discount,2) THEN
    RAISE EXCEPTION 'O desconto geral é inválido.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_discount_invalid';
  END IF;
  PERFORM public.pdv_assert_ref_company('public.customers',v_customer,v_company,'O cliente');

  PERFORM pi.id FROM public.pdv_preorder_items pi WHERE pi.preorder_id=p_preorder_id ORDER BY pi.id FOR UPDATE OF pi;
  IF jsonb_array_length(p_items)<>(SELECT count(*) FROM public.pdv_preorder_items pi WHERE pi.preorder_id=p_preorder_id) THEN
    RAISE EXCEPTION 'A lista de itens mudou. Atualize o pré-pedido antes de continuar.' USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(v_item->>'id','') IS NULL OR (v_item->>'id')::uuid=ANY(v_ids) THEN
      RAISE EXCEPTION 'A lista de itens é inválida.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_value_items_invalid';
    END IF;
    v_ids:=array_append(v_ids,(v_item->>'id')::uuid);
    SELECT * INTO v_existing FROM public.pdv_preorder_items pi
      WHERE pi.id=(v_item->>'id')::uuid AND pi.preorder_id=p_preorder_id AND pi.company_id=v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A lista de itens mudou. Atualize o pré-pedido antes de continuar.' USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict';
    END IF;
    v_line_discount:=COALESCE(NULLIF(v_item->>'discount_amount','')::numeric,0);
    IF v_line_discount<0 OR v_line_discount<>round(v_line_discount,2)
       OR (NULLIF(v_item->>'unit_price','') IS NOT NULL AND (v_item->>'unit_price')::numeric<0) THEN
      RAISE EXCEPTION 'Preço ou desconto do item é inválido.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_item_value_invalid';
    END IF;
    IF NULLIF(v_item->>'unit_price','') IS NULL THEN
      IF v_line_discount>0 THEN
        RAISE EXCEPTION 'Defina o preço do item antes de aplicar desconto.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_discount_without_price';
      END IF;
      v_has_missing:=true;
    ELSE
      v_line_gross:=round(v_existing.quantity*(v_item->>'unit_price')::numeric,2);
      IF v_line_discount>v_line_gross THEN
        RAISE EXCEPTION 'O desconto de um item não pode superar o valor desse item.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_line_discount_exceeded';
      END IF;
      v_line_total:=round(v_line_gross-v_line_discount,2);
      v_subtotal:=round(v_subtotal+v_line_total,2);
    END IF;
    UPDATE public.pdv_preorder_items SET
      unit_price=NULLIF(v_item->>'unit_price','')::numeric,
      discount_amount=v_line_discount
    WHERE id=v_existing.id;
  END LOOP;

  IF v_has_missing AND v_discount>0 THEN
    RAISE EXCEPTION 'Defina todos os preços antes de aplicar desconto geral.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_discount_without_price';
  END IF;
  IF NOT v_has_missing AND v_discount>v_subtotal THEN
    RAISE EXCEPTION 'O desconto é maior que o valor dos itens.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_discount_invalid';
  END IF;

  UPDATE public.pdv_preorders SET
    customer_id=v_customer,
    notes=v_notes,
    subtotal=CASE WHEN v_has_missing THEN NULL ELSE v_subtotal END,
    discount_amount=v_discount,
    total=CASE WHEN v_has_missing THEN NULL ELSE round(v_subtotal-v_discount,2) END,
    revision=revision+1
  WHERE id=p_preorder_id RETURNING * INTO v_pre;

  v_result:=jsonb_build_object(
    'preorder_id',v_pre.id,'revision',v_pre.revision,'status',v_pre.status,
    'has_missing_prices',v_has_missing
  );
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_preorder',v_pre.id,v_result);
  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION public.pdv_value_preorder_v2(uuid,bigint,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_value_preorder_v2(uuid,bigint,jsonb,jsonb,text) TO authenticated,service_role;

COMMENT ON FUNCTION public.pdv_value_preorder_v2(uuid,bigint,jsonb,jsonb,text) IS
  'Valoriza por CAS um pre-pedido encaminhado. Exige screen:pdv_orders e fn:value_pdv_preorder explicita; nao altera material, quantidade, origem ou reserva.';

COMMIT;
