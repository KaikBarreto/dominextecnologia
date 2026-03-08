
-- ============================================================
-- TIME TRACKING MODULE — Tables, RLS, Storage, Realtime
-- ============================================================

-- 1. time_records: individual punch events
CREATE TABLE public.time_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  user_id uuid NOT NULL,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('clock_in','break_start','break_end','clock_out')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  address text,
  photo_url text,
  device_info jsonb,
  source text DEFAULT 'app' CHECK (source IN ('app','admin','manual')),
  notes text,
  is_valid boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2. time_sheets: daily summary per user
CREATE TABLE public.time_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  user_id uuid NOT NULL,
  date date NOT NULL,
  first_clock_in timestamptz,
  last_clock_out timestamptz,
  total_worked_min integer,
  total_break_min integer,
  expected_min integer DEFAULT 480,
  balance_min integer,
  status text DEFAULT 'open' CHECK (status IN ('open','complete','incomplete','justified','holiday','day_off')),
  justified_by uuid,
  justification text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, user_id, date)
);

-- 3. time_schedules: weekly schedule per user
CREATE TABLE public.time_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL,
  user_id uuid NOT NULL,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  expected_in time NOT NULL,
  expected_out time NOT NULL,
  break_minutes integer DEFAULT 60,
  is_work_day boolean DEFAULT true
);

-- 4. time_settings: company-wide time tracking config
CREATE TABLE public.time_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) NOT NULL UNIQUE,
  default_in time NOT NULL DEFAULT '08:00',
  default_out time NOT NULL DEFAULT '17:00',
  default_break_min integer DEFAULT 60,
  require_selfie boolean DEFAULT true,
  require_geolocation boolean DEFAULT true,
  max_radius_meters integer DEFAULT 0,
  allow_off_hours boolean DEFAULT true,
  late_tolerance_min integer DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE public.time_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_settings ENABLE ROW LEVEL SECURITY;

-- time_records: tecnico sees own, admin sees company
CREATE POLICY "Users can view own time_records"
  ON public.time_records FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin can view company time_records"
  ON public.time_records FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

CREATE POLICY "Users can insert own time_records"
  ON public.time_records FOR INSERT
  WITH CHECK (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin can insert time_records"
  ON public.time_records FOR INSERT
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

CREATE POLICY "Admin can update time_records"
  ON public.time_records FOR UPDATE
  USING (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

-- time_sheets: same pattern
CREATE POLICY "Users can view own time_sheets"
  ON public.time_sheets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin can view company time_sheets"
  ON public.time_sheets FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

CREATE POLICY "Users can insert own time_sheets"
  ON public.time_sheets FOR INSERT
  WITH CHECK (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin can manage time_sheets"
  ON public.time_sheets FOR ALL
  USING (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

CREATE POLICY "Users can update own time_sheets"
  ON public.time_sheets FOR UPDATE
  USING (user_id = auth.uid() AND company_id = get_user_company_id(auth.uid()));

-- time_schedules
CREATE POLICY "Users can view own schedule"
  ON public.time_schedules FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin can manage schedules"
  ON public.time_schedules FOR ALL
  USING (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

-- time_settings
CREATE POLICY "Users can view time_settings"
  ON public.time_settings FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admin can manage time_settings"
  ON public.time_settings FOR ALL
  USING (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_admin_or_gestor(auth.uid()));

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('time-photos', 'time-photos', true);

CREATE POLICY "Anyone can view time photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'time-photos');

CREATE POLICY "Authenticated users can upload time photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'time-photos' AND auth.uid() IS NOT NULL);

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.time_records;
