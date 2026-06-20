-- =====================================================================
-- TRAVA "EMPRESA NUNCA SEM ADMIN"
-- Regra (Tech Lead): toda empresa deve sempre ter >= 1 admin ATIVO.
--   admin ativo = user_roles.role='admin' E profiles.is_active não-false
--                 (NULL é tratado como ativo).
-- Implementado via TRIGGERS (path-independent) em vez de policy:
--   A) BEFORE UPDATE OR DELETE em user_roles  -> bloqueia rebaixar/excluir
--      o último admin.
--   B) BEFORE UPDATE em profiles -> bloqueia desativar o último admin.
-- Bypass por flag de sessão (app.bypass_last_admin_guard='on') para que
-- admin_delete_company (exclusão de tenant inteiro) não seja bloqueada.
-- Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A) Função do trigger em user_roles
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_last_admin_on_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_remaining  int;
BEGIN
  -- Bypass durante exclusão de empresa inteira (admin_delete_company)
  IF current_setting('app.bypass_last_admin_guard', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Só age quando o registro AFETADO era admin e está deixando de ser:
  --   - DELETE de uma linha role='admin', OU
  --   - UPDATE de role='admin' para algo diferente de 'admin'.
  IF OLD.role <> 'admin' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role = 'admin' THEN
    -- continua admin -> nada a checar
    RETURN NEW;
  END IF;

  -- Empresa do usuário afetado
  SELECT p.company_id INTO v_company_id
    FROM public.profiles p
   WHERE p.user_id = OLD.user_id
   LIMIT 1;

  -- Sem empresa associada -> não há o que proteger
  IF v_company_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- Conta admins ATIVOS restantes da MESMA empresa, EXCLUINDO este usuário
  SELECT count(*) INTO v_remaining
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
   WHERE ur.role = 'admin'
     AND p.company_id = v_company_id
     AND p.user_id <> OLD.user_id
     AND p.is_active IS DISTINCT FROM false;

  IF v_remaining = 0 THEN
    RAISE EXCEPTION 'A empresa precisa de pelo menos um administrador ativo.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_last_admin_user_roles ON public.user_roles;
CREATE TRIGGER trg_enforce_last_admin_user_roles
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_last_admin_on_user_roles();

-- ---------------------------------------------------------------------
-- B) Função do trigger em profiles (desativação do último admin)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_last_admin_on_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_admin   boolean;
  v_remaining  int;
