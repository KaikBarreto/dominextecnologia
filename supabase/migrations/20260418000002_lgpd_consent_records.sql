-- =============================================================================
-- LGPD: Tabela de registro de consentimento (Art. 8º §2º — ônus da prova)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  revoked_at timestamptz,
  CONSTRAINT consent_records_purpose_check CHECK (
    purpose IN (
      'registration',
      'terms_of_use',
      'privacy_policy',
      'marketing',
      'gps_tracking',
      'biometric_time_record',
      'cookie_essential',
      'cookie_analytics'
    )
  )
);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

-- Usuário pode ver apenas seus próprios consentimentos
CREATE POLICY "Users can view own consent records"
  ON public.consent_records FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Usuário pode inserir seus próprios consentimentos
CREATE POLICY "Users can insert own consent records"
  ON public.consent_records FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Administradores da empresa podem ver consentimentos da empresa
CREATE POLICY "Managers can view company consent records"
  ON public.consent_records FOR SELECT
  TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND can_manage_system(auth.uid())
  );

-- Índices para consultas LGPD
CREATE INDEX IF NOT EXISTS consent_records_user_id_idx ON public.consent_records(user_id);
CREATE INDEX IF NOT EXISTS consent_records_company_id_idx ON public.consent_records(company_id);
CREATE INDEX IF NOT EXISTS consent_records_purpose_idx ON public.consent_records(purpose);

-- Campo deletion_requested_at em profiles para exercício do direito de exclusão (Art. 18)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz DEFAULT NULL;
