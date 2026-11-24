BEGIN;

-- Ambos os kits usam subscription_modules.basic: mesmo preço-base, sem duplicação.
CREATE TABLE public.subscription_core_pricing (
 business_core text PRIMARY KEY CHECK (business_core IN ('services','retail')),
 base_price numeric CHECK (base_price IS NULL),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.subscription_core_pricing(business_core) VALUES ('services'),('retail');
ALTER TABLE public.subscription_core_pricing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_core_pricing FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.subscription_core_pricing TO anon,authenticated;
CREATE POLICY "Public business core prices" ON public.subscription_core_pricing FOR SELECT TO anon,authenticated USING (true);

CREATE TABLE public.subscription_core_price_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 business_core text NOT NULL REFERENCES public.subscription_core_pricing(business_core),
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 previous_prices jsonb NOT NULL,
 new_prices jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_core_price_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_core_price_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.subscription_core_price_history TO authenticated;
CREATE POLICY "Master reads core price history" ON public.subscription_core_price_history FOR SELECT TO authenticated
 USING (public.is_super_admin(auth.uid()) IS TRUE AND EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND is_active));

-- Decisão comercial: Essencial fixo em R$197 nos dois kits. Isso muda
-- somente o catálogo, nunca subscription_value/custom_price de contratos.
UPDATE public.subscription_modules SET price=197,is_active=true WHERE code='basic';
UPDATE public.subscription_plans SET price=197 WHERE code IN ('start','retail_start');
UPDATE public.subscription_modules services SET price=pdv.price FROM public.subscription_modules pdv
 WHERE services.code='service_operations' AND pdv.code='pdv';
DO $required_catalog$
BEGIN
 IF (SELECT count(*) FROM public.subscription_modules WHERE code IN ('basic','pdv','service_operations'))<>3
  OR (SELECT count(*) FROM public.subscription_plans WHERE code IN ('start','retail_start'))<>2 THEN
  RAISE EXCEPTION 'Os kits precisam estar cadastrados antes de configurar os preços.' USING ERRCODE='22023';
 END IF;
END $required_catalog$;

-- BEFORE STATEMENT também cobre REST e outros editores do catálogo. Todos
-- adquirem os três módulos e as duas revisões na MESMA ordem, antes do lock
-- das linhas afetadas; o espelhamento reentra nos locks da própria transação.
CREATE FUNCTION public.lock_business_core_catalog_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.subscription_modules WHERE code IN ('basic','pdv','service_operations') ORDER BY code FOR UPDATE;
 PERFORM 1 FROM public.subscription_core_pricing ORDER BY business_core FOR UPDATE;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.lock_business_core_catalog_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER business_core_catalog_lock_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_modules
 FOR EACH STATEMENT EXECUTE FUNCTION public.lock_business_core_catalog_v1();
CREATE TRIGGER business_core_catalog_lock_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_plans
 FOR EACH STATEMENT EXECUTE FUNCTION public.lock_business_core_catalog_v1();

