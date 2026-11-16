-- Padrão da Loja separado do principal operacional/OS. stock_id do terminal
-- continua sendo o vínculo efetivo persistido de venda, compra e rascunho.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
ALTER TABLE public.company_settings ADD COLUMN pdv_default_stock_id uuid REFERENCES public.stocks(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.company_settings ADD COLUMN pdv_stock_settings_revision bigint NOT NULL DEFAULT 0 CHECK(pdv_stock_settings_revision>=0);
ALTER TABLE public.pdv_terminals ADD COLUMN stock_binding_mode text NOT NULL DEFAULT 'specific' CHECK(stock_binding_mode IN('specific','store_default'));
COMMENT ON COLUMN public.pdv_terminals.stock_binding_mode IS 'specific preserva o local explícito; store_default segue o padrão da Loja somente em mudança autorizada sem operação pendente. stock_id é sempre efetivo/persistido.';

CREATE FUNCTION public.pdv_can_manage_stock_v3(p_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.is_super_admin(auth.uid()) OR (
  auth.uid() IS NOT NULL AND p_company_id=public.get_user_company_id(auth.uid())
  AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=auth.uid() AND p.company_id=p_company_id AND p.is_active IS TRUE)
  AND public.pdv_company_access_entitled_internal(p_company_id) IS TRUE
  AND (public.company_has_module(p_company_id,'basic') IS TRUE OR public.company_has_module(p_company_id,'pdv') IS TRUE)
  AND (public.is_admin_or_gestor(auth.uid()) OR EXISTS(SELECT 1 FROM public.user_permissions p WHERE p.user_id=auth.uid() AND p.is_active IS TRUE AND (p.permissions ? '*' OR p.permissions ? 'fn:manage_inventory'))));
$fn$;
REVOKE ALL ON FUNCTION public.pdv_can_manage_stock_v3(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_can_manage_stock_v3(uuid) TO authenticated,service_role;

CREATE FUNCTION public.pdv_assert_store_stock_manager_internal_v1(p_actor_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT(public.is_admin_or_gestor(p_actor_id) OR public.is_super_admin(p_actor_id) OR public.pdv_has_explicit_action_permission_v2(p_actor_id,'fn:manage_pdv_settings')) THEN
  RAISE EXCEPTION 'Seu perfil não permite configurar o estoque da loja.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_management_denied';END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_store_stock_manager_internal_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_assert_terminal_stock_idle_internal_v1(p_company_id uuid,p_terminal_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM public.pdv_cash_sessions s WHERE s.company_id=p_company_id AND s.terminal_id=p_terminal_id AND s.status='aberta')
 OR EXISTS(SELECT 1 FROM public.pdv_preorders p WHERE p.company_id=p_company_id AND p.target_terminal_id=p_terminal_id AND p.status IN('edicao','encaminhado'))
 OR EXISTS(SELECT 1 FROM public.pdv_orders o WHERE o.company_id=p_company_id AND (o.terminal_id=p_terminal_id OR o.target_terminal_id=p_terminal_id) AND o.status::text IN('aguardando_pagamento','liberado_retirada','retirada_parcial'))
 OR EXISTS(SELECT 1 FROM public.pdv_order_drafts d WHERE d.company_id=p_company_id AND d.terminal_id=p_terminal_id AND d.deleted_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items r JOIN public.pdv_order_items i ON i.id=r.order_item_id JOIN public.pdv_orders o ON o.id=i.order_id AND o.company_id=r.company_id WHERE r.company_id=p_company_id AND (o.terminal_id=p_terminal_id OR o.target_terminal_id=p_terminal_id) AND r.state IN('guaranteed','conflict'))
 OR EXISTS(SELECT 1 FROM public.pdv_stock_reservation_items r JOIN public.pdv_preorder_items i ON i.id=r.preorder_item_id JOIN public.pdv_preorders p ON p.id=i.preorder_id AND p.company_id=r.company_id WHERE r.company_id=p_company_id AND p.target_terminal_id=p_terminal_id AND r.state IN('guaranteed','conflict')) THEN
  RAISE EXCEPTION 'Feche o caixa e conclua ou desvincule os pedidos e rascunhos deste caixa antes de mudar o estoque.' USING ERRCODE='23514',DETAIL='code=pdv_store_stock_busy';
 END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_assert_terminal_stock_idle_internal_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_store_stock_projection_internal_v1(p_company_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT jsonb_build_object('stock_id',CASE WHEN public.can_access_stock(auth.uid(),s.pdv_default_stock_id) IS TRUE THEN s.pdv_default_stock_id ELSE NULL END,
  'default_unavailable',s.pdv_default_stock_id IS NOT NULL AND public.can_access_stock(auth.uid(),s.pdv_default_stock_id) IS DISTINCT FROM TRUE,'revision',s.pdv_stock_settings_revision,
  'can_manage',public.is_admin_or_gestor(auth.uid()) OR public.is_super_admin(auth.uid()) OR public.pdv_has_explicit_action_permission_v2(auth.uid(),'fn:manage_pdv_settings'),
  'can_create_stock',(public.is_admin_or_gestor(auth.uid()) OR public.is_super_admin(auth.uid()) OR public.pdv_has_explicit_action_permission_v2(auth.uid(),'fn:manage_pdv_settings')) AND public.pdv_can_manage_stock_v3(p_company_id),
  'stocks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',st.id,'name',st.name,'purpose',st.purpose,'is_default',st.is_default) ORDER BY st.sort_order,st.name,st.id) FROM public.stocks st WHERE st.company_id=p_company_id AND st.customer_id IS NULL AND public.can_access_stock(auth.uid(),st.id) IS TRUE),'[]'::jsonb))
 FROM public.company_settings s WHERE s.company_id=p_company_id;
