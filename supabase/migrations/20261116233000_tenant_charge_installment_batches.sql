-- Parcelamento avulso de cobranças (sem carnê nativo do Asaas)
--
-- Um lote representa uma intenção idempotente do usuário. Cada parcela é uma
-- cobrança simples e independente em tenant_charges, reservada ANTES do POST
-- no gateway. O id da linha reservada é usado como externalReference no Asaas,
-- permitindo recuperar um POST cujo retorno se perdeu sem emitir em duplicidade.

CREATE TABLE IF NOT EXISTS public.tenant_charge_batches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_request_id     uuid NOT NULL,
  payload_hash          text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  customer_id           uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  total_value           numeric(14,2) NOT NULL CHECK (total_value > 0),
  installment_count     integer NOT NULL CHECK (installment_count BETWEEN 2 AND 12),
  first_due_date        date NOT NULL,
  billing_type          text NOT NULL CHECK (billing_type IN ('PIX', 'BOLETO', 'UNDEFINED')),
  description           text,
  category              text,
  cost_center_id        uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  finance_account_id    uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  post_to_finance       boolean NOT NULL DEFAULT true,
  fine_type             text NOT NULL DEFAULT 'PERCENTAGE'
                          CHECK (fine_type IN ('PERCENTAGE', 'FIXED')),
  fine_value            numeric(14,2) NOT NULL DEFAULT 0 CHECK (fine_value >= 0),
  interest_percent      numeric(7,4) NOT NULL DEFAULT 0
                          CHECK (interest_percent >= 0 AND interest_percent <= 10),
  discount_percent      numeric(7,4) NOT NULL DEFAULT 0
                          CHECK (discount_percent >= 0 AND discount_percent <= 100),
  discount_days         integer NOT NULL DEFAULT 0 CHECK (discount_days >= 0),
  status                text NOT NULL DEFAULT 'processing'
                          CHECK (status IN ('processing', 'partial', 'completed', 'failed')),
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_charge_batches_company_request_uidx
    UNIQUE (company_id, client_request_id),
  CONSTRAINT tenant_charge_batches_id_company_uidx
    UNIQUE (id, company_id)
);

COMMENT ON TABLE public.tenant_charge_batches IS
  'Intenção idempotente de parcelamento avulso. client_request_id + payload_hash impedem duplicação e reuso do mesmo id com outro conteúdo.';
COMMENT ON COLUMN public.tenant_charge_batches.client_request_id IS
  'UUID gerado no cliente e reutilizado em retentativas do MESMO pedido.';
COMMENT ON COLUMN public.tenant_charge_batches.payload_hash IS
  'SHA-256 hexadecimal da intenção normalizada/canonizada pelo servidor; defaults efetivos ficam no snapshot das demais colunas.';

CREATE INDEX IF NOT EXISTS idx_tenant_charge_batches_company_created
  ON public.tenant_charge_batches (company_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_tenant_charge_batches_updated_at
  ON public.tenant_charge_batches;
CREATE TRIGGER trg_tenant_charge_batches_updated_at
  BEFORE UPDATE ON public.tenant_charge_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A ligação inclui company_id na FK: mesmo uma escrita privilegiada com bug não
-- consegue anexar uma cobrança de uma empresa ao lote de outra.
ALTER TABLE public.tenant_charges
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS installment_total integer,
  ADD COLUMN IF NOT EXISTS gateway_creation_claim_token uuid,
  ADD COLUMN IF NOT EXISTS gateway_creation_claimed_at timestamptz;

ALTER TABLE public.tenant_charges
  DROP CONSTRAINT IF EXISTS tenant_charges_batch_company_fkey,
  ADD CONSTRAINT tenant_charges_batch_company_fkey
    FOREIGN KEY (batch_id, company_id)
    REFERENCES public.tenant_charge_batches(id, company_id)
    ON DELETE NO ACTION,
  DROP CONSTRAINT IF EXISTS tenant_charges_installment_shape_check,
  ADD CONSTRAINT tenant_charges_installment_shape_check CHECK (
    (batch_id IS NULL AND installment_number IS NULL AND installment_total IS NULL)
    OR
    (
      batch_id IS NOT NULL
      AND installment_number IS NOT NULL
      AND installment_total IS NOT NULL
      AND installment_total BETWEEN 2 AND 12
      AND installment_number BETWEEN 1 AND installment_total
    )
  ),
  DROP CONSTRAINT IF EXISTS tenant_charges_gateway_claim_shape_check,
  ADD CONSTRAINT tenant_charges_gateway_claim_shape_check CHECK (
    (gateway_creation_claim_token IS NULL) = (gateway_creation_claimed_at IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_tenant_charges_batch_installment
  ON public.tenant_charges (batch_id, installment_number);

CREATE INDEX IF NOT EXISTS idx_tenant_charges_batch
  ON public.tenant_charges (batch_id)
  WHERE batch_id IS NOT NULL;

COMMENT ON COLUMN public.tenant_charges.batch_id IS
  'Lote idempotente do parcelamento avulso; NULL nas cobranças unitárias e recorrentes.';
COMMENT ON COLUMN public.tenant_charges.installment_number IS
  'Posição desta cobrança simples no lote (1..installment_total).';
COMMENT ON COLUMN public.tenant_charges.installment_total IS
  'Quantidade total de cobranças simples reservadas no lote.';
COMMENT ON COLUMN public.tenant_charges.gateway_creation_claim_token IS
  'Lease interno da edge para impedir dois POSTs concorrentes da mesma parcela. Nunca é enviado ao gateway.';
COMMENT ON COLUMN public.tenant_charges.gateway_creation_claimed_at IS
  'Início do lease de criação no gateway; após expirar, a retentativa consulta externalReference antes de novo POST.';

-- Espelho de gateway: authenticated só lê. Toda mutação passa pela edge com
-- service_role, do mesmo modo que tenant_charges/tenant_subscriptions.
ALTER TABLE public.tenant_charge_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_tenant_charge_batches"
  ON public.tenant_charge_batches;
CREATE POLICY "service_role_full_access_tenant_charge_batches"
  ON public.tenant_charge_batches FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Company can view own charge batches"
  ON public.tenant_charge_batches;
CREATE POLICY "Company can view own charge batches"
  ON public.tenant_charge_batches FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin(auth.uid()))
    OR company_id = (SELECT public.get_user_company_id(auth.uid()))
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.tenant_charge_batches FROM authenticated;
GRANT SELECT ON public.tenant_charge_batches TO authenticated;
REVOKE ALL ON public.tenant_charge_batches FROM anon;
