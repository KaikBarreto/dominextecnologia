-- Cupom promocional = desconto. Não cria crédito, voucher ou dinheiro.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
CREATE TABLE public.pdv_coupons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 code text NOT NULL, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('fixed','percentage')),
 value numeric(14,2) NOT NULL CHECK(value>0 AND value=round(value,2) AND value::text NOT IN ('NaN','Infinity','-Infinity')),
 max_discount_amount numeric(14,2) CHECK(max_discount_amount>0 AND max_discount_amount::text NOT IN ('NaN','Infinity','-Infinity')),
 minimum_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(minimum_amount>=0 AND minimum_amount::text NOT IN ('NaN','Infinity','-Infinity')),
 starts_on date, expires_on date, is_active boolean NOT NULL DEFAULT true,
 usage_limit integer CHECK(usage_limit>0), per_customer_limit integer CHECK(per_customer_limit>0),
 customer_ids uuid[] NOT NULL DEFAULT '{}', inventory_ids uuid[] NOT NULL DEFAULT '{}',
 revision integer NOT NULL DEFAULT 1, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,code), UNIQUE(company_id,id),
 CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'), CHECK(char_length(name) BETWEEN 2 AND 100),
 CHECK(kind<>'percentage' OR value<=100), CHECK(starts_on IS NULL OR expires_on IS NULL OR starts_on<=expires_on)
);
CREATE TABLE public.pdv_coupon_usages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 coupon_id uuid NOT NULL, order_id uuid NOT NULL UNIQUE REFERENCES public.pdv_orders(id) ON DELETE CASCADE, customer_id uuid,
 discount_cents bigint NOT NULL CHECK(discount_cents>0), rules_snapshot jsonb NOT NULL, allocations jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(company_id,coupon_id) REFERENCES public.pdv_coupons(company_id,id)
);
CREATE INDEX pdv_coupon_usages_customer ON public.pdv_coupon_usages(company_id,coupon_id,customer_id);
ALTER TABLE public.pdv_orders ADD COLUMN coupon_discount_amount_v1 numeric(14,2) NOT NULL DEFAULT 0 CHECK(coupon_discount_amount_v1>=0);
ALTER TABLE public.pdv_order_items ADD COLUMN coupon_discount_amount_v1 numeric(14,2) NOT NULL DEFAULT 0 CHECK(coupon_discount_amount_v1>=0);
ALTER TABLE public.pdv_orders ADD CONSTRAINT pdv_orders_coupon_company_fk FOREIGN KEY(company_id,coupon_id) REFERENCES public.pdv_coupons(company_id,id) NOT VALID;
COMMENT ON COLUMN public.pdv_orders.coupon_id IS 'Cupom promocional validado no servidor; não representa voucher ou meio de pagamento.';
COMMENT ON COLUMN public.pdv_order_items.coupon_discount_amount_v1 IS 'Parte imutável do desconto promocional já incluída no desconto canônico do item. Devoluções usam total líquido persistido.';

CREATE FUNCTION public.pdv_coupon_company_v1(p_manage boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_context record;
BEGIN
 SELECT * INTO v_context FROM public.pdv_counter_context_v2(NULL,NULL,false);
 IF p_manage THEN
   IF NOT(public.is_admin_or_gestor(v_context.user_id) OR public.is_super_admin(v_context.user_id))
      AND (public.pdv_has_explicit_action_permission_v2(v_context.user_id,'screen:pdv_settings') IS DISTINCT FROM true
       OR public.pdv_has_explicit_action_permission_v2(v_context.user_id,'fn:manage_pdv_settings') IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'Seu perfil não tem permissão para gerenciar cupons.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_permission';
   END IF;
 ELSIF NOT(public.is_admin_or_gestor(v_context.user_id) OR public.is_super_admin(v_context.user_id))
  AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,'screen:pdv') IS DISTINCT FROM true
  AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,'screen:pdv_orders') IS DISTINCT FROM true
  AND public.pdv_has_explicit_action_permission_v2(v_context.user_id,'screen:pdv_settings') IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Seu perfil não tem permissão para acessar cupons.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_permission';
 END IF;
 RETURN v_context.company_id;