$fn$;
REVOKE ALL ON FUNCTION public.pdv_store_stock_projection_internal_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- A mesma trava da abertura é adquirida antes dos locks de configuração.
CREATE FUNCTION public.pdv_lock_stock_settings_internal_v1(p_company_id uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT pg_advisory_xact_lock(pg_catalog.hashtextextended('pdv-treasury-company:'||p_company_id::text,0));
$fn$;
REVOKE ALL ON FUNCTION public.pdv_lock_stock_settings_internal_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.pdv_guard_store_default_stock_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t record; ctx record;
BEGIN
 IF TG_OP='UPDATE' AND NEW.pdv_default_stock_id IS NOT DISTINCT FROM OLD.pdv_default_stock_id THEN
  NEW.pdv_stock_settings_revision:=OLD.pdv_stock_settings_revision;RETURN NEW;END IF;
 IF TG_OP='INSERT' AND NEW.pdv_default_stock_id IS NULL THEN NEW.pdv_stock_settings_revision:=0;RETURN NEW;END IF;
 IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
  SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv_settings','fn:manage_pdv_settings',false);
  PERFORM public.pdv_assert_store_stock_manager_internal_v1(ctx.user_id);
  IF ctx.company_id IS DISTINCT FROM NEW.company_id THEN RAISE EXCEPTION 'O estoque não está disponível para sua empresa.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
 ELSIF auth.role() IS DISTINCT FROM 'service_role' AND session_user NOT IN('postgres','supabase_admin') THEN
  RAISE EXCEPTION 'Seu perfil não permite configurar o estoque da loja.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';
 END IF;
 PERFORM public.pdv_lock_stock_settings_internal_v1(NEW.company_id);
 IF NEW.pdv_default_stock_id IS NULL THEN RAISE EXCEPTION 'Escolha o estoque padrão da loja antes de salvar.' USING ERRCODE='23514',DETAIL='code=pdv_store_stock_required';END IF;
 IF public.pdv_company_access_entitled_internal(NEW.company_id) IS DISTINCT FROM TRUE OR public.company_has_module(NEW.company_id,'pdv') IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'O módulo ou a assinatura não permite configurar a loja.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
 PERFORM st.id FROM public.stocks st WHERE st.id=NEW.pdv_default_stock_id AND st.company_id=NEW.company_id AND st.customer_id IS NULL FOR UPDATE;
 IF NOT FOUND OR (auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) AND public.can_access_stock(auth.uid(),NEW.pdv_default_stock_id) IS DISTINCT FROM TRUE) THEN RAISE EXCEPTION 'Escolha um local geral disponível na sua empresa.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
 FOR t IN SELECT id,stock_id FROM public.pdv_terminals WHERE company_id=NEW.company_id AND stock_binding_mode='store_default' ORDER BY id FOR UPDATE LOOP
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) AND t.stock_id IS NOT NULL AND public.can_access_stock(auth.uid(),t.stock_id) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Seu perfil não permite alterar todos os caixas vinculados a este padrão.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
  PERFORM public.pdv_assert_terminal_stock_idle_internal_v1(NEW.company_id,t.id);
 END LOOP;
 UPDATE public.stocks SET purpose='pdv' WHERE id=NEW.pdv_default_stock_id AND company_id=NEW.company_id AND purpose IS DISTINCT FROM 'pdv';
 NEW.pdv_stock_settings_revision:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.pdv_stock_settings_revision+1 END;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_guard_store_default_stock_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tg_pdv_store_default_stock_v1 BEFORE INSERT OR UPDATE OF pdv_default_stock_id,pdv_stock_settings_revision ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_store_default_stock_v1();

