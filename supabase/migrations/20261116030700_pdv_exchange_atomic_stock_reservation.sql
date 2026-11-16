-- A troca garante somente o estoque faltante antes de confirmar as coberturas.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION public.pdv_pair_availability_internal_v1(p_company_id uuid,p_inventory_id uuid,p_stock_id uuid)
RETURNS TABLE(inventory_id uuid,stock_id uuid,physical_quantity numeric,committed_quantity numeric,
 guaranteed_quantity numeric,shortage_quantity numeric,available_quantity numeric,has_conflict boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_physical numeric:=0; v_committed numeric:=0; v_shortage numeric:=0; v_guaranteed numeric:=0;
BEGIN
 SELECT COALESCE(sl.quantity,0) INTO v_physical FROM public.inventory_stock_levels sl
  WHERE sl.company_id=p_company_id AND sl.inventory_id=p_inventory_id AND sl.stock_id=p_stock_id;
 v_physical:=COALESCE(v_physical,0);
 SELECT COALESCE(sum(r.reserved_quantity-r.consumed_quantity-r.released_quantity),0),COALESCE(sum(r.shortage_quantity),0)
 INTO v_committed,v_shortage FROM public.pdv_stock_reservation_items r
 WHERE r.company_id=p_company_id AND r.inventory_id=p_inventory_id AND r.stock_id=p_stock_id AND r.state IN('guaranteed','conflict');
 -- Mesmo cálculo canônico anterior: falta derivada também falha fechado.
 v_shortage:=LEAST(v_committed,GREATEST(v_shortage,v_committed-v_physical,0));
 v_guaranteed:=GREATEST(v_committed-v_shortage,0);
 RETURN QUERY SELECT p_inventory_id,p_stock_id,v_physical,v_committed,v_guaranteed,v_shortage,
  CASE WHEN v_shortage>0 THEN 0::numeric ELSE GREATEST(v_physical-v_guaranteed,0) END,v_shortage>0;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_pair_availability_internal_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- O RPC público conserva integralmente os guards e seus privilégios.
DO $canonical_availability$
DECLARE s text; first_position integer; last_position integer;
BEGIN
 SELECT pg_get_functiondef('public.pdv_get_stock_availability_v2(uuid,uuid)'::regprocedure) INTO s;
 first_position:=position('  SELECT COALESCE(sl.quantity, 0)' IN s);
 last_position:=position('END;' IN substring(s FROM first_position));
 IF first_position=0 OR last_position=0 OR position('v_shortage := LEAST(' IN s)=0
  OR position('v_guaranteed := GREATEST(' IN s)=0 OR position('RETURN QUERY SELECT' IN s)=0 THEN
  RAISE EXCEPTION 'O cálculo canônico de disponibilidade mudou'; END IF;
 s:=left(s,first_position-1)||'  RETURN QUERY SELECT * FROM public.pdv_pair_availability_internal_v1(v_company_id,p_inventory_id,p_stock_id);'||chr(10)||substring(s FROM first_position+last_position-1);
 EXECUTE s;
END $canonical_availability$;

CREATE FUNCTION public.pdv_exchange_order_stock_available_internal_v1(p_company_id uuid,p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o public.pdv_orders; pair record; availability record;
BEGIN
 SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id AND company_id=p_company_id;
 IF NOT FOUND OR o.contract_version IS DISTINCT FROM 2 OR o.operation_mode_snapshot IS DISTINCT FROM 'counter'
  OR o.status IS DISTINCT FROM 'aguardando_pagamento'
  OR public.pdv_order_actor_can_access_v2(o.id,auth.uid()) IS DISTINCT FROM TRUE
  OR public.pdv_has_stock_access_scope_v2(auth.uid(),p_company_id,p_order_id=>o.id) IS DISTINCT FROM TRUE THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.pdv_order_items i WHERE i.order_id=o.id AND
  (i.contract_version IS DISTINCT FROM 2 OR i.item_type IS NULL OR i.quantity<=0
   OR lower(i.quantity::text) IN('nan','infinity','-infinity') OR (i.item_type='material' AND i.inventory_id IS NULL))) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items r JOIN public.pdv_order_items i ON i.id=r.order_item_id
  WHERE i.order_id=o.id AND r.state IN('guaranteed','conflict') AND (r.company_id<>p_company_id OR r.stock_id IS DISTINCT FROM o.stock_id OR r.state='conflict')) THEN RETURN false; END IF;
 FOR pair IN
  SELECT i.inventory_id,sum(GREATEST(i.quantity-COALESCE((SELECT sum(r.reserved_quantity-r.consumed_quantity-r.released_quantity-r.shortage_quantity)
    FROM public.pdv_stock_reservation_items r WHERE r.company_id=p_company_id AND r.order_item_id=i.id AND r.stock_id=o.stock_id AND r.state='guaranteed'),0),0)) missing
  FROM public.pdv_order_items i WHERE i.order_id=o.id AND i.item_type='material' GROUP BY i.inventory_id ORDER BY i.inventory_id
 LOOP
  IF NOT EXISTS(SELECT 1 FROM public.inventory i WHERE i.id=pair.inventory_id AND i.company_id=p_company_id AND i.customer_id IS NULL AND i.archived_at IS NULL)
   OR NOT EXISTS(SELECT 1 FROM public.stocks st WHERE st.id=o.stock_id AND st.company_id=p_company_id AND st.customer_id IS NULL) THEN RETURN false; END IF;
  SELECT * INTO availability FROM public.pdv_pair_availability_internal_v1(p_company_id,pair.inventory_id,o.stock_id);
  IF availability.has_conflict OR availability.available_quantity<pair.missing THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_exchange_order_stock_available_internal_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_ensure_exchange_order_stock_internal_v1(p_company_id uuid,p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE o public.pdv_orders; ctx record; item public.pdv_order_items; reservation public.pdv_stock_reservation_items;
 missing numeric; availability record;
BEGIN
 SELECT * INTO o FROM public.pdv_orders WHERE id=p_order_id AND company_id=p_company_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'O pedido não está disponível para troca.' USING ERRCODE='42501',DETAIL='code=pdv_exchange_order_invalid'; END IF;
 PERFORM i.id FROM public.pdv_order_items i WHERE i.order_id=o.id ORDER BY i.id FOR UPDATE OF i;
 PERFORM i.id FROM public.inventory i WHERE i.company_id=p_company_id AND EXISTS(SELECT 1 FROM public.pdv_order_items line WHERE line.order_id=o.id AND line.item_type='material' AND line.inventory_id=i.id) ORDER BY i.id FOR UPDATE OF i;
 PERFORM st.id FROM public.stocks st WHERE st.id=o.stock_id AND st.company_id=p_company_id FOR UPDATE OF st;
 INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity)
  SELECT DISTINCT p_company_id,i.inventory_id,o.stock_id,0 FROM public.pdv_order_items i WHERE i.order_id=o.id AND i.item_type='material' AND i.inventory_id IS NOT NULL
  ON CONFLICT(inventory_id,stock_id) DO NOTHING;
 PERFORM level.id FROM public.inventory_stock_levels level WHERE level.company_id=p_company_id AND level.stock_id=o.stock_id
  AND EXISTS(SELECT 1 FROM public.pdv_order_items i WHERE i.order_id=o.id AND i.item_type='material' AND i.inventory_id=level.inventory_id)
  ORDER BY level.inventory_id,level.stock_id FOR UPDATE OF level;
 PERFORM r.id FROM public.pdv_stock_reservation_items r WHERE r.company_id=p_company_id AND r.stock_id=o.stock_id AND r.state IN('guaranteed','conflict')
  AND EXISTS(SELECT 1 FROM public.pdv_order_items i WHERE i.order_id=o.id AND i.item_type='material' AND i.inventory_id=r.inventory_id)
  ORDER BY r.inventory_id,r.stock_id,r.id FOR UPDATE OF r;
 -- Revalida a autoridade depois de esperar pelos mutexes do estoque.
 SELECT * INTO ctx FROM public.pdv_after_sale_context_v2('fn:cover_pdv_exchange');
 IF ctx.company_id IS DISTINCT FROM p_company_id THEN RAISE EXCEPTION 'O pedido não está disponível para troca.' USING ERRCODE='42501'; END IF;
 PERFORM public.pdv_assert_order_cash_access_v2(o.id,ctx.user_id);
 IF public.pdv_has_stock_access_scope_v2(ctx.user_id,p_company_id,p_order_id=>o.id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Seu perfil não permite reservar os materiais deste pedido.' USING ERRCODE='42501',DETAIL='code=pdv_after_sale_stock_denied'; END IF;
 IF public.pdv_exchange_order_stock_available_internal_v1(p_company_id,o.id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'O estoque disponível mudou. Confira os materiais do pedido antes de concluir a troca.' USING ERRCODE='23514',DETAIL='code=pdv_exchange_stock_insufficient'; END IF;
 FOR item IN SELECT i.* FROM public.pdv_order_items i WHERE i.order_id=o.id AND i.item_type='material' ORDER BY i.inventory_id,i.id LOOP
  reservation:=NULL;
  SELECT r.* INTO reservation FROM public.pdv_stock_reservation_items r WHERE r.company_id=p_company_id AND r.order_item_id=item.id AND r.stock_id=o.stock_id AND r.state IN('guaranteed','conflict') FOR UPDATE;
  missing:=item.quantity-COALESCE(reservation.reserved_quantity-reservation.consumed_quantity-reservation.released_quantity-reservation.shortage_quantity,0);
  IF missing>0 THEN
   IF reservation.id IS NULL THEN
    PERFORM public.pdv_reserve_stock_internal_v2(p_company_id,item.inventory_id,o.stock_id,item.id,NULL,missing,'coverage',NULL,1);
   ELSE
    -- Preserva identidade, custo e origem da reserva parcial.
    SELECT * INTO availability FROM public.pdv_pair_availability_internal_v1(p_company_id,item.inventory_id,o.stock_id);
    IF availability.has_conflict OR availability.available_quantity<missing THEN
     RAISE EXCEPTION 'O estoque disponível mudou. Confira os materiais do pedido antes de concluir a troca.' USING ERRCODE='23514',DETAIL='code=pdv_exchange_stock_insufficient'; END IF;
    UPDATE public.pdv_stock_reservation_items SET reserved_quantity=reserved_quantity+missing WHERE id=reservation.id;
   END IF;
  END IF;
 END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_ensure_exchange_order_stock_internal_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $exchange_reservation$
DECLARE s text; a text; b text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_cover_exchange_order_coupon_base_v1(uuid,uuid,uuid,numeric,numeric,text,uuid,uuid,text,integer)'::regprocedure) INTO s;
 a:=$anchor$  PERFORM public.pdv_consume_order_coupon_internal_v1(v_order.id);
  IF EXISTS(SELECT 1 FROM public.pdv_order_items item WHERE item.order_id=v_order.id AND item.inventory_id IS NOT NULL
    AND COALESCE((SELECT sum(reservation.reserved_quantity-reservation.consumed_quantity-reservation.released_quantity)
      FROM public.pdv_stock_reservation_items reservation WHERE reservation.order_item_id=item.id
        AND reservation.state='guaranteed'),0)<item.quantity) THEN
    RAISE EXCEPTION 'O novo pedido precisa estar integralmente reservado antes da troca.'
      USING ERRCODE='23514',DETAIL='code=pdv_exchange_reservation_missing'; END IF;$anchor$;
 b:=$patch$  -- PDV_EXCHANGE_ATOMIC_RESERVATION_V1: estoque → cupom → cobertura.
  PERFORM public.pdv_ensure_exchange_order_stock_internal_v1(v_context.company_id,v_order.id);
  PERFORM public.pdv_consume_order_coupon_internal_v1(v_order.id);$patch$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A garantia da troca mudou'; END IF;
 EXECUTE replace(s,a,b);
END $exchange_reservation$;
DO $exchange_candidates$
DECLARE s text; a text; b text; cut integer; tail text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_get_after_sale_workspace_core_015_v2(uuid)'::regprocedure) INTO s;
 a:=$anchor$(v_exchange AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment$anchor$;
 b:=$patch$(v_exchange AND public.pdv_exchange_order_stock_available_internal_v1(v_context.company_id,candidate.id) AND NOT EXISTS(SELECT 1 FROM public.pdv_order_payments payment$patch$;
 IF position(a IN s)=0 THEN RAISE EXCEPTION 'A elegibilidade da troca mudou'; END IF; s:=replace(s,a,b);
 cut:=position('''exchange_candidates'',CASE' IN s);
 IF cut=0 THEN RAISE EXCEPTION 'A lista de trocas mudou'; END IF;
 tail:=substring(s FROM cut);
 a:=$anchor$AND candidate.status='aguardando_pagamento'$anchor$;
 b:=$patch$AND candidate.status='aguardando_pagamento' AND public.pdv_exchange_order_stock_available_internal_v1(v_context.company_id,candidate.id)$patch$;
 IF position(a IN tail)=0 THEN RAISE EXCEPTION 'O filtro de trocas mudou'; END IF;
 s:=left(s,cut-1)||replace(tail,a,b); EXECUTE s;
END $exchange_candidates$;
COMMIT;
