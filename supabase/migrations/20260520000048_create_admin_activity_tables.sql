-- ============================================================
-- Tabelas para o painel admin Auctus (super_admin):
-- - usage_events: eventos de uso por empresa (engajamento)
-- - subscription_history: histórico de mudanças de plano/status
--
-- IMPORTANTE PRIVACIDADE/LGPD: usage_events.metadata é jsonb,
-- mas NÃO deve armazenar PII (CPF, email, endereço completo).
-- Limitar a path, os_id, lead_id, etc. — identificadores opacos.
-- ============================================================

-- ===== usage_events =====
CREATE TABLE public.usage_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,  -- ex: 'login' | 'page_view' | 'sale' | 'os_completion'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_company_id_created_at
  ON public.usage_events(company_id, created_at DESC);
CREATE INDEX idx_usage_events_event_type
  ON public.usage_events(event_type);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Super admin Auctus lê todos os eventos (para painel master)
CREATE POLICY "super_admin reads all usage_events"
ON public.usage_events FOR SELECT
USING (is_super_admin(auth.uid()));

-- Usuários autenticados inserem eventos da própria empresa (instrumentação client)
CREATE POLICY "authenticated users insert usage_events for own company"
ON public.usage_events FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND company_id = get_user_company_id(auth.uid())
);

-- ===== subscription_history =====
CREATE TABLE public.subscription_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_plan TEXT,
  new_plan TEXT,
  previous_value NUMERIC,
  new_value NUMERIC,
  previous_status TEXT,
  new_status TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscription_history_company_id_created_at
  ON public.subscription_history(company_id, created_at DESC);

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

-- Apenas super_admin acessa esse log
CREATE POLICY "super_admin reads subscription_history"
ON public.subscription_history FOR SELECT
USING (is_super_admin(auth.uid()));

CREATE POLICY "super_admin inserts subscription_history"
ON public.subscription_history FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));