CREATE FUNCTION public.pdv_sync_inherited_terminal_stock_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NEW.pdv_default_stock_id IS DISTINCT FROM OLD.pdv_default_stock_id THEN
  UPDATE public.pdv_terminals SET stock_id=NEW.pdv_default_stock_id WHERE company_id=NEW.company_id AND stock_binding_mode='store_default' AND stock_id IS DISTINCT FROM NEW.pdv_default_stock_id;
 END IF;RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_sync_inherited_terminal_stock_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tg_pdv_sync_inherited_terminal_stock_v1 AFTER UPDATE OF pdv_default_stock_id ON public.company_settings FOR EACH ROW EXECUTE FUNCTION public.pdv_sync_inherited_terminal_stock_v1();

CREATE FUNCTION public.pdv_guard_terminal_stock_binding_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE store_stock uuid;
BEGIN
 PERFORM public.pdv_lock_stock_settings_internal_v1(NEW.company_id);
 IF NEW.stock_binding_mode='store_default' THEN
  SELECT pdv_default_stock_id INTO store_stock FROM public.company_settings WHERE company_id=NEW.company_id;
  IF store_stock IS NULL THEN RAISE EXCEPTION 'Defina o estoque padrão da loja antes de criar este caixa.' USING ERRCODE='23514',DETAIL='code=pdv_store_stock_required';END IF;
  NEW.stock_id:=store_stock;
 END IF;
 IF NEW.stock_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.stocks s WHERE s.id=NEW.stock_id AND s.company_id=NEW.company_id AND s.customer_id IS NULL) THEN RAISE EXCEPTION 'Escolha um local geral da mesma empresa.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
 IF TG_OP='UPDATE' AND (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.stock_id IS DISTINCT FROM OLD.stock_id OR NEW.stock_binding_mode IS DISTINCT FROM OLD.stock_binding_mode OR (OLD.is_active IS TRUE AND NEW.is_active IS FALSE)) THEN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'O caixa não pode mudar de empresa.' USING ERRCODE='42501';END IF;
  PERFORM public.pdv_assert_terminal_stock_idle_internal_v1(OLD.company_id,OLD.id);
 END IF;
 UPDATE public.stocks SET purpose='pdv' WHERE id=NEW.stock_id AND company_id=NEW.company_id AND purpose IS DISTINCT FROM 'pdv';
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_guard_terminal_stock_binding_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tg_pdv_a_terminal_stock_binding_v1 BEFORE INSERT OR UPDATE OF stock_id,stock_binding_mode,is_active,company_id ON public.pdv_terminals FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_terminal_stock_binding_v1();

