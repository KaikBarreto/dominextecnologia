-- CRUD de locais: autorização no banco, metadados imutáveis e exclusão sem perda.
-- Depende dos helpers canônicos de vigência/módulos da migration 16160000.
-- Rollback lógico: restaurar as policies anteriores somente após suspender CRUD;
-- esta migration não transforma saldos, históricos, ACLs nem defaults existentes.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';

DROP POLICY IF EXISTS stocks_insert_own_company ON public.stocks;
CREATE POLICY stocks_insert_own_company ON public.stocks FOR INSERT TO authenticated
 WITH CHECK (public.pdv_can_manage_stock_v3(company_id) IS TRUE
 AND (company_id=public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid())));
DROP POLICY IF EXISTS stocks_update_own_company ON public.stocks;
CREATE POLICY stocks_update_own_company ON public.stocks FOR UPDATE TO authenticated
 USING (public.pdv_can_manage_stock_v3(company_id) IS TRUE
 AND (company_id=public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
 AND public.can_access_stock(auth.uid(),id) IS TRUE)
 WITH CHECK (public.pdv_can_manage_stock_v3(company_id) IS TRUE
 AND (company_id=public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
 AND public.can_access_stock(auth.uid(),id) IS TRUE);
DROP POLICY IF EXISTS stocks_delete_own_company ON public.stocks;
CREATE POLICY stocks_delete_own_company ON public.stocks FOR DELETE TO authenticated
 USING (public.pdv_can_manage_stock_v3(company_id) IS TRUE
 AND (company_id=public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()))
 AND public.can_access_stock(auth.uid(),id) IS TRUE);

-- Não verifica auth no trigger: RPCs privilegiadas de cliente/bootstrap já
-- autorizam seus próprios contextos. RLS é a fronteira da escrita direta.
CREATE FUNCTION public.guard_stock_location_metadata_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 -- O RPC legado de cliente deriva o nome completo do cadastro, sem este limite.
 IF NEW.customer_id IS NULL THEN
  NEW.name:=btrim(NEW.name);
  IF NEW.name IS NULL OR length(NEW.name) NOT BETWEEN 2 AND 80 THEN
   RAISE EXCEPTION 'Informe um nome entre 2 e 80 caracteres para o local.' USING ERRCODE='22023',DETAIL='code=stock_name_invalid';
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
   RAISE EXCEPTION 'O local não pode mudar de empresa ou cliente.' USING ERRCODE='23514',DETAIL='code=stock_scope_immutable';
  END IF;
  IF NEW.purpose IS DISTINCT FROM OLD.purpose AND NEW.purpose<>'pdv'
   AND (EXISTS(SELECT 1 FROM public.pdv_terminals t WHERE t.stock_id=OLD.id AND t.company_id=OLD.company_id)
    OR EXISTS(SELECT 1 FROM public.company_settings s WHERE s.company_id=OLD.company_id AND s.pdv_default_stock_id=OLD.id)) THEN
   RAISE EXCEPTION 'Este local atende à loja. Desvincule os caixas e o padrão da loja antes de mudar sua finalidade.' USING ERRCODE='23514',DETAIL='code=stock_purpose_in_use';
  END IF;
 END IF;
 IF NEW.purpose='pdv' AND (TG_OP='INSERT' OR NEW.purpose IS DISTINCT FROM OLD.purpose)
  AND (public.pdv_company_access_entitled_internal(NEW.company_id) IS DISTINCT FROM TRUE OR public.company_has_module(NEW.company_id,'pdv') IS DISTINCT FROM TRUE) THEN
  RAISE EXCEPTION 'Ative o módulo Loja em uma assinatura vigente para usar esta finalidade.' USING ERRCODE='42501',DETAIL='code=stock_pdv_module_required';
 END IF;
 IF TG_OP='INSERT' AND NEW.customer_id IS NULL THEN
  -- Serializa a escolha do primeiro geral com bootstrap/configuração. SECURITY
  -- DEFINER enxerga a empresa inteira, inclusive locais ocultos pela ACL.
  PERFORM public.pdv_lock_stock_settings_internal_v1(NEW.company_id);
  IF NOT EXISTS(SELECT 1 FROM public.stocks s WHERE s.company_id=NEW.company_id AND s.customer_id IS NULL) THEN NEW.is_default:=true; END IF;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_stock_location_metadata_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tg_a_stock_location_metadata_v1 BEFORE INSERT OR UPDATE ON public.stocks FOR EACH ROW EXECUTE FUNCTION public.guard_stock_location_metadata_v1();

CREATE OR REPLACE FUNCTION public.prevent_delete_protected_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE reference record; in_use boolean;
BEGIN
 -- Contextos de limpeza preexistentes: marcador sozinho NUNCA autoriza.
 -- Rollback exige service_role e criação incompleta com solicitante válido;
 -- purge exige super_admin e o UUID nominal da empresa inteira.
 IF (current_setting('app.rollback_admin_company_creation',true)='on'
  AND auth.role()='service_role'
  AND EXISTS(SELECT 1 FROM public.companies c WHERE c.id=OLD.company_id
   AND c.creation_completed_at IS NULL AND c.creation_idempotency_key IS NOT NULL
   AND (public.has_role(c.creation_requested_by,'super_admin'::public.app_role)
    OR public.has_admin_permission(c.creation_requested_by,'admin_empresas'))))
 OR (current_setting('app.pdv_purge_company',true)=OLD.company_id::text
  AND public.is_super_admin(auth.uid()) IS TRUE) THEN RETURN OLD; END IF;
 -- DELETE já segura a linha; FOR UPDATE também impede novas referências FK
 -- enquanto todas as dependências são verificadas, inclusive ON DELETE CASCADE.
 PERFORM s.id FROM public.stocks s WHERE s.id=OLD.id FOR UPDATE;
 IF OLD.is_default OR OLD.customer_id IS NOT NULL THEN
  RAISE EXCEPTION 'Este local é principal ou pertence a um cliente e não pode ser excluído.' USING ERRCODE='23514',DETAIL='code=stock_delete_in_use';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.stocks s WHERE s.company_id=OLD.company_id AND s.customer_id IS NULL AND s.id<>OLD.id) THEN
  RAISE EXCEPTION 'Mantenha ao menos um local geral na empresa.' USING ERRCODE='23514',DETAIL='code=stock_delete_in_use';
 END IF;
 PERFORM l.id FROM public.inventory_stock_levels l WHERE l.stock_id=OLD.id ORDER BY l.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.inventory_stock_levels l WHERE l.stock_id=OLD.id AND l.quantity<>0) THEN
  RAISE EXCEPTION 'Zere o saldo e preserve os registros deste local antes de excluí-lo.' USING ERRCODE='23514',DETAIL='code=stock_delete_in_use';
 END IF;
 -- FK catálogo cobre compras, OS, pedidos, reservas, contagens, caixas,
 -- devoluções e vínculos futuros. ACL é configuração; levels sem saldo não
 -- são fatos históricos. Todo outro vínculo impede apagar inclusive SET NULL.
 FOR reference IN
  SELECT n.nspname,c.relname,a.attname
  FROM pg_constraint fk JOIN pg_class c ON c.oid=fk.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=fk.conkey[1]
  WHERE fk.contype='f' AND fk.confrelid='public.stocks'::regclass
   AND cardinality(fk.conkey)=1 AND c.oid NOT IN('public.stock_access'::regclass,'public.inventory_stock_levels'::regclass)
  ORDER BY n.nspname,c.relname,a.attname
 LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I=$1)',reference.nspname,reference.relname,reference.attname) INTO in_use USING OLD.id;
  IF in_use THEN RAISE EXCEPTION 'Este local possui histórico ou vínculos de operação e não pode ser excluído.' USING ERRCODE='23514',DETAIL='code=stock_delete_in_use'; END IF;
 END LOOP;
 RETURN OLD;
