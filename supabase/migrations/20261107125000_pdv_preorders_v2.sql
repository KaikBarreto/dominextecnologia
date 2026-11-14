-- W2-01: pre-pedido operacional unico do PDV e conversao atomica em pedido v2.
BEGIN;

CREATE TABLE public.pdv_preorder_number_counters (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  next_value integer NOT NULL DEFAULT 1 CHECK (next_value > 0)
);

CREATE TABLE public.pdv_preorders (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  number integer NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  stock_id uuid REFERENCES public.stocks(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'edicao' CHECK (status IN ('edicao','encaminhado','convertido','cancelado')),
  operation_mode text NOT NULL DEFAULT 'counter' CHECK (operation_mode IN ('direct','counter')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  subtotal numeric,
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0 AND discount_amount = round(discount_amount, 2)),
  total numeric,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  forwarded_at timestamptz,
  converted_order_id uuid,
  converted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_preorders_company_number_unique UNIQUE(company_id, number),
  CONSTRAINT pdv_preorders_status_dates_check CHECK (
    (status = 'edicao' AND forwarded_at IS NULL AND converted_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'encaminhado' AND forwarded_at IS NOT NULL AND converted_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'convertido' AND forwarded_at IS NOT NULL AND converted_at IS NOT NULL AND converted_order_id IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'cancelado' AND converted_at IS NULL AND converted_order_id IS NULL AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT pdv_preorders_totals_check CHECK (
    (subtotal IS NULL AND total IS NULL)
    OR (subtotal IS NOT NULL AND subtotal >= 0 AND subtotal = round(subtotal, 2)
        AND total IS NOT NULL AND total >= 0 AND total = round(total, 2)
        AND discount_amount <= subtotal AND total = round(subtotal - discount_amount, 2))
  )
);

CREATE TABLE public.pdv_preorder_items (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  preorder_id uuid NOT NULL REFERENCES public.pdv_preorders(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES public.inventory(id) ON DELETE SET NULL,
  item_type text NOT NULL CHECK (item_type IN ('material','service','free_item')),
  description text NOT NULL CHECK (btrim(description) <> ''),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric CHECK (unit_price IS NULL OR unit_price >= 0),
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0 AND discount_amount = round(discount_amount, 2)),
  unit_factor_snapshot numeric NOT NULL DEFAULT 1 CHECK (unit_factor_snapshot > 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_preorder_items_type_inventory_check CHECK (
    (item_type = 'material' AND inventory_id IS NOT NULL)
    OR (item_type IN ('service','free_item') AND inventory_id IS NULL)
  ),
  UNIQUE(preorder_id, id)
);

CREATE INDEX idx_pdv_preorders_queue ON public.pdv_preorders(company_id,status,updated_at DESC,id);
CREATE INDEX idx_pdv_preorders_actor ON public.pdv_preorders(company_id,created_by,assigned_to,updated_at DESC);
CREATE INDEX idx_pdv_preorder_items_parent ON public.pdv_preorder_items(preorder_id,sort_order,id);

ALTER TABLE public.pdv_preorders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_preorders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_preorder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_preorder_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_preorder_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_preorder_number_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_preorders FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON public.pdv_preorder_items FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON public.pdv_preorder_number_counters FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER set_pdv_preorders_updated_at BEFORE UPDATE ON public.pdv_preorders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_pdv_preorder_items_updated_at BEFORE UPDATE ON public.pdv_preorder_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Completa a origem antecipada prevista em W1B-01.
ALTER TABLE public.pdv_stock_reservation_items
  ADD CONSTRAINT pdv_stock_reservation_items_preorder_item_id_fkey
  FOREIGN KEY (preorder_item_id) REFERENCES public.pdv_preorder_items(id) ON DELETE CASCADE;

ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS source_preorder_id uuid REFERENCES public.pdv_preorders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS operation_mode_snapshot text;
ALTER TABLE public.pdv_orders DROP CONSTRAINT IF EXISTS pdv_orders_contract_version_v2_check;
ALTER TABLE public.pdv_orders ADD CONSTRAINT pdv_orders_contract_version_v2_check
  CHECK (contract_version IN (1,2) AND (contract_version = 1 OR operation_mode_snapshot IN ('direct','counter')));
CREATE UNIQUE INDEX uniq_pdv_orders_source_preorder
  ON public.pdv_orders(source_preorder_id) WHERE source_preorder_id IS NOT NULL;

ALTER TABLE public.pdv_order_items
  ADD COLUMN IF NOT EXISTS gross_total_v2 numeric,
  ADD COLUMN IF NOT EXISTS line_discount_amount_v2 numeric,
  ADD COLUMN IF NOT EXISTS order_discount_allocated_v2 numeric;
ALTER TABLE public.pdv_order_items DROP CONSTRAINT IF EXISTS pdv_order_items_preorder_amounts_v2_check;
ALTER TABLE public.pdv_order_items ADD CONSTRAINT pdv_order_items_preorder_amounts_v2_check CHECK (
  contract_version<>2 OR (
    gross_total_v2 IS NOT NULL AND gross_total_v2>=0 AND gross_total_v2=round(gross_total_v2,2)
    AND line_discount_amount_v2 IS NOT NULL AND line_discount_amount_v2>=0 AND line_discount_amount_v2=round(line_discount_amount_v2,2)
    AND order_discount_allocated_v2 IS NOT NULL AND order_discount_allocated_v2>=0 AND order_discount_allocated_v2=round(order_discount_allocated_v2,2)
    AND gross_total_v2=round(quantity*unit_price,2)
    AND discount_amount=round(line_discount_amount_v2+order_discount_allocated_v2,2)
    AND total=round(gross_total_v2-discount_amount,2)
  )
);

ALTER TABLE public.pdv_preorders
  ADD CONSTRAINT pdv_preorders_converted_order_id_fkey
  FOREIGN KEY (converted_order_id) REFERENCES public.pdv_orders(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.pdv_has_explicit_action_permission_v2(p_user uuid,p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT EXISTS(
    SELECT 1 FROM public.user_permissions up
    WHERE up.user_id=p_user AND up.is_active IS TRUE
      AND (up.permissions ? '*' OR up.permissions ? p_key)
  );
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_preorder_access_company_v2()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_uid uuid:=auth.uid(); v_company uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sua sessão expirou. Entre novamente.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_auth_required'; END IF;
  SELECT p.company_id INTO v_company FROM public.profiles p WHERE p.user_id=v_uid AND p.is_active IS TRUE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Seu usuário não possui uma empresa ativa.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_company_required'; END IF;
  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM true OR public.company_has_module(v_company,'pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'O PDV não está disponível para esta empresa.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_entitlement_denied';
  END IF;
  IF public.user_has_permission(v_uid,'screen:pdv') IS DISTINCT FROM true
     AND public.user_has_permission(v_uid,'screen:pdv_orders') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para acessar os pré-pedidos.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_screen_denied';
  END IF;
  RETURN v_company;
END $fn$;

CREATE OR REPLACE FUNCTION public.next_pdv_preorder_number_v2(p_company_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v integer;
BEGIN
  INSERT INTO public.pdv_preorder_number_counters AS c(company_id,next_value) VALUES(p_company_id,2)
  ON CONFLICT(company_id) DO UPDATE SET next_value=c.next_value+1 RETURNING next_value-1 INTO v;
  RETURN v;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_preorder_can_access_v2(p_preorder public.pdv_preorders)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
  SELECT p_preorder.company_id=public.get_user_company_id(auth.uid()) AND (
    ((p_preorder.created_by=auth.uid() OR p_preorder.assigned_to=auth.uid()) AND public.user_has_permission(auth.uid(),'screen:pdv'))
    OR public.is_admin_or_gestor(auth.uid()) OR public.is_super_admin(auth.uid())
    OR (
      p_preorder.status IN ('encaminhado','convertido')
      AND public.user_has_permission(auth.uid(),'screen:pdv_orders')
      AND (
        public.pdv_has_explicit_action_permission_v2(auth.uid(),'fn:value_pdv_preorder')
        OR public.pdv_has_explicit_action_permission_v2(auth.uid(),'fn:convert_pdv_preorder')
      )
    )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_preorder_validate_actor_v2(p_company uuid,p_user uuid,p_label text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.company_id=p_company AND p.is_active IS TRUE) THEN
    RAISE EXCEPTION '% não pertence à empresa ou está inativo.',p_label USING ERRCODE='42501',DETAIL='code=pdv_preorder_actor_invalid';
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_save_preorder_v2(
  p_preorder_id uuid,p_expected_revision bigint,p_header jsonb,p_items jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid; v_uid uuid:=auth.uid(); v_claim record; v_pre public.pdv_preorders%ROWTYPE;
  v_item jsonb; v_ids uuid[]:='{}'; v_subtotal numeric:=0; v_has_missing boolean:=false; v_discount numeric;
  v_customer uuid; v_stock uuid; v_assigned uuid; v_mode text; v_notes text; v_result jsonb; v_can_value boolean;
  v_line_gross numeric; v_line_discount numeric; v_line_total numeric; v_canonical_payload jsonb;
BEGIN
  v_company:=public.pdv_preorder_access_company_v2();
  IF public.user_has_permission(v_uid,'screen:pdv') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Você não tem permissão para criar ou editar pré-pedidos.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_edit_screen_denied';
  END IF;
  IF p_preorder_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR jsonb_typeof(p_header)<>'object' OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'Revise os dados do pré-pedido e tente novamente.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_payload_invalid';
  END IF;
  -- O retry representa a intencao, nao a forma do JSON: ignora campos extras,
  -- ordena itens e materializa defaults/numeros antes de calcular o hash W1A.
  SELECT jsonb_build_object(
    'id',p_preorder_id,'revision',p_expected_revision,
    'header',jsonb_build_object(
      'customer_id',NULLIF(p_header->>'customer_id','')::uuid,
      'stock_id',NULLIF(p_header->>'stock_id','')::uuid,
      'assigned_to',NULLIF(p_header->>'assigned_to','')::uuid,
      'operation_mode',COALESCE(NULLIF(p_header->>'operation_mode',''),'counter'),
      'notes',NULLIF(btrim(COALESCE(p_header->>'notes','')),''),
      'discount_amount',trim_scale(COALESCE(NULLIF(p_header->>'discount_amount','')::numeric,0))
    ),
    'items',COALESCE(jsonb_agg(jsonb_build_object(
      'id',NULLIF(x.item->>'id','')::uuid,
      'inventory_id',NULLIF(x.item->>'inventory_id','')::uuid,
      'item_type',NULLIF(x.item->>'item_type',''),
      'description',btrim(COALESCE(x.item->>'description','')),
      'quantity',trim_scale(NULLIF(x.item->>'quantity','')::numeric),
      'unit_price',trim_scale(NULLIF(x.item->>'unit_price','')::numeric),
      'discount_amount',trim_scale(COALESCE(NULLIF(x.item->>'discount_amount','')::numeric,0)),
      'unit_factor',trim_scale(COALESCE(NULLIF(x.item->>'unit_factor','')::numeric,1)),
      'sort_order',COALESCE(NULLIF(x.item->>'sort_order','')::integer,0)
    ) ORDER BY COALESCE(NULLIF(x.item->>'sort_order','')::integer,0),NULLIF(x.item->>'id','')::uuid),'[]'::jsonb)
  ) INTO v_canonical_payload FROM jsonb_array_elements(p_items) x(item);
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_company,'preorder.save',p_idempotency_key,v_canonical_payload);
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result; END IF;
    RAISE EXCEPTION 'Esta alteração ainda está sendo processada. Aguarde e tente novamente.' USING ERRCODE='55000',DETAIL='code=pdv_preorder_operation_pending';
  END IF;
  -- Serializa a criacao e a edicao mesmo quando chegam com chaves idempotentes diferentes.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_company::text||':'||p_preorder_id::text,0));
  v_can_value:=public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid) OR (
    public.user_has_permission(v_uid,'screen:pdv_orders')
    AND public.pdv_has_explicit_action_permission_v2(v_uid,'fn:value_pdv_preorder')
  );
  v_customer:=NULLIF(p_header->>'customer_id','')::uuid; v_stock:=NULLIF(p_header->>'stock_id','')::uuid;
  v_assigned:=NULLIF(p_header->>'assigned_to','')::uuid; v_mode:=COALESCE(NULLIF(p_header->>'operation_mode',''),'counter');
  v_notes:=NULLIF(btrim(COALESCE(p_header->>'notes','')),''); v_discount:=COALESCE(NULLIF(p_header->>'discount_amount','')::numeric,0);
  IF v_mode NOT IN('direct','counter') OR v_discount<0 OR v_discount<>round(v_discount,2) THEN RAISE EXCEPTION 'Modo ou desconto inválido.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_header_invalid'; END IF;
  IF v_discount>0 AND NOT v_can_value THEN RAISE EXCEPTION 'Você não tem permissão para aplicar desconto neste pré-pedido.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_value_denied'; END IF;
  PERFORM public.pdv_assert_ref_company('public.customers',v_customer,v_company,'O cliente');
  PERFORM public.pdv_assert_ref_company('public.stocks',v_stock,v_company,'O local de estoque');
  PERFORM public.pdv_preorder_validate_actor_v2(v_company,v_assigned,'O responsável');

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item)<>'object' OR NULLIF(v_item->>'id','') IS NULL OR NULLIF(btrim(COALESCE(v_item->>'description','')),'') IS NULL
       OR COALESCE(NULLIF(v_item->>'quantity','')::numeric,0)<=0 OR COALESCE(NULLIF(v_item->>'item_type',''),'') NOT IN('material','service','free_item') THEN
      RAISE EXCEPTION 'Há item incompleto no pré-pedido.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_item_invalid';
    END IF;
    IF (v_item->>'id')::uuid=ANY(v_ids) THEN RAISE EXCEPTION 'O mesmo item foi informado mais de uma vez.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_item_duplicate'; END IF;
    v_ids:=array_append(v_ids,(v_item->>'id')::uuid);
    IF EXISTS(SELECT 1 FROM public.pdv_preorder_items pi WHERE pi.id=(v_item->>'id')::uuid AND (pi.company_id<>v_company OR pi.preorder_id<>p_preorder_id)) THEN
      RAISE EXCEPTION 'Um item informado já pertence a outro pré-pedido.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_item_scope_conflict';
    END IF;
    IF (v_item->>'item_type')='material' THEN
      IF NULLIF(v_item->>'inventory_id','') IS NULL THEN RAISE EXCEPTION 'Selecione o material do item.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_material_required'; END IF;
      PERFORM public.pdv_assert_ref_company('public.inventory',NULLIF(v_item->>'inventory_id','')::uuid,v_company,'O material');
    ELSIF NULLIF(v_item->>'inventory_id','') IS NOT NULL THEN RAISE EXCEPTION 'Serviço ou item livre não deve movimentar estoque.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_nonmaterial_inventory'; END IF;
    v_line_discount:=COALESCE(NULLIF(v_item->>'discount_amount','')::numeric,0);
    IF v_line_discount<0 OR v_line_discount<>round(v_line_discount,2) OR COALESCE(NULLIF(v_item->>'unit_factor','')::numeric,1)<=0
       OR (NULLIF(v_item->>'unit_price','') IS NOT NULL AND (v_item->>'unit_price')::numeric<0) THEN
      RAISE EXCEPTION 'Preço, desconto ou fator do item é inválido.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_item_value_invalid';
    END IF;
    IF v_line_discount>0 AND NOT v_can_value THEN
      RAISE EXCEPTION 'Você não tem permissão para alterar preços ou descontos.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_value_denied';
    END IF;
    IF EXISTS(
      SELECT 1 FROM public.pdv_preorder_items old
      JOIN public.pdv_stock_reservation_items r ON r.preorder_item_id=old.id AND r.state IN('guaranteed','conflict')
      WHERE old.id=(v_item->>'id')::uuid AND (
        old.inventory_id IS DISTINCT FROM NULLIF(v_item->>'inventory_id','')::uuid
        OR old.item_type IS DISTINCT FROM v_item->>'item_type'
        OR old.quantity IS DISTINCT FROM (v_item->>'quantity')::numeric
        OR old.unit_factor_snapshot IS DISTINCT FROM COALESCE(NULLIF(v_item->>'unit_factor','')::numeric,1)
      )
    ) THEN RAISE EXCEPTION 'Libere a reserva antes de alterar material, quantidade ou unidade.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_reserved_item_immutable'; END IF;
    IF NULLIF(v_item->>'unit_price','') IS NULL THEN
      IF v_line_discount>0 THEN RAISE EXCEPTION 'Defina o preço do item antes de aplicar desconto.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_discount_without_price'; END IF;
      v_has_missing:=true;
    ELSE
      v_line_gross:=round((v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric,2);
      IF v_line_discount > v_line_gross THEN
        RAISE EXCEPTION 'O desconto de um item não pode superar o valor desse item.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_line_discount_exceeded';
      END IF;
      IF NOT v_can_value AND (
        v_line_discount>0
        OR (v_item->>'item_type')<>'material'
        OR (v_item->>'unit_price')::numeric IS DISTINCT FROM (SELECT inv.sale_price FROM public.inventory inv WHERE inv.id=NULLIF(v_item->>'inventory_id','')::uuid)
      ) THEN RAISE EXCEPTION 'Você não tem permissão para alterar preços ou descontos.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_value_denied'; END IF;
      v_line_total:=round(v_line_gross-v_line_discount,2);
      v_subtotal:=round(v_subtotal+v_line_total,2);
    END IF;
  END LOOP;
  IF NOT v_has_missing AND (v_subtotal<0 OR v_discount>v_subtotal) THEN RAISE EXCEPTION 'O desconto é maior que o valor dos itens.' USING ERRCODE='22023',DETAIL='code=pdv_preorder_discount_invalid'; END IF;

  SELECT * INTO v_pre FROM public.pdv_preorders WHERE id=p_preorder_id FOR UPDATE;
  IF FOUND THEN
    IF v_pre.company_id<>v_company OR NOT public.pdv_preorder_can_access_v2(v_pre) THEN RAISE EXCEPTION 'Você não pode alterar este pré-pedido.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_access_denied'; END IF;
    IF v_pre.status<>'edicao' THEN RAISE EXCEPTION 'Somente pré-pedidos em edição podem ser alterados.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_not_editable'; END IF;
    IF v_pre.revision<>p_expected_revision THEN RAISE EXCEPTION 'Este pré-pedido foi alterado em outro dispositivo. Atualize antes de continuar.' USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict'; END IF;
    IF EXISTS(
      SELECT 1 FROM public.pdv_preorder_items old
      JOIN public.pdv_stock_reservation_items r ON r.preorder_item_id=old.id AND r.state IN('guaranteed','conflict')
      WHERE old.preorder_id=p_preorder_id AND NOT(old.id=ANY(v_ids))
    ) THEN RAISE EXCEPTION 'Libere a reserva antes de remover o item.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_reserved_item_remove_denied'; END IF;
    UPDATE public.pdv_preorders SET customer_id=v_customer,stock_id=v_stock,assigned_to=v_assigned,operation_mode=v_mode,notes=v_notes,
      subtotal=CASE WHEN v_has_missing THEN NULL ELSE v_subtotal END,discount_amount=v_discount,total=CASE WHEN v_has_missing THEN NULL ELSE v_subtotal-v_discount END,revision=revision+1
      WHERE id=p_preorder_id RETURNING * INTO v_pre;
  ELSE
    IF p_expected_revision<>0 THEN RAISE EXCEPTION 'Pré-pedido não encontrado para esta revisão.' USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict'; END IF;
    INSERT INTO public.pdv_preorders(id,company_id,number,customer_id,stock_id,operation_mode,assigned_to,notes,subtotal,discount_amount,total,created_by)
    VALUES(p_preorder_id,v_company,public.next_pdv_preorder_number_v2(v_company),v_customer,v_stock,v_mode,v_assigned,v_notes,
      CASE WHEN v_has_missing THEN NULL ELSE v_subtotal END,v_discount,CASE WHEN v_has_missing THEN NULL ELSE v_subtotal-v_discount END,v_uid)
    RETURNING * INTO v_pre;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.pdv_preorder_items(id,company_id,preorder_id,inventory_id,item_type,description,quantity,unit_price,discount_amount,unit_factor_snapshot,sort_order)
    VALUES((v_item->>'id')::uuid,v_company,p_preorder_id,NULLIF(v_item->>'inventory_id','')::uuid,v_item->>'item_type',btrim(v_item->>'description'),
      (v_item->>'quantity')::numeric,NULLIF(v_item->>'unit_price','')::numeric,COALESCE(NULLIF(v_item->>'discount_amount','')::numeric,0),COALESCE(NULLIF(v_item->>'unit_factor','')::numeric,1),COALESCE(NULLIF(v_item->>'sort_order','')::integer,0))
    ON CONFLICT(id) DO UPDATE SET inventory_id=EXCLUDED.inventory_id,item_type=EXCLUDED.item_type,description=EXCLUDED.description,quantity=EXCLUDED.quantity,
      unit_price=EXCLUDED.unit_price,discount_amount=EXCLUDED.discount_amount,unit_factor_snapshot=EXCLUDED.unit_factor_snapshot,sort_order=EXCLUDED.sort_order
    WHERE public.pdv_preorder_items.preorder_id=p_preorder_id AND public.pdv_preorder_items.company_id=v_company;
  END LOOP;
  DELETE FROM public.pdv_preorder_items pi WHERE pi.preorder_id=p_preorder_id AND NOT(pi.id=ANY(v_ids));
  v_result:=jsonb_build_object('preorder_id',v_pre.id,'number',v_pre.number,'revision',v_pre.revision,'status',v_pre.status,'has_missing_prices',v_has_missing);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_preorder',v_pre.id,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_forward_preorder_v2(p_preorder_id uuid,p_expected_revision bigint,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid; v_pre public.pdv_preorders%ROWTYPE; v_claim record; v_result jsonb;
BEGIN
  v_company:=public.pdv_preorder_access_company_v2();
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_company,'preorder.forward',p_idempotency_key,jsonb_build_object('id',p_preorder_id,'revision',p_expected_revision));
  IF v_claim.is_replay THEN IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result; END IF; RAISE EXCEPTION 'Este encaminhamento ainda está sendo processado.' USING ERRCODE='55000',DETAIL='code=pdv_preorder_operation_pending'; END IF;
  SELECT * INTO v_pre FROM public.pdv_preorders WHERE id=p_preorder_id FOR UPDATE;
  IF NOT FOUND OR v_pre.company_id<>v_company OR NOT public.pdv_preorder_can_access_v2(v_pre) THEN RAISE EXCEPTION 'Pré-pedido não encontrado ou sem acesso.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_access_denied'; END IF;
  IF v_pre.status<>'edicao' OR v_pre.revision<>p_expected_revision THEN RAISE EXCEPTION 'Atualize o pré-pedido antes de encaminhar.' USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict'; END IF;
  UPDATE public.pdv_preorders SET status='encaminhado',forwarded_at=now(),revision=revision+1 WHERE id=p_preorder_id RETURNING * INTO v_pre;
  v_result:=jsonb_build_object('preorder_id',v_pre.id,'revision',v_pre.revision,'status',v_pre.status);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_preorder',v_pre.id,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_cancel_preorder_v2(p_preorder_id uuid,p_expected_revision bigint,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid; v_uid uuid:=auth.uid(); v_pre public.pdv_preorders%ROWTYPE; v_claim record; v_r record; v_result jsonb;
BEGIN
  v_company:=public.pdv_preorder_access_company_v2();
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_company,'preorder.cancel',p_idempotency_key,jsonb_build_object('id',p_preorder_id,'revision',p_expected_revision));
  IF v_claim.is_replay THEN IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result; END IF; RAISE EXCEPTION 'Este cancelamento ainda está sendo processado.' USING ERRCODE='55000',DETAIL='code=pdv_preorder_operation_pending'; END IF;
  SELECT * INTO v_pre FROM public.pdv_preorders WHERE id=p_preorder_id FOR UPDATE;
  IF NOT FOUND OR v_pre.company_id<>v_company OR NOT public.pdv_preorder_can_access_v2(v_pre) THEN RAISE EXCEPTION 'Pré-pedido não encontrado ou sem acesso.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_access_denied'; END IF;
  IF NOT (v_pre.created_by=v_uid OR v_pre.assigned_to=v_uid OR public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Você não tem permissão para cancelar este pré-pedido.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_cancel_denied';
  END IF;
  IF v_pre.status NOT IN('edicao','encaminhado') OR v_pre.revision<>p_expected_revision THEN RAISE EXCEPTION 'Este pré-pedido não pode mais ser cancelado nesta versão.' USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict'; END IF;
  FOR v_r IN SELECT r.id,r.reserved_quantity-r.consumed_quantity-r.released_quantity residual FROM public.pdv_stock_reservation_items r JOIN public.pdv_preorder_items pi ON pi.id=r.preorder_item_id WHERE pi.preorder_id=p_preorder_id AND r.state IN('guaranteed','conflict') ORDER BY r.inventory_id,r.stock_id,r.id FOR UPDATE OF r LOOP
    PERFORM public.pdv_release_stock_reservation_internal_v2(v_company,v_r.id,v_r.residual);
  END LOOP;
  UPDATE public.pdv_preorders SET status='cancelado',cancelled_at=now(),revision=revision+1 WHERE id=p_preorder_id RETURNING * INTO v_pre;
  v_result:=jsonb_build_object('preorder_id',v_pre.id,'revision',v_pre.revision,'status',v_pre.status);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_preorder',v_pre.id,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_convert_preorder_v2(p_preorder_id uuid,p_expected_revision bigint,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid; v_uid uuid:=auth.uid(); v_pre public.pdv_preorders%ROWTYPE; v_claim record; v_order uuid; v_pi record; v_oi uuid; v_result jsonb; v_r record; v_cost numeric; v_cost_max numeric; v_null_cost boolean; v_nonnull_cost boolean;
BEGIN
  v_company:=public.pdv_preorder_access_company_v2();
  IF public.user_has_permission(v_uid,'screen:pdv_orders') IS DISTINCT FROM true
     OR NOT (public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid) OR public.pdv_has_explicit_action_permission_v2(v_uid,'fn:convert_pdv_preorder')) THEN
    RAISE EXCEPTION 'Você não tem permissão para transformar este pré-pedido em pedido.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_convert_denied';
  END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_company,'preorder.convert',p_idempotency_key,jsonb_build_object('id',p_preorder_id,'revision',p_expected_revision));
  IF v_claim.is_replay THEN IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result; END IF; RAISE EXCEPTION 'Esta conversão ainda está sendo processada.' USING ERRCODE='55000',DETAIL='code=pdv_preorder_operation_pending'; END IF;
  SELECT * INTO v_pre FROM public.pdv_preorders WHERE id=p_preorder_id FOR UPDATE;
  IF NOT FOUND OR v_pre.company_id<>v_company OR NOT public.pdv_preorder_can_access_v2(v_pre) THEN RAISE EXCEPTION 'Pré-pedido não encontrado ou sem acesso.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_access_denied'; END IF;
  IF v_pre.status='convertido' THEN
    v_result:=jsonb_build_object('preorder_id',v_pre.id,'order_id',v_pre.converted_order_id,'already_converted',true);
    PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_order',v_pre.converted_order_id,v_result); RETURN v_result;
  END IF;
  IF v_pre.status<>'encaminhado' OR v_pre.revision<>p_expected_revision THEN RAISE EXCEPTION 'Atualize ou encaminhe o pré-pedido antes de converter.' USING ERRCODE='40001',DETAIL='code=pdv_preorder_revision_conflict'; END IF;
  IF v_pre.subtotal IS NULL OR v_pre.total IS NULL OR EXISTS(SELECT 1 FROM public.pdv_preorder_items pi WHERE pi.preorder_id=p_preorder_id AND pi.unit_price IS NULL) THEN
    RAISE EXCEPTION 'Defina o preço de todos os itens antes de criar o pedido.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_missing_prices';
  END IF;
  -- Prelock global de materiais, locais, niveis e reservas antes de transferir origens.
  PERFORM pi.id FROM public.pdv_preorder_items pi WHERE pi.preorder_id=p_preorder_id ORDER BY pi.id FOR UPDATE OF pi;
  PERFORM inv.id FROM public.inventory inv WHERE EXISTS(
    SELECT 1 FROM public.pdv_preorder_items pi WHERE pi.preorder_id=p_preorder_id AND pi.inventory_id=inv.id
  ) ORDER BY inv.id FOR UPDATE OF inv;
  PERFORM st.id FROM public.stocks st WHERE EXISTS(
    SELECT 1 FROM public.pdv_stock_reservation_items r JOIN public.pdv_preorder_items pi ON pi.id=r.preorder_item_id
    WHERE pi.preorder_id=p_preorder_id AND r.stock_id=st.id AND r.state IN('guaranteed','conflict')
  ) ORDER BY st.id FOR UPDATE OF st;
  PERFORM sl.id FROM public.inventory_stock_levels sl WHERE EXISTS(
    SELECT 1 FROM public.pdv_stock_reservation_items r JOIN public.pdv_preorder_items pi ON pi.id=r.preorder_item_id
    WHERE pi.preorder_id=p_preorder_id AND r.inventory_id=sl.inventory_id AND r.stock_id=sl.stock_id AND r.state IN('guaranteed','conflict')
  ) ORDER BY sl.inventory_id,sl.stock_id FOR UPDATE OF sl;
  PERFORM r.id FROM public.pdv_stock_reservation_items r JOIN public.pdv_preorder_items pi ON pi.id=r.preorder_item_id
   WHERE pi.preorder_id=p_preorder_id AND r.state IN('guaranteed','conflict') ORDER BY r.inventory_id,r.stock_id,r.id FOR UPDATE OF r;
  v_order:=gen_random_uuid();
  INSERT INTO public.pdv_orders(id,company_id,number,customer_id,salesperson_id,stock_id,status,subtotal,discount_amount,total,notes,source_preorder_id,contract_version,operation_mode_snapshot)
  VALUES(v_order,v_company,public.next_pdv_order_number(v_company),v_pre.customer_id,v_uid,v_pre.stock_id,'aguardando_pagamento',v_pre.subtotal,v_pre.discount_amount,v_pre.total,v_pre.notes,p_preorder_id,2,v_pre.operation_mode);
  FOR v_pi IN
    WITH base AS (
      SELECT pi.*,round(pi.quantity*pi.unit_price,2) AS gross_total_calc,
        round(round(pi.quantity*pi.unit_price,2)-pi.discount_amount,2) AS net_before_order_discount
      FROM public.pdv_preorder_items pi WHERE pi.preorder_id=p_preorder_id
    ), shares AS (
      SELECT b.*,CASE WHEN v_pre.discount_amount=0 OR v_pre.subtotal=0 THEN 0::numeric
        ELSE v_pre.discount_amount*100*b.net_before_order_discount/v_pre.subtotal END AS raw_alloc_cents
      FROM base b
    ), ranked AS (
      SELECT s.*,floor(s.raw_alloc_cents)::bigint AS base_alloc_cents,
        row_number() OVER(ORDER BY s.raw_alloc_cents-floor(s.raw_alloc_cents) DESC,s.sort_order,s.id) AS remainder_rank,
        sum(floor(s.raw_alloc_cents)::bigint) OVER() AS allocated_floor_cents
      FROM shares s
    )
    SELECT ranked.*,(base_alloc_cents+CASE WHEN remainder_rank<=round(v_pre.discount_amount*100)::bigint-allocated_floor_cents THEN 1 ELSE 0 END)::numeric/100 AS order_discount_allocated
    FROM ranked ORDER BY sort_order,id
  LOOP
    v_oi:=gen_random_uuid();
    v_cost:=NULL; v_null_cost:=false; v_nonnull_cost:=false;
    IF v_pi.item_type='material' THEN
      SELECT bool_or(r.cost_price_snapshot IS NULL),bool_or(r.cost_price_snapshot IS NOT NULL),min(r.cost_price_snapshot),max(r.cost_price_snapshot)
        INTO v_null_cost,v_nonnull_cost,v_cost,v_cost_max
        FROM public.pdv_stock_reservation_items r WHERE r.preorder_item_id=v_pi.id AND r.state IN('guaranteed','conflict');
      IF COALESCE(v_null_cost,false) AND COALESCE(v_nonnull_cost,false) THEN RAISE EXCEPTION 'As reservas do item possuem custos incompatíveis.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_reservation_cost_conflict'; END IF;
      IF COALESCE(v_nonnull_cost,false) AND v_cost IS DISTINCT FROM v_cost_max THEN RAISE EXCEPTION 'As reservas do item possuem custos diferentes.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_reservation_cost_conflict'; END IF;
      IF NOT COALESCE(v_null_cost,false) AND NOT COALESCE(v_nonnull_cost,false) THEN SELECT inv.cost_price INTO v_cost FROM public.inventory inv WHERE inv.id=v_pi.inventory_id; END IF;
    ELSE v_cost:=NULL; END IF;
    INSERT INTO public.pdv_order_items(id,company_id,order_id,inventory_id,description,quantity,unit_price,unit_cost,discount_amount,total,sort_order,item_type,unit_cost_v2,contract_version,gross_total_v2,line_discount_amount_v2,order_discount_allocated_v2)
    VALUES(v_oi,v_company,v_order,v_pi.inventory_id,v_pi.description,v_pi.quantity,v_pi.unit_price,COALESCE(v_cost,0),
      round(v_pi.discount_amount+v_pi.order_discount_allocated,2),round(v_pi.gross_total_calc-v_pi.discount_amount-v_pi.order_discount_allocated,2),
      v_pi.sort_order,v_pi.item_type,v_cost,2,v_pi.gross_total_calc,v_pi.discount_amount,v_pi.order_discount_allocated);
    FOR v_r IN SELECT r.id FROM public.pdv_stock_reservation_items r WHERE r.preorder_item_id=v_pi.id AND r.company_id=v_company AND r.state IN('guaranteed','conflict') ORDER BY r.inventory_id,r.stock_id,r.id LOOP
      PERFORM public.pdv_transfer_stock_reservation_origin_internal_v2(v_company,v_r.id,v_oi);
    END LOOP;
  END LOOP;
  IF (SELECT COALESCE(sum(oi.total),0) FROM public.pdv_order_items oi WHERE oi.order_id=v_order) IS DISTINCT FROM v_pre.total THEN
    RAISE EXCEPTION 'Não foi possível conciliar o desconto entre os itens.' USING ERRCODE='23514',DETAIL='code=pdv_preorder_discount_allocation_mismatch';
  END IF;
  UPDATE public.pdv_preorders SET status='convertido',converted_order_id=v_order,converted_at=now(),revision=revision+1 WHERE id=p_preorder_id RETURNING * INTO v_pre;
  v_result:=jsonb_build_object('preorder_id',v_pre.id,'order_id',v_order,'already_converted',false,'revision',v_pre.revision);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'pdv_order',v_order,v_result); RETURN v_result;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_list_preorders_v2(p_status text DEFAULT NULL)
RETURNS TABLE(id uuid,number integer,status text,operation_mode text,revision bigint,customer_id uuid,assigned_to uuid,total numeric,has_missing_prices boolean,updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid;
BEGIN v_company:=public.pdv_preorder_access_company_v2();
  RETURN QUERY SELECT p.id,p.number,p.status,p.operation_mode,p.revision,p.customer_id,p.assigned_to,p.total,p.total IS NULL,p.updated_at
  FROM public.pdv_preorders p WHERE p.company_id=v_company AND (p_status IS NULL OR p.status=p_status)
    AND public.pdv_preorder_can_access_v2(p)
  ORDER BY p.updated_at DESC,p.id;
END $fn$;

CREATE OR REPLACE FUNCTION public.pdv_get_preorder_v2(p_preorder_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid; v_pre public.pdv_preorders%ROWTYPE;
BEGIN v_company:=public.pdv_preorder_access_company_v2(); SELECT * INTO v_pre FROM public.pdv_preorders WHERE id=p_preorder_id AND company_id=v_company;
  IF NOT FOUND OR NOT public.pdv_preorder_can_access_v2(v_pre) THEN RAISE EXCEPTION 'Pré-pedido não encontrado ou sem acesso.' USING ERRCODE='42501',DETAIL='code=pdv_preorder_access_denied'; END IF;
  RETURN jsonb_build_object('preorder',to_jsonb(v_pre),'items',(SELECT COALESCE(jsonb_agg(to_jsonb(pi) ORDER BY pi.sort_order,pi.id),'[]'::jsonb) FROM public.pdv_preorder_items pi WHERE pi.preorder_id=p_preorder_id));
END $fn$;

-- Escrita somente por RPC; helpers internos permanecem fechados.
REVOKE ALL ON FUNCTION public.pdv_preorder_access_company_v2() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_has_explicit_action_permission_v2(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.next_pdv_preorder_number_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_preorder_can_access_v2(public.pdv_preorders) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_preorder_validate_actor_v2(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pdv_save_preorder_v2(uuid,bigint,jsonb,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_forward_preorder_v2(uuid,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_cancel_preorder_v2(uuid,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_convert_preorder_v2(uuid,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_list_preorders_v2(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.pdv_get_preorder_v2(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_save_preorder_v2(uuid,bigint,jsonb,jsonb,text),public.pdv_forward_preorder_v2(uuid,bigint,text),public.pdv_cancel_preorder_v2(uuid,bigint,text),public.pdv_convert_preorder_v2(uuid,bigint,text),public.pdv_list_preorders_v2(text),public.pdv_get_preorder_v2(uuid) TO authenticated,service_role;

-- O reset PDV passa a remover pre-pedidos (inclusive nao convertidos) sob a valvula nominal existente.
DO $patch_reset$
DECLARE v_oid regprocedure; v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT p.oid::regprocedure,pg_get_functiondef(p.oid) INTO v_oid,v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='reset_system_step'
     AND pg_get_function_identity_arguments(p.oid)='p_company_id uuid, p_step text, p_audit_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'reset_system_step nao encontrada'; END IF;
  IF position('DELETE FROM public.pdv_preorders WHERE company_id = p_company_id;' in v_src)>0 THEN RETURN; END IF;
  v_anchor:='DELETE FROM public.customer_credit_ledger WHERE company_id = p_company_id;';
  v_insert:='DELETE FROM public.pdv_preorders WHERE company_id = p_company_id;'||chr(10)||'    DELETE FROM public.pdv_preorder_number_counters WHERE company_id = p_company_id;'||chr(10)||'    '||v_anchor;
  IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Ancora do reset PDV mudou'; END IF;
  EXECUTE replace(v_src,v_anchor,v_insert);
END $patch_reset$;

-- O wrapper administrativo historico apaga pedidos antes da empresa. Remove a
-- origem operacional primeiro para nao depender do efeito da FK do pedido.
DO $patch_admin_delete$
DECLARE v_oid regprocedure; v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT p.oid::regprocedure,pg_get_functiondef(p.oid) INTO v_oid,v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='admin_delete_company'
     AND pg_get_function_identity_arguments(p.oid)='p_company_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'admin_delete_company nao encontrada'; END IF;
  IF position('DELETE FROM public.pdv_preorders WHERE company_id = p_company_id;' in v_src)>0 THEN RETURN; END IF;
  v_anchor:='DELETE FROM public.pdv_orders order_row'||chr(10)||'   WHERE order_row.company_id = p_company_id;';
  v_insert:='DELETE FROM public.pdv_preorders WHERE company_id = p_company_id;'||chr(10)
    ||'  DELETE FROM public.pdv_preorder_number_counters WHERE company_id = p_company_id;'||chr(10)||chr(10)||'  '||v_anchor;
  IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Ancora do admin_delete_company mudou'; END IF;
  EXECUTE replace(v_src,v_anchor,v_insert);
END $patch_admin_delete$;

COMMENT ON FUNCTION public.pdv_save_preorder_v2(uuid,bigint,jsonb,jsonb,text) IS
  'Salva pre-pedido com CAS. A UI de permissoes deve cadastrar fn:value_pdv_preorder para quem pode definir preco/desconto.';
COMMENT ON FUNCTION public.pdv_convert_preorder_v2(uuid,bigint,text) IS
  'Converte pre-pedido encaminhado uma unica vez. A UI de permissoes deve cadastrar fn:convert_pdv_preorder para operadores de caixa.';

COMMIT;