CREATE FUNCTION public.pdv_set_store_stock_v1(p_stock_id uuid,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; revision bigint;
BEGIN
 SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv_settings','fn:manage_pdv_settings',false);
  PERFORM public.pdv_assert_store_stock_manager_internal_v1(ctx.user_id);
 PERFORM public.pdv_lock_stock_settings_internal_v1(ctx.company_id);
 SELECT pdv_stock_settings_revision INTO revision FROM public.company_settings WHERE company_id=ctx.company_id FOR UPDATE;
 IF NOT FOUND OR p_expected_revision IS DISTINCT FROM revision THEN RAISE EXCEPTION 'A configuração mudou. Atualize antes de salvar novamente.' USING ERRCODE='40001',DETAIL='code=pdv_store_stock_conflict';END IF;
 IF p_stock_id IS NULL THEN RAISE EXCEPTION 'Escolha o estoque padrão da loja.' USING ERRCODE='23514',DETAIL='code=pdv_store_stock_required';END IF;
 UPDATE public.company_settings SET pdv_default_stock_id=p_stock_id WHERE company_id=ctx.company_id;
 RETURN public.pdv_store_stock_projection_internal_v1(ctx.company_id);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_set_store_stock_v1(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_set_store_stock_v1(uuid,bigint) TO authenticated,service_role;

CREATE FUNCTION public.pdv_create_store_stock_v1(p_name text,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; revision bigint; stock_id uuid;
BEGIN
 SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv_settings','fn:manage_pdv_settings',false);
  PERFORM public.pdv_assert_store_stock_manager_internal_v1(ctx.user_id);
 IF public.pdv_can_manage_stock_v3(ctx.company_id) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Seu perfil não permite criar locais de estoque.' USING ERRCODE='42501',DETAIL='code=pdv_stock_management_denied';END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Informe um nome entre 2 e 80 caracteres para o local.' USING ERRCODE='22023',DETAIL='code=pdv_store_stock_name_invalid';END IF;
 PERFORM public.pdv_lock_stock_settings_internal_v1(ctx.company_id);
 SELECT pdv_stock_settings_revision INTO revision FROM public.company_settings WHERE company_id=ctx.company_id FOR UPDATE;
 IF NOT FOUND OR p_expected_revision IS DISTINCT FROM revision THEN RAISE EXCEPTION 'A configuração mudou. Atualize antes de salvar novamente.' USING ERRCODE='40001',DETAIL='code=pdv_store_stock_conflict';END IF;
 INSERT INTO public.stocks(company_id,name,purpose,is_default) VALUES(ctx.company_id,btrim(p_name),'pdv',false) RETURNING id INTO stock_id;
 UPDATE public.company_settings SET pdv_default_stock_id=stock_id WHERE company_id=ctx.company_id;
 RETURN public.pdv_store_stock_projection_internal_v1(ctx.company_id);
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_create_store_stock_v1(text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_create_store_stock_v1(text,bigint) TO authenticated,service_role;

-- Mantém uma única regra de cadastro; a assinatura anterior representa sempre
-- escolha explícita e continua compatível com clientes antigos.
ALTER FUNCTION public.pdv_save_cash_terminal_v2(uuid,text,uuid,boolean,integer) RENAME TO pdv_save_cash_terminal_base_016_v2;
REVOKE ALL ON FUNCTION public.pdv_save_cash_terminal_base_016_v2(uuid,text,uuid,boolean,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.pdv_save_cash_terminal_v3(p_terminal_id uuid,p_name text,p_stock_id uuid,p_is_active boolean,p_sort_order integer,p_stock_binding_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record; effective_stock uuid; current_terminal public.pdv_terminals; saved jsonb;
BEGIN
 SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv_settings','fn:manage_pdv_settings',false);
  PERFORM public.pdv_assert_store_stock_manager_internal_v1(ctx.user_id);
 IF p_stock_binding_mode IS NULL OR p_stock_binding_mode NOT IN('specific','store_default') THEN RAISE EXCEPTION 'Escolha como este caixa usa o estoque da loja.' USING ERRCODE='22023',DETAIL='code=pdv_terminal_binding_invalid';END IF;
 PERFORM public.pdv_lock_stock_settings_internal_v1(ctx.company_id);
 SELECT pdv_default_stock_id INTO effective_stock FROM public.company_settings WHERE company_id=ctx.company_id FOR UPDATE;
 IF p_stock_binding_mode='specific' THEN effective_stock:=p_stock_id;END IF;
 IF effective_stock IS NULL THEN RAISE EXCEPTION 'Escolha o estoque padrão da loja antes de cadastrar este caixa.' USING ERRCODE='23514',DETAIL='code=pdv_store_stock_required';END IF;
 PERFORM s.id FROM public.stocks s WHERE s.id=effective_stock AND s.company_id=ctx.company_id AND s.customer_id IS NULL AND public.can_access_stock(ctx.user_id,s.id) IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Escolha um local geral disponível para seu perfil.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
 IF p_terminal_id IS NOT NULL THEN
  SELECT * INTO current_terminal FROM public.pdv_terminals WHERE id=p_terminal_id AND company_id=ctx.company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O caixa não está disponível nesta empresa.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
  IF current_terminal.stock_id IS NOT NULL AND public.can_access_stock(ctx.user_id,current_terminal.stock_id) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'O caixa não está disponível para seu perfil.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
  IF current_terminal.stock_id IS DISTINCT FROM effective_stock OR current_terminal.stock_binding_mode IS DISTINCT FROM p_stock_binding_mode OR (current_terminal.is_active IS TRUE AND p_is_active IS FALSE) THEN PERFORM public.pdv_assert_terminal_stock_idle_internal_v1(ctx.company_id,p_terminal_id);END IF;
 END IF;
 saved:=public.pdv_save_cash_terminal_base_016_v2(p_terminal_id,p_name,effective_stock,p_is_active,p_sort_order);
 UPDATE public.pdv_terminals SET stock_id=effective_stock,stock_binding_mode=p_stock_binding_mode WHERE id=(saved->>'id')::uuid AND company_id=ctx.company_id RETURNING jsonb_build_object('id',id,'name',name,'stock_id',stock_id,'is_active',is_active,'sort_order',sort_order,'stock_binding_mode',stock_binding_mode) INTO saved;
 RETURN saved;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_save_cash_terminal_v3(uuid,text,uuid,boolean,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_save_cash_terminal_v3(uuid,text,uuid,boolean,integer,text) TO authenticated,service_role;
CREATE FUNCTION public.pdv_save_cash_terminal_v2(p_terminal_id uuid,p_name text,p_stock_id uuid,p_is_active boolean,p_sort_order integer) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.pdv_save_cash_terminal_v3(p_terminal_id,p_name,p_stock_id,p_is_active,p_sort_order,'specific');
$fn$;
REVOKE ALL ON FUNCTION public.pdv_save_cash_terminal_v2(uuid,text,uuid,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pdv_save_cash_terminal_v2(uuid,text,uuid,boolean,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.pdv_list_cash_terminal_settings_v2() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE ctx record;
BEGIN
 SELECT * INTO ctx FROM public.pdv_counter_context_v2('screen:pdv_settings',NULL,false);
 RETURN jsonb_build_object('terminals',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'stock_id',t.stock_id,'is_active',t.is_active,'sort_order',t.sort_order,'stock_binding_mode',t.stock_binding_mode) ORDER BY t.sort_order,t.name,t.id) FROM public.pdv_terminals t WHERE t.company_id=ctx.company_id AND (t.stock_id IS NULL OR public.can_access_stock(ctx.user_id,t.stock_id) IS TRUE)),'[]'::jsonb),
 'stocks',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'purpose',s.purpose,'is_default',s.is_default) ORDER BY s.is_default DESC,s.sort_order,s.name,s.id) FROM public.stocks s WHERE s.company_id=ctx.company_id AND s.customer_id IS NULL AND public.can_access_stock(ctx.user_id,s.id) IS TRUE),'[]'::jsonb),
 'store_stock',public.pdv_store_stock_projection_internal_v1(ctx.company_id));
END $fn$;

-- Compartilha o mutex com a abertura e com novos vínculos de orçamento/draft.
-- Uma tentativa que esperou uma mudança de padrão precisa validar o local
-- persistido atual do terminal, nunca remapear seu payload antigo.
CREATE FUNCTION public.pdv_guard_open_session_stock_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 PERFORM public.pdv_lock_stock_settings_internal_v1(NEW.company_id);
 IF NOT EXISTS(SELECT 1 FROM public.pdv_terminals t JOIN public.stocks s ON s.id=t.stock_id AND s.company_id=t.company_id WHERE t.id=NEW.terminal_id AND t.company_id=NEW.company_id AND t.is_active IS TRUE AND s.customer_id IS NULL
  AND (auth.uid() IS NULL OR public.is_super_admin(auth.uid()) OR public.can_access_stock(auth.uid(),s.id) IS TRUE)) THEN
  RAISE EXCEPTION 'O caixa ou seu estoque mudou. Atualize antes de abrir.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_guard_open_session_stock_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tg_pdv_open_session_stock_v1 BEFORE INSERT ON public.pdv_cash_sessions FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_open_session_stock_v1();

CREATE FUNCTION public.pdv_guard_stock_bound_work_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE terminal uuid; stock uuid; company uuid;
BEGIN
 company:=NEW.company_id;
 IF TG_TABLE_NAME='pdv_order_drafts' THEN terminal:=NEW.terminal_id;stock:=NEW.stock_id;
 ELSE terminal:=NEW.target_terminal_id;stock:=NEW.stock_id;END IF;
 IF terminal IS NULL THEN RETURN NEW;END IF;
 PERFORM public.pdv_lock_stock_settings_internal_v1(company);
 IF TG_TABLE_NAME='pdv_preorders' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.status IN('cancelado','convertido') AND NEW.target_terminal_id IS NOT DISTINCT FROM OLD.target_terminal_id
     AND NEW.stock_id IS NOT DISTINCT FROM OLD.stock_id THEN RETURN NEW;END IF;
  END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pdv_terminals t WHERE t.id=terminal AND t.company_id=company AND t.stock_id=stock AND t.is_active IS TRUE) THEN
  RAISE EXCEPTION 'O estoque deste caixa mudou. Atualize o vínculo antes de continuar.' USING ERRCODE='42501',DETAIL='code=pdv_store_stock_invalid';END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.pdv_guard_stock_bound_work_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tg_pdv_preorder_stock_bound_v1 BEFORE INSERT OR UPDATE OF target_terminal_id,stock_id,status ON public.pdv_preorders FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_stock_bound_work_v1();
