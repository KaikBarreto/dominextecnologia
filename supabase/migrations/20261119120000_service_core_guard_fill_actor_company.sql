-- Corrige regressão da 20261116210000_company_business_cores.sql.
--
-- Problema: o gatilho guard_service_business_core_v1 (BEFORE INSERT/UPDATE/
-- DELETE) dispara em ordem alfabética ANTES de tg_set_company_id_<tabela>
-- (set_company_id_on_insert) e de tg_set_contract_attachment_owner, que são
-- quem preenchem company_id com a empresa de quem está criando. Resultado: todo
-- INSERT que chegava sem company_id (ex.: cadastrar tipo de serviço de dentro do
-- orçamento) passou a falhar com 42501 "O registro precisa estar vinculado à
-- empresa." (code=service_business_core_origin_required).
--
-- Regra (Tech Lead / Plataforma): registro novo que chega sem empresa herda a
-- empresa de QUEM está criando, como antes de 16/11. Nunca a de outro tenant.
-- Todas as outras checagens do guard continuam valendo depois disso.
--
-- Correção: só CREATE OR REPLACE FUNCTION (sem DDL de tabela, sem recriar
-- gatilho: ALTER TABLE em service_orders/quotes deu deadlock com tráfego ao
-- vivo). O guard antecipa, em INSERT, exatamente o preenchimento que o gatilho
-- próprio da tabela faria logo depois, e então valida normalmente.
--
-- Escopo: SOMENTE as tabelas guardadas que já têm gatilho próprio de
-- preenchimento pela empresa do ator. Tabela filha (quote_items,
-- service_order_materials etc.) continua tirando a empresa do pai e não muda de
-- comportamento. O valor vem só de get_user_company_id(auth.uid()) e logo em
-- seguida o guard confere v_company = empresa do ator, então não há caminho para
-- gravar em outro tenant. company_id enviado explicitamente nunca é tocado.
-- service_role/postgres/super_admin seguem no bypass original, e os gatilhos
-- próprios das tabelas continuam preenchendo para eles como antes.
--
-- Idempotente: CREATE OR REPLACE + REVOKE repetível. Corpo idêntico ao de
-- produção (conferido via pg_get_functiondef em 2026-11-19), exceto o bloco
-- marcado "actor company fill".

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
 -- actor company fill: o guard roda antes de tg_set_company_id_<tabela> /
 -- tg_set_contract_attachment_owner (ordem alfabética). Antecipa o mesmo
 -- preenchimento, só em INSERT, só quando veio nulo e só com a empresa do
 -- próprio ator. A validação abaixo continua conferindo origem, pais, módulo,
 -- assinatura e que a empresa é a do ator.
 -- IF aninhado de propósito: PL/pgSQL não garante curto-circuito no AND, e
 -- NEW.company_id não existe em tabela filha (quote_items etc.) -> 42703.
 IF TG_OP='INSERT' AND auth.uid() IS NOT NULL
  AND TG_TABLE_NAME IN ('company_pmoc_document_templates','contract_attachments','contracts','equipment',
   'form_templates','os_statuses','pmoc_contract_documents_custom','pmoc_documents','quotes',
   'responsible_technicians','service_orders','service_types','task_types') THEN
  IF NEW.company_id IS NULL THEN
   NEW.company_id:=public.get_user_company_id(auth.uid());
  END IF;
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
