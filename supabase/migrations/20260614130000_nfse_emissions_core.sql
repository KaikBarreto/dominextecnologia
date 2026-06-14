-- Módulo Notas Fiscais (NFS-e) — integração Fisqal
-- Cria 3 tabelas tenant: config fiscal 1:1, emissões e log append-only de eventos.
-- Regra de RLS definida por Plataforma; aqui só a implementação SQL.
-- Nomes distintos de propósito (evita colisão/sobrescrita de policy de tabela tenant existente).
-- Funções canônicas: get_user_company_id(auth.uid()) e can_manage_system(auth.uid()).
-- Sem ramo is_super_admin nem company_id IS NULL (vazamento conhecido).

-- ============================================================
-- Tabela 1: company_fiscal_settings (config fiscal 1:1 por empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_fiscal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  inscricao_municipal text,
  inscricao_estadual text,
  regime_tributario text,
  codigo_servico_default text,
  item_lc116 text,
  iss_aliquota numeric(5,2),
  fisqal_company_id text,
  fisqal_certificate_id text,
  certificate_expires_at timestamptz,
  fiscal_ambiente text NOT NULL DEFAULT 'homologacao',
  serie_dps text,
  ultimo_numero_dps bigint NOT NULL DEFAULT 0,
  municipio_ibge text,
  pode_emitir boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at_company_fiscal_settings ON public.company_fiscal_settings;
CREATE TRIGGER set_updated_at_company_fiscal_settings
  BEFORE UPDATE ON public.company_fiscal_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.company_fiscal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_company_fiscal_settings" ON public.company_fiscal_settings;
CREATE POLICY "service_role_full_access_company_fiscal_settings"
  ON public.company_fiscal_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view fiscal settings from their company" ON public.company_fiscal_settings;
CREATE POLICY "Users can view fiscal settings from their company"
  ON public.company_fiscal_settings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Managers can insert fiscal settings for their company" ON public.company_fiscal_settings;
CREATE POLICY "Managers can insert fiscal settings for their company"
  ON public.company_fiscal_settings FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  );

DROP POLICY IF EXISTS "Managers can update fiscal settings for their company" ON public.company_fiscal_settings;
CREATE POLICY "Managers can update fiscal settings for their company"
  ON public.company_fiscal_settings FOR UPDATE TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.can_manage_system(auth.uid())
  );
-- DELETE: sem policy authenticated (negado pro tenant).

-- ============================================================
-- Tabela 2: nfse_emissions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nfse_emissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  financial_transaction_id uuid REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  fisqal_dps_id text,
  fisqal_fiscal_request_id text,
  numero_nfse text,
  chave_acesso text,
  protocolo text,
  pdf_url text,
  xml_url text,
  valor_servico numeric(12,2),
  valor_iss numeric(12,2),
  descricao_servico text,
  idempotency_key text,
  error_message text,
  emitida_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT nfse_emissions_company_idempotency_key UNIQUE (company_id, idempotency_key)
);

DROP TRIGGER IF EXISTS set_updated_at_nfse_emissions ON public.nfse_emissions;
CREATE TRIGGER set_updated_at_nfse_emissions
  BEFORE UPDATE ON public.nfse_emissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_nfse_emissions_company_id ON public.nfse_emissions (company_id);
CREATE INDEX IF NOT EXISTS idx_nfse_emissions_service_order_id ON public.nfse_emissions (service_order_id);
CREATE INDEX IF NOT EXISTS idx_nfse_emissions_status ON public.nfse_emissions (status);

ALTER TABLE public.nfse_emissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_nfse_emissions" ON public.nfse_emissions;
CREATE POLICY "service_role_full_access_nfse_emissions"
  ON public.nfse_emissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view nfse emissions from their company" ON public.nfse_emissions;
CREATE POLICY "Users can view nfse emissions from their company"
  ON public.nfse_emissions FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
-- INSERT/UPDATE/DELETE: sem policy authenticated (escrita só via edge service_role).

-- ============================================================
-- Tabela 3: nfse_events (log append-only; company_id denormalizado)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nfse_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nfse_emission_id uuid NOT NULL REFERENCES public.nfse_emissions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nfse_events_emission_id ON public.nfse_events (nfse_emission_id);
CREATE INDEX IF NOT EXISTS idx_nfse_events_company_id ON public.nfse_events (company_id);

ALTER TABLE public.nfse_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_nfse_events" ON public.nfse_events;
CREATE POLICY "service_role_full_access_nfse_events"
  ON public.nfse_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view nfse events from their company" ON public.nfse_events;
CREATE POLICY "Users can view nfse events from their company"
  ON public.nfse_events FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
-- INSERT/UPDATE/DELETE: sem policy authenticated.