CREATE TRIGGER tg_pdv_draft_stock_bound_v1 BEFORE INSERT OR UPDATE OF terminal_id,stock_id ON public.pdv_order_drafts FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_stock_bound_work_v1();

DO $bootstrap_store_default$
DECLARE definition text; anchor text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_bootstrap_company(uuid)'::regprocedure) INTO definition;
 anchor:=$anchor$  -- Nunca associa o PDV a estoque segregado de cliente. Primeiro usa o geral
  -- principal; em base legada sem principal, promove um geral existente. Se
  -- nao houver estoque geral, nao inventa local nem cria terminal invalido: a
  -- UI orienta o responsavel a cadastrar o primeiro local e repetir o setup.
  SELECT stock.id
    INTO v_stock_id
    FROM public.stocks stock
   WHERE stock.company_id = p_company_id
     AND stock.customer_id IS NULL
     AND stock.is_default
   ORDER BY stock.sort_order, stock.created_at, stock.id
   LIMIT 1;

  IF v_stock_id IS NULL THEN
    SELECT stock.id
      INTO v_stock_id
      FROM public.stocks stock
     WHERE stock.company_id = p_company_id
       AND stock.customer_id IS NULL
     ORDER BY stock.sort_order, stock.created_at, stock.id
     LIMIT 1;

    IF v_stock_id IS NOT NULL THEN
      UPDATE public.stocks
         SET is_default = true
       WHERE id = v_stock_id
         AND is_default IS DISTINCT FROM true;
      v_stock_promoted := true;
    END IF;
  END IF;