CREATE FUNCTION public.guard_business_core_module_prices_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_canonical numeric;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.code IN ('basic','pdv','service_operations') THEN RAISE EXCEPTION 'Este item faz parte dos kits e não pode ser excluído.' USING ERRCODE='22023'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.code IN ('basic','pdv','service_operations') OR NEW.code IN ('basic','pdv','service_operations'))
  AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.id IS DISTINCT FROM OLD.id OR NEW.name IS DISTINCT FROM OLD.name OR NEW.type IS DISTINCT FROM OLD.type) THEN
  RAISE EXCEPTION 'A identificação dos kits e adicionais não pode ser alterada.' USING ERRCODE='22023';
 END IF;
 IF NEW.code='basic' AND (NEW.price IS DISTINCT FROM 197 OR NEW.is_active IS DISTINCT FROM true) THEN
  RAISE EXCEPTION 'O Essencial custa R$ 197 por mês nos dois kits.' USING ERRCODE='22023';
 END IF;
 IF NEW.code IN ('pdv','service_operations') THEN
  IF NEW.price IS NULL OR NEW.price<0 OR NEW.price>1000000 OR NEW.price<>round(NEW.price,2)
   OR (NEW.is_active IS TRUE AND NEW.price<=0) THEN
   RAISE EXCEPTION 'Informe um preço válido antes de disponibilizar o adicional.' USING ERRCODE='22023';
  END IF;
  IF NEW.code='service_operations' THEN
   SELECT price INTO v_canonical FROM public.subscription_modules WHERE code='pdv';
   IF NOT FOUND OR NEW.price IS DISTINCT FROM v_canonical THEN
    RAISE EXCEPTION 'Os adicionais dos dois kits usam o mesmo preço. Atualize pelo preço compartilhado.' USING ERRCODE='22023';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_business_core_module_prices_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER business_core_module_prices_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_modules
 FOR EACH ROW EXECUTE FUNCTION public.guard_business_core_module_prices_v1();
CREATE FUNCTION public.mirror_business_core_addon_price_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.code='pdv' AND (TG_OP='INSERT' OR NEW.price IS DISTINCT FROM OLD.price) THEN
  UPDATE public.subscription_modules SET price=NEW.price WHERE code='service_operations' AND price IS DISTINCT FROM NEW.price;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mirror_business_core_addon_price_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER business_core_addon_price_mirror_v1 AFTER INSERT OR UPDATE ON public.subscription_modules
 FOR EACH ROW EXECUTE FUNCTION public.mirror_business_core_addon_price_v1();
CREATE FUNCTION public.guard_business_core_plan_prices_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.code IN ('start','retail_start') THEN RAISE EXCEPTION 'O plano Essencial não pode ser excluído.' USING ERRCODE='22023'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.code IN ('start','retail_start') OR NEW.code IN ('start','retail_start'))
  AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.code IS DISTINCT FROM OLD.code OR NEW.name IS DISTINCT FROM OLD.name OR NEW.business_core IS DISTINCT FROM OLD.business_core) THEN
  RAISE EXCEPTION 'A identificação do plano Essencial não pode ser alterada.' USING ERRCODE='22023';
 END IF;
 IF NEW.code IN ('start','retail_start') AND NEW.price IS DISTINCT FROM 197 THEN
  RAISE EXCEPTION 'O Essencial custa R$ 197 por mês nos dois kits.' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_business_core_plan_prices_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER business_core_plan_prices_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_plans
 FOR EACH ROW EXECUTE FUNCTION public.guard_business_core_plan_prices_v1();

CREATE FUNCTION public.get_business_core_base_price_v1(p_business_core text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_price numeric;
BEGIN
 IF p_business_core IS NULL OR p_business_core NOT IN ('services','retail') THEN
  RAISE EXCEPTION 'Escolha Loja ou Serviços.' USING ERRCODE='22023';
 END IF;
 SELECT price INTO v_price FROM public.subscription_modules WHERE code='basic' AND is_active AND price=197;
 RETURN jsonb_build_object('business_core',p_business_core,'base_price',v_price,'configured',coalesce(v_price>0,false));
END $$;
REVOKE ALL ON FUNCTION public.get_business_core_base_price_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_core_base_price_v1(text) TO anon,authenticated,service_role;

CREATE FUNCTION public.admin_get_business_core_pricing_v1(p_business_core text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_row public.subscription_core_pricing%ROWTYPE; v_addon text;
BEGIN
 IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) IS DISTINCT FROM true
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND is_active IS TRUE) THEN
  RAISE EXCEPTION 'Seu perfil não permite gerenciar os preços.' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_row FROM public.subscription_core_pricing WHERE business_core=p_business_core;
 IF NOT FOUND THEN RAISE EXCEPTION 'Escolha Loja ou Serviços.' USING ERRCODE='22023'; END IF;
 v_addon:=CASE p_business_core WHEN 'retail' THEN 'service_operations' ELSE 'pdv' END;
 RETURN public.get_business_core_base_price_v1(p_business_core) || jsonb_build_object(
  'revision',v_row.revision,
  'plans',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'price',price,'is_active',is_active) ORDER BY max_users,code)
   FROM public.subscription_plans WHERE business_core=p_business_core AND code NOT IN ('personalizado','excecao','retail_excecao')),'[]'::jsonb),
  'addon',(SELECT jsonb_build_object('code',code,'name',name,'price',price,'is_active',is_active) FROM public.subscription_modules WHERE code=v_addon)
 );
