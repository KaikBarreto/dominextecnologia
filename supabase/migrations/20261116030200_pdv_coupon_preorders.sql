BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
ALTER TABLE public.pdv_preorders ADD COLUMN coupon_id uuid,
 ADD COLUMN coupon_discount_amount_v1 numeric(14,2) NOT NULL DEFAULT 0 CHECK(coupon_discount_amount_v1>=0),
 ADD COLUMN coupon_code_v1 text;
ALTER TABLE public.pdv_preorders ADD CONSTRAINT pdv_preorders_coupon_company_fk FOREIGN KEY(company_id,coupon_id) REFERENCES public.pdv_coupons(company_id,id);

CREATE FUNCTION public.pdv_preview_preorder_coupon_internal_v1(p_preorder_id uuid,p_coupon_id uuid,p_expected_discount_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE p public.pdv_preorders; v_items jsonb; v_eval jsonb; v_discount numeric:=0; v_code text;
BEGIN
 SELECT * INTO p FROM public.pdv_preorders WHERE id=p_preorder_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'O orçamento não está disponível.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_order_missing'; END IF;
 IF p_coupon_id IS NOT NULL THEN
  SELECT code INTO v_code FROM public.pdv_coupons WHERE id=p_coupon_id AND company_id=p.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este cupom não está disponível.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_missing'; END IF;
  IF p.total IS NOT NULL THEN
   WITH bases AS (SELECT i.id,i.inventory_id,round((round(i.quantity*i.unit_price,2)-i.discount_amount)*100)::bigint net FROM public.pdv_preorder_items i WHERE i.preorder_id=p.id),
   shares AS (SELECT *,CASE WHEN p.subtotal=0 THEN 0 ELSE p.discount_amount*100*net/(p.subtotal*100) END raw FROM bases),
   ranked AS (SELECT *,floor(raw)::bigint base,row_number() OVER(ORDER BY raw-floor(raw) DESC,id) rank,sum(floor(raw)) OVER() allocated FROM shares)
   SELECT jsonb_agg(jsonb_build_object('id',id,'inventory_id',inventory_id,'net_cents',net-base-CASE WHEN rank<=round(p.discount_amount*100)::bigint-allocated THEN 1 ELSE 0 END) ORDER BY id) INTO v_items FROM ranked;
   v_eval:=public.pdv_evaluate_coupon_internal_v1(p.company_id,p_coupon_id,p.customer_id,v_items,NULL);
   IF (v_eval->>'eligible')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '%',v_eval->>'message' USING ERRCODE='22023',DETAIL='code=pdv_coupon_ineligible'; END IF;
   IF (v_eval->>'discount_cents')::bigint IS DISTINCT FROM p_expected_discount_cents THEN RAISE EXCEPTION 'As regras do cupom mudaram. Atualize o orçamento antes de salvar.' USING ERRCODE='40001',DETAIL='code=pdv_coupon_conflict'; END IF;
   v_discount:=p_expected_discount_cents::numeric/100;
  END IF;
 ELSIF COALESCE(p_expected_discount_cents,0)<>0 THEN RAISE EXCEPTION 'Selecione um cupom válido.' USING ERRCODE='22023',DETAIL='code=pdv_coupon_invalid'; END IF;
 UPDATE public.pdv_preorders SET coupon_id=p_coupon_id,coupon_code_v1=v_code,coupon_discount_amount_v1=v_discount,discount_amount=p.discount_amount+v_discount,total=CASE WHEN p.total IS NULL THEN NULL ELSE p.total-v_discount END WHERE id=p.id;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_preview_preorder_coupon_internal_v1(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;

DO $save_and_value$
DECLARE signature text; s text; a text; b text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.pdv_save_preorder_v2(uuid,bigint,jsonb,jsonb,text)','public.pdv_value_preorder_v2(uuid,bigint,jsonb,jsonb,text)'] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO s;
  a:=$a$'discount_amount',trim_scale(COALESCE(NULLIF(p_header->>'discount_amount','')::numeric,0))
    ),
    'items'$a$;
  b:=$b$'discount_amount',trim_scale(COALESCE(NULLIF(p_header->>'discount_amount','')::numeric,0))
    )||public.pdv_coupon_hash_meta_internal_v1(p_header),
    'items'$b$;
  IF position(a IN s)=0 THEN RAISE EXCEPTION 'O contrato do orçamento mudou antes da integração do cupom.'; END IF; s:=replace(s,a,b);
  a:=$a$  v_result:=jsonb_build_object('preorder_id'$a$;
  b:=$b$  -- PDV_COUPON_PREORDER_V1: validação consultiva não consome utilização.
  PERFORM public.pdv_preview_preorder_coupon_internal_v1(v_pre.id,NULLIF(p_header->>'coupon_id','')::uuid,COALESCE(NULLIF(p_header->>'coupon_discount_cents','')::bigint,0));
  v_result:=jsonb_build_object('preorder_id'$b$;
  IF position(a IN s)=0 THEN
   -- O writer de valorização usa quebra de linha entre := e jsonb_build_object.
   a:=$a$  v_result:=jsonb_build_object($a$;
   b:=$b$  PERFORM public.pdv_preview_preorder_coupon_internal_v1(v_pre.id,NULLIF(p_header->>'coupon_id','')::uuid,COALESCE(NULLIF(p_header->>'coupon_discount_cents','')::bigint,0));
  v_result:=jsonb_build_object($b$;
  END IF;
  IF position(a IN s)=0 THEN RAISE EXCEPTION 'O resultado do orçamento mudou antes da integração do cupom.'; END IF; s:=replace(s,a,b);
  EXECUTE s;
 END LOOP;
END $save_and_value$;
DO $conversion$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_convert_preorder_v2(uuid,bigint,text)'::regprocedure) INTO s;
 a:=$a$  v_order:=gen_random_uuid();$a$;
 b:=$b$  -- O rateio original recebe somente desconto manual; promoção aplica depois.
  v_pre.discount_amount:=v_pre.discount_amount-v_pre.coupon_discount_amount_v1;
  v_pre.total:=v_pre.total+v_pre.coupon_discount_amount_v1;
  v_order:=gen_random_uuid();$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A criação do pedido mudou antes da integração do cupom.'; END IF; s:=replace(s,a,b);
 a:=$a$  UPDATE public.pdv_preorders SET status='convertido'$a$;
 b:=$b$  IF v_pre.coupon_id IS NOT NULL THEN
    PERFORM public.pdv_apply_order_coupon_internal_v1(v_order,v_pre.coupon_id,round(v_pre.coupon_discount_amount_v1*100)::bigint);
  END IF;
  UPDATE public.pdv_preorders SET status='convertido'$b$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A conclusão da conversão mudou antes da integração do cupom.'; END IF; s:=replace(s,a,b);
 EXECUTE s;
END $conversion$;
-- A válvula administrativa existente continua sendo a única entrada de reset.
DO $reset_coupons$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.reset_system_step(uuid,text,uuid)'::regprocedure) INTO s;
 a:=$anchor$v_counts := jsonb_set(v_counts, '{pdv_orders}', to_jsonb(v_n));$anchor$;
 b:=a||chr(10)||'    DELETE FROM public.pdv_coupons WHERE company_id = p_company_id;';
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A limpeza administrativa do PDV mudou antes da integração do cupom.'; END IF;
 EXECUTE replace(s,a,b);
END $reset_coupons$;
COMMIT;
