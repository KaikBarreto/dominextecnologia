
-- 1. Create can_manage_system function
CREATE OR REPLACE FUNCTION public.can_manage_system(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.is_admin_or_gestor(_user_id)
    OR public.has_full_permissions(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions
      WHERE user_id = _user_id
        AND is_active = true
        AND permissions @> '"fn:manage_settings"'::jsonb
    )
  )
$$;

-- 2. Drop old policies on user_roles (duplicates of can_manage_users)
DROP POLICY IF EXISTS "Admins and gestors can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins and gestors can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins and gestors can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins and gestors can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

-- 3. Update company_settings
DROP POLICY IF EXISTS "Admin/gestor can manage company_settings" ON public.company_settings;
CREATE POLICY "System managers can manage company_settings" ON public.company_settings FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 4. Update crm_stages
DROP POLICY IF EXISTS "Admin/gestor can manage crm_stages" ON public.crm_stages;
CREATE POLICY "System managers can manage crm_stages" ON public.crm_stages FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 5. Update equipment_categories
DROP POLICY IF EXISTS "Admin/gestor can manage equipment_categories" ON public.equipment_categories;
CREATE POLICY "System managers can manage equipment_categories" ON public.equipment_categories FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 6. Update equipment_field_config
DROP POLICY IF EXISTS "Admin/gestor can manage equipment_field_config" ON public.equipment_field_config;
CREATE POLICY "System managers can manage equipment_field_config" ON public.equipment_field_config FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 7. Update financial_categories
DROP POLICY IF EXISTS "Admin/gestor can manage financial_categories" ON public.financial_categories;
CREATE POLICY "System managers can manage financial_categories" ON public.financial_categories FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 8. Update form_questions
DROP POLICY IF EXISTS "Admin/gestor can manage form_questions" ON public.form_questions;
CREATE POLICY "System managers can manage form_questions" ON public.form_questions FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 9. Update form_templates
DROP POLICY IF EXISTS "Admin/gestor can manage form_templates" ON public.form_templates;
CREATE POLICY "System managers can manage form_templates" ON public.form_templates FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 10. Update os_config
DROP POLICY IF EXISTS "Admin/gestor can manage os_config" ON public.os_config;
CREATE POLICY "System managers can manage os_config" ON public.os_config FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 11. Update os_required_fields
DROP POLICY IF EXISTS "Admin/gestor can manage os_required_fields" ON public.os_required_fields;
CREATE POLICY "System managers can manage os_required_fields" ON public.os_required_fields FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 12. Update os_sla_config
DROP POLICY IF EXISTS "Admin/gestor can manage os_sla_config" ON public.os_sla_config;
CREATE POLICY "System managers can manage os_sla_config" ON public.os_sla_config FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 13. Update os_statuses
DROP POLICY IF EXISTS "Admin/gestor can manage os_statuses" ON public.os_statuses;
CREATE POLICY "System managers can manage os_statuses" ON public.os_statuses FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 14. Update proposal_templates
DROP POLICY IF EXISTS "Admin/gestor can manage proposal_templates" ON public.proposal_templates;
CREATE POLICY "System managers can manage proposal_templates" ON public.proposal_templates FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 15. Update service_types (3 separate policies)
DROP POLICY IF EXISTS "Admin/gestor can delete service types" ON public.service_types;
DROP POLICY IF EXISTS "Admin/gestor can insert service types" ON public.service_types;
DROP POLICY IF EXISTS "Admin/gestor can update service types" ON public.service_types;
CREATE POLICY "System managers can manage service_types" ON public.service_types FOR ALL TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 16. Update profiles - admin update
DROP POLICY IF EXISTS "Admin/gestor can update any profile" ON public.profiles;
CREATE POLICY "System managers can update any profile" ON public.profiles FOR UPDATE TO authenticated
  USING (can_manage_system(auth.uid()))
  WITH CHECK (can_manage_system(auth.uid()));

-- 17. Update profiles - admin view
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "System managers can view all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (can_manage_system(auth.uid()));

-- 18. Update inventory_movements - admin insert
DROP POLICY IF EXISTS "Admins can create any movement" ON public.inventory_movements;
CREATE POLICY "System managers can create any movement" ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (can_manage_system(auth.uid()));

-- 19. Update inventory_movements - user OS insert (replace is_admin_or_gestor inside)
DROP POLICY IF EXISTS "Users can create movements for their OS" ON public.inventory_movements;
CREATE POLICY "Users can create movements for their OS" ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (
    (service_order_id IS NULL) OR (EXISTS (
      SELECT 1 FROM service_orders so
      WHERE so.id = inventory_movements.service_order_id
        AND (so.technician_id = auth.uid() OR so.created_by = auth.uid() OR can_manage_system(auth.uid()))
    ))
  );

-- 20. Update technician_locations
DROP POLICY IF EXISTS "Admin/gestor can view all locations" ON public.technician_locations;
CREATE POLICY "System managers can view all locations" ON public.technician_locations FOR SELECT TO authenticated
  USING (can_manage_system(auth.uid()));

-- 21. Update os_photos - insert policy
DROP POLICY IF EXISTS "Users can add photos to own OS" ON public.os_photos;
CREATE POLICY "Users can add photos to own OS" ON public.os_photos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM service_orders so
      WHERE so.id = os_photos.service_order_id
        AND (so.technician_id = auth.uid() OR so.created_by = auth.uid() OR can_manage_system(auth.uid()))
    )
  );

-- 22. Update time_records
DROP POLICY IF EXISTS "Admin can manage time_records" ON public.time_records;
CREATE POLICY "Admin can manage time_records" ON public.time_records FOR ALL TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())) AND can_manage_system(auth.uid()))
  WITH CHECK ((company_id = get_user_company_id(auth.uid())) AND can_manage_system(auth.uid()));

-- 23. Update time_schedules
DROP POLICY IF EXISTS "Admin can manage schedules" ON public.time_schedules;
CREATE POLICY "Admin can manage schedules" ON public.time_schedules FOR ALL TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())) AND can_manage_system(auth.uid()))
  WITH CHECK ((company_id = get_user_company_id(auth.uid())) AND can_manage_system(auth.uid()));

-- 24. Update time_settings
DROP POLICY IF EXISTS "Admin can manage time_settings" ON public.time_settings;
CREATE POLICY "Admin can manage time_settings" ON public.time_settings FOR ALL TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())) AND can_manage_system(auth.uid()))
  WITH CHECK ((company_id = get_user_company_id(auth.uid())) AND can_manage_system(auth.uid()));

-- 25. Update time_sheets
DROP POLICY IF EXISTS "Admin can manage time_sheets" ON public.time_sheets;
CREATE POLICY "Admin can manage time_sheets" ON public.time_sheets FOR ALL TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())) AND can_manage_system(auth.uid()))
  WITH CHECK ((company_id = get_user_company_id(auth.uid())) AND can_manage_system(auth.uid()));

DROP POLICY IF EXISTS "Admin can view company time_sheets" ON public.time_sheets;
CREATE POLICY "Admin can view company time_sheets" ON public.time_sheets FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())) AND can_manage_system(auth.uid()));