END $$;
REVOKE ALL ON FUNCTION public.admin_get_business_core_pricing_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_business_core_pricing_v1(text) TO authenticated;

CREATE FUNCTION public.admin_set_business_core_pricing_v1(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_core text; v_row public.subscription_core_pricing%ROWTYPE; v_base numeric;
 v_current numeric; v_canonical numeric; v_shared_changed boolean; v_addon text; v_plan record; v_item jsonb; v_module record; v_before jsonb; v_after jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) IS DISTINCT FROM true
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND is_active IS TRUE) THEN
  RAISE EXCEPTION 'Seu perfil não permite gerenciar os preços.' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Revise os preços informados.' USING ERRCODE='22023'; END IF;
 v_core:=p_input->>'business_core';
 -- Serializa os dois kits na mesma ordem usada pelos editores REST.
 PERFORM 1 FROM public.subscription_modules WHERE code IN ('basic','pdv','service_operations') ORDER BY code FOR UPDATE;
 PERFORM 1 FROM public.subscription_core_pricing ORDER BY business_core FOR UPDATE;
 SELECT * INTO v_row FROM public.subscription_core_pricing WHERE business_core=v_core;
 IF NOT FOUND THEN RAISE EXCEPTION 'Escolha Loja ou Serviços.' USING ERRCODE='22023'; END IF;
 IF v_row.revision IS DISTINCT FROM (p_input->>'revision')::bigint THEN
  RAISE EXCEPTION 'Os preços mudaram. Atualize a tela antes de salvar.' USING ERRCODE='40001';
 END IF;
 v_base:=(p_input->>'base_price')::numeric;
 IF v_base IS DISTINCT FROM 197 THEN
  RAISE EXCEPTION 'O Essencial custa R$ 197 por mês nos dois kits.' USING ERRCODE='22023';
 END IF;
 v_addon:=CASE v_core WHEN 'retail' THEN 'service_operations' ELSE 'pdv' END;
 v_before:=public.admin_get_business_core_pricing_v1(v_core);
 SELECT CASE WHEN is_active THEN price ELSE NULL END INTO v_current FROM public.subscription_modules WHERE code='basic';
 IF v_current IS DISTINCT FROM (p_input->>'expected_base_price')::numeric THEN
  RAISE EXCEPTION 'Os preços mudaram. Atualize a tela antes de salvar.' USING ERRCODE='40001';
 END IF;
 IF jsonb_typeof(p_input->'plans') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'plans')>20
  OR (SELECT count(*)<>count(DISTINCT item->>'id') FROM jsonb_array_elements(p_input->'plans') item) THEN
  RAISE EXCEPTION 'Revise os planos informados.' USING ERRCODE='22023';
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_input->'plans') ORDER BY value->>'id' LOOP
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id=(v_item->>'id')::uuid AND business_core=v_core
   AND code NOT IN ('personalizado','excecao','retail_excecao') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Um plano não pertence ao kit escolhido.' USING ERRCODE='22023'; END IF;
  IF v_plan.code IN ('start','retail_start') AND (v_item->>'price')::numeric IS DISTINCT FROM v_base THEN
   RAISE EXCEPTION 'O plano básico usa o mesmo preço-base dos dois kits.' USING ERRCODE='22023';
  END IF;
  IF v_plan.price IS DISTINCT FROM (v_item->>'expected_price')::numeric OR v_plan.is_active IS DISTINCT FROM (v_item->>'expected_active')::boolean THEN
   RAISE EXCEPTION 'Os preços mudaram. Atualize a tela antes de salvar.' USING ERRCODE='40001';
  END IF;
  IF NOT(v_item ? 'price' AND v_item ? 'is_active') OR (v_item->>'is_active')::boolean IS NULL
   OR (v_item->>'price')::numeric IS NULL OR (v_item->>'price')::numeric<0 OR (v_item->>'price')::numeric>1000000
   OR (v_item->>'price')::numeric<>round((v_item->>'price')::numeric,2)
   OR ((v_item->>'is_active')::boolean AND (v_item->>'price')::numeric<=0) THEN
   RAISE EXCEPTION 'Planos disponíveis para venda precisam de preço maior que zero.' USING ERRCODE='22023';
  END IF;
  UPDATE public.subscription_plans SET price=(v_item->>'price')::numeric,is_active=(v_item->>'is_active')::boolean WHERE id=v_plan.id;
 END LOOP;
 IF jsonb_typeof(p_input->'addon') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Revise o adicional.' USING ERRCODE='22023'; END IF;
 v_item:=p_input->'addon';
 SELECT * INTO v_module FROM public.subscription_modules WHERE code=v_addon;
 IF NOT FOUND THEN RAISE EXCEPTION 'O adicional ainda não está cadastrado.' USING ERRCODE='22023'; END IF;
 SELECT price INTO v_canonical FROM public.subscription_modules WHERE code='pdv';
 IF v_module.price IS DISTINCT FROM (v_item->>'expected_price')::numeric OR v_canonical IS DISTINCT FROM (v_item->>'expected_price')::numeric OR v_module.is_active IS DISTINCT FROM (v_item->>'expected_active')::boolean THEN
  RAISE EXCEPTION 'Os preços mudaram. Atualize a tela antes de salvar.' USING ERRCODE='40001';
 END IF;
 IF (v_item->>'is_active')::boolean IS NULL OR (v_item->>'price')::numeric IS NULL
  OR (v_item->>'price')::numeric<0 OR (v_item->>'price')::numeric>1000000
  OR (v_item->>'price')::numeric<>round((v_item->>'price')::numeric,2)
  OR ((v_item->>'is_active')::boolean AND (v_item->>'price')::numeric<=0) THEN
  RAISE EXCEPTION 'Informe o preço do adicional antes de disponibilizá-lo.' USING ERRCODE='22023';
 END IF;
 -- Disponibilidade é própria de cada adicional; só o preço é compartilhado.
 -- Desativar primeiro permite preço zero apenas se nenhum adicional fica ativo.
 v_shared_changed:=v_canonical IS DISTINCT FROM (v_item->>'price')::numeric;
 IF (v_item->>'is_active')::boolean IS FALSE THEN
  UPDATE public.subscription_modules SET is_active=false WHERE code=v_addon;
 END IF;
 UPDATE public.subscription_modules SET price=(v_item->>'price')::numeric WHERE code='pdv';
 UPDATE public.subscription_modules SET is_active=(v_item->>'is_active')::boolean WHERE code=v_addon;
 UPDATE public.subscription_core_pricing SET base_price=NULL,revision=revision+1,updated_at=now()
  WHERE business_core=v_core OR v_shared_changed;
 v_after:=public.admin_get_business_core_pricing_v1(v_core);
 INSERT INTO public.subscription_core_price_history(business_core,actor_id,previous_prices,new_prices)
 VALUES(v_core,auth.uid(),v_before,v_after);
 RETURN v_after;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'Revise os preços e as opções informadas.' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.admin_set_business_core_pricing_v1(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_business_core_pricing_v1(jsonb) TO authenticated;
COMMIT;