END $fn$;
REVOKE ALL ON FUNCTION public.prevent_delete_protected_stock() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_default_stock(p_stock_id uuid) RETURNS public.stocks
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE company uuid; result public.stocks;
BEGIN
 SELECT company_id INTO company FROM public.stocks WHERE id=p_stock_id AND customer_id IS NULL;
 IF NOT FOUND OR public.pdv_can_manage_stock_v3(company) IS DISTINCT FROM TRUE OR public.can_access_stock(auth.uid(),p_stock_id) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Seu perfil não permite configurar este local de estoque.' USING ERRCODE='42501',DETAIL='code=stock_management_denied';
 END IF;
 PERFORM public.pdv_lock_stock_settings_internal_v1(company);
 PERFORM id FROM public.stocks WHERE company_id=company AND customer_id IS NULL ORDER BY id FOR UPDATE;
 UPDATE public.stocks SET is_default=false WHERE company_id=company AND customer_id IS NULL AND is_default AND id<>p_stock_id;
 UPDATE public.stocks SET is_default=true WHERE id=p_stock_id AND company_id=company AND customer_id IS NULL RETURNING * INTO result;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.set_default_stock(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_default_stock(uuid) TO authenticated,service_role;

CREATE FUNCTION public.stock_can_manage_access_v1(p_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.pdv_can_manage_stock_v3(p_company_id) IS TRUE
 AND (public.is_super_admin(auth.uid()) OR (p_company_id=public.get_user_company_id(auth.uid()) AND public.is_admin_or_gestor(auth.uid())));
$fn$;
REVOKE ALL ON FUNCTION public.stock_can_manage_access_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stock_can_manage_access_v1(uuid) TO authenticated,service_role;
-- Direct writes remain admin-only, with tenant/target/user invariants in trigger.
DROP POLICY IF EXISTS stock_access_insert_admin_gestor ON public.stock_access;
CREATE POLICY stock_access_insert_admin_gestor ON public.stock_access FOR INSERT TO authenticated WITH CHECK(public.stock_can_manage_access_v1(company_id));
DROP POLICY IF EXISTS stock_access_update_admin_gestor ON public.stock_access;
CREATE POLICY stock_access_update_admin_gestor ON public.stock_access FOR UPDATE TO authenticated USING(public.stock_can_manage_access_v1(company_id)) WITH CHECK(public.stock_can_manage_access_v1(company_id));
DROP POLICY IF EXISTS stock_access_delete_admin_gestor ON public.stock_access;
CREATE POLICY stock_access_delete_admin_gestor ON public.stock_access FOR DELETE TO authenticated USING(public.stock_can_manage_access_v1(company_id));

CREATE FUNCTION public.guard_stock_access_scope_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.stocks s WHERE s.id=NEW.stock_id AND s.company_id=NEW.company_id)
 OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=NEW.user_id AND p.company_id=NEW.company_id AND p.is_active IS TRUE) THEN
  RAISE EXCEPTION 'Selecione somente usuários ativos da empresa deste local.' USING ERRCODE='22023',DETAIL='code=stock_access_user_invalid';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_stock_access_scope_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tg_stock_access_scope_v1 BEFORE INSERT OR UPDATE ON public.stock_access FOR EACH ROW EXECUTE FUNCTION public.guard_stock_access_scope_v1();

