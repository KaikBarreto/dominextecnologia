-- NF-e modelo 55 + complemento da NFC-e modelo 65.
-- Persistência própria, idempotente e isolada por company_id. O navegador só
-- lê documentos e chama Edge Functions; certificado, numeração e transmissão
-- continuam exclusivamente no backend privilegiado.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fiscal-artifacts', 'fiscal-artifacts', false, 10485760, ARRAY['application/xml', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS fiscal_icms_rate numeric(7,4),
  ADD COLUMN IF NOT EXISTS fiscal_icms_reduction_rate numeric(7,4),
  ADD COLUMN IF NOT EXISTS fiscal_pis_rate numeric(7,4),
  ADD COLUMN IF NOT EXISTS fiscal_cofins_rate numeric(7,4),
  ADD COLUMN IF NOT EXISTS fiscal_ipi_rate numeric(7,4),
  ADD COLUMN IF NOT EXISTS fiscal_cfop_entry_internal text,
  ADD COLUMN IF NOT EXISTS fiscal_cfop_entry_interstate text,
  ADD COLUMN IF NOT EXISTS fiscal_cfop_exit_internal text,
  ADD COLUMN IF NOT EXISTS fiscal_cfop_exit_interstate text;

UPDATE public.inventory SET
  fiscal_cfop_exit_internal = coalesce(fiscal_cfop_exit_internal, fiscal_cfop_internal),
  fiscal_cfop_exit_interstate = coalesce(fiscal_cfop_exit_interstate, fiscal_cfop_interstate)
WHERE fiscal_cfop_exit_internal IS NULL OR fiscal_cfop_exit_interstate IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_rates_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_rates_check CHECK (
      (fiscal_icms_rate IS NULL OR fiscal_icms_rate BETWEEN 0 AND 100) AND
      (fiscal_icms_reduction_rate IS NULL OR fiscal_icms_reduction_rate BETWEEN 0 AND 100) AND
      (fiscal_pis_rate IS NULL OR fiscal_pis_rate BETWEEN 0 AND 100) AND
      (fiscal_cofins_rate IS NULL OR fiscal_cofins_rate BETWEEN 0 AND 100) AND
      (fiscal_ipi_rate IS NULL OR fiscal_ipi_rate BETWEEN 0 AND 100)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_fiscal_directional_cfop_check') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_fiscal_directional_cfop_check CHECK (
      (fiscal_cfop_entry_internal IS NULL OR fiscal_cfop_entry_internal ~ '^[1-3][0-9]{3}$') AND
      (fiscal_cfop_entry_interstate IS NULL OR fiscal_cfop_entry_interstate ~ '^[1-3][0-9]{3}$') AND
      (fiscal_cfop_exit_internal IS NULL OR fiscal_cfop_exit_internal ~ '^[5-7][0-9]{3}$') AND
      (fiscal_cfop_exit_interstate IS NULL OR fiscal_cfop_exit_interstate ~ '^[5-7][0-9]{3}$')
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.company_nfe_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  homologation_approved boolean NOT NULL DEFAULT false,
  production_approved boolean NOT NULL DEFAULT false,
  series integer NOT NULL DEFAULT 1 CHECK (series BETWEEN 0 AND 889),
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number BETWEEN 1 AND 999999999),
  default_operation_nature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_nfe_settings_production_requires_homologation
    CHECK (NOT production_approved OR homologation_approved)
);