END $fn$;
ALTER TABLE public.pdv_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_coupon_usages ENABLE ROW LEVEL SECURITY;
CREATE POLICY pdv_coupons_read ON public.pdv_coupons FOR SELECT TO authenticated USING(company_id=(SELECT public.pdv_coupon_company_v1(false)));
CREATE POLICY pdv_coupon_usages_read ON public.pdv_coupon_usages FOR SELECT TO authenticated USING(company_id=(SELECT public.pdv_coupon_company_v1(true)));
REVOKE ALL ON public.pdv_coupons,public.pdv_coupon_usages FROM anon,authenticated;
GRANT SELECT ON public.pdv_coupons,public.pdv_coupon_usages TO authenticated;

CREATE FUNCTION public.pdv_list_coupons_v1(p_management boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid:=public.pdv_coupon_company_v1(p_management); v_today date:=public.company_today(v_company);
BEGIN
 RETURN jsonb_build_object('coupons',COALESCE((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object(
 'used_count',(SELECT count(*) FROM public.pdv_coupon_usages u WHERE u.coupon_id=c.id),
 'status',CASE WHEN NOT c.is_active THEN 'inactive' WHEN c.expires_on<v_today THEN 'expired' WHEN c.starts_on>v_today THEN 'scheduled' ELSE 'available' END) ORDER BY c.updated_at DESC) FROM public.pdv_coupons c WHERE c.company_id=v_company),'[]'::jsonb),
 'customers',CASE WHEN p_management THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) ORDER BY c.name) FROM public.customers c WHERE c.company_id=v_company AND c.is_deleted IS NOT TRUE),'[]'::jsonb) ELSE '[]'::jsonb END,
 'inventory',CASE WHEN p_management THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.name) ORDER BY i.name) FROM public.inventory i WHERE i.company_id=v_company AND i.customer_id IS NULL),'[]'::jsonb) ELSE '[]'::jsonb END);
END $fn$;

CREATE FUNCTION public.pdv_save_coupon_v1(p_coupon_id uuid,p_expected_revision integer,p_rules jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_company uuid:=public.pdv_coupon_company_v1(true); v_row public.pdv_coupons; v_id uuid; v_customers uuid[]; v_inventory uuid[]; v_code text;
BEGIN
 IF jsonb_typeof(p_rules) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_rules) k WHERE k NOT IN ('code','name','kind','value','max_discount_amount','minimum_amount','starts_on','expires_on','is_active','usage_limit','per_customer_limit','customer_ids','inventory_ids')) THEN
  RAISE EXCEPTION 'Revise as regras do cupom.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_invalid'; END IF;
 v_code:=upper(btrim(p_rules->>'code'));
 v_customers:=ARRAY(SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(COALESCE(p_rules->'customer_ids','[]'::jsonb)));
 v_inventory:=ARRAY(SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(COALESCE(p_rules->'inventory_ids','[]'::jsonb)));
 FOREACH v_id IN ARRAY v_customers LOOP PERFORM public.pdv_assert_ref_company('public.customers',v_id,v_company,'O cliente'); END LOOP;
 FOREACH v_id IN ARRAY v_inventory LOOP PERFORM public.pdv_assert_ref_company('public.inventory',v_id,v_company,'O produto'); END LOOP;
 IF p_coupon_id IS NOT NULL THEN
  SELECT * INTO v_row FROM public.pdv_coupons WHERE company_id=v_company AND id=p_coupon_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este cupom não está disponível.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_missing'; END IF;
  IF v_row.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'O cupom foi alterado em outra sessão. Atualize antes de salvar.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
 END IF;
 INSERT INTO public.pdv_coupons AS c(id,company_id,code,name,kind,value,max_discount_amount,minimum_amount,starts_on,expires_on,is_active,usage_limit,per_customer_limit,customer_ids,inventory_ids,created_by)
 VALUES(COALESCE(p_coupon_id,gen_random_uuid()),v_company,v_code,btrim(p_rules->>'name'),p_rules->>'kind',(p_rules->>'value')::numeric,NULLIF(p_rules->>'max_discount_amount','')::numeric,COALESCE((p_rules->>'minimum_amount')::numeric,0),NULLIF(p_rules->>'starts_on','')::date,NULLIF(p_rules->>'expires_on','')::date,COALESCE((p_rules->>'is_active')::boolean,true),NULLIF(p_rules->>'usage_limit','')::integer,NULLIF(p_rules->>'per_customer_limit','')::integer,v_customers,v_inventory,auth.uid())
 ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,kind=EXCLUDED.kind,value=EXCLUDED.value,max_discount_amount=EXCLUDED.max_discount_amount,minimum_amount=EXCLUDED.minimum_amount,starts_on=EXCLUDED.starts_on,expires_on=EXCLUDED.expires_on,is_active=EXCLUDED.is_active,usage_limit=EXCLUDED.usage_limit,per_customer_limit=EXCLUDED.per_customer_limit,customer_ids=EXCLUDED.customer_ids,inventory_ids=EXCLUDED.inventory_ids,revision=c.revision+1,updated_at=now()
 RETURNING * INTO v_row;
 RETURN to_jsonb(v_row)||jsonb_build_object('used_count',(SELECT count(*) FROM public.pdv_coupon_usages u WHERE u.coupon_id=v_row.id),'status',CASE WHEN NOT v_row.is_active THEN 'inactive' WHEN v_row.expires_on<public.company_today(v_company) THEN 'expired' WHEN v_row.starts_on>public.company_today(v_company) THEN 'scheduled' ELSE 'available' END);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Já existe um cupom com este código. Escolha outro código.' USING ERRCODE='23505',DETAIL='code=pdv_coupon_duplicate';
 WHEN check_violation OR invalid_text_representation OR datetime_field_overflow OR not_null_violation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Revise os valores, os limites e a vigência do cupom.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_invalid';
