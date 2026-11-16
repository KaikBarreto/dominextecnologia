-- Mantém o contexto canônico até a custódia ser inserida. Seu BEFORE trigger
-- vincula a sessão ao fato financeiro antes de tornar a custódia visível.
-- Não altera autoridade, cálculo, hash, request ou guard da tesouraria.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
DO $cash_purchase_attachment$
DECLARE definition text; clear_context text; final_anchor text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_registrar_compra_material_direta_v2(uuid,uuid,uuid,uuid,uuid,jsonb,date,uuid,uuid,boolean,date,date,text,text,text)'::regprocedure) INTO definition;
 clear_context:=$clear$  PERFORM set_config('app.pdv_treasury_custody_delta','',true);$clear$;
 final_anchor:=$anchor$  v_result:=v_purchase||jsonb_build_object('cash_session_id',p_cash_session_id,$anchor$;
 IF (length(definition)-length(replace(definition,clear_context,'')))/length(clear_context)<>1
   OR (length(definition)-length(replace(definition,final_anchor,'')))/length(final_anchor)<>1
   OR position(clear_context IN definition)>=position('INSERT INTO public.pdv_cash_custody_entries' IN definition)
   OR position('INSERT INTO public.pdv_cash_custody_entries' IN definition)>=position(final_anchor IN definition)
   OR position('app.pdv_treasury_custody_delta' IN definition)=0 THEN
  RAISE EXCEPTION 'O ciclo da compra no caixa mudou; revise antes de preservar o pareamento da custódia';END IF;
 definition:=replace(definition,clear_context||chr(10),'');
 definition:=replace(definition,final_anchor,clear_context||chr(10)||chr(10)||final_anchor);
 EXECUTE definition;
END $cash_purchase_attachment$;
COMMIT;
