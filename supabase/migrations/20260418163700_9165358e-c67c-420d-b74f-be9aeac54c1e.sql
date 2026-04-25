
-- ============================================================
-- FASE 2.2: Substituir RLS permissivas por isolamento por company_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'super_admin'::app_role) $$;

CREATE OR REPLACE FUNCTION public.is_customer_in_active_portal(_customer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.customer_portals WHERE customer_id = _customer_id AND is_active = true) $$;

-- CUSTOMERS
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Public can view customers for portal" ON public.customers;
CREATE POLICY "Users view own company customers" ON public.customers FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Users insert own company customers" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Users update own company customers" ON public.customers FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Users delete own company customers" ON public.customers FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Public view customers via active portal" ON public.customers FOR SELECT TO anon
  USING (is_customer_in_active_portal(id));

-- EQUIPMENT
DROP POLICY IF EXISTS "Authenticated users can manage equipment" ON public.equipment;
DROP POLICY IF EXISTS "Authenticated users can view equipment" ON public.equipment;
DROP POLICY IF EXISTS "Public can view equipment for portal" ON public.equipment;
CREATE POLICY "Users view own company equipment" ON public.equipment FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Users manage own company equipment" ON public.equipment FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Public view equipment via active portal" ON public.equipment FOR SELECT TO anon
  USING (is_customer_in_active_portal(customer_id));