BEGIN
  -- Bypass durante exclusão de empresa inteira (admin_delete_company)
  IF current_setting('app.bypass_last_admin_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Só age quando estava ATIVO (NULL ou true) e vai para is_active=false
  IF NOT (OLD.is_active IS DISTINCT FROM false) THEN
    RETURN NEW;  -- já estava inativo
  END IF;
  IF NEW.is_active IS DISTINCT FROM false THEN
    RETURN NEW;  -- não está sendo desativado
  END IF;

  -- Este usuário é admin?
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = OLD.user_id AND ur.role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Empresa sem company_id -> nada a proteger
  IF OLD.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Conta OUTROS admins ATIVOS da mesma empresa (excluindo este usuário)
  SELECT count(*) INTO v_remaining
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
   WHERE ur.role = 'admin'
     AND p.company_id = OLD.company_id
     AND p.user_id <> OLD.user_id
     AND p.is_active IS DISTINCT FROM false;

  IF v_remaining = 0 THEN
    RAISE EXCEPTION 'A empresa precisa de pelo menos um administrador ativo.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_last_admin_profiles ON public.profiles;
CREATE TRIGGER trg_enforce_last_admin_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_last_admin_on_profiles();

-- ---------------------------------------------------------------------
-- C) admin_delete_company: liga o bypass logo após o check de super_admin
--    (set_config com is_local=true -> escopo de transação).
--    CREATE OR REPLACE mantendo TODO o resto idêntico ao original.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_company(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_ids uuid[];
BEGIN
  -- 1) SEGURANÇA: só super_admin
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Bypass da trava "empresa nunca sem admin" durante a exclusão do tenant
  -- inteiro (escopo de transação). Sem isso, apagar user_roles/profiles do
  -- último admin dispararia a EXCEPTION e quebraria a exclusão.
  PERFORM set_config('app.bypass_last_admin_guard', 'on', true);

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  -- Coletar os usuários que pertencem A ESTA empresa.
  -- (No modelo atual um profile pertence a exatamente uma empresa; ainda
  --  assim, mais abaixo só apagamos auth.users de quem NÃO tem profile
  --  em outra empresa, por garantia.)
  SELECT array_agg(user_id)
    INTO v_user_ids
    FROM public.profiles
   WHERE company_id = p_company_id
     AND user_id IS NOT NULL;

  -- ===================================================================
  -- 2) NETOS sem company_id (apagar via subquery pelo id do pai da empresa)
  --    Ordem: do mais profundo pro mais raso.
  -- ===================================================================

  -- service_orders -> netos
  DELETE FROM public.service_rating_criteria
   WHERE rating_id IN (
     SELECT sr.id FROM public.service_ratings sr
     JOIN public.service_orders so ON so.id = sr.service_order_id
     WHERE so.company_id = p_company_id);

  DELETE FROM public.service_ratings
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id);

  DELETE FROM public.os_photos
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id);

  DELETE FROM public.service_order_assignees
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id);

  DELETE FROM public.service_order_equipment
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id);

  -- form_responses referencia service_orders, equipment e form_questions
  DELETE FROM public.form_responses
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id)
      OR equipment_id IN (SELECT id FROM public.equipment WHERE company_id = p_company_id)
      OR question_id IN (
           SELECT fq.id FROM public.form_questions fq
           JOIN public.form_templates ft ON ft.id = fq.template_id
           WHERE ft.company_id = p_company_id);

  -- pmoc_schedules referencia service_orders e equipment
  DELETE FROM public.pmoc_schedules
   WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE company_id = p_company_id)
      OR equipment_id IN (SELECT id FROM public.equipment WHERE company_id = p_company_id);

  -- contracts -> netos PMOC / itens / ambientes / atividades de plano
  DELETE FROM public.pmoc_documents WHERE company_id = p_company_id;
  DELETE FROM public.pmoc_contract_documents_custom WHERE company_id = p_company_id;

  -- service_order_activities tem company_id, mas referencia contract_plan_activities,
  -- service_orders e equipment -> apagar antes de qualquer um deles
  DELETE FROM public.service_order_activities WHERE company_id = p_company_id;

  DELETE FROM public.contract_plan_activities WHERE company_id = p_company_id;

  DELETE FROM public.contract_items
   WHERE contract_id IN (SELECT id FROM public.contracts WHERE company_id = p_company_id);

  DELETE FROM public.contract_environments WHERE company_id = p_company_id;

  -- ===================================================================
  -- 3) Compras (cotações/materiais/preços) — tudo com company_id
  -- ===================================================================
  DELETE FROM public.compra_cotacao_precos WHERE company_id = p_company_id;
  DELETE FROM public.compra_cotacoes WHERE company_id = p_company_id;
  DELETE FROM public.compra_materiais WHERE company_id = p_company_id;
  DELETE FROM public.compras WHERE company_id = p_company_id;
  DELETE FROM public.compras_number_counters WHERE company_id = p_company_id;
  DELETE FROM public.nfe_imports WHERE company_id = p_company_id;
  -- suppliers: referenciado por compra_cotacoes / inventory_movements /
  -- nfe_imports (todos já apagados acima)
  DELETE FROM public.suppliers WHERE company_id = p_company_id;

  -- ===================================================================
  -- 4) Quotes (orçamentos) -> itens/materiais antes
  -- ===================================================================
  DELETE FROM public.quote_item_materials
   WHERE quote_item_id IN (
     SELECT qi.id FROM public.quote_items qi
     JOIN public.quotes q ON q.id = qi.quote_id
     WHERE q.company_id = p_company_id);

  DELETE FROM public.quote_items
   WHERE quote_id IN (SELECT id FROM public.quotes WHERE company_id = p_company_id);

  -- ===================================================================
  -- 5) NFS-e
  -- ===================================================================
  DELETE FROM public.nfse_events WHERE company_id = p_company_id;
  DELETE FROM public.nfse_emissions WHERE company_id = p_company_id;

  -- ===================================================================
  -- 6) Financeiro (transações têm self-FK parent_transaction_id e são
  --    referenciadas por nfse/quotes/credit_card_bills/anexos -> limpar
  --    dependentes primeiro, depois as transações de uma vez)
  -- ===================================================================
  DELETE FROM public.financial_transaction_attachments
   WHERE transaction_id IN (SELECT id FROM public.financial_transactions WHERE company_id = p_company_id);

  -- desamarrar referências que apontam pra transações da empresa
  UPDATE public.credit_card_bills
     SET payment_transaction_id = NULL
   WHERE company_id = p_company_id
     AND payment_transaction_id IS NOT NULL;

  -- quotes.financial_transaction_id é NO ACTION; será resolvido ao apagar
  -- quotes logo abaixo, mas zeramos antes pra liberar as transações
  UPDATE public.quotes
     SET financial_transaction_id = NULL
   WHERE company_id = p_company_id
     AND financial_transaction_id IS NOT NULL;

  -- self-FK: zerar o ponteiro de pai antes de deletar em bloco
  UPDATE public.financial_transactions
     SET parent_transaction_id = NULL
   WHERE company_id = p_company_id
     AND parent_transaction_id IS NOT NULL;

  DELETE FROM public.financial_transactions WHERE company_id = p_company_id;

  DELETE FROM public.credit_card_bills WHERE company_id = p_company_id;
  DELETE FROM public.financial_accounts WHERE company_id = p_company_id;
  DELETE FROM public.financial_categories WHERE company_id = p_company_id;

  -- ===================================================================
  -- 7) Estoque (movimentos têm self-FK related_movement_id)
  -- ===================================================================
  UPDATE public.inventory_movements
     SET related_movement_id = NULL
   WHERE company_id = p_company_id
     AND related_movement_id IS NOT NULL;
  DELETE FROM public.inventory_movements WHERE company_id = p_company_id;
  DELETE FROM public.inventory WHERE company_id = p_company_id;

  -- ===================================================================
  -- 8) Catálogo de serviços e custos (netos sem company_id antes)
  -- ===================================================================
  DELETE FROM public.service_cost_resources
   WHERE service_id IN (SELECT id FROM public.service_types WHERE company_id = p_company_id)
      OR resource_id IN (SELECT id FROM public.cost_resources WHERE company_id = p_company_id);

  DELETE FROM public.service_gifts
   WHERE service_id IN (SELECT id FROM public.service_types WHERE company_id = p_company_id)
      OR resource_id IN (SELECT id FROM public.cost_resources WHERE company_id = p_company_id);

  DELETE FROM public.service_costs WHERE company_id = p_company_id;
  DELETE FROM public.service_materials WHERE company_id = p_company_id;

  DELETE FROM public.cost_resource_items
   WHERE resource_id IN (SELECT id FROM public.cost_resources WHERE company_id = p_company_id);
  DELETE FROM public.cost_resources WHERE company_id = p_company_id;

  -- ===================================================================
  -- 9) Formulários (questões e vínculos antes dos templates)
  -- ===================================================================
  DELETE FROM public.form_template_service_types
   WHERE template_id IN (SELECT id FROM public.form_templates WHERE company_id = p_company_id)
      OR service_type_id IN (SELECT id FROM public.service_types WHERE company_id = p_company_id);
  DELETE FROM public.form_questions
   WHERE template_id IN (SELECT id FROM public.form_templates WHERE company_id = p_company_id);

  -- ===================================================================
  -- 10) Ordens de serviço (agora que netos e atividades já foram)
  -- ===================================================================
  DELETE FROM public.service_orders WHERE company_id = p_company_id;

  -- ===================================================================
  -- 11) Contratos (depois das OS, que referenciam contract_id)
  -- ===================================================================
  DELETE FROM public.contracts WHERE company_id = p_company_id;

  -- form_templates agora liberado (contract_items/contracts/OS já foram)
  DELETE FROM public.form_templates WHERE company_id = p_company_id;

  -- ===================================================================
  -- 12) Catálogos de OS (depois das OS e contratos que os referenciam)
  -- ===================================================================
  DELETE FROM public.os_statuses WHERE company_id = p_company_id;
  DELETE FROM public.task_types WHERE company_id = p_company_id;
  DELETE FROM public.service_types WHERE company_id = p_company_id;

  -- ===================================================================
  -- 13) Leads / CRM (interações antes; leads antes de crm_stages/customers)
  -- ===================================================================
  DELETE FROM public.lead_interactions
   WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_company_id);
  DELETE FROM public.leads WHERE company_id = p_company_id;
  DELETE FROM public.crm_stages WHERE company_id = p_company_id;
  DELETE FROM public.crm_webhooks WHERE company_id = p_company_id;
  DELETE FROM public.customer_origins WHERE company_id = p_company_id;

  -- ===================================================================
  -- 14) Quotes (raiz, já sem itens) — antes de customers
  -- ===================================================================
  DELETE FROM public.quotes WHERE company_id = p_company_id;

  -- ===================================================================
  -- 15) Clientes (netos antes; depois de OS/contratos/quotes/leads/equip)
  -- ===================================================================
  DELETE FROM public.customer_portals
   WHERE customer_id IN (SELECT id FROM public.customers WHERE company_id = p_company_id);
  DELETE FROM public.customer_contacts
   WHERE customer_id IN (SELECT id FROM public.customers WHERE company_id = p_company_id);

  -- ===================================================================
  -- 16) Equipamentos (netos antes; depois de OS/contract_items/form_responses)
  -- ===================================================================
  DELETE FROM public.equipment_tasks
   WHERE equipment_id IN (SELECT id FROM public.equipment WHERE company_id = p_company_id);
  DELETE FROM public.equipment_attachments
   WHERE equipment_id IN (SELECT id FROM public.equipment WHERE company_id = p_company_id);
  DELETE FROM public.equipment WHERE company_id = p_company_id;

  DELETE FROM public.customers WHERE company_id = p_company_id;
  DELETE FROM public.equipment_categories WHERE company_id = p_company_id;
  DELETE FROM public.equipment_field_config WHERE company_id = p_company_id;
  DELETE FROM public.equipment_number_counters WHERE company_id = p_company_id;

  -- ===================================================================
  -- 17) RH / Ponto (movimentos e registros antes de employees)
  -- ===================================================================
  DELETE FROM public.employee_movements
   WHERE employee_id IN (SELECT id FROM public.employees WHERE company_id = p_company_id);
  DELETE FROM public.time_records WHERE company_id = p_company_id;
  DELETE FROM public.time_schedules WHERE company_id = p_company_id;
  DELETE FROM public.time_sheets WHERE company_id = p_company_id;
  DELETE FROM public.time_settings WHERE company_id = p_company_id;
  DELETE FROM public.employees WHERE company_id = p_company_id;

  -- ===================================================================
  -- 18) Times (membros antes; depois de OS/contratos que referenciam team_id)
  -- ===================================================================
  DELETE FROM public.team_members
   WHERE team_id IN (SELECT id FROM public.teams WHERE company_id = p_company_id);
  DELETE FROM public.teams WHERE company_id = p_company_id;

  -- responsible_technicians é referenciado por contracts (já apagados)
  DELETE FROM public.responsible_technicians WHERE company_id = p_company_id;

  -- ===================================================================
  -- 19) Configurações / documentos / fiscais / assinatura da empresa
  -- ===================================================================
  DELETE FROM public.company_fiscal_settings WHERE company_id = p_company_id;
  DELETE FROM public.company_pmoc_document_templates WHERE company_id = p_company_id;
  DELETE FROM public.company_settings WHERE company_id = p_company_id;
  DELETE FROM public.pricing_settings WHERE company_id = p_company_id;
  DELETE FROM public.holidays WHERE company_id = p_company_id;
  DELETE FROM public.nps_criteria WHERE company_id = p_company_id;
  DELETE FROM public.nps_settings WHERE company_id = p_company_id;
  DELETE FROM public.technician_locations WHERE company_id = p_company_id;
  DELETE FROM public.contract_health_status WHERE company_id = p_company_id;

  DELETE FROM public.company_modules WHERE company_id = p_company_id;
  DELETE FROM public.company_payments WHERE company_id = p_company_id;
  DELETE FROM public.subscription_payments WHERE company_id = p_company_id;
  DELETE FROM public.subscription_history WHERE company_id = p_company_id;
  DELETE FROM public.subscription_cancellation_requests WHERE company_id = p_company_id;
  DELETE FROM public.usage_events WHERE company_id = p_company_id;
  DELETE FROM public.consent_records WHERE company_id = p_company_id;
  DELETE FROM public.destructive_actions_audit WHERE company_id = p_company_id;

  -- ===================================================================
  -- 20) Registros Auctus (revenue ledger): NÃO destruir histórico de
  --     comissão/cobrança — só desamarrar da empresa (company_id NULL).
  -- ===================================================================
  UPDATE public.salesperson_sales SET company_id = NULL WHERE company_id = p_company_id;
  UPDATE public.ledger_asaas      SET company_id = NULL WHERE company_id = p_company_id;

  -- ===================================================================
  -- 21) LOGINS dos usuários da empresa (decisão CEO: apagar o dono)
  --     Só apaga auth.users de quem NÃO tem profile em outra empresa.
  -- ===================================================================
  IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
    -- tabelas por-usuário desta empresa
    DELETE FROM public.active_sessions  WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_roles       WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_permissions WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_preferences WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.user_notifications WHERE user_id = ANY(v_user_ids);

    -- profiles desta empresa
    DELETE FROM public.profiles WHERE company_id = p_company_id;

    -- auth.users: só os que não têm mais nenhum profile (em qualquer empresa).
    -- auth.identities tem ON DELETE CASCADE -> some junto.
    DELETE FROM auth.users u
     WHERE u.id = ANY(v_user_ids)
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id);
  END IF;

  -- ===================================================================
  -- 22) A própria empresa
  -- ===================================================================
  DELETE FROM public.companies WHERE id = p_company_id;
END;
$function$;
