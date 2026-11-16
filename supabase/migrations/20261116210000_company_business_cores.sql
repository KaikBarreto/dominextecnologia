-- Dois núcleos sem alterar contratos, valores ou módulos das empresas existentes.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
ALTER TABLE public.companies ADD COLUMN business_core text NOT NULL DEFAULT 'services'
 CONSTRAINT companies_business_core_check CHECK(business_core IN ('services','retail'));
ALTER TABLE public.companies ADD COLUMN business_core_version smallint NOT NULL DEFAULT 1 CHECK(business_core_version IN (1,2));
COMMENT ON COLUMN public.companies.business_core IS 'Núcleo contratado na criação: Serviços ou Loja. Não substitui assinatura ou permissões.';
ALTER TABLE public.subscription_plans ADD COLUMN business_core text NOT NULL DEFAULT 'services'
 CHECK(business_core IN ('services','retail'));
-- Preço-base igual nos dois núcleos: Start Loja reaproveita o contrato e
-- preço do Start existente. Outros pacotes aguardam revisão administrativa.
INSERT INTO public.subscription_plans(code,name,description,price,max_users,included_modules,is_active,business_core)
 SELECT 'retail_'||code, 'Loja · '||name,
 'PDV, clientes, fornecedores, estoque e financeiro. Serviços é adicional.',
 price,max_users,
 (SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM jsonb_array_elements(included_modules) value
  WHERE value #>> '{}' NOT IN ('customer_portal','video_questions','contracts')) || '["basic","pdv"]'::jsonb,
 (code='start' AND is_active IS TRUE),'retail'
 FROM public.subscription_plans WHERE business_core='services' AND code<>'personalizado'
 ON CONFLICT(code) DO NOTHING;
INSERT INTO public.subscription_modules(code,name,description,price,is_active,sort_order)
 SELECT 'service_operations','Operação de Serviços','OS, agenda, serviços, equipamentos e orçamentos de serviços.',price,is_active,2
 FROM public.subscription_modules WHERE code='pdv'
 ON CONFLICT(code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_company_business_core_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_plan_core text;
BEGIN
 IF TG_OP='INSERT' THEN NEW.business_core_version:=2; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.business_core IS DISTINCT FROM OLD.business_core OR NEW.business_core_version IS DISTINCT FROM OLD.business_core_version THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='O perfil inicial da empresa não pode ser alterado. Contrate o outro núcleo pelos módulos.',DETAIL='code=business_core_immutable';
  END IF;
 ELSIF NEW.business_core='retail' AND auth.role() IS DISTINCT FROM 'service_role'
   AND NOT (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) AND public.is_super_admin(auth.uid()) IS DISTINCT FROM true THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seu perfil não permite definir a contratação desta empresa.',DETAIL='code=business_core_creation_denied';
 END IF;
 IF NEW.subscription_plan IS DISTINCT FROM 'personalizado' THEN
  SELECT business_core INTO v_plan_core FROM public.subscription_plans WHERE code=NEW.subscription_plan;
  IF NOT FOUND THEN
   IF TG_OP='INSERT' OR NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='O plano selecionado não está disponível.',DETAIL='code=company_plan_business_core_unknown';
   END IF;
  ELSIF v_plan_core IS DISTINCT FROM NEW.business_core THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Escolha um plano do perfil da empresa.',DETAIL='code=company_plan_business_core_mismatch';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_company_business_core_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_company_business_core_v1 BEFORE INSERT OR UPDATE OF business_core,business_core_version,subscription_plan
 ON public.companies FOR EACH ROW EXECUTE FUNCTION public.guard_company_business_core_v1();

CREATE OR REPLACE FUNCTION public.company_has_module_legacy_core_v1(
  p_company_id uuid,
  p_module_code text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_status       text;
  v_expires_at   timestamptz;
  v_plan         text;
  v_trial_active boolean;
BEGIN
  IF p_company_id IS NULL OR p_module_code IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.subscription_status,
         c.subscription_expires_at,
         COALESCE(NULLIF(c.subscription_plan, ''), 'start')
    INTO v_status, v_expires_at, v_plan
  FROM public.companies c
  WHERE c.id = p_company_id;

  -- Empresa inexistente => sem acesso.
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 1) Trial ativo libera tudo (espelha isTrialActive do hook).
  v_trial_active := (v_status = 'testing')
    AND (v_expires_at IS NULL OR v_expires_at > now());
  IF v_trial_active THEN
    RETURN true;
  END IF;

  -- 2) Addon avulso em company_modules.
  IF EXISTS (
    SELECT 1
    FROM public.company_modules cm
    WHERE cm.company_id = p_company_id
      AND cm.module_code = p_module_code
  ) THEN
    RETURN true;
  END IF;

  -- 3) Incluso no plano atual (subscription_plans.included_modules é jsonb array).
  IF EXISTS (
    SELECT 1
    FROM public.subscription_plans sp
    WHERE sp.code = v_plan
      AND sp.included_modules ? p_module_code
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;


REVOKE ALL ON FUNCTION public.company_has_module_legacy_core_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.company_has_module(p_company_id uuid,p_module_code text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_core text; v_version smallint;
BEGIN
 SELECT business_core,business_core_version INTO v_core,v_version FROM public.companies WHERE id=p_company_id;
 IF NOT FOUND OR p_module_code IS NULL THEN RETURN false; END IF;
 IF v_core='retail' AND p_module_code IN ('contracts','customer_portal','video_questions')
   AND NOT public.company_has_module(p_company_id,'service_operations') THEN RETURN false; END IF;
 IF p_module_code='service_operations' THEN
  IF v_core='services' THEN RETURN public.company_has_module_legacy_core_v1(p_company_id,'basic'); END IF;
  -- O teste da Loja não pode ativar OS implicitamente. Somente contratação.
  RETURN public.pdv_company_access_entitled_internal(p_company_id) AND (
   EXISTS(SELECT 1 FROM public.company_modules WHERE company_id=p_company_id AND module_code='service_operations')
   OR EXISTS(SELECT 1 FROM public.companies c JOIN public.subscription_plans p ON p.code=c.subscription_plan
     WHERE c.id=p_company_id AND p.included_modules ? 'service_operations'));
 END IF;
 IF v_core='services' AND v_version>=2 AND p_module_code='pdv' THEN
  RETURN public.pdv_company_access_entitled_internal(p_company_id) AND (
   EXISTS(SELECT 1 FROM public.company_modules WHERE company_id=p_company_id AND module_code='pdv')
   OR EXISTS(SELECT 1 FROM public.companies c JOIN public.subscription_plans p ON p.code=c.subscription_plan
     WHERE c.id=p_company_id AND p.included_modules ? 'pdv'));
 END IF;
 IF v_core='retail' AND p_module_code='pdv' THEN
  RETURN public.pdv_company_access_entitled_internal(p_company_id) AND public.company_has_module_legacy_core_v1(p_company_id,'basic');
 END IF;
 RETURN public.company_has_module_legacy_core_v1(p_company_id,p_module_code);
END $$;
REVOKE ALL ON FUNCTION public.company_has_module(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_has_module(uuid,text) TO anon,authenticated,service_role;

-- Fechar OS antiga continua básico mesmo após retirar Contratos; a régua
-- original continua inteira para criação ou troca de cliente/vínculo.
CREATE OR REPLACE FUNCTION public.guard_contract_visit_customization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_contract_customer_id uuid;
  v_old_id uuid;
  v_is_occurrence boolean;
BEGIN
  v_old_id := CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END;

  IF NEW.contract_id IS NULL THEN
    NEW.contract_reference_date := NULL;
    NEW.contract_visit_customized_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.contract_id IS NOT NULL
     AND OLD.origin = 'contract'
     AND NEW.origin IS DISTINCT FROM 'contract' THEN
    RAISE EXCEPTION 'contract_visit_origin_immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Chamado do portal pode carregar contract_id apenas como contexto. Ele so
  -- vira ocorrencia quando a RPC abaixo grava referencia + carimbo.
  v_is_occurrence := NEW.origin = 'contract'
    OR (NEW.contract_reference_date IS NOT NULL AND NEW.contract_visit_customized_at IS NOT NULL);
  IF NOT v_is_occurrence THEN
    RETURN NEW;
  END IF;

  IF TG_OP='INSERT' OR NEW.contract_id IS DISTINCT FROM OLD.contract_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
  SELECT c.customer_id
    INTO v_contract_customer_id
    FROM public.contracts c
   WHERE c.id = NEW.contract_id;

  IF v_contract_customer_id IS NULL OR NEW.customer_id IS DISTINCT FROM v_contract_customer_id THEN
    RAISE EXCEPTION 'contract_service_order_customer_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  END IF;

  IF NEW.origin = 'contract' THEN
    NEW.contract_reference_date := COALESCE(NEW.contract_reference_date, NEW.scheduled_date);

    IF TG_OP = 'UPDATE' AND OLD.contract_id IS NOT NULL AND NEW.contract_id = OLD.contract_id THEN
      NEW.contract_reference_date := COALESCE(OLD.contract_reference_date, OLD.scheduled_date);
      IF OLD.contract_visit_customized_at IS NOT NULL THEN
        NEW.contract_visit_customized_at := OLD.contract_visit_customized_at;
      ELSIF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
         OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time
         OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
         OR NEW.schedule_plan IS DISTINCT FROM OLD.schedule_plan
         OR NEW.technician_id IS DISTINCT FROM OLD.technician_id
         OR NEW.team_id IS DISTINCT FROM OLD.team_id
         OR NEW.description IS DISTINCT FROM OLD.description
         OR NEW.notes IS DISTINCT FROM OLD.notes
         OR NEW.equipment_id IS DISTINCT FROM OLD.equipment_id
         OR NEW.service_type_id IS DISTINCT FROM OLD.service_type_id
         OR NEW.form_template_id IS DISTINCT FROM OLD.form_template_id
         OR NEW.require_tech_signature IS DISTINCT FROM OLD.require_tech_signature
         OR NEW.require_client_signature IS DISTINCT FROM OLD.require_client_signature THEN
        NEW.contract_visit_customized_at := COALESCE(NEW.contract_visit_customized_at, now());
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE'
        AND OLD.contract_id = NEW.contract_id
        AND OLD.contract_reference_date IS NOT NULL
        AND OLD.contract_visit_customized_at IS NOT NULL THEN
    -- Depois de vinculada, a competencia e o carimbo sao monotonicos. Uma
    -- futura troca de competencia devera passar por RPC propria e auditavel.
    NEW.contract_reference_date := OLD.contract_reference_date;
    NEW.contract_visit_customized_at := OLD.contract_visit_customized_at;
  END IF;

  -- Regeneracao pode coexistir temporariamente com a visita automatica antiga,
  -- pois cria antes de apagar. O que nunca pode coexistir e uma visita manual
  -- protegida e outra ocorrencia para a mesma competencia.
  IF NEW.contract_reference_date IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.service_orders other
     WHERE other.contract_id = NEW.contract_id
       AND other.contract_reference_date = NEW.contract_reference_date
       AND other.id IS DISTINCT FROM v_old_id
       AND (
         (NEW.origin IS DISTINCT FROM 'contract' AND (
            other.origin = 'contract'
            OR other.contract_visit_customized_at IS NOT NULL
         ))
         OR (NEW.origin = 'contract'
             AND other.origin IS DISTINCT FROM 'contract'
             AND other.contract_visit_customized_at IS NOT NULL)
       )
  ) THEN
    RAISE EXCEPTION 'contract_period_occupied'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Políticas restritivas não abrem caminhos paralelos às policies tenant/role.
DO $policies$
DECLARE v_table text;
BEGIN
 FOREACH v_table IN ARRAY ARRAY['service_orders','equipment','service_types','quotes','os_statuses','task_types'] LOOP
  IF to_regclass('public.'||v_table) IS NOT NULL AND EXISTS(
   SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table AND column_name='company_id') THEN
   EXECUTE format('CREATE POLICY business_core_service_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()) OR public.company_has_module(coalesce(company_id,public.get_user_company_id(auth.uid())),''service_operations'')) WITH CHECK (public.is_super_admin(auth.uid()) OR public.company_has_module(coalesce(company_id,public.get_user_company_id(auth.uid())),''service_operations''))',v_table);
  END IF;
 END LOOP;
END $policies$;

-- Contexto privado de uma exclusão já autorizada. Não usa GUC controlável
-- pelo chamador. Só o OLD de um filho em cascata pode consultar o pai exato.
CREATE TABLE public.service_core_delete_context_v1 (
 backend_pid integer NOT NULL, transaction_id bigint NOT NULL,
 parent_table text NOT NULL CHECK(parent_table IN ('service_orders','quotes','quote_items','equipment','service_order_pmoc_documents','contracts','contract_items','contract_environments','pmoc_documents','form_templates')),
 parent_id uuid NOT NULL, company_id uuid NOT NULL,
 actor_id uuid, actor_role text, required_module text NOT NULL CHECK(required_module IN ('service_operations','contracts')),
 PRIMARY KEY(backend_pid,transaction_id,parent_table,parent_id)
);
ALTER TABLE public.service_core_delete_context_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_core_delete_context_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.service_core_deleted_parent_company_internal_v1(p_table text,p_id uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF pg_trigger_depth()<=1 THEN RETURN NULL; END IF;
 RETURN (SELECT company_id FROM public.service_core_delete_context_v1
  WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
    AND parent_table=p_table AND parent_id=p_id
    AND actor_id IS NOT DISTINCT FROM auth.uid() AND actor_role IS NOT DISTINCT FROM auth.role());
END $$;
REVOKE ALL ON FUNCTION public.service_core_deleted_parent_company_internal_v1(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.clear_service_core_delete_context_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF pg_trigger_depth()=1 THEN
  DELETE FROM public.service_core_delete_context_v1 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.clear_service_core_delete_context_v1() FROM PUBLIC,anon,authenticated,service_role;
-- Fecha também cascatas iniciadas fora das tabelas de Serviços (cliente →
-- equipamento). O gatilho não concede acesso; só apaga metadados da transação.
CREATE CONSTRAINT TRIGGER clear_service_core_delete_context_commit_v1
 AFTER INSERT OR UPDATE ON public.service_core_delete_context_v1
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION public.clear_service_core_delete_context_v1();

CREATE OR REPLACE FUNCTION public.service_core_row_company_internal_v1(p_row jsonb,p_table text,p_old boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_company uuid; v_parent uuid; v_id uuid;
BEGIN
 v_company:=nullif(p_row->>'company_id','')::uuid;
 -- Ledgers de numeração podem vincular o UUID antes do registro existir.
 IF p_table IN ('quote_number_reservations','service_order_number_reservations') THEN
  IF v_company IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='O registro precisa estar vinculado à empresa.'; END IF;
  RETURN v_company;
 END IF;
 -- Contratos e seus filhos conferem também a origem, nunca só company_id.
 IF p_table='contracts' THEN
  SELECT company_id INTO v_parent FROM public.customers WHERE id=nullif(p_row->>'customer_id','')::uuid;
  IF v_parent IS NULL OR v_parent IS DISTINCT FROM v_company THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o cliente deste contrato.',DETAIL='code=service_business_core_origin_invalid'; END IF;
 END IF;
 IF p_table='pmoc_certificate_validations' AND nullif(p_row->>'source_id','') IS NOT NULL THEN
  IF p_row->>'source_kind'='contract' THEN p_row:=p_row||jsonb_build_object('contract_id',p_row->>'source_id');
  ELSIF p_row->>'source_kind'='service_order' THEN p_row:=p_row||jsonb_build_object('service_order_id',p_row->>'source_id');
  ELSE RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.'; END IF;
 END IF;
 IF p_table<>'pmoc_schedules' AND nullif(p_row->>'contract_id','') IS NOT NULL THEN
  v_id:=(p_row->>'contract_id')::uuid;
  SELECT company_id INTO v_parent FROM public.contracts WHERE id=v_id;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('contracts',v_id); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.',DETAIL='code=service_business_core_origin_invalid';
  END IF;
  v_company:=v_parent;
 END IF;
 IF nullif(p_row->>'contract_item_id','') IS NOT NULL THEN
  v_id:=(p_row->>'contract_item_id')::uuid;
  SELECT c.company_id INTO v_parent FROM public.contract_items i JOIN public.contracts c ON c.id=i.contract_id WHERE i.id=v_id;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('contract_items',v_id); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.',DETAIL='code=service_business_core_origin_invalid';
  END IF;
  v_company:=v_parent;
 END IF;
 IF nullif(p_row->>'environment_id','') IS NOT NULL THEN
  v_id:=(p_row->>'environment_id')::uuid;
  SELECT company_id INTO v_parent FROM public.contract_environments WHERE id=v_id;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('contract_environments',v_id); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.',DETAIL='code=service_business_core_origin_invalid';
  END IF;
  v_company:=v_parent;
 END IF;
 IF nullif(p_row->>'contract_document_id','') IS NOT NULL THEN
  v_id:=(p_row->>'contract_document_id')::uuid;
  SELECT company_id INTO v_parent FROM public.pmoc_documents WHERE id=v_id;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('pmoc_documents',v_id); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.',DETAIL='code=service_business_core_origin_invalid';
  END IF;
  v_company:=v_parent;
 END IF;
 IF nullif(p_row->>'service_order_document_id','') IS NOT NULL THEN
  p_row:=p_row||jsonb_build_object('pmoc_document_id',p_row->>'service_order_document_id');
 END IF;
 IF p_table='form_questions' THEN
  v_id:=nullif(p_row->>'template_id','')::uuid;
  SELECT company_id INTO v_parent FROM public.form_templates WHERE id=v_id;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('form_templates',v_id); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o formulário desta pergunta.'; END IF;
  v_company:=v_parent;
 END IF;
 IF nullif(p_row->>'service_order_id','') IS NOT NULL THEN
  v_id:=(p_row->>'service_order_id')::uuid;
  SELECT company_id INTO v_parent FROM public.service_orders WHERE id=v_id;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('service_orders',v_id); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.',DETAIL='code=service_business_core_origin_invalid';
  END IF;
  v_company:=v_parent;
 END IF;
 IF nullif(p_row->>'quote_id','') IS NOT NULL THEN
  SELECT company_id INTO v_parent FROM public.quotes WHERE id=(p_row->>'quote_id')::uuid;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('quotes',(p_row->>'quote_id')::uuid); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.',DETAIL='code=service_business_core_origin_invalid';
  END IF;
  v_company:=v_parent;
 END IF;
 IF nullif(p_row->>'quote_item_id','') IS NOT NULL THEN
  SELECT q.company_id INTO v_parent FROM public.quote_items i JOIN public.quotes q ON q.id=i.quote_id
   WHERE i.id=(p_row->>'quote_item_id')::uuid;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('quote_items',(p_row->>'quote_item_id')::uuid); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.',DETAIL='code=service_business_core_origin_invalid';
  END IF;
  v_company:=v_parent;
 END IF;
 IF nullif(p_row->>'equipment_id','') IS NOT NULL THEN
  SELECT company_id INTO v_parent FROM public.equipment WHERE id=(p_row->>'equipment_id')::uuid;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('equipment',(p_row->>'equipment_id')::uuid); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.',DETAIL='code=service_business_core_origin_invalid';
  END IF;
  v_company:=v_parent;
 END IF;
 IF nullif(p_row->>'pmoc_document_id','') IS NOT NULL THEN
  SELECT company_id INTO v_parent FROM public.service_order_pmoc_documents WHERE id=(p_row->>'pmoc_document_id')::uuid;
  IF v_parent IS NULL AND p_old THEN v_parent:=public.service_core_deleted_parent_company_internal_v1('service_order_pmoc_documents',(p_row->>'pmoc_document_id')::uuid); END IF;
  IF v_parent IS NULL OR (v_company IS NOT NULL AND v_company IS DISTINCT FROM v_parent) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Não foi possível confirmar o vínculo deste registro.',DETAIL='code=service_business_core_origin_invalid';
  END IF;
  v_company:=v_parent;
 END IF;
 IF v_company IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='O registro precisa estar vinculado à empresa.',DETAIL='code=service_business_core_origin_required'; END IF;
 RETURN v_company;
END $$;
REVOKE ALL ON FUNCTION public.service_core_row_company_internal_v1(jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
-- PMOC compartilha uma tabela com relatório comum de OS. A licença do
-- relatório genérico continua sendo Serviços; certificados exigem Contratos.
CREATE OR REPLACE FUNCTION public.service_core_required_module_internal_v1(p_table text,p_row jsonb)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_type text; v_normative boolean;
BEGIN
 IF p_table IN ('contracts','contract_items','contract_attachments','contract_environments','contract_plan_activities',
  'company_pmoc_document_templates','pmoc_contract_documents_custom','pmoc_documents','pmoc_schedules',
  'pmoc_certificate_number_counters','pmoc_certificate_validations','pmoc_activity_catalog','responsible_technicians') THEN RETURN 'contracts'; END IF;
 IF p_table='form_templates' AND (p_row->>'is_pmoc_default'='true' OR nullif(p_row->>'pmoc_family','') IS NOT NULL) THEN RETURN 'contracts'; END IF;
 IF p_table='form_questions' THEN
  SELECT is_pmoc_default OR nullif(pmoc_family,'') IS NOT NULL INTO v_normative FROM public.form_templates WHERE id=nullif(p_row->>'template_id','')::uuid;
  IF v_normative IS TRUE THEN RETURN 'contracts'; END IF;
  IF v_normative IS NULL AND pg_trigger_depth()>1 THEN
   RETURN coalesce((SELECT required_module FROM public.service_core_delete_context_v1 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
    AND parent_table='form_templates' AND parent_id=nullif(p_row->>'template_id','')::uuid
    AND actor_id IS NOT DISTINCT FROM auth.uid() AND actor_role IS NOT DISTINCT FROM auth.role()),'service_operations');
  END IF;
 END IF;
 IF p_table='service_order_pmoc_documents' THEN
  IF p_row->>'doc_type'='relatorio_servico' THEN RETURN 'service_operations'; END IF;
  RETURN 'contracts';
 END IF;
 IF p_table='service_order_pmoc_document_links' THEN
  SELECT doc_type INTO v_type FROM public.service_order_pmoc_documents WHERE id=nullif(p_row->>'pmoc_document_id','')::uuid;
  IF v_type='relatorio_servico' THEN RETURN 'service_operations'; END IF;
  IF v_type IS NULL AND pg_trigger_depth()>1 THEN
   RETURN coalesce((SELECT required_module FROM public.service_core_delete_context_v1 WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
    AND parent_table='service_order_pmoc_documents' AND parent_id=nullif(p_row->>'pmoc_document_id','')::uuid
    AND actor_id IS NOT DISTINCT FROM auth.uid() AND actor_role IS NOT DISTINCT FROM auth.role()),'contracts');
  END IF;
  RETURN 'contracts';
 END IF;
 RETURN 'service_operations';
END $$;
REVOKE ALL ON FUNCTION public.service_core_required_module_internal_v1(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guard_service_business_core_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_company uuid; v_required_module text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND is_active IS TRUE) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seu acesso está desativado.',DETAIL='code=service_business_core_actor_inactive';
 END IF;
 IF auth.role()='service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) OR public.is_super_admin(auth.uid()) IS TRUE THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 -- Conferir a origem antiga impede mover um registro de um núcleo bloqueado
 -- para um tenant permitido para contornar o gate. Os parents também têm de
 -- pertencer à company declarada, mesmo em RPC SECURITY DEFINER.

 IF TG_OP IN ('UPDATE','DELETE') THEN
  v_company:=public.service_core_row_company_internal_v1(to_jsonb(OLD),TG_TABLE_NAME,true);
  v_required_module:=public.service_core_required_module_internal_v1(TG_TABLE_NAME,to_jsonb(OLD));
  IF TG_TABLE_NAME='pmoc_schedules' AND TG_OP='UPDATE' AND pg_trigger_depth()>1
   AND nullif(to_jsonb(OLD)->>'service_order_id','') IS NOT NULL AND nullif(to_jsonb(NEW)->>'service_order_id','') IS NULL
   AND to_jsonb(OLD)-'service_order_id'=to_jsonb(NEW)-'service_order_id'
   AND public.service_core_deleted_parent_company_internal_v1('service_orders',(to_jsonb(OLD)->>'service_order_id')::uuid)=v_company THEN v_required_module:='service_operations'; END IF;
  IF auth.uid() IS NOT NULL AND v_company IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seu perfil não permite alterar registros desta empresa.',DETAIL='code=service_business_core_company_denied';
  END IF;
  IF public.company_has_module(v_company,v_required_module) IS NOT TRUE OR public.pdv_company_access_entitled_internal(v_company) IS NOT TRUE THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sua empresa não tem acesso a esta operação. Confira os módulos contratados e a validade da assinatura.',DETAIL='code=business_core_module_not_contracted';
  END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  v_company:=public.service_core_row_company_internal_v1(to_jsonb(NEW),TG_TABLE_NAME,false);
  v_required_module:=public.service_core_required_module_internal_v1(TG_TABLE_NAME,to_jsonb(NEW));
  -- Preserva execução/histórico das OS antigas. Contratos é necessário para
  -- criar uma visita ou atribuir/trocar seu vínculo, não para fechar a OS.
  IF TG_TABLE_NAME='service_orders' AND nullif(to_jsonb(NEW)->>'contract_id','') IS NOT NULL
    AND (TG_OP='INSERT' OR to_jsonb(NEW)->>'contract_id' IS DISTINCT FROM to_jsonb(OLD)->>'contract_id'
     OR (to_jsonb(NEW)->>'origin'='contract' AND to_jsonb(NEW)->>'origin' IS DISTINCT FROM to_jsonb(OLD)->>'origin')
     OR to_jsonb(NEW)->>'contract_reference_date' IS DISTINCT FROM to_jsonb(OLD)->>'contract_reference_date') THEN v_required_module:='contracts'; END IF;
  IF TG_TABLE_NAME='service_order_activities' AND nullif(to_jsonb(NEW)->>'plan_activity_id','') IS NOT NULL
    AND (TG_OP='INSERT' OR to_jsonb(NEW)->>'plan_activity_id' IS DISTINCT FROM to_jsonb(OLD)->>'plan_activity_id') THEN v_required_module:='contracts'; END IF;

  IF TG_TABLE_NAME='pmoc_schedules' AND TG_OP='UPDATE' AND pg_trigger_depth()>1
   AND nullif(to_jsonb(OLD)->>'service_order_id','') IS NOT NULL AND nullif(to_jsonb(NEW)->>'service_order_id','') IS NULL
   AND to_jsonb(OLD)-'service_order_id'=to_jsonb(NEW)-'service_order_id'
   AND public.service_core_deleted_parent_company_internal_v1('service_orders',(to_jsonb(OLD)->>'service_order_id')::uuid)=v_company THEN v_required_module:='service_operations'; END IF;
  IF TG_TABLE_NAME='form_questions' AND nullif(to_jsonb(NEW)->>'pmoc_catalog_activity_id','') IS NOT NULL
    AND (TG_OP='INSERT' OR to_jsonb(NEW)->>'pmoc_catalog_activity_id' IS DISTINCT FROM to_jsonb(OLD)->>'pmoc_catalog_activity_id') THEN v_required_module:='contracts'; END IF;

  IF auth.uid() IS NOT NULL AND v_company IS DISTINCT FROM public.get_user_company_id(auth.uid()) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seu perfil não permite alterar registros desta empresa.',DETAIL='code=service_business_core_company_denied';
  END IF;
  IF public.company_has_module(v_company,v_required_module) IS NOT TRUE OR public.pdv_company_access_entitled_internal(v_company) IS NOT TRUE THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sua empresa não tem acesso a esta operação. Confira os módulos contratados e a validade da assinatura.',DETAIL='code=business_core_module_not_contracted';
  END IF;
 END IF;
 IF TG_OP='DELETE' AND TG_TABLE_NAME IN ('service_orders','quotes','quote_items','equipment','service_order_pmoc_documents','contracts','contract_items','contract_environments','pmoc_documents','form_templates') THEN
  INSERT INTO public.service_core_delete_context_v1(backend_pid,transaction_id,parent_table,parent_id,company_id,actor_id,actor_role,required_module)
  VALUES(pg_backend_pid(),txid_current(),TG_TABLE_NAME,(to_jsonb(OLD)->>'id')::uuid,v_company,auth.uid(),auth.role(),v_required_module)
  ON CONFLICT(backend_pid,transaction_id,parent_table,parent_id) DO UPDATE
   SET company_id=EXCLUDED.company_id,actor_id=EXCLUDED.actor_id,actor_role=EXCLUDED.actor_role,required_module=EXCLUDED.required_module;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.guard_service_business_core_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.service_core_can_read_row_v1(p_row jsonb,p_table text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_company uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND is_active IS TRUE) THEN RETURN false; END IF;
 IF public.is_super_admin(auth.uid()) IS TRUE THEN RETURN true; END IF;
 IF p_table IN ('service_types','os_statuses','task_types','pmoc_activity_catalog') AND nullif(p_row->>'company_id','') IS NULL THEN
  v_company:=public.get_user_company_id(auth.uid());
 ELSE
  BEGIN v_company:=public.service_core_row_company_internal_v1(p_row,p_table,false);
 EXCEPTION WHEN insufficient_privilege OR invalid_text_representation THEN RETURN false; END;
 END IF;
 RETURN v_company=public.get_user_company_id(auth.uid())
  AND public.pdv_company_access_entitled_internal(v_company)
  AND public.company_has_module(v_company,public.service_core_required_module_internal_v1(p_table,p_row));
END $$;
REVOKE ALL ON FUNCTION public.service_core_can_read_row_v1(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.service_core_can_read_row_v1(jsonb,text) TO authenticated;
DO $guards$
DECLARE v_table text; v_fields text;
BEGIN
 FOR v_table IN
 SELECT t.tablename FROM pg_catalog.pg_tables t WHERE t.schemaname='public'
  AND (t.tablename IN ('equipment','service_types','os_statuses','task_types','contracts','contract_items','contract_attachments','contract_environments','contract_plan_activities','company_pmoc_document_templates','pmoc_contract_documents_custom','pmoc_documents','pmoc_schedules','pmoc_certificate_number_counters','pmoc_certificate_validations','pmoc_activity_catalog','responsible_technicians','form_templates','form_questions')
   OR t.tablename LIKE 'service_order\_%' ESCAPE '\' OR t.tablename='service_orders'
   OR t.tablename LIKE 'quote\_%' ESCAPE '\' OR t.tablename='quotes')
  AND (t.tablename='pmoc_activity_catalog' OR EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=t.tablename
   AND c.column_name IN ('company_id','service_order_id','quote_id','quote_item_id','equipment_id','contract_id','template_id')))
 LOOP
  EXECUTE format('CREATE TRIGGER guard_service_business_core_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_service_business_core_v1()',v_table);
  -- Não serializar snapshots/documentos inteiros a cada policy. Só os campos
  -- de ownership são entregues ao resolvedor privado, sem recursão de RLS.
  SELECT string_agg(format('%L,%I',c.column_name,c.column_name),',' ORDER BY c.column_name) INTO v_fields
   FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=v_table
    AND c.column_name IN ('company_id','service_order_id','quote_id','quote_item_id','equipment_id','pmoc_document_id','contract_id','contract_item_id','environment_id','contract_document_id','service_order_document_id','source_id','source_kind','doc_type','plan_activity_id','customer_id','template_id','is_pmoc_default','pmoc_family','pmoc_catalog_activity_id');
  EXECUTE format('CREATE POLICY business_core_dependency_read_v1 ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.service_core_can_read_row_v1(jsonb_build_object(%s),%L))',v_table,coalesce(v_fields,''),v_table);
  IF v_table IN ('service_orders','quotes','quote_items','equipment','service_order_pmoc_documents','contracts','contract_items','contract_environments','pmoc_documents','form_templates') THEN
   EXECUTE format('CREATE TRIGGER clear_service_core_delete_context_v1 AFTER DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.clear_service_core_delete_context_v1()',v_table);
  END IF;
 END LOOP;
END $guards$;
-- A tabela e o arquivo usam a mesma origem/licença. Arquivo sem metadata
-- nunca pode ser lido como certificado; upload novo segue as permissões já
-- existentes e exige pelo menos Serviços, sem conceder nova policy permissiva.
CREATE OR REPLACE FUNCTION public.service_core_can_read_pmoc_storage_v1(p_name text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_document jsonb;
BEGIN
 SELECT to_jsonb(d) INTO v_document FROM public.pmoc_documents d WHERE d.pdf_storage_path=p_name LIMIT 1;
 IF v_document IS NOT NULL THEN RETURN public.service_core_can_read_row_v1(v_document,'pmoc_documents'); END IF;
 SELECT to_jsonb(d) INTO v_document FROM public.service_order_pmoc_documents d WHERE d.pdf_storage_path=p_name LIMIT 1;
 IF v_document IS NOT NULL THEN RETURN public.service_core_can_read_row_v1(v_document,'service_order_pmoc_documents'); END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.service_core_can_read_pmoc_storage_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.service_core_can_read_pmoc_storage_v1(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.service_core_can_upload_pmoc_storage_v1(p_name text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_company uuid;
BEGIN
 BEGIN v_company:=nullif(split_part(p_name,'/',1),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 RETURN public.service_core_can_read_row_v1(jsonb_build_object('company_id',v_company),'service_orders');
END $$;
REVOKE ALL ON FUNCTION public.service_core_can_upload_pmoc_storage_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.service_core_can_upload_pmoc_storage_v1(text) TO authenticated;
CREATE POLICY business_core_pmoc_storage_read_v1 ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'pmoc-documents' OR public.service_core_can_read_pmoc_storage_v1(name));
CREATE POLICY business_core_pmoc_storage_insert_v1 ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'pmoc-documents' OR public.service_core_can_upload_pmoc_storage_v1(name));
CREATE POLICY business_core_pmoc_storage_update_v1 ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'pmoc-documents' OR public.service_core_can_read_pmoc_storage_v1(name))
 WITH CHECK(bucket_id<>'pmoc-documents' OR public.service_core_can_read_pmoc_storage_v1(name));
CREATE POLICY business_core_pmoc_storage_delete_v1 ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'pmoc-documents' OR public.service_core_can_read_pmoc_storage_v1(name));

CREATE OR REPLACE FUNCTION public.service_core_can_read_contract_storage_v1(p_name text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_attachment jsonb;
BEGIN
 SELECT to_jsonb(a) INTO v_attachment FROM public.contract_attachments a WHERE a.storage_path=p_name LIMIT 1;
 RETURN v_attachment IS NOT NULL AND public.service_core_can_read_row_v1(v_attachment,'contract_attachments');
END $$;
REVOKE ALL ON FUNCTION public.service_core_can_read_contract_storage_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.service_core_can_read_contract_storage_v1(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.service_core_can_upload_contract_storage_v1(p_name text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_company uuid;
BEGIN
 BEGIN v_company:=nullif(split_part(p_name,'/',1),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 RETURN public.service_core_can_read_row_v1(jsonb_build_object('company_id',v_company),'contract_attachments');
END $$;
REVOKE ALL ON FUNCTION public.service_core_can_upload_contract_storage_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.service_core_can_upload_contract_storage_v1(text) TO authenticated;
CREATE POLICY business_core_contract_storage_read_v1 ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'contract-attachments' OR public.service_core_can_read_contract_storage_v1(name));
CREATE POLICY business_core_contract_storage_insert_v1 ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'contract-attachments' OR public.service_core_can_upload_contract_storage_v1(name));
CREATE POLICY business_core_contract_storage_update_v1 ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'contract-attachments' OR public.service_core_can_read_contract_storage_v1(name))
 WITH CHECK(bucket_id<>'contract-attachments' OR public.service_core_can_read_contract_storage_v1(name));
CREATE POLICY business_core_contract_storage_delete_v1 ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'contract-attachments' OR public.service_core_can_read_contract_storage_v1(name));

-- Em modo IMMEDIATE o evento deferred roda ainda dentro da cascata e deve
-- aguardar. A limpeza do statement externo é instalada só nos ancestrais
-- públicos comprovados por FK CASCADE, nunca em todas as tabelas do sistema.
DO $ancestor_cleanup$
DECLARE ancestor record;
BEGIN
 FOR ancestor IN
  WITH RECURSIVE roots(relid) AS (
   SELECT oid FROM pg_class WHERE oid IN ('public.service_orders'::regclass,'public.quotes'::regclass,
    'public.quote_items'::regclass,'public.equipment'::regclass,'public.service_order_pmoc_documents'::regclass,
    'public.contracts'::regclass,'public.contract_items'::regclass,'public.contract_environments'::regclass,'public.pmoc_documents'::regclass,'public.form_templates'::regclass)
   UNION
   SELECT fk.confrelid FROM pg_constraint fk JOIN roots r ON fk.conrelid=r.relid
    WHERE fk.contype='f' AND fk.confdeltype='c'
  ) SELECT c.oid,n.nspname,c.relname FROM roots r JOIN pg_class c ON c.oid=r.relid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
 LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=ancestor.oid AND tgname='clear_service_core_delete_context_v1') THEN
   EXECUTE format('CREATE TRIGGER clear_service_core_delete_context_v1 AFTER DELETE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION public.clear_service_core_delete_context_v1()',ancestor.nspname,ancestor.relname);
  END IF;
 END LOOP;
END $ancestor_cleanup$;


CREATE OR REPLACE FUNCTION public.seed_equipment_field_config_on_company_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.business_core='retail' THEN RETURN NEW; END IF;
  -- Só semeia empresa que não tem campo NENHUM. Se algum outro fluxo já criou
  -- (ou se a empresa foi criada com configuração própria), não encosta.
  IF EXISTS (SELECT 1 FROM public.equipment_field_config WHERE company_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.equipment_field_config
    (company_id, field_key, label, field_type, is_visible, is_required, position)
  VALUES
    (NEW.id, 'brand',         'Marca',                    'text', true, false, 1),
    (NEW.id, 'model',         'Modelo',                   'text', true, false, 2),
    (NEW.id, 'serial_number', 'Nº de Série',              'text', true, false, 3),
    (NEW.id, 'capacity',      'Capacidade/Especificação', 'text', true, false, 4),
    (NEW.id, 'location',      'Local',                    'text', true, false, 5),
    (NEW.id, 'install_date',  'Data de Instalação',       'date', true, false, 6)
  ON CONFLICT (company_id, field_key) DO NOTHING;

  RETURN NEW;
END;
$fn$;


-- O mesmo seed é chamado pelas duas entradas (pública e administrativa).
ALTER FUNCTION public.seed_company_catalog(uuid,text) RENAME TO seed_company_service_catalog_v1;
REVOKE ALL ON FUNCTION public.seed_company_service_catalog_v1(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.seed_company_catalog(p_company_id uuid,p_language text DEFAULT 'pt-br')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_core text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_super_admin(auth.uid()) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seu perfil não permite preparar a empresa.',DETAIL='code=company_seed_not_authorized';
 END IF;
 SELECT business_core INTO v_core FROM public.companies WHERE id=p_company_id;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='A empresa não foi encontrada.',DETAIL='code=company_seed_not_found'; END IF;
 IF v_core='services' OR public.company_has_module(p_company_id,'service_operations') THEN
  PERFORM public.seed_company_service_catalog_v1(p_company_id,p_language);
  INSERT INTO public.equipment_field_config(company_id,field_key,label,field_type,is_visible,is_required,position)
  SELECT p_company_id,field_key,label,field_type,true,false,position FROM(VALUES
    ('brand','Marca','text',1),('model','Modelo','text',2),('serial_number','Nº de Série','text',3),
    ('capacity','Capacidade/Especificação','text',4),('location','Local','text',5),('install_date','Data de Instalação','date',6)
  )field(field_key,label,field_type,position)
  ON CONFLICT(company_id,field_key) DO NOTHING;
 ELSE
  PERFORM public.pdv_bootstrap_company(p_company_id);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.seed_company_catalog(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.seed_company_catalog(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.seed_business_core_on_service_activation_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 -- Contratação pode ser persistida antes de pagar. Só preparar operação
 -- quando a vigência estiver liberada; a ativação paga chama o seed depois.
 IF NEW.module_code='service_operations' AND public.pdv_company_access_entitled_internal(NEW.company_id) IS TRUE THEN
  PERFORM public.seed_company_catalog(NEW.company_id,'pt-br');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.seed_business_core_on_service_activation_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER seed_business_core_on_service_activation_v1 AFTER INSERT ON public.company_modules
 FOR EACH ROW EXECUTE FUNCTION public.seed_business_core_on_service_activation_v1();

-- Ofertas de cadastro persistem o núcleo e condições no servidor. A URL não
-- é autorização para trocar plano, preço, comissão ou módulos.
CREATE TABLE public.registration_core_offers (
 token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_core text NOT NULL CHECK(business_core IN ('services','retail')),
 configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 issuer_scope text NOT NULL CHECK(issuer_scope IN ('admin','salesperson','affiliate_manager','affiliate')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 revoked_at timestamptz
);
ALTER TABLE public.registration_core_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registration_core_offers FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.registration_core_offers TO service_role;
CREATE OR REPLACE FUNCTION public.create_registration_core_offer_v1(p_business_core text,p_configuration jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_config jsonb; v_token uuid; v_manager boolean; v_affiliate_manager boolean; v_seller record; v_affiliate record; v_target_affiliate text; v_expires_at timestamptz; v_issuer_scope text;
BEGIN
 IF auth.uid() IS NULL OR p_business_core NOT IN ('services','retail') OR p_business_core IS NULL
  OR jsonb_typeof(p_configuration) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seu perfil não permite gerar este link.',DETAIL='code=registration_offer_not_authorized';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND is_active IS TRUE) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seu perfil não permite gerar este link.',DETAIL='code=registration_offer_not_authorized';
 END IF;
 v_manager:=coalesce(public.is_super_admin(auth.uid()),false) OR coalesce(public.has_admin_permission(auth.uid(),'admin_empresas_criar'),false);
 v_affiliate_manager:=coalesce(public.has_admin_permission(auth.uid(),'admin_afiliados'),false);
 SELECT id,referral_code INTO v_seller FROM public.salespeople WHERE user_id=auth.uid() AND is_active IS TRUE;
 SELECT id,slug INTO v_affiliate FROM public.affiliates WHERE user_id=auth.uid() AND is_active IS TRUE;
 IF NOT v_manager AND NOT v_affiliate_manager AND v_seller.id IS NULL AND v_affiliate.id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Seu perfil não permite gerar este link.',DETAIL='code=registration_offer_not_authorized';
 END IF;
 v_issuer_scope:=CASE WHEN v_manager THEN 'admin' WHEN v_seller.id IS NOT NULL THEN 'salesperson' WHEN v_affiliate_manager THEN 'affiliate_manager' ELSE 'affiliate' END;
 SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO v_config FROM jsonb_each(p_configuration)
 WHERE key IN ('link_type','locked_plan','is_locked','locked_price','billing_cycle','promo_months','trial_days','referral_code','affiliate_id','modules','max_users','origin');
 IF NOT v_manager AND v_seller.id IS NOT NULL THEN
  v_config:=v_config||jsonb_build_object('referral_code',v_seller.referral_code);
 ELSIF NOT v_manager AND v_affiliate_manager AND v_seller.id IS NULL THEN
  SELECT coalesce(nullif(slug,''),id::text) INTO v_target_affiliate FROM public.affiliates
   WHERE is_active IS TRUE AND (id::text=p_configuration->>'affiliate_id' OR slug=p_configuration->>'affiliate_id');
  IF v_target_affiliate IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selecione um afiliado ativo para gerar o link.',DETAIL='code=registration_offer_affiliate_invalid'; END IF;
  v_config:=jsonb_build_object('link_type','teste','affiliate_id',v_target_affiliate);
 ELSIF NOT v_manager AND v_affiliate.id IS NOT NULL THEN
  -- Afiliado pode indicar teste, mas não conceder desconto/plano/contrato.
  v_config:=jsonb_build_object('link_type','teste','affiliate_id',coalesce(nullif(v_affiliate.slug,''),v_affiliate.id::text));
 END IF;
 IF v_config->>'link_type' NOT IN ('teste','venda') OR v_config->>'link_type' IS NULL THEN
  v_config:=v_config||'{"link_type":"teste"}'::jsonb;
 END IF;
 v_expires_at:=now()+interval '30 days';
 -- Apenas o permalink de indicação simples pode ser duradouro. Nenhuma
 -- condição comercial ou prazo customizado pode ganhar validade infinita.
 IF (SELECT count(*) FROM jsonb_object_keys(p_configuration))=2
  AND (SELECT count(*) FROM jsonb_object_keys(v_config))=2
  AND p_configuration->>'link_type'='teste' AND v_config->>'link_type'='teste'
  AND nullif(v_config->>'affiliate_id','') IS NOT NULL THEN v_expires_at:='infinity'::timestamptz; END IF;
 INSERT INTO public.registration_core_offers(business_core,configuration,created_by,expires_at,issuer_scope)
 VALUES(p_business_core,v_config,auth.uid(),v_expires_at,v_issuer_scope) RETURNING token INTO v_token;
 RETURN jsonb_build_object('token',v_token,'business_core',p_business_core);
END $$;
REVOKE ALL ON FUNCTION public.create_registration_core_offer_v1(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_registration_core_offer_v1(text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_public_registration_core_offer_v1(p_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('business_core',business_core,'configuration',configuration)
 FROM public.registration_core_offers offer WHERE token=p_token AND revoked_at IS NULL AND expires_at>now()
 AND EXISTS(SELECT 1 FROM public.profiles profile WHERE profile.user_id=offer.created_by AND profile.is_active IS TRUE)
 AND (
  nullif(configuration->>'affiliate_id','') IS NULL
  OR EXISTS(SELECT 1 FROM public.affiliates a WHERE a.is_active IS TRUE AND (a.id::text=configuration->>'affiliate_id' OR a.slug=configuration->>'affiliate_id'))
 )
 AND CASE offer.issuer_scope
  WHEN 'admin' THEN public.is_super_admin(offer.created_by) IS TRUE OR public.has_admin_permission(offer.created_by,'admin_empresas_criar') IS TRUE
  WHEN 'salesperson' THEN EXISTS(SELECT 1 FROM public.salespeople seller WHERE seller.user_id=offer.created_by AND seller.is_active IS TRUE
    AND seller.referral_code=configuration->>'referral_code')
  WHEN 'affiliate_manager' THEN public.has_admin_permission(offer.created_by,'admin_afiliados') IS TRUE
    AND (SELECT count(*) FROM jsonb_object_keys(configuration))=2 AND configuration->>'link_type'='teste'
  WHEN 'affiliate' THEN (SELECT count(*) FROM jsonb_object_keys(configuration))=2 AND configuration->>'link_type'='teste'
    AND EXISTS(SELECT 1 FROM public.affiliates a WHERE a.user_id=offer.created_by AND a.is_active IS TRUE
      AND (a.id::text=configuration->>'affiliate_id' OR a.slug=configuration->>'affiliate_id'))
  ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.get_public_registration_core_offer_v1(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_registration_core_offer_v1(uuid) TO anon,authenticated,service_role;
COMMIT;