$anchor$;
 replacement:=$replacement$  -- Padrão da Loja é independente do principal operacional/OS.
  SELECT settings.pdv_default_stock_id INTO v_stock_id FROM public.company_settings settings WHERE settings.company_id=p_company_id;
  IF v_stock_id IS NULL THEN
    -- Relação já escolhida de forma unívoca por caixas ativos: metadado apenas.
    SELECT CASE WHEN count(DISTINCT stock.id)=1 THEN min(stock.id::text)::uuid END INTO v_stock_id
      FROM public.pdv_terminals terminal JOIN public.stocks stock ON stock.id=terminal.stock_id AND stock.company_id=terminal.company_id
     WHERE terminal.company_id=p_company_id AND terminal.is_active IS TRUE AND stock.customer_id IS NULL;
    IF v_stock_id IS NULL THEN
      SELECT count(*),CASE WHEN count(*)=1 THEN min(stock.id::text)::uuid END INTO v_general_count,v_stock_id
        FROM public.stocks stock WHERE stock.company_id=p_company_id AND stock.customer_id IS NULL;
      IF v_general_count=0 THEN
        INSERT INTO public.stocks(company_id,name,purpose,is_default,sort_order)
        VALUES(p_company_id,'Estoque da loja','pdv',true,0) RETURNING id INTO v_stock_id;
      END IF;
    END IF;
    IF v_stock_id IS NOT NULL THEN
      UPDATE public.company_settings SET pdv_default_stock_id=v_stock_id WHERE company_id=p_company_id;
    ELSIF EXISTS(SELECT 1 FROM public.pdv_terminals terminal JOIN public.stocks stock ON stock.id=terminal.stock_id AND stock.company_id=terminal.company_id
      WHERE terminal.company_id=p_company_id AND terminal.is_active IS TRUE AND stock.customer_id IS NULL) THEN
      RETURN jsonb_build_object('configured',true,'cash_account_created',v_account_created,'cash_account_deferred',v_cash_account_deferred,
        'needs_cash_close',false,'terminal_created',false,'terminals_repaired',0,'needs_stock',false,'needs_store_stock_choice',true);
    END IF;
  END IF;

