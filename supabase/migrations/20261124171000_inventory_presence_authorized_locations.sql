-- Editar os locais visíveis nunca remove presença de um local restrito.
BEGIN;
CREATE OR REPLACE FUNCTION public.set_inventory_presence(p_inventory_id uuid, p_stock_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
DECLARE v_user uuid := auth.uid(); v_company uuid; v_customer uuid;
  v_scope uuid[]; v_blocked text;
BEGIN
  IF public.inventory_user_can_manage_v3(v_user) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar materiais.' USING ERRCODE = '42501';
  END IF;
  SELECT company_id, customer_id INTO v_company, v_customer FROM public.inventory
    WHERE id = p_inventory_id AND company_id = public.get_user_company_id(v_user) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT COALESCE(array_agg(stock.id), ARRAY[]::uuid[]) INTO v_scope FROM public.stocks stock
    WHERE stock.company_id = v_company AND stock.customer_id IS NOT DISTINCT FROM v_customer
      AND public.can_access_stock(v_user, stock.id) IS TRUE;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_stock_ids, ARRAY[]::uuid[])) requested(id)
    WHERE requested.id IS NULL OR NOT requested.id = ANY(v_scope)) THEN
    RAISE EXCEPTION 'Um dos locais não está disponível para seu usuário.' USING ERRCODE = '42501';
  END IF;
  -- Upsert também trava os pares ainda sem linha, como o writer de movimentos.
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
    SELECT v_company,p_inventory_id,id,0,id=ANY(COALESCE(p_stock_ids,ARRAY[]::uuid[]))
    FROM unnest(v_scope) scoped(id) ORDER BY id
    ON CONFLICT(inventory_id,stock_id) DO UPDATE SET is_present=inventory_stock_levels.is_present;
  SELECT string_agg(stock.name, ', ' ORDER BY stock.name) INTO v_blocked
    FROM public.inventory_stock_levels level JOIN public.stocks stock ON stock.id=level.stock_id
    WHERE level.inventory_id=p_inventory_id AND level.company_id=v_company
      AND level.stock_id=ANY(v_scope) AND level.quantity<>0
      AND NOT level.stock_id=ANY(COALESCE(p_stock_ids,ARRAY[]::uuid[]));
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'presence_has_balance: %',v_blocked USING ERRCODE='23514';
  END IF;
  UPDATE public.inventory_stock_levels SET is_present=stock_id=ANY(COALESCE(p_stock_ids,ARRAY[]::uuid[]))
    WHERE inventory_id=p_inventory_id AND company_id=v_company AND stock_id=ANY(v_scope);
END $fn$;
REVOKE ALL ON FUNCTION public.set_inventory_presence(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_presence(uuid,uuid[]) TO authenticated,service_role;

-- A ação unitária não reenvia snapshots dos demais locais.
CREATE OR REPLACE FUNCTION public.inventory_remove_from_stock_v4(p_inventory_id uuid,p_stock_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_user uuid:=auth.uid(); v_company uuid:=public.get_user_company_id(auth.uid());
BEGIN
  IF public.inventory_user_can_manage_v3(v_user) IS DISTINCT FROM TRUE OR NOT EXISTS (
    SELECT 1 FROM public.inventory item JOIN public.stocks stock ON stock.company_id=item.company_id
      AND stock.customer_id IS NOT DISTINCT FROM item.customer_id
    WHERE item.id=p_inventory_id AND item.company_id=v_company AND stock.id=p_stock_id
      AND public.can_access_stock(v_user,stock.id) IS TRUE
  ) THEN RAISE EXCEPTION 'Material ou local indisponível para seu usuário.' USING ERRCODE='42501'; END IF;
  INSERT INTO public.inventory_stock_levels(company_id,inventory_id,stock_id,quantity,is_present)
    VALUES(v_company,p_inventory_id,p_stock_id,0,false)
    ON CONFLICT(inventory_id,stock_id) DO UPDATE SET is_present=false
      WHERE inventory_stock_levels.quantity=0;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfira ou registre a saída do saldo antes de remover o material deste local.'
      USING ERRCODE='23514',DETAIL='code=inventory_presence_has_balance';
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.inventory_remove_from_stock_v4(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inventory_remove_from_stock_v4(uuid,uuid) TO authenticated;
COMMIT;