-- EQUIPMENT_ATTACHMENTS / TASKS / CATEGORIES / FIELD_CONFIG
DROP POLICY IF EXISTS "Authenticated users can manage equipment_attachments" ON public.equipment_attachments;
DROP POLICY IF EXISTS "Authenticated users can view equipment_attachments" ON public.equipment_attachments;
CREATE POLICY "Users manage own equipment_attachments" ON public.equipment_attachments FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM equipment e WHERE e.id = equipment_id AND (e.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM equipment e WHERE e.id = equipment_id AND (e.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

DROP POLICY IF EXISTS "Authenticated users can manage equipment_tasks" ON public.equipment_tasks;
DROP POLICY IF EXISTS "Authenticated users can view equipment_tasks" ON public.equipment_tasks;
CREATE POLICY "Users manage own equipment_tasks" ON public.equipment_tasks FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM equipment e WHERE e.id = equipment_id AND (e.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM equipment e WHERE e.id = equipment_id AND (e.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

DROP POLICY IF EXISTS "Authenticated users can view equipment_categories" ON public.equipment_categories;
CREATE POLICY "Users view own company equipment_categories" ON public.equipment_categories FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view equipment_field_config" ON public.equipment_field_config;
CREATE POLICY "Users view own company equipment_field_config" ON public.equipment_field_config FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

-- CUSTOMER_CONTACTS
DROP POLICY IF EXISTS "Authenticated users can manage customer_contacts" ON public.customer_contacts;
CREATE POLICY "Users manage own customer_contacts" ON public.customer_contacts FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM customers c WHERE c.id = customer_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM customers c WHERE c.id = customer_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

-- ORIGINS / STAGES / STATUSES / TYPES
DROP POLICY IF EXISTS "Authenticated users can view customer_origins" ON public.customer_origins;
CREATE POLICY "Users view own company customer_origins" ON public.customer_origins FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view crm_stages" ON public.crm_stages;
CREATE POLICY "Users view own company crm_stages" ON public.crm_stages FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view os_statuses" ON public.os_statuses;
CREATE POLICY "Users view own company os_statuses" ON public.os_statuses FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view task_types" ON public.task_types;
CREATE POLICY "Users view own company task_types" ON public.task_types FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view service types" ON public.service_types;
CREATE POLICY "Users view own company service_types" ON public.service_types FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

-- Globals (sem company_id)
DROP POLICY IF EXISTS "Authenticated users can view os_config" ON public.os_config;
CREATE POLICY "Authenticated view os_config" ON public.os_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can view os_required_fields" ON public.os_required_fields;
CREATE POLICY "Authenticated view os_required_fields" ON public.os_required_fields FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can view os_sla_config" ON public.os_sla_config;
CREATE POLICY "Authenticated view os_sla_config" ON public.os_sla_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can view permission_presets" ON public.permission_presets;
CREATE POLICY "Authenticated view permission_presets" ON public.permission_presets FOR SELECT TO authenticated USING (true);

-- COMPANY_SETTINGS
DROP POLICY IF EXISTS "Authenticated users can view company_settings" ON public.company_settings;
DROP POLICY IF EXISTS "Public can view company_settings" ON public.company_settings;
CREATE POLICY "Users view own company_settings" ON public.company_settings FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Public view company_settings via portal" ON public.company_settings FOR SELECT TO anon
  USING (EXISTS(SELECT 1 FROM customer_portals cp JOIN customers c ON c.id = cp.customer_id WHERE cp.is_active = true AND c.company_id = company_settings.company_id));

-- COMPANY_MODULES / COMPANY_ORIGINS
DROP POLICY IF EXISTS "Public can view company modules" ON public.company_modules;
DROP POLICY IF EXISTS "Anyone can view origins" ON public.company_origins;
CREATE POLICY "Authenticated view company_origins" ON public.company_origins FOR SELECT TO authenticated USING (true);

-- EMPLOYEES / EMPLOYEE_MOVEMENTS / TEAMS / TEAM_MEMBERS
DROP POLICY IF EXISTS "Authenticated users can manage employees" ON public.employees;
CREATE POLICY "Users manage own company employees" ON public.employees FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can manage employee_movements" ON public.employee_movements;
CREATE POLICY "Users manage own employee_movements" ON public.employee_movements FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM employees e WHERE e.id = employee_id AND (e.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM employees e WHERE e.id = employee_id AND (e.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

DROP POLICY IF EXISTS "Authenticated users can manage teams" ON public.teams;
CREATE POLICY "Users manage own company teams" ON public.teams FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can manage team_members" ON public.team_members;
CREATE POLICY "Users manage own team_members" ON public.team_members FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM teams t WHERE t.id = team_id AND (t.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM teams t WHERE t.id = team_id AND (t.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

-- INVENTORY
DROP POLICY IF EXISTS "Authenticated users can manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "Authenticated users can view inventory" ON public.inventory;
CREATE POLICY "Users manage own company inventory" ON public.inventory FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view movements" ON public.inventory_movements;
CREATE POLICY "Users view own inventory_movements" ON public.inventory_movements FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM inventory i WHERE i.id = inventory_id AND (i.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

-- LEADS
DROP POLICY IF EXISTS "Authenticated users can manage leads" ON public.leads;
CREATE POLICY "Users manage own company leads" ON public.leads FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can manage lead_interactions" ON public.lead_interactions;
CREATE POLICY "Users manage own lead_interactions" ON public.lead_interactions FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM leads l WHERE l.id = lead_id AND (l.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM leads l WHERE l.id = lead_id AND (l.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

-- FINANCIAL_TRANSACTIONS
DROP POLICY IF EXISTS "Authenticated users can delete financial_transactions" ON public.financial_transactions;
DROP POLICY IF EXISTS "Authenticated users can manage transactions" ON public.financial_transactions;
CREATE POLICY "Users manage own company financial_transactions" ON public.financial_transactions FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

-- SERVICE_ORDERS
DROP POLICY IF EXISTS "Authenticated users can delete service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "Authenticated users can insert service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "Authenticated users can update service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "Authenticated users can view service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "Public can view service orders by customer" ON public.service_orders;
DROP POLICY IF EXISTS "Public can view service_orders" ON public.service_orders;
CREATE POLICY "Users manage own company service_orders" ON public.service_orders FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Public view service_orders via portal" ON public.service_orders FOR SELECT TO anon
  USING (is_customer_in_active_portal(customer_id) OR EXISTS(SELECT 1 FROM service_ratings sr WHERE sr.service_order_id = service_orders.id));

-- SERVICE_ORDER_ASSIGNEES / EQUIPMENT
DROP POLICY IF EXISTS "Authenticated users can delete service_order_assignees" ON public.service_order_assignees;
DROP POLICY IF EXISTS "Authenticated users can manage assignees" ON public.service_order_assignees;
DROP POLICY IF EXISTS "Authenticated users can view assignees" ON public.service_order_assignees;
CREATE POLICY "Users manage own service_order_assignees" ON public.service_order_assignees FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

DROP POLICY IF EXISTS "Authenticated users can delete service_order_equipment" ON public.service_order_equipment;
DROP POLICY IF EXISTS "Authenticated users can insert service_order_equipment" ON public.service_order_equipment;
DROP POLICY IF EXISTS "Authenticated users can view service_order_equipment" ON public.service_order_equipment;
DROP POLICY IF EXISTS "Public can view service_order_equipment" ON public.service_order_equipment;
CREATE POLICY "Users manage own service_order_equipment" ON public.service_order_equipment FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));
CREATE POLICY "Public view service_order_equipment via portal" ON public.service_order_equipment FOR SELECT TO anon
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND is_customer_in_active_portal(so.customer_id)));

-- SERVICE_RATINGS
DROP POLICY IF EXISTS "Authenticated users can delete service_ratings" ON public.service_ratings;
DROP POLICY IF EXISTS "Authenticated users can insert service_ratings" ON public.service_ratings;
CREATE POLICY "Users manage own service_ratings" ON public.service_ratings FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));
CREATE POLICY "Public submit rating by token" ON public.service_ratings FOR INSERT TO anon WITH CHECK (token IS NOT NULL);
CREATE POLICY "Public update rating by token" ON public.service_ratings FOR UPDATE TO anon USING (token IS NOT NULL);

-- QUOTES
DROP POLICY IF EXISTS "Authenticated users can manage quotes" ON public.quotes;
DROP POLICY IF EXISTS "Public can view quote by token" ON public.quotes;
CREATE POLICY "Users manage own company quotes" ON public.quotes FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Public view quotes by token" ON public.quotes FOR SELECT TO anon USING (token IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can manage quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Public can view quote_items" ON public.quote_items;
CREATE POLICY "Users manage own quote_items" ON public.quote_items FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM quotes q WHERE q.id = quote_id AND (q.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM quotes q WHERE q.id = quote_id AND (q.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));
CREATE POLICY "Public view quote_items via quote" ON public.quote_items FOR SELECT TO anon
  USING (EXISTS(SELECT 1 FROM quotes q WHERE q.id = quote_id AND q.token IS NOT NULL));

-- quote_item_materials: tabela criada manualmente no antigo, pode não existir no novo. Aplicar policy só se existir.
DO $$
BEGIN
  IF to_regclass('public.quote_item_materials') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can manage quote_item_materials" ON public.quote_item_materials';
    EXECUTE $policy$
      CREATE POLICY "Users manage own quote_item_materials" ON public.quote_item_materials FOR ALL TO authenticated
        USING (EXISTS(SELECT 1 FROM quote_items qi JOIN quotes q ON q.id = qi.quote_id WHERE qi.id = quote_item_id AND (q.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
        WITH CHECK (EXISTS(SELECT 1 FROM quote_items qi JOIN quotes q ON q.id = qi.quote_id WHERE qi.id = quote_item_id AND (q.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
    $policy$;
  END IF;
END$$;

-- FORM_TEMPLATES / QUESTIONS / RESPONSES / TEMPLATE_SERVICE_TYPES
DROP POLICY IF EXISTS "Authenticated users can view form_templates" ON public.form_templates;
DROP POLICY IF EXISTS "Public can view active templates" ON public.form_templates;
CREATE POLICY "Users view own company form_templates" ON public.form_templates FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "Public view form_templates via OS portal" ON public.form_templates FOR SELECT TO anon
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.form_template_id = form_templates.id AND (is_customer_in_active_portal(so.customer_id) OR EXISTS(SELECT 1 FROM service_ratings sr WHERE sr.service_order_id = so.id))));

DROP POLICY IF EXISTS "Authenticated users can view form_questions" ON public.form_questions;
DROP POLICY IF EXISTS "Public can view template questions" ON public.form_questions;
CREATE POLICY "Users view own company form_questions" ON public.form_questions FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM form_templates ft WHERE ft.id = template_id AND (ft.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));
CREATE POLICY "Public view form_questions via OS portal" ON public.form_questions FOR SELECT TO anon
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.form_template_id = form_questions.template_id AND (is_customer_in_active_portal(so.customer_id) OR EXISTS(SELECT 1 FROM service_ratings sr WHERE sr.service_order_id = so.id))));

DROP POLICY IF EXISTS "Authenticated users can delete form_responses" ON public.form_responses;
DROP POLICY IF EXISTS "Authenticated users can view form_responses" ON public.form_responses;
DROP POLICY IF EXISTS "Public can view form_responses" ON public.form_responses;
DROP POLICY IF EXISTS "Users can create form_responses" ON public.form_responses;
DROP POLICY IF EXISTS "Users can update own form_responses" ON public.form_responses;
DROP POLICY IF EXISTS "Public can submit responses" ON public.form_responses;
CREATE POLICY "Users manage own form_responses" ON public.form_responses FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));
CREATE POLICY "Public view form_responses via OS portal" ON public.form_responses FOR SELECT TO anon
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (is_customer_in_active_portal(so.customer_id) OR EXISTS(SELECT 1 FROM service_ratings sr WHERE sr.service_order_id = so.id))));
CREATE POLICY "Public submit form_responses via portal" ON public.form_responses FOR INSERT TO anon
  WITH CHECK (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (is_customer_in_active_portal(so.customer_id) OR EXISTS(SELECT 1 FROM service_ratings sr WHERE sr.service_order_id = so.id))));

DROP POLICY IF EXISTS "Authenticated users can create template-service links" ON public.form_template_service_types;
DROP POLICY IF EXISTS "Authenticated users can delete template-service links" ON public.form_template_service_types;
DROP POLICY IF EXISTS "Authenticated users can view template-service links" ON public.form_template_service_types;
CREATE POLICY "Users manage own form_template_service_types" ON public.form_template_service_types FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM form_templates ft WHERE ft.id = template_id AND (ft.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM form_templates ft WHERE ft.id = template_id AND (ft.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

-- OS_PHOTOS
DROP POLICY IF EXISTS "Authenticated users can delete os_photos" ON public.os_photos;
DROP POLICY IF EXISTS "Users can view OS photos" ON public.os_photos;
CREATE POLICY "Users view own os_photos" ON public.os_photos FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));
CREATE POLICY "Users delete own os_photos" ON public.os_photos FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (so.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));
CREATE POLICY "Public view os_photos via portal" ON public.os_photos FOR SELECT TO anon
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (is_customer_in_active_portal(so.customer_id) OR EXISTS(SELECT 1 FROM service_ratings sr WHERE sr.service_order_id = so.id))));