END $fn$;

-- Campos opcionais de cupom não alteram hashes persistidos por clientes antigos.
CREATE FUNCTION public.pdv_coupon_hash_meta_internal_v1(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE v_coupon uuid:=NULLIF(p_input->>'coupon_id','')::uuid; v_cents bigint:=COALESCE(NULLIF(p_input->>'coupon_discount_cents','')::bigint,0);
BEGIN
 IF v_coupon IS NULL THEN
  IF v_cents<>0 THEN RAISE EXCEPTION 'Selecione um cupom válido.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_invalid'; END IF;
  RETURN '{}'::jsonb;
 END IF;
 IF v_cents<0 THEN RAISE EXCEPTION 'Confira o desconto do cupom.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_invalid'; END IF;
 RETURN jsonb_build_object('coupon_id',v_coupon,'coupon_discount_cents',v_cents);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_coupon_hash_meta_internal_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- items: [{id:string, inventory_id:uuid|null, net_cents:integer}].
-- Valor líquido após desconto manual e ANTES do cupom. Somente writers internos
-- passam valores canônicos; a RPC de preview é consultiva e não cria uso.
CREATE FUNCTION public.pdv_evaluate_coupon_internal_v1(p_company_id uuid,p_coupon_id uuid,p_customer_id uuid,p_items jsonb,p_exclude_order_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE c public.pdv_coupons; v_today date:=public.company_today(p_company_id); v_reason text; v_total bigint; v_eligible bigint; v_discount bigint; v_alloc jsonb; v_count bigint;
BEGIN
 SELECT * INTO c FROM public.pdv_coupons WHERE company_id=p_company_id AND id=p_coupon_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('eligible',false,'reason','missing','message','Este cupom não está disponível.'); END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>1000
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) i WHERE jsonb_typeof(i) IS DISTINCT FROM 'object' OR COALESCE(i->>'id','')='' OR COALESCE(i->>'net_cents','')!~'^[0-9]{1,14}$')
  OR (SELECT count(DISTINCT i->>'id') FROM jsonb_array_elements(p_items) i)<>jsonb_array_length(p_items) THEN
  RAISE EXCEPTION 'Revise os itens antes de aplicar o cupom.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_items_invalid'; END IF;
 IF p_customer_id IS NOT NULL THEN PERFORM public.pdv_assert_ref_company('public.customers',p_customer_id,p_company_id,'O cliente'); END IF;
 IF NOT c.is_active THEN v_reason:='inactive'; ELSIF c.starts_on>v_today THEN v_reason:='scheduled'; ELSIF c.expires_on<v_today THEN v_reason:='expired';
 ELSIF cardinality(c.customer_ids)>0 AND (p_customer_id IS NULL OR NOT p_customer_id=ANY(c.customer_ids)) THEN v_reason:='customer';
 ELSIF c.per_customer_limit IS NOT NULL AND p_customer_id IS NULL THEN v_reason:='customer_required'; END IF;
 SELECT COALESCE(sum((i->>'net_cents')::bigint),0), COALESCE(sum((i->>'net_cents')::bigint) FILTER(WHERE cardinality(c.inventory_ids)=0 OR NULLIF(i->>'inventory_id','')::uuid=ANY(c.inventory_ids)),0)
 INTO v_total,v_eligible FROM jsonb_array_elements(p_items) i;
 IF v_reason IS NULL AND v_total<round(c.minimum_amount*100)::bigint THEN v_reason:='minimum'; END IF;
 IF v_reason IS NULL AND v_eligible=0 THEN v_reason:='items'; END IF;
 SELECT count(*) INTO v_count FROM public.pdv_coupon_usages u WHERE u.coupon_id=c.id AND (p_exclude_order_id IS NULL OR u.order_id<>p_exclude_order_id);
 IF v_reason IS NULL AND c.usage_limit IS NOT NULL AND v_count>=c.usage_limit THEN v_reason:='usage_limit'; END IF;
 IF v_reason IS NULL AND c.per_customer_limit IS NOT NULL AND (SELECT count(*) FROM public.pdv_coupon_usages u WHERE u.coupon_id=c.id AND u.customer_id=p_customer_id AND (p_exclude_order_id IS NULL OR u.order_id<>p_exclude_order_id))>=c.per_customer_limit THEN v_reason:='customer_limit'; END IF;
 IF v_reason IS NOT NULL THEN RETURN jsonb_build_object('eligible',false,'reason',v_reason,'message',CASE v_reason
 WHEN 'inactive' THEN 'Este cupom está inativo.' WHEN 'scheduled' THEN 'A vigência deste cupom ainda não começou.' WHEN 'expired' THEN 'A vigência deste cupom terminou.'
 WHEN 'customer' THEN 'Este cupom está disponível apenas para os clientes selecionados.' WHEN 'customer_required' THEN 'Selecione um cliente para usar este cupom.'
 WHEN 'minimum' THEN 'O valor dos itens não atingiu a compra mínima deste cupom.' WHEN 'items' THEN 'Adicione um produto participante para usar este cupom.'
 WHEN 'usage_limit' THEN 'O limite de utilizações deste cupom foi atingido.' ELSE 'Este cliente já atingiu o limite de utilizações deste cupom.' END); END IF;
 v_discount:=LEAST(v_eligible,CASE WHEN c.kind='percentage' THEN round(v_eligible*c.value/100)::bigint ELSE round(c.value*100)::bigint END,COALESCE(round(c.max_discount_amount*100)::bigint,v_eligible));
 IF v_discount<=0 THEN RETURN jsonb_build_object('eligible',false,'reason','zero','message','O cupom não gera desconto para os itens atuais.'); END IF;
 WITH bases AS (SELECT i->>'id' id,(i->>'net_cents')::bigint net_cents FROM jsonb_array_elements(p_items) i WHERE cardinality(c.inventory_ids)=0 OR NULLIF(i->>'inventory_id','')::uuid=ANY(c.inventory_ids)),
 shares AS (SELECT *,v_discount::numeric*net_cents/v_eligible raw FROM bases),
 ranked AS (SELECT *,floor(raw)::bigint base,row_number() OVER(ORDER BY raw-floor(raw) DESC,id) rank,sum(floor(raw)) OVER() allocated FROM shares)
 SELECT jsonb_agg(jsonb_build_object('item_id',id,'base_net_cents',net_cents,'discount_cents',base+CASE WHEN rank<=v_discount-allocated THEN 1 ELSE 0 END) ORDER BY id) INTO v_alloc FROM ranked;
 RETURN jsonb_build_object('eligible',true,'discount_cents',v_discount,'allocations',v_alloc,'coupon_id',c.id,'revision',c.revision,'code',c.code,'rules_snapshot',to_jsonb(c)-'created_by');