DROP TRIGGER IF EXISTS set_updated_at_company_nfe_settings ON public.company_nfe_settings;
CREATE TRIGGER set_updated_at_company_nfe_settings BEFORE UPDATE ON public.company_nfe_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.company_nfe_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages company nfe settings" ON public.company_nfe_settings;
CREATE POLICY "service role manages company nfe settings" ON public.company_nfe_settings
FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company reads own nfe settings" ON public.company_nfe_settings;
CREATE POLICY "company reads own nfe settings" ON public.company_nfe_settings
FOR SELECT TO authenticated USING (company_id = public.get_user_company_id((SELECT auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.company_nfe_settings FROM authenticated, anon;
GRANT SELECT ON public.company_nfe_settings TO authenticated;

CREATE TABLE IF NOT EXISTS public.nfe_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN (
    'manual', 'pdv_sale', 'pdv_purchase', 'inventory_purchase'
  )),
  source_id uuid,
  direction text NOT NULL CHECK (direction IN ('entrada', 'saida')),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'queued', 'preparing', 'signed', 'transmitting', 'uncertain',
    'authorized', 'rejected', 'cancellation_pending', 'cancelled'
  )),
  official_status text CHECK (official_status IS NULL OR official_status IN (
    'autorizada', 'cancelada', 'denegada', 'nao_localizada', 'aguardando_confirmacao'
  )),
  environment smallint NOT NULL DEFAULT 2 CHECK (environment IN (1, 2)),
  uf text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  series integer CHECK (series IS NULL OR series BETWEEN 0 AND 889),
  number bigint CHECK (number IS NULL OR number BETWEEN 1 AND 999999999),
  access_key text CHECK (access_key IS NULL OR access_key ~ '^[0-9]{44}$'),
  protocol text CHECK (protocol IS NULL OR protocol ~ '^[0-9]{15}$'),
  snapshot_hash text CHECK (snapshot_hash IS NULL OR snapshot_hash ~ '^[0-9a-f]{64}$'),
  draft_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot jsonb,
  signed_xml_path text,
  processed_xml_path text,
  danfe_pdf_path text,
  last_error_code text,
  last_error_message text,
  next_action text,
  official_checked_at timestamptz,
  authorized_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nfe_documents_company_operation_unique UNIQUE (company_id, operation_id),
  CONSTRAINT nfe_documents_company_key_unique UNIQUE (company_id, access_key),
  CONSTRAINT nfe_documents_source_direction CHECK (
    (direction = 'saida' AND source_type IN ('manual', 'pdv_sale')) OR
    (direction = 'entrada' AND source_type IN ('manual', 'pdv_purchase', 'inventory_purchase'))
  ),
  CONSTRAINT nfe_documents_party_direction CHECK (
    NOT (customer_id IS NOT NULL AND supplier_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nfe_documents_company_source
ON public.nfe_documents(company_id, source_type, source_id)
WHERE source_id IS NOT NULL AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_nfe_documents_company_status
ON public.nfe_documents(company_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_nfe_documents_official_pending ON public.nfe_documents(updated_at)
WHERE status IN ('transmitting', 'uncertain', 'cancellation_pending');

DROP TRIGGER IF EXISTS set_updated_at_nfe_documents ON public.nfe_documents;
CREATE TRIGGER set_updated_at_nfe_documents BEFORE UPDATE ON public.nfe_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.nfe_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages nfe documents" ON public.nfe_documents;
CREATE POLICY "service role manages nfe documents" ON public.nfe_documents
FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company reads own nfe documents" ON public.nfe_documents;
CREATE POLICY "company reads own nfe documents" ON public.nfe_documents
FOR SELECT TO authenticated USING (company_id = public.get_user_company_id((SELECT auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.nfe_documents FROM authenticated, anon;
GRANT SELECT ON public.nfe_documents TO authenticated;

CREATE TABLE IF NOT EXISTS public.nfe_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL UNIQUE REFERENCES public.nfe_documents(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_nfe_outbox_due ON public.nfe_outbox(next_attempt_at, created_at)
WHERE state IN ('pending', 'retry');
ALTER TABLE public.nfe_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages nfe outbox" ON public.nfe_outbox;
CREATE POLICY "service role manages nfe outbox" ON public.nfe_outbox
FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.nfe_outbox FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.nfe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.nfe_documents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text,
  official_status text,
  cstat text,
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nfe_events_document ON public.nfe_events(document_id, created_at DESC);
ALTER TABLE public.nfe_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages nfe events" ON public.nfe_events;
CREATE POLICY "service role manages nfe events" ON public.nfe_events
FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company reads own nfe events" ON public.nfe_events;
CREATE POLICY "company reads own nfe events" ON public.nfe_events
FOR SELECT TO authenticated USING (company_id = public.get_user_company_id((SELECT auth.uid())));
REVOKE INSERT, UPDATE, DELETE ON public.nfe_events FROM authenticated, anon;
GRANT SELECT ON public.nfe_events TO authenticated;

-- NFC-e manual e importada: preserva o gatilho do PDV e torna order_id
-- opcional para o modal fiscal. A origem impede associação ambígua.
ALTER TABLE public.nfce_documents ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'pdv_sale';
ALTER TABLE public.nfce_documents ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE public.nfce_documents ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.nfce_documents ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.nfce_documents ADD COLUMN IF NOT EXISTS draft_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.nfce_documents ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.nfce_documents ALTER COLUMN status SET DEFAULT 'draft';
UPDATE public.nfce_documents SET source_id = order_id WHERE source_id IS NULL AND order_id IS NOT NULL;
ALTER TABLE public.nfce_documents DROP CONSTRAINT IF EXISTS nfce_documents_company_order_unique;
ALTER TABLE public.nfce_documents DROP CONSTRAINT IF EXISTS nfce_documents_status_check;
ALTER TABLE public.nfce_documents ADD CONSTRAINT nfce_documents_status_check CHECK (status IN (
  'draft', 'queued', 'preparing', 'signed', 'transmitting', 'uncertain',
  'authorized', 'rejected', 'cancellation_pending', 'cancelled'
));
ALTER TABLE public.nfce_documents DROP CONSTRAINT IF EXISTS nfce_documents_source_type_check;
ALTER TABLE public.nfce_documents ADD CONSTRAINT nfce_documents_source_type_check
CHECK (source_type IN ('manual', 'pdv_sale'));
ALTER TABLE public.nfce_documents DROP CONSTRAINT IF EXISTS nfce_documents_source_consistency;
ALTER TABLE public.nfce_documents ADD CONSTRAINT nfce_documents_source_consistency CHECK (
  (source_type = 'manual' AND order_id IS NULL) OR
  (source_type = 'pdv_sale' AND order_id IS NOT NULL AND source_id = order_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_nfce_documents_company_order
ON public.nfce_documents(company_id, order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_nfce_documents_company_source
ON public.nfce_documents(company_id, source_type, source_id)
WHERE source_id IS NOT NULL AND status <> 'cancelled';

CREATE OR REPLACE FUNCTION public.nfce_assert_document_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_order_company uuid;
BEGIN
  IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
  SELECT company_id INTO v_order_company FROM public.pdv_orders WHERE id = NEW.order_id;
  IF v_order_company IS NULL OR v_order_company <> NEW.company_id THEN
    RAISE EXCEPTION 'O pedido da NFC-e não pertence à empresa informada.' USING ERRCODE = '23514';
  END IF;
  NEW.source_type := 'pdv_sale';
  NEW.source_id := NEW.order_id;
  RETURN NEW;
END;
$$;

-- Fonte única dos seletores de importação. Retorna somente o tenant do JWT.
CREATE OR REPLACE FUNCTION public.fiscal_list_goods_sources(
  p_direction text,
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS TABLE (
  source_type text, source_id uuid, number bigint, party_name text,
  issued_at timestamptz, total numeric, item_count bigint, origin_label text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH tenant AS (SELECT public.get_user_company_id((SELECT auth.uid())) AS company_id),
  sales(source_type, source_id, number, party_name, issued_at, total, item_count, origin_label) AS (
    SELECT 'pdv_sale'::text, o.id, o.number::bigint, c.name, o.created_at,
      o.total, count(i.id), 'Venda do PDV'::text
    FROM public.pdv_orders o CROSS JOIN tenant t
    LEFT JOIN public.customers c ON c.id = o.customer_id AND c.company_id = o.company_id
    LEFT JOIN public.pdv_order_items i ON i.order_id = o.id AND i.company_id = o.company_id
    WHERE p_direction = 'saida' AND o.company_id = t.company_id AND o.status <> 'cancelado'
      AND (coalesce(trim(p_query), '') = '' OR o.number::text ILIKE '%' || trim(p_query) || '%'
        OR coalesce(c.name, '') ILIKE '%' || trim(p_query) || '%')
    GROUP BY o.id, c.name
  ), purchases(source_type, source_id, number, party_name, issued_at, total, item_count, origin_label) AS (
    SELECT CASE WHEN c.cash_session_id IS NULL THEN 'inventory_purchase' ELSE 'pdv_purchase' END,
      po.id, po.numero::bigint, s.name, coalesce(po.received_at, po.created_at),
      coalesce(sum(oi.quantity_ordered * coalesce(oi.unit_price, 0)), 0), count(oi.id),
      CASE WHEN c.cash_session_id IS NULL THEN 'Compra do estoque' ELSE 'Compra do caixa/PDV' END
    FROM public.compra_ordens po CROSS JOIN tenant t
    JOIN public.compras c ON c.id = po.compra_id AND c.company_id = po.company_id
    JOIN public.suppliers s ON s.id = po.supplier_id AND s.company_id = po.company_id
    LEFT JOIN public.compra_ordem_itens oi ON oi.ordem_id = po.id AND oi.company_id = po.company_id
    WHERE p_direction = 'entrada' AND po.company_id = t.company_id AND po.status <> 'cancelada'
      AND (coalesce(trim(p_query), '') = '' OR po.numero::text ILIKE '%' || trim(p_query) || '%'
        OR s.name ILIKE '%' || trim(p_query) || '%')
    GROUP BY po.id, s.name, c.cash_session_id
  )
  SELECT * FROM (SELECT * FROM sales UNION ALL SELECT * FROM purchases) sources
  ORDER BY issued_at DESC LIMIT least(greatest(p_limit, 1), 100);
$$;
REVOKE ALL ON FUNCTION public.fiscal_list_goods_sources(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_list_goods_sources(text, text, integer) TO authenticated;

-- Snapshot de pré-preenchimento. Os códigos fiscais vêm do cadastro do material;
-- ausentes continuam ausentes e são exibidos como pendência antes de emitir.
CREATE OR REPLACE FUNCTION public.fiscal_get_goods_source_snapshot(
  p_source_type text,
  p_source_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid := public.get_user_company_id((SELECT auth.uid())); v_result jsonb;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'Empresa não identificada.' USING ERRCODE = '42501'; END IF;
  IF p_source_type = 'pdv_sale' THEN
    SELECT jsonb_build_object(
      'sourceType', p_source_type, 'sourceId', o.id, 'direction', 'saida',
      'number', o.number, 'issuedAt', o.created_at, 'total', o.total,
      'party', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', c.id, 'name', c.name, 'document', c.document, 'stateRegistration', c.inscricao_estadual,
        'email', c.email, 'address', c.address, 'addressNumber', coalesce(c.address_number, c.street_number),
        'complement', c.complement, 'neighborhood', c.neighborhood, 'city', c.city,
        'state', c.state, 'zipCode', c.zip_code, 'municipalityCode', c.ibge_municipality_code) END,
      'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'sourceItemId', oi.id, 'inventoryId', oi.inventory_id, 'description', oi.description,
        'quantity', oi.quantity, 'unitPrice', oi.unit_price, 'discount', oi.discount_amount, 'total', oi.total,
        'unit', inv.unit, 'ncm', inv.fiscal_ncm, 'cest', inv.fiscal_cest, 'gtin', inv.fiscal_gtin,
        'origin', inv.fiscal_origin,
        'cfopEntryInternal', inv.fiscal_cfop_entry_internal, 'cfopEntryInterstate', inv.fiscal_cfop_entry_interstate,
        'cfopExitInternal', coalesce(inv.fiscal_cfop_exit_internal, inv.fiscal_cfop_internal),
        'cfopExitInterstate', coalesce(inv.fiscal_cfop_exit_interstate, inv.fiscal_cfop_interstate), 'icmsCode', inv.fiscal_icms_code,
        'icmsRate', inv.fiscal_icms_rate, 'icmsReductionRate', inv.fiscal_icms_reduction_rate,
        'pisCst', inv.fiscal_pis_cst, 'cofinsCst', inv.fiscal_cofins_cst,
        'pisRate', inv.fiscal_pis_rate, 'cofinsRate', inv.fiscal_cofins_rate,
        'ipiCst', inv.fiscal_ipi_cst, 'ipiRate', inv.fiscal_ipi_rate,
        'taxUnit', inv.fiscal_tax_unit, 'ibsCbsCst', inv.fiscal_ibs_cbs_cst)
        ORDER BY oi.sort_order, oi.id) FROM public.pdv_order_items oi
        LEFT JOIN public.inventory inv ON inv.id = oi.inventory_id AND inv.company_id = oi.company_id
        WHERE oi.order_id = o.id AND oi.company_id = v_company), '[]'::jsonb),
      'payments', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'method', CASE lower(p.method)
          WHEN 'dinheiro' THEN '01'
          WHEN 'cheque' THEN '02'
          WHEN 'credito' THEN '03'
          WHEN 'cartao_credito' THEN '03'
          WHEN 'debito' THEN '04'
          WHEN 'cartao_debito' THEN '04'
          WHEN 'credito_loja' THEN '05'
          WHEN 'vale_alimentacao' THEN '10'
          WHEN 'vale_refeicao' THEN '11'
          WHEN 'vale_presente' THEN '12'
          WHEN 'vale_combustivel' THEN '13'
          WHEN 'duplicata' THEN '14'
          WHEN 'boleto' THEN '15'
          WHEN 'deposito' THEN '16'
          WHEN 'pix' THEN '17'
          WHEN 'transferencia' THEN '18'
          WHEN 'fidelidade' THEN '19'
          WHEN 'pontos' THEN '19'
          WHEN 'fiado' THEN '05'
          ELSE '99'
        END,
        'amount', p.amount + p.change_amount,
        'change', p.change_amount)
        ORDER BY p.received_at, p.id) FROM public.pdv_order_payments p WHERE p.order_id = o.id AND p.company_id = v_company), '[]'::jsonb)
    ) INTO v_result
    FROM public.pdv_orders o LEFT JOIN public.customers c ON c.id = o.customer_id AND c.company_id = o.company_id
    WHERE o.id = p_source_id AND o.company_id = v_company;
  ELSIF p_source_type IN ('pdv_purchase', 'inventory_purchase') THEN
    SELECT jsonb_build_object(
      'sourceType', CASE WHEN c.cash_session_id IS NULL THEN 'inventory_purchase' ELSE 'pdv_purchase' END,
      'sourceId', po.id, 'direction', 'entrada', 'number', po.numero,
      'issuedAt', coalesce(po.received_at, po.created_at),
      'total', coalesce((SELECT sum(oi.quantity_ordered * coalesce(oi.unit_price, 0)) FROM public.compra_ordem_itens oi WHERE oi.ordem_id = po.id), 0),
      'party', jsonb_build_object('id', s.id, 'name', s.name, 'document', s.cpf_cnpj, 'email', s.email, 'address', s.address),
      'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'sourceItemId', oi.id, 'inventoryId', oi.inventory_id,
        'description', coalesce(oi.material_name, inv.name), 'quantity', oi.quantity_ordered,
        'unitPrice', coalesce(oi.unit_price, 0), 'discount', 0,
        'total', oi.quantity_ordered * coalesce(oi.unit_price, 0), 'unit', coalesce(oi.unit, inv.unit),
        'ncm', inv.fiscal_ncm, 'cest', inv.fiscal_cest, 'gtin', inv.fiscal_gtin,
        'origin', inv.fiscal_origin,
        'cfopEntryInternal', inv.fiscal_cfop_entry_internal, 'cfopEntryInterstate', inv.fiscal_cfop_entry_interstate,
        'cfopExitInternal', coalesce(inv.fiscal_cfop_exit_internal, inv.fiscal_cfop_internal),
        'cfopExitInterstate', coalesce(inv.fiscal_cfop_exit_interstate, inv.fiscal_cfop_interstate), 'icmsCode', inv.fiscal_icms_code,
        'icmsRate', inv.fiscal_icms_rate, 'icmsReductionRate', inv.fiscal_icms_reduction_rate,
        'pisCst', inv.fiscal_pis_cst, 'cofinsCst', inv.fiscal_cofins_cst,
        'pisRate', inv.fiscal_pis_rate, 'cofinsRate', inv.fiscal_cofins_rate,
        'ipiCst', inv.fiscal_ipi_cst, 'ipiRate', inv.fiscal_ipi_rate,
        'taxUnit', inv.fiscal_tax_unit, 'ibsCbsCst', inv.fiscal_ibs_cbs_cst)
        ORDER BY oi.created_at, oi.id) FROM public.compra_ordem_itens oi
        LEFT JOIN public.inventory inv ON inv.id = oi.inventory_id AND inv.company_id = oi.company_id
        WHERE oi.ordem_id = po.id AND oi.company_id = v_company), '[]'::jsonb),
      'payments', '[]'::jsonb
    ) INTO v_result
    FROM public.compra_ordens po
    JOIN public.compras c ON c.id = po.compra_id AND c.company_id = po.company_id
    JOIN public.suppliers s ON s.id = po.supplier_id AND s.company_id = po.company_id
    WHERE po.id = p_source_id AND po.company_id = v_company
      AND ((p_source_type = 'pdv_purchase' AND c.cash_session_id IS NOT NULL)
        OR (p_source_type = 'inventory_purchase' AND c.cash_session_id IS NULL));
  ELSE RAISE EXCEPTION 'Origem fiscal inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_result IS NULL THEN RAISE EXCEPTION 'Origem fiscal não encontrada para esta empresa.' USING ERRCODE = '42501'; END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_get_goods_source_snapshot(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_get_goods_source_snapshot(text, uuid) TO authenticated;

-- Reserva atômica usada somente pela Edge. A numeração nunca nasce no browser.
CREATE OR REPLACE FUNCTION public.reserve_goods_fiscal_number(p_company_id uuid, p_model integer)
RETURNS TABLE(series integer, number bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_model = 55 THEN
    INSERT INTO public.company_nfe_settings(company_id) VALUES (p_company_id) ON CONFLICT DO NOTHING;
    RETURN QUERY UPDATE public.company_nfe_settings s SET next_number = s.next_number + 1
      WHERE s.company_id = p_company_id RETURNING s.series, s.next_number - 1;
  ELSIF p_model = 65 THEN
    INSERT INTO public.company_nfce_settings(company_id) VALUES (p_company_id) ON CONFLICT DO NOTHING;
    RETURN QUERY UPDATE public.company_nfce_settings s SET next_number = s.next_number + 1
      WHERE s.company_id = p_company_id RETURNING s.series, s.next_number - 1;
  ELSE RAISE EXCEPTION 'Modelo fiscal inválido.' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_goods_fiscal_number(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_goods_fiscal_number(uuid, integer) TO service_role;

DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nfe_documents'::regclass)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nfe_events'::regclass)
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nfe_outbox'::regclass) THEN
    RAISE EXCEPTION 'RLS precisa estar ativa nas tabelas NF-e.';
  END IF;
  IF has_table_privilege('authenticated', 'public.nfe_documents', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'public.nfe_outbox', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'ACL NF-e permite escrita direta indevida ao tenant.';
  END IF;
END $$;
