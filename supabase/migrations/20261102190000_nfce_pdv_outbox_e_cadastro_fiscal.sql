-- NFC-e no PDV: cadastro fiscal, configuração fail-closed e outbox durável.
-- Produção nasce desligada para todas as empresas. Venda paga e documento
-- fiscal são estados independentes: rejeição da NFC-e não desfaz caixa/estoque.

-- ---------------------------------------------------------------------------
-- 1) Cadastro fiscal do produto. NULL significa "não configurado"; o worker
-- bloqueia a emissão com plano de ação, nunca inventa tributação.
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS fiscal_ncm text,
  ADD COLUMN IF NOT EXISTS fiscal_cest text,
  ADD COLUMN IF NOT EXISTS fiscal_gtin text,
  ADD COLUMN IF NOT EXISTS fiscal_origin text,
  ADD COLUMN IF NOT EXISTS fiscal_cfop_internal text,
  ADD COLUMN IF NOT EXISTS fiscal_cfop_interstate text,
  ADD COLUMN IF NOT EXISTS fiscal_icms_code text,
  ADD COLUMN IF NOT EXISTS fiscal_pis_cst text,
  ADD COLUMN IF NOT EXISTS fiscal_cofins_cst text,
  ADD COLUMN IF NOT EXISTS fiscal_ipi_cst text,
  ADD COLUMN IF NOT EXISTS fiscal_tax_unit text,
  ADD COLUMN IF NOT EXISTS fiscal_ibs_cbs_cst text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_ncm_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_ncm_check
      CHECK (fiscal_ncm IS NULL OR fiscal_ncm ~ '^[0-9]{8}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_cest_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_cest_check
      CHECK (fiscal_cest IS NULL OR fiscal_cest ~ '^[0-9]{7}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_origin_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_origin_check
      CHECK (fiscal_origin IS NULL OR fiscal_origin ~ '^[0-8]$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_cfop_internal_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_cfop_internal_check
      CHECK (fiscal_cfop_internal IS NULL OR fiscal_cfop_internal ~ '^[1-7][0-9]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_cfop_interstate_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_cfop_interstate_check
      CHECK (fiscal_cfop_interstate IS NULL OR fiscal_cfop_interstate ~ '^[1-7][0-9]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_icms_code_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_icms_code_check
      CHECK (fiscal_icms_code IS NULL OR fiscal_icms_code ~ '^[0-9]{2,3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_pis_cst_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_pis_cst_check
      CHECK (fiscal_pis_cst IS NULL OR fiscal_pis_cst ~ '^[0-9]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_cofins_cst_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_cofins_cst_check
      CHECK (fiscal_cofins_cst IS NULL OR fiscal_cofins_cst ~ '^[0-9]{2}$');
  END IF;
END $$;

COMMENT ON COLUMN public.inventory.fiscal_ncm IS 'NCM de 8 dígitos. NULL bloqueia NF-e/NFC-e do item; nunca preencher por palpite.';
COMMENT ON COLUMN public.inventory.fiscal_gtin IS 'GTIN fiscal. Separado do barcode, que também aceita código interno da loja.';
COMMENT ON COLUMN public.inventory.fiscal_icms_code IS 'CST (2 dígitos) ou CSOSN (3 dígitos), conforme o regime da empresa.';
COMMENT ON COLUMN public.inventory.fiscal_ibs_cbs_cst IS 'CST IBS/CBS configurável; NULL até a contabilidade definir a classificação aplicável.';

-- ---------------------------------------------------------------------------
-- 2) Configuração NFC-e própria, sem UPDATE direto por usuário autenticado.
-- `enabled` é intenção; homologation_approved/production_approved são gates de
-- rollout gravados por edge/admin após credenciamento e testes oficiais.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_nfce_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  homologation_approved boolean NOT NULL DEFAULT false,
  production_approved boolean NOT NULL DEFAULT false,
  uf text,
  series integer NOT NULL DEFAULT 1,
  next_number bigint NOT NULL DEFAULT 1,
  qr_base_url_homologation text,
  access_url_homologation text,
  qr_base_url_production text,
  access_url_production text,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_nfce_settings_uf_check CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  CONSTRAINT company_nfce_settings_series_check CHECK (series BETWEEN 1 AND 889),
  CONSTRAINT company_nfce_settings_next_number_check CHECK (next_number BETWEEN 1 AND 999999999),
  CONSTRAINT company_nfce_settings_production_requires_homologation
    CHECK (NOT production_approved OR homologation_approved)
);

DROP TRIGGER IF EXISTS set_updated_at_company_nfce_settings ON public.company_nfce_settings;
CREATE TRIGGER set_updated_at_company_nfce_settings
  BEFORE UPDATE ON public.company_nfce_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.company_nfce_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages company nfce settings" ON public.company_nfce_settings;
CREATE POLICY "service role manages company nfce settings"
  ON public.company_nfce_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company reads own nfce settings" ON public.company_nfce_settings;
CREATE POLICY "company reads own nfce settings"
  ON public.company_nfce_settings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.company_nfce_settings FROM authenticated, anon;
GRANT SELECT ON public.company_nfce_settings TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Documento fiscal vinculado 1:1 à venda. O status do pedido nunca é usado
-- como substituto do status oficial da SEFAZ.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nfce_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'preparing', 'signed', 'transmitting', 'uncertain',
    'authorized', 'rejected', 'cancellation_pending', 'cancelled'
  )),
  official_status text CHECK (official_status IS NULL OR official_status IN (
    'autorizada', 'cancelada', 'denegada', 'nao_localizada', 'aguardando_confirmacao'
  )),
  environment smallint NOT NULL DEFAULT 2 CHECK (environment IN (1, 2)),
  uf text NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
  series integer NOT NULL CHECK (series BETWEEN 1 AND 889),
  number bigint CHECK (number BETWEEN 1 AND 999999999),
  access_key text CHECK (access_key IS NULL OR access_key ~ '^[0-9]{44}$'),
  protocol text CHECK (protocol IS NULL OR protocol ~ '^[0-9]{15}$'),
  snapshot_hash text CHECK (snapshot_hash IS NULL OR snapshot_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb,
  signed_xml_path text,
  processed_xml_path text,
  danfce_pdf_path text,
  last_error_code text,
  last_error_message text,
  next_action text,
  official_checked_at timestamptz,
  authorized_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nfce_documents_company_order_unique UNIQUE (company_id, order_id),
  CONSTRAINT nfce_documents_company_operation_unique UNIQUE (company_id, operation_id),
  CONSTRAINT nfce_documents_company_key_unique UNIQUE (company_id, access_key)
);

CREATE INDEX IF NOT EXISTS idx_nfce_documents_company_status
  ON public.nfce_documents (company_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_nfce_documents_official_pending
  ON public.nfce_documents (updated_at)
  WHERE status IN ('transmitting', 'uncertain', 'cancellation_pending');

DROP TRIGGER IF EXISTS set_updated_at_nfce_documents ON public.nfce_documents;
CREATE TRIGGER set_updated_at_nfce_documents
  BEFORE UPDATE ON public.nfce_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.nfce_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages nfce documents" ON public.nfce_documents;
CREATE POLICY "service role manages nfce documents"
  ON public.nfce_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company reads own nfce documents" ON public.nfce_documents;
CREATE POLICY "company reads own nfce documents"
  ON public.nfce_documents FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.nfce_documents FROM authenticated, anon;
GRANT SELECT ON public.nfce_documents TO authenticated;

CREATE TABLE IF NOT EXISTS public.nfce_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL UNIQUE REFERENCES public.nfce_documents(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'retry', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nfce_outbox_due
  ON public.nfce_outbox (next_attempt_at, created_at)
  WHERE state IN ('pending', 'retry');
ALTER TABLE public.nfce_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages nfce outbox" ON public.nfce_outbox;
CREATE POLICY "service role manages nfce outbox"
  ON public.nfce_outbox FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.nfce_outbox FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.nfce_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.nfce_documents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text,
  official_status text,
  cstat text,
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nfce_events_document
  ON public.nfce_events (document_id, created_at DESC);
ALTER TABLE public.nfce_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages nfce events" ON public.nfce_events;
CREATE POLICY "service role manages nfce events"
  ON public.nfce_events FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company reads own nfce events" ON public.nfce_events;
CREATE POLICY "company reads own nfce events"
  ON public.nfce_events FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id((SELECT auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.nfce_events FROM authenticated, anon;
GRANT SELECT ON public.nfce_events TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Cross-tenant e enfileiramento. A venda paga só cria pendência quando a
-- configuração foi aprovada em homologação; default false = zero impacto.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nfce_assert_document_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order_company uuid;
BEGIN
  SELECT company_id INTO v_order_company FROM public.pdv_orders WHERE id = NEW.order_id;
  IF v_order_company IS NULL OR v_order_company <> NEW.company_id THEN
    RAISE EXCEPTION 'O pedido da NFC-e não pertence à empresa informada.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_nfce_document_tenant ON public.nfce_documents;
CREATE TRIGGER tg_nfce_document_tenant
  BEFORE INSERT OR UPDATE OF company_id, order_id ON public.nfce_documents
  FOR EACH ROW EXECUTE FUNCTION public.nfce_assert_document_tenant();

CREATE OR REPLACE FUNCTION public.queue_nfce_after_paid_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.company_nfce_settings;
  v_document_id uuid;
BEGIN
  IF NEW.status <> 'pago' OR (TG_OP = 'UPDATE' AND OLD.status = 'pago') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_config
  FROM public.company_nfce_settings
  WHERE company_id = NEW.company_id
    AND enabled = true
    AND homologation_approved = true;

  IF NOT FOUND OR v_config.uf IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.nfce_documents (
    company_id, order_id, environment, uf, series, status
  ) VALUES (
    NEW.company_id, NEW.id, 2, v_config.uf, v_config.series, 'queued'
  )
  ON CONFLICT (company_id, order_id) DO NOTHING
  RETURNING id INTO v_document_id;

  IF v_document_id IS NOT NULL THEN
    INSERT INTO public.nfce_outbox (company_id, document_id)
    VALUES (NEW.company_id, v_document_id)
    ON CONFLICT (document_id) DO NOTHING;

    INSERT INTO public.nfce_events (
      company_id, document_id, event_type, status, message
    ) VALUES (
      NEW.company_id, v_document_id, 'queued_after_sale', 'queued',
      'Venda paga; NFC-e aguardando preparação fiscal.'
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_nfce_after_paid_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_queue_nfce_after_paid_order ON public.pdv_orders;
CREATE TRIGGER tg_queue_nfce_after_paid_order
  AFTER INSERT OR UPDATE OF status ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.queue_nfce_after_paid_order();

-- Provas estruturais: RLS ativa e nenhum write direto do tenant.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nfce_documents'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nfce_events'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nfce_outbox'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.company_nfce_settings'::regclass) THEN
    RAISE EXCEPTION 'RLS precisa estar ativa em todas as tabelas NFC-e.';
  END IF;
  IF has_table_privilege('authenticated', 'public.nfce_documents', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.nfce_outbox', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'ACL NFC-e permite acesso direto indevido ao tenant.';
  END IF;
END $$;