-- CONTRACT_ITEMS / CONTRACT_OCCURRENCES (limpa "DELETE true")
DROP POLICY IF EXISTS "Authenticated users can delete contract_items" ON public.contract_items;
DROP POLICY IF EXISTS "Authenticated users can delete contract_occurrences" ON public.contract_occurrences;

-- PMOC_*  (todas ligam via plan_id → pmoc_plans → customer_id → customers.company_id; pmoc_schedules via contract_id)
DROP POLICY IF EXISTS "Authenticated users can manage pmoc_contracts" ON public.pmoc_contracts;
DROP POLICY IF EXISTS "Authenticated users can view PMOC contracts" ON public.pmoc_contracts;
CREATE POLICY "Users manage own company pmoc_contracts" ON public.pmoc_contracts FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can manage pmoc_items" ON public.pmoc_items;
CREATE POLICY "Users manage own pmoc_items" ON public.pmoc_items FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM pmoc_plans pp JOIN customers c ON c.id = pp.customer_id WHERE pp.id = plan_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM pmoc_plans pp JOIN customers c ON c.id = pp.customer_id WHERE pp.id = plan_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

DROP POLICY IF EXISTS "Authenticated users can manage pmoc_plans" ON public.pmoc_plans;
CREATE POLICY "Users manage own pmoc_plans" ON public.pmoc_plans FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM customers c WHERE c.id = customer_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM customers c WHERE c.id = customer_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

