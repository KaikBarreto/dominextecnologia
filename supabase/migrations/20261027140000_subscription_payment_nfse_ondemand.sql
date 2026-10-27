-- NFS-e da assinatura Dominex emitida sob demanda pelo cliente.
--
-- A nota pertence à Dominex (prestadora) e referencia uma cobrança Asaas da
-- assinatura. Ela não usa nfse_emissions, que representa as notas emitidas
-- pelos próprios tenants no módulo fiscal.

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS nfse_status TEXT,
  ADD COLUMN IF NOT EXISTS nfse_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS nfse_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS nfse_xml_url TEXT,
  ADD COLUMN IF NOT EXISTS nfse_number TEXT,
  ADD COLUMN IF NOT EXISTS nfse_error TEXT,
  ADD COLUMN IF NOT EXISTS nfse_requested_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_payments_nfse_invoice_id
  ON public.subscription_payments (nfse_invoice_id)
  WHERE nfse_invoice_id IS NOT NULL;

COMMENT ON COLUMN public.subscription_payments.nfse_status IS
  'Estado da NFS-e da assinatura na Dominex/Asaas; separado do status financeiro da cobrança.';
COMMENT ON COLUMN public.subscription_payments.nfse_invoice_id IS
  'Identificador inv_* da NFS-e no Asaas, usado para casar os eventos INVOICE_*.';
COMMENT ON COLUMN public.subscription_payments.nfse_pdf_url IS
  'URL do PDF da NFS-e autorizada no Asaas.';
COMMENT ON COLUMN public.subscription_payments.nfse_xml_url IS
  'URL do XML da NFS-e autorizada no Asaas.';
COMMENT ON COLUMN public.subscription_payments.nfse_number IS
  'Número da NFS-e autorizada pela prefeitura/Portal Nacional.';
COMMENT ON COLUMN public.subscription_payments.nfse_error IS
  'Orientação segura em PT-BR quando a emissão falhar; não armazena código interno do provedor.';
COMMENT ON COLUMN public.subscription_payments.nfse_requested_at IS
  'Instante da última tentativa/atividade, usado pela trava idempotente para recuperar solicitações abandonadas.';

-- Reserva atômica antes de chamar POST /v3/invoices. Sem isso, dois cliques ou
-- retries simultâneos poderiam criar duas notas para o mesmo pagamento.
CREATE OR REPLACE FUNCTION public.claim_subscription_payment_nfse(
  p_payment_id UUID,
  p_company_id UUID,
  p_stale_before TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH claimed AS (
    UPDATE public.subscription_payments
       SET nfse_status = 'REQUESTING',
           nfse_invoice_id = NULL,
           nfse_pdf_url = NULL,
           nfse_xml_url = NULL,
           nfse_number = NULL,
           nfse_error = NULL,
           nfse_requested_at = now(),
           updated_at = now()
     WHERE id = p_payment_id
       AND company_id = p_company_id
       AND (
         (
           nfse_status IS NULL
           AND nfse_invoice_id IS NULL
           AND nfse_pdf_url IS NULL
         )
         OR lower(nfse_status) IN ('error', 'canceled', 'cancelled')
         OR (
           lower(nfse_status) = 'requesting'
           AND COALESCE(nfse_requested_at, '-infinity'::timestamptz) < p_stale_before
         )
       )
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

REVOKE ALL ON FUNCTION public.claim_subscription_payment_nfse(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_subscription_payment_nfse(UUID, UUID, TIMESTAMPTZ)
  TO service_role;

