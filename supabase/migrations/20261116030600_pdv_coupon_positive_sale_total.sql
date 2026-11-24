-- O PDV mantém o contrato existente de venda com total estritamente positivo.
-- Um cupom não cria uma via de venda gratuita nem vira crédito/voucher.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $positive_order_total$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_evaluate_coupon_internal_v1(uuid,uuid,uuid,jsonb,uuid)'::regprocedure) INTO s;
 IF position('PDV_COUPON_POSITIVE_ORDER_TOTAL_V1' IN s)>0 THEN RETURN; END IF;
 a:=$a$ IF v_discount<=0 THEN RETURN jsonb_build_object('eligible',false,'reason','zero','message','O cupom não gera desconto para os itens atuais.'); END IF;$a$;
 b:=a||$guard$
 -- PDV_COUPON_POSITIVE_ORDER_TOTAL_V1: compara com TODO o pedido pós-manual,
 -- não só o subtotal participante. 100% de um subconjunto continua possível.
 IF v_discount>=v_total THEN
  RETURN jsonb_build_object('eligible',false,'reason','order_total_zero','message',
   'O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.');
 END IF;$guard$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A avaliação promocional mudou antes da validação de total positivo.'; END IF;
 EXECUTE replace(s,a,b);
END $positive_order_total$;

-- Preview e checkout usam o mesmo reason; não expõem detalhe técnico no erro
-- exibido quando o cupom é revalidado após uma alteração das regras.
DO $domain_error$
DECLARE signature text; s text; a text; b text; result_name text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.pdv_apply_order_coupon_internal_v1(uuid,uuid,bigint)',
  'public.pdv_commit_coupon_internal_v1(uuid,uuid,jsonb,bigint)',
  'public.pdv_preview_preorder_coupon_internal_v1(uuid,uuid,bigint)'
 ] LOOP
  SELECT pg_get_functiondef(signature::regprocedure) INTO s;
  IF position('code=pdv_coupon_order_total_zero' IN s)>0 THEN CONTINUE; END IF;
  result_name:=CASE WHEN signature LIKE '%preview_preorder%' THEN 'v_eval' ELSE 'v_result' END;
  a:='IF ('||result_name||'->>''eligible'')::boolean IS DISTINCT FROM true THEN';
  b:='IF '||result_name||'->>''reason''=''order_total_zero'' THEN'
   ||' RAISE EXCEPTION ''O desconto precisa deixar um valor a receber. Escolha outro cupom ou remova o cupom para continuar.'''
   ||' USING ERRCODE=''22023'',DETAIL=''code=pdv_coupon_order_total_zero''; END IF; '||a;
  IF position(a IN s)=0 THEN RAISE EXCEPTION 'A tradução de erro promocional mudou: %',signature; END IF;
  EXECUTE replace(s,a,b);
 END LOOP;
END $domain_error$;
COMMIT;
