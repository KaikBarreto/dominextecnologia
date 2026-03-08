
-- Add employee_id to time_records
ALTER TABLE public.time_records ADD COLUMN employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.time_records ALTER COLUMN user_id DROP NOT NULL;

-- Add employee_id to time_sheets
ALTER TABLE public.time_sheets ADD COLUMN employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.time_sheets ALTER COLUMN user_id DROP NOT NULL;
-- Drop old unique constraint and add new one
ALTER TABLE public.time_sheets DROP CONSTRAINT IF EXISTS time_sheets_company_id_user_id_date_key;
ALTER TABLE public.time_sheets ADD CONSTRAINT time_sheets_company_id_employee_id_date_key UNIQUE(company_id, employee_id, date);

-- Add employee_id to time_schedules
ALTER TABLE public.time_schedules ADD COLUMN employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.time_schedules ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS policies for time_records to support employee_id based access
DROP POLICY IF EXISTS "Admin can insert time_records" ON public.time_records;
DROP POLICY IF EXISTS "Admin can update time_records" ON public.time_records;
DROP POLICY IF EXISTS "Admin can view company time_records" ON public.time_records;
DROP POLICY IF EXISTS "Users can insert own time_records" ON public.time_records;
DROP POLICY IF EXISTS "Users can view own time_records" ON public.time_records;

CREATE POLICY "Admin can manage time_records" ON public.time_records
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

CREATE POLICY "Users can insert own time_records" ON public.time_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can view own time_records" ON public.time_records
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Update RLS policies for time_sheets
DROP POLICY IF EXISTS "Admin can manage time_sheets" ON public.time_sheets;
DROP POLICY IF EXISTS "Users can view own time_sheets" ON public.time_sheets;
DROP POLICY IF EXISTS "Users can manage own time_sheets" ON public.time_sheets;

CREATE POLICY "Admin can manage time_sheets" ON public.time_sheets
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

CREATE POLICY "Users can view own time_sheets" ON public.time_sheets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own time_sheets" ON public.time_sheets
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Update RLS for time_schedules
DROP POLICY IF EXISTS "Admin can manage schedules" ON public.time_schedules;
DROP POLICY IF EXISTS "Users can view own schedule" ON public.time_schedules;

CREATE POLICY "Admin can manage schedules" ON public.time_schedules
  FOR ALL TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

CREATE POLICY "Users can view own schedule" ON public.time_schedules
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
