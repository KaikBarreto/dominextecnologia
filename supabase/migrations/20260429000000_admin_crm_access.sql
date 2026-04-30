-- =============================================
-- Allow non-master admin users (vendedores) with the `admin_crm` permission to
-- read and manage admin CRM data. Previous policies were super_admin-only,
-- which made the admin CRM screen empty for vendedores even when they had the
-- "CRM" permission granted in admin_permissions.
-- =============================================

CREATE OR REPLACE FUNCTION public.has_admin_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_permissions
    WHERE user_id = _user_id
      AND permission = _permission
  );
$$;

-- ---------------------------------------------------------------------------
-- admin_crm_stages: stages are global to the admin panel; any admin user with
-- CRM access needs to read them. Writes still require super_admin.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin CRM users can view admin_crm_stages" ON public.admin_crm_stages;
CREATE POLICY "Admin CRM users can view admin_crm_stages"
  ON public.admin_crm_stages FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

-- ---------------------------------------------------------------------------
-- admin_leads: every vendedor with admin_crm sees ALL leads (regardless of
-- who is assigned), per product requirement.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin CRM users can view admin_leads" ON public.admin_leads;
CREATE POLICY "Admin CRM users can view admin_leads"
  ON public.admin_leads FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

DROP POLICY IF EXISTS "Admin CRM users can insert admin_leads" ON public.admin_leads;
CREATE POLICY "Admin CRM users can insert admin_leads"
  ON public.admin_leads FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

DROP POLICY IF EXISTS "Admin CRM users can update admin_leads" ON public.admin_leads;
CREATE POLICY "Admin CRM users can update admin_leads"
  ON public.admin_leads FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

DROP POLICY IF EXISTS "Admin CRM users can delete admin_leads" ON public.admin_leads;
CREATE POLICY "Admin CRM users can delete admin_leads"
  ON public.admin_leads FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

-- ---------------------------------------------------------------------------
-- admin_lead_interactions: same access model as admin_leads.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin CRM users can view admin_lead_interactions" ON public.admin_lead_interactions;
CREATE POLICY "Admin CRM users can view admin_lead_interactions"
  ON public.admin_lead_interactions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

DROP POLICY IF EXISTS "Admin CRM users can insert admin_lead_interactions" ON public.admin_lead_interactions;
CREATE POLICY "Admin CRM users can insert admin_lead_interactions"
  ON public.admin_lead_interactions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

DROP POLICY IF EXISTS "Admin CRM users can update admin_lead_interactions" ON public.admin_lead_interactions;
CREATE POLICY "Admin CRM users can update admin_lead_interactions"
  ON public.admin_lead_interactions FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );

DROP POLICY IF EXISTS "Admin CRM users can delete admin_lead_interactions" ON public.admin_lead_interactions;
CREATE POLICY "Admin CRM users can delete admin_lead_interactions"
  ON public.admin_lead_interactions FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_admin_permission(auth.uid(), 'admin_crm')
  );