END $fn$;

CREATE FUNCTION public.pdv_evaluate_coupon_v1(p_coupon_id uuid,p_customer_id uuid,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN RETURN public.pdv_evaluate_coupon_internal_v1(public.pdv_coupon_company_v1(false),p_coupon_id,p_customer_id,p_items,NULL); END $fn$;

-- Integrado pelo writer ANTES da liquidação: os itens base já refletem os descontos
-- manuais, e o desconto retornado deve compor os totais canônicos persistidos.
-- O lock serializa limite global/cliente. A transação do writer desfaz o uso
-- quando pagamento/estoque falha. Replay jamais consome outra utilização.
CREATE FUNCTION public.pdv_commit_coupon_internal_v1(p_order_id uuid,p_coupon_id uuid,p_base_items jsonb,p_expected_discount_cents bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o public.pdv_orders; u public.pdv_coupon_usages; v_result jsonb;
BEGIN
 SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'O pedido não está disponível.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_order_missing'; END IF;
 SELECT * INTO u FROM public.pdv_coupon_usages WHERE order_id=o.id;
 IF FOUND THEN
  IF u.coupon_id IS DISTINCT FROM p_coupon_id OR u.discount_cents IS DISTINCT FROM p_expected_discount_cents THEN
   RAISE EXCEPTION 'O cupom do pedido já foi confirmado. Atualize o pedido.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
  RETURN jsonb_build_object('eligible',true,'discount_cents',u.discount_cents,'allocations',u.allocations,'rules_snapshot',u.rules_snapshot,'idempotent',true);
 END IF;
 IF o.status NOT IN ('aguardando_pagamento','em_separacao') THEN RAISE EXCEPTION 'O cupom só pode ser confirmado antes do pagamento.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_order_state'; END IF;
 PERFORM 1 FROM public.pdv_coupons WHERE id=p_coupon_id AND company_id=o.company_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_base_items) i WHERE NOT EXISTS(SELECT 1 FROM public.pdv_order_items oi WHERE oi.id=(i->>'id')::uuid AND oi.order_id=o.id AND oi.inventory_id IS NOT DISTINCT FROM NULLIF(i->>'inventory_id','')::uuid))
  OR jsonb_array_length(p_base_items)<>(SELECT count(*) FROM public.pdv_order_items WHERE order_id=o.id) THEN
   RAISE EXCEPTION 'Os itens do pedido mudaram. Atualize antes de aplicar o cupom.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
 v_result:=public.pdv_evaluate_coupon_internal_v1(o.company_id,p_coupon_id,o.customer_id,p_base_items,o.id);
 IF (v_result->>'eligible')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '%',v_result->>'message' USING ERRCODE='22023',DETAIL='code=pdv_coupon_ineligible'; END IF;
 IF (v_result->>'discount_cents')::bigint IS DISTINCT FROM p_expected_discount_cents THEN RAISE EXCEPTION 'As regras do cupom mudaram. Atualize o desconto antes de pagar.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
 INSERT INTO public.pdv_coupon_usages(company_id,coupon_id,order_id,customer_id,discount_cents,rules_snapshot,allocations)
 VALUES(o.company_id,p_coupon_id,o.id,o.customer_id,p_expected_discount_cents,v_result->'rules_snapshot',v_result->'allocations');
 RETURN v_result||jsonb_build_object('idempotent',false);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_coupon_company_v1(boolean),public.pdv_list_coupons_v1(boolean),public.pdv_save_coupon_v1(uuid,integer,jsonb),public.pdv_evaluate_coupon_v1(uuid,uuid,jsonb),public.pdv_evaluate_coupon_internal_v1(uuid,uuid,uuid,jsonb,uuid),public.pdv_commit_coupon_internal_v1(uuid,uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pdv_coupon_company_v1(boolean),public.pdv_list_coupons_v1(boolean),public.pdv_save_coupon_v1(uuid,integer,jsonb),public.pdv_evaluate_coupon_v1(uuid,uuid,jsonb) TO authenticated,service_role;
-- Prepara a intenção sem consumir limite. Contrato v2 guarda TODO desconto por
-- item; o cabeçalho é apenas seu resumo. Coupon_amount é subconjunto, nunca
-- um segundo abatimento. Orçamentos e pedidos pendentes não reservam utilizações.
CREATE FUNCTION public.pdv_apply_order_coupon_internal_v1(p_order_id uuid,p_coupon_id uuid,p_expected_discount_cents bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o public.pdv_orders; v_items jsonb; v_result jsonb; v_old numeric; v_discount numeric;
BEGIN
 SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.contract_version<>2 OR o.status<>'aguardando_pagamento' OR EXISTS(SELECT 1 FROM public.pdv_coupon_usages WHERE order_id=o.id) THEN
  RAISE EXCEPTION 'O pedido não está disponível para alterar o cupom.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_order_state'; END IF;
 v_old:=o.coupon_discount_amount_v1;
 SELECT jsonb_agg(jsonb_build_object('id',i.id,'inventory_id',i.inventory_id,'net_cents',round((i.total+i.coupon_discount_amount_v1)*100)::bigint) ORDER BY i.id)
 INTO v_items FROM public.pdv_order_items i WHERE i.order_id=o.id;
 IF p_coupon_id IS NULL THEN
  IF COALESCE(p_expected_discount_cents,0)<>0 THEN RAISE EXCEPTION 'Selecione um cupom válido.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_invalid'; END IF;
  v_result:=jsonb_build_object('eligible',true,'discount_cents',0,'allocations','[]'::jsonb); v_discount:=0;
 ELSE
  v_result:=public.pdv_evaluate_coupon_internal_v1(o.company_id,p_coupon_id,o.customer_id,v_items,o.id);
  IF (v_result->>'eligible')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '%',v_result->>'message' USING ERRCODE='22023',DETAIL='code=pdv_coupon_ineligible'; END IF;
  IF (v_result->>'discount_cents')::bigint IS DISTINCT FROM p_expected_discount_cents THEN RAISE EXCEPTION 'As regras do cupom mudaram. Atualize o desconto antes de continuar.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
  v_discount:=p_expected_discount_cents::numeric/100;
 END IF;
 UPDATE public.pdv_order_items i SET
   discount_amount=i.discount_amount-i.coupon_discount_amount_v1+COALESCE((SELECT (a->>'discount_cents')::numeric/100 FROM jsonb_array_elements(v_result->'allocations') a WHERE a->>'item_id'=i.id::text),0),
   order_discount_allocated_v2=i.order_discount_allocated_v2-i.coupon_discount_amount_v1+COALESCE((SELECT (a->>'discount_cents')::numeric/100 FROM jsonb_array_elements(v_result->'allocations') a WHERE a->>'item_id'=i.id::text),0),
   total=i.total+i.coupon_discount_amount_v1-COALESCE((SELECT (a->>'discount_cents')::numeric/100 FROM jsonb_array_elements(v_result->'allocations') a WHERE a->>'item_id'=i.id::text),0),
   coupon_discount_amount_v1=COALESCE((SELECT (a->>'discount_cents')::numeric/100 FROM jsonb_array_elements(v_result->'allocations') a WHERE a->>'item_id'=i.id::text),0)
 WHERE i.order_id=o.id;
 UPDATE public.pdv_orders SET coupon_id=p_coupon_id,coupon_discount_amount_v1=v_discount,discount_amount=o.discount_amount-v_old+v_discount,total=o.total+v_old-v_discount WHERE id=o.id;
 RETURN v_result||jsonb_build_object('total',o.total+v_old-v_discount,'discount_amount',o.discount_amount-v_old+v_discount);
END $fn$;
CREATE FUNCTION public.pdv_consume_order_coupon_internal_v1(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o public.pdv_orders; v_items jsonb; v_result jsonb;
BEGIN
 SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id FOR UPDATE;
 IF o.coupon_id IS NULL THEN
  IF o.coupon_discount_amount_v1<>0 OR EXISTS(SELECT 1 FROM public.pdv_order_items WHERE order_id=o.id AND coupon_discount_amount_v1<>0) THEN RAISE EXCEPTION 'Confira o desconto do pedido antes de pagar.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_invalid'; END IF;
  RETURN;
 END IF;
 SELECT jsonb_agg(jsonb_build_object('id',i.id,'inventory_id',i.inventory_id,'net_cents',round((i.total+i.coupon_discount_amount_v1)*100)::bigint) ORDER BY i.id)
 INTO v_items FROM public.pdv_order_items i WHERE i.order_id=o.id;
 v_result:=public.pdv_commit_coupon_internal_v1(o.id,o.coupon_id,v_items,round(o.coupon_discount_amount_v1*100)::bigint);
 IF EXISTS(SELECT 1 FROM public.pdv_order_items i WHERE i.order_id=o.id AND round(i.coupon_discount_amount_v1*100)::bigint IS DISTINCT FROM COALESCE((SELECT (a->>'discount_cents')::bigint FROM jsonb_array_elements(v_result->'allocations') a WHERE a->>'item_id'=i.id::text),0)) THEN
   RAISE EXCEPTION 'Os itens do cupom mudaram. Atualize o pedido antes de pagar.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_apply_order_coupon_internal_v1(uuid,uuid,bigint),public.pdv_consume_order_coupon_internal_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Colunas adicionadas não herdam uma via de escrita livre do UPDATE legado.
-- Trigger INVOKER distingue escrita autenticada de RPC SECURITY DEFINER.
CREATE FUNCTION public.pdv_guard_coupon_amounts_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF current_user IN ('authenticated','anon') THEN
  IF TG_TABLE_NAME='pdv_orders' THEN
   IF (TG_OP='INSERT' AND (NEW.coupon_id IS NOT NULL OR NEW.coupon_discount_amount_v1<>0))
    OR (TG_OP='UPDATE' AND (NEW.coupon_id,NEW.coupon_discount_amount_v1) IS DISTINCT FROM (OLD.coupon_id,OLD.coupon_discount_amount_v1)) THEN
    RAISE EXCEPTION 'Altere o cupom pelo atendimento da venda.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_permission'; END IF;
  ELSIF (TG_OP='INSERT' AND NEW.coupon_discount_amount_v1<>0)
   OR (TG_OP='UPDATE' AND NEW.coupon_discount_amount_v1 IS DISTINCT FROM OLD.coupon_discount_amount_v1) THEN
   RAISE EXCEPTION 'Altere o cupom pelo atendimento da venda.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_permission';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;
CREATE FUNCTION public.pdv_guard_coupon_history_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF TG_TABLE_NAME='pdv_order_items' THEN
  IF EXISTS(SELECT 1 FROM public.pdv_coupon_usages u WHERE u.order_id=OLD.order_id)
   AND (NEW.quantity,NEW.unit_price,NEW.discount_amount,NEW.total,NEW.coupon_discount_amount_v1,NEW.order_discount_allocated_v2,NEW.line_discount_amount_v2)
   IS DISTINCT FROM (OLD.quantity,OLD.unit_price,OLD.discount_amount,OLD.total,OLD.coupon_discount_amount_v1,OLD.order_discount_allocated_v2,OLD.line_discount_amount_v2) THEN
   RAISE EXCEPTION 'Os valores da venda concluída são preservados no histórico.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_history_immutable'; END IF;
 ELSIF EXISTS(SELECT 1 FROM public.pdv_coupon_usages u WHERE u.order_id=OLD.id)
  AND (NEW.customer_id,NEW.coupon_id,NEW.coupon_discount_amount_v1,NEW.subtotal,NEW.discount_amount,NEW.total)
  IS DISTINCT FROM (OLD.customer_id,OLD.coupon_id,OLD.coupon_discount_amount_v1,OLD.subtotal,OLD.discount_amount,OLD.total) THEN
  RAISE EXCEPTION 'Os valores da venda concluída são preservados no histórico.' USING ERRCODE='42501',DETAIL='code=pdv_coupon_history_immutable';
 END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER pdv_orders_coupon_write_guard BEFORE INSERT OR UPDATE ON public.pdv_orders FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_coupon_amounts_v1();
CREATE TRIGGER pdv_order_items_coupon_write_guard BEFORE INSERT OR UPDATE ON public.pdv_order_items FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_coupon_amounts_v1();
CREATE TRIGGER pdv_orders_coupon_history_guard BEFORE UPDATE ON public.pdv_orders FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_coupon_history_v1();
CREATE TRIGGER pdv_order_items_coupon_history_guard BEFORE UPDATE ON public.pdv_order_items FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_coupon_history_v1();
REVOKE ALL ON FUNCTION public.pdv_guard_coupon_amounts_v1(),public.pdv_guard_coupon_history_v1() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