$replacement$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 OR position('PDV_BOOTSTRAP_RETAIL_STOCK_V1' IN definition)=0 THEN RAISE EXCEPTION 'O bootstrap da loja mudou; revise antes de separar o padrão';END IF;definition:=replace(definition,anchor,replacement);
 anchor:='  v_terminals_repaired integer := 0;';replacement:=anchor||chr(10)||'  v_general_count integer;';IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'As variáveis do bootstrap mudaram';END IF;definition:=replace(definition,anchor,replacement);
 anchor:=$anchor$company_id, name, stock_id, is_active, sort_order
    ) VALUES (
      p_company_id, 'Caixa principal', v_stock_id, true, 0$anchor$;
 replacement:=$replacement$company_id, name, stock_id, is_active, sort_order, stock_binding_mode
    ) VALUES (
      p_company_id, 'Caixa principal', v_stock_id, true, 0, 'store_default'$replacement$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'A criação do primeiro caixa mudou';END IF;EXECUTE replace(definition,anchor,replacement);
END $bootstrap_store_default$;

-- Inicialização apenas de metadado confirmado. Caixas existentes permanecem
-- specific, inclusive quando seu local coincide com o padrão inicial da Loja.
DO $serialize_terminal_custody$
DECLARE definition text; anchor text; replacement text;
BEGIN
 SELECT pg_get_functiondef('public.pdv_guard_counter_terminal_custody_v2()'::regprocedure) INTO definition;
 anchor:=$anchor$BEGIN
  IF TG_TABLE_NAME='pdv_preorders' THEN$anchor$;
 replacement:=$replacement$BEGIN
  PERFORM public.pdv_lock_stock_settings_internal_v1(NEW.company_id);
  -- Cada expressão de record só é preparada no ramo da sua tabela/operação.
  IF TG_TABLE_NAME='pdv_preorders' THEN
    IF TG_OP='UPDATE' THEN
      IF NEW.status IN('cancelado','convertido') AND NEW.target_terminal_id IS NOT DISTINCT FROM OLD.target_terminal_id
        AND NEW.stock_id IS NOT DISTINCT FROM OLD.stock_id THEN RETURN NEW;END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME='pdv_orders' THEN
    IF TG_OP='UPDATE' THEN
      IF OLD.status::text IN('entregue','cancelado','pago') AND NEW.status::text IN('entregue','cancelado','pago')
        AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
        AND NEW.stock_id IS NOT DISTINCT FROM OLD.stock_id AND NEW.terminal_id IS NOT DISTINCT FROM OLD.terminal_id
        AND NEW.target_terminal_id IS NOT DISTINCT FROM OLD.target_terminal_id AND NEW.source_preorder_id IS NOT DISTINCT FROM OLD.source_preorder_id
        AND NEW.contract_version IS NOT DISTINCT FROM OLD.contract_version AND NEW.operation_mode_snapshot IS NOT DISTINCT FROM OLD.operation_mode_snapshot THEN RETURN NEW;END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME='pdv_preorders' THEN$replacement$;
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'O vínculo canônico do caixa mudou';END IF;
 EXECUTE replace(definition,anchor,replacement);
END $serialize_terminal_custody$;

DO $initial_store_default$
DECLARE company record; chosen uuid;
BEGIN
 FOR company IN SELECT s.company_id FROM public.company_settings s
  WHERE s.pdv_default_stock_id IS NULL AND public.pdv_company_access_entitled_internal(s.company_id) IS TRUE
    AND public.company_has_module(s.company_id,'pdv') IS TRUE ORDER BY s.company_id LOOP
  PERFORM public.pdv_lock_stock_settings_internal_v1(company.company_id);
  PERFORM 1 FROM public.company_settings WHERE company_id=company.company_id FOR UPDATE;
  SELECT CASE WHEN count(DISTINCT st.id)=1 THEN min(st.id::text)::uuid END INTO chosen
   FROM public.pdv_terminals t JOIN public.stocks st ON st.id=t.stock_id AND st.company_id=t.company_id
   WHERE t.company_id=company.company_id AND t.is_active IS TRUE AND st.customer_id IS NULL;
  IF chosen IS NULL THEN
   SELECT CASE WHEN count(*)=1 THEN min(st.id::text)::uuid END INTO chosen FROM public.stocks st WHERE st.company_id=company.company_id AND st.customer_id IS NULL;
  END IF;
  IF chosen IS NOT NULL THEN UPDATE public.company_settings SET pdv_default_stock_id=chosen WHERE company_id=company.company_id AND pdv_default_stock_id IS NULL;END IF;
 END LOOP;
END $initial_store_default$;
COMMIT;