DROP POLICY IF EXISTS "Authenticated users can manage pmoc_schedules" ON public.pmoc_schedules;
DROP POLICY IF EXISTS "Authenticated users can view PMOC schedules" ON public.pmoc_schedules;
CREATE POLICY "Users manage own pmoc_schedules" ON public.pmoc_schedules FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM pmoc_contracts pc WHERE pc.id = contract_id AND (pc.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM pmoc_contracts pc WHERE pc.id = contract_id AND (pc.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

DROP POLICY IF EXISTS "Authenticated users can delete pmoc_generated_os" ON public.pmoc_generated_os;
DROP POLICY IF EXISTS "Authenticated users can insert pmoc_generated_os" ON public.pmoc_generated_os;
DROP POLICY IF EXISTS "Authenticated users can update pmoc_generated_os" ON public.pmoc_generated_os;
DROP POLICY IF EXISTS "Authenticated users can view pmoc_generated_os" ON public.pmoc_generated_os;
CREATE POLICY "Users manage own pmoc_generated_os" ON public.pmoc_generated_os FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM pmoc_plans pp JOIN customers c ON c.id = pp.customer_id WHERE pp.id = plan_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM pmoc_plans pp JOIN customers c ON c.id = pp.customer_id WHERE pp.id = plan_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

-- SERVICE_COST_RESOURCES / SERVICE_GIFTS (ligam via service_id → service_types → company_id)
DROP POLICY IF EXISTS "Authenticated users can view service_cost_resources" ON public.service_cost_resources;
CREATE POLICY "Users view own service_cost_resources" ON public.service_cost_resources FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM service_types st WHERE st.id = service_id AND (st.company_id IS NULL OR st.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

DROP POLICY IF EXISTS "Authenticated users can view service_gifts" ON public.service_gifts;
CREATE POLICY "Users view own service_gifts" ON public.service_gifts FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM service_types st WHERE st.id = service_id AND (st.company_id IS NULL OR st.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));

-- TECHNICIAN_LOCATIONS
DROP POLICY IF EXISTS "Public can view locations by service_order" ON public.technician_locations;
CREATE POLICY "Public view technician_locations via portal" ON public.technician_locations FOR SELECT TO anon
  USING (EXISTS(SELECT 1 FROM service_orders so WHERE so.id = service_order_id AND (is_customer_in_active_portal(so.customer_id) OR EXISTS(SELECT 1 FROM service_ratings sr WHERE sr.service_order_id = so.id))));

-- CUSTOMER_PORTALS (mantém anon por token)
DROP POLICY IF EXISTS "Authenticated can manage portals" ON public.customer_portals;
CREATE POLICY "Users manage own customer_portals" ON public.customer_portals FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM customers c WHERE c.id = customer_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS(SELECT 1 FROM customers c WHERE c.id = customer_id AND (c.company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()))));