CREATE OR REPLACE FUNCTION public.get_stock_access(p_stock_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE company uuid; ids uuid[];
BEGIN
 SELECT company_id INTO company FROM public.stocks WHERE id=p_stock_id;
 IF NOT FOUND OR public.stock_can_manage_access_v1(company) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Seu perfil não permite configurar o acesso deste local.' USING ERRCODE='42501',DETAIL='code=stock_access_denied'; END IF;
 SELECT COALESCE(array_agg(user_id ORDER BY created_at,user_id),ARRAY[]::uuid[]) INTO ids FROM public.stock_access WHERE stock_id=p_stock_id;
 RETURN jsonb_build_object('restricted',cardinality(ids)>0,'user_ids',to_jsonb(ids));
END $fn$;
CREATE OR REPLACE FUNCTION public.set_stock_access(p_stock_id uuid,p_restricted boolean,p_user_ids uuid[] DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE company uuid; valid_ids uuid[]; requested_ids uuid[];
BEGIN
 SELECT company_id INTO company FROM public.stocks WHERE id=p_stock_id FOR UPDATE;
 IF NOT FOUND OR public.stock_can_manage_access_v1(company) IS DISTINCT FROM TRUE THEN
  RAISE EXCEPTION 'Seu perfil não permite configurar o acesso deste local.' USING ERRCODE='42501',DETAIL='code=stock_access_denied'; END IF;
 IF p_restricted IS NULL THEN RAISE EXCEPTION 'Informe se o local deve ter acesso restrito.' USING ERRCODE='22023',DETAIL='code=stock_access_empty'; END IF;
 IF p_restricted THEN
  SELECT COALESCE(array_agg(DISTINCT uid ORDER BY uid),ARRAY[]::uuid[]) INTO requested_ids FROM unnest(COALESCE(p_user_ids,ARRAY[]::uuid[])) uid;
  IF cardinality(requested_ids)=0 THEN
   RAISE EXCEPTION 'Selecione ao menos um usuário para restringir o acesso ao local.' USING ERRCODE='22023',DETAIL='code=stock_access_empty'; END IF;
  -- Locks keep selected memberships active/in-tenant until the ACL is written.
  PERFORM p.id FROM public.profiles p WHERE p.user_id=ANY(requested_ids) ORDER BY p.id FOR SHARE;
  SELECT COALESCE(array_agg(DISTINCT p.user_id ORDER BY p.user_id),ARRAY[]::uuid[]) INTO valid_ids FROM public.profiles p WHERE p.user_id=ANY(requested_ids) AND p.company_id=company AND p.is_active IS TRUE;
  IF valid_ids IS DISTINCT FROM requested_ids THEN
   RAISE EXCEPTION 'Selecione somente usuários ativos da empresa deste local.' USING ERRCODE='22023',DETAIL='code=stock_access_user_invalid'; END IF;
 END IF;
 -- Validate the complete request BEFORE deleting the existing restriction.
 DELETE FROM public.stock_access WHERE stock_id=p_stock_id;
 IF p_restricted THEN INSERT INTO public.stock_access(company_id,stock_id,user_id) SELECT company,p_stock_id,uid FROM unnest(valid_ids) uid; END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.get_stock_access(uuid),public.set_stock_access(uuid,boolean,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_stock_access(uuid),public.set_stock_access(uuid,boolean,uuid[]) TO authenticated,service_role;
COMMIT;
