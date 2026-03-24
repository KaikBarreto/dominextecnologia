
-- Add company_id and is_system to financial_categories
ALTER TABLE public.financial_categories ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.financial_categories ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Drop old RLS policies
DROP POLICY IF EXISTS "Authenticated users can view financial_categories" ON public.financial_categories;
DROP POLICY IF EXISTS "System managers can manage financial_categories" ON public.financial_categories;

-- New RLS: users see categories of their company
CREATE POLICY "Users can view own company categories"
ON public.financial_categories FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

-- Managers can insert/update/delete non-system categories of their company
CREATE POLICY "Managers can manage own company categories"
ON public.financial_categories FOR ALL TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND can_manage_system(auth.uid()))
WITH CHECK (company_id = get_user_company_id(auth.uid()) AND can_manage_system(auth.uid()));

-- Prevent deletion of system categories
CREATE POLICY "Cannot delete system categories"
ON public.financial_categories FOR DELETE TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND is_system = false AND can_manage_system(auth.uid()));
