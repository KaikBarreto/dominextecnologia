-- Tentativas de checkout de assinatura no gateway.
--
-- Autorizacao de Pix Automatico, assinatura recorrente e pagamento sao objetos
-- diferentes na Asaas. Esta tabela guarda o consentimento/checkout; a tabela
-- subscription_payments continua reservada a dinheiro real (pay_*).

CREATE TABLE IF NOT EXISTS public.subscription_checkout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_change_request_id UUID
    REFERENCES public.subscription_change_requests(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL DEFAULT 'renewal',
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('pix_automatic')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  checkout_status TEXT NOT NULL DEFAULT 'CREATING'
    CHECK (checkout_status IN (
      'CREATING', 'CREATE_UNKNOWN', 'PENDING', 'CREATED', 'ACTIVE',
      'COMPLETED', 'FAILED', 'REFUSED', 'CANCELLED', 'EXPIRED'
    )),
  authorization_status TEXT,
  gateway_correlation_ref TEXT NOT NULL UNIQUE,
  asaas_authorization_id TEXT UNIQUE,
  asaas_subscription_id TEXT UNIQUE,
  asaas_payment_id TEXT UNIQUE,
  pix_conciliation_identifier TEXT UNIQUE,
  pix_end_to_end_identifier TEXT UNIQUE,
  pix_qr_code_id TEXT UNIQUE,
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  pix_expiration_date TIMESTAMPTZ,
  last_error_code TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_checkout_attempts_company_created
  ON public.subscription_checkout_attempts (company_id, created_at DESC);

-- Uma empresa nao pode disparar dois POSTs de Pix Automatico enquanto ainda ha
-- uma tentativa recuperavel. O claim abaixo usa o mesmo predicado sob lock.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_checkout_attempts_live_pix
  ON public.subscription_checkout_attempts (company_id)
  WHERE payment_mode = 'pix_automatic'
    AND checkout_status IN ('CREATING', 'CREATE_UNKNOWN', 'PENDING', 'CREATED', 'ACTIVE');

DROP TRIGGER IF EXISTS update_subscription_checkout_attempts_updated_at
  ON public.subscription_checkout_attempts;
CREATE TRIGGER update_subscription_checkout_attempts_updated_at
  BEFORE UPDATE ON public.subscription_checkout_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.subscription_checkout_attempts ENABLE ROW LEVEL SECURITY;

-- Sem policies para authenticated: checkout e correlacao sao internos. As edge
-- functions usam service_role e o tenant recebe apenas a resposta sanitizada.

COMMENT ON TABLE public.subscription_checkout_attempts IS
  'Tentativas internas de checkout/consentimento; pagamentos reais permanecem em subscription_payments.';
COMMENT ON COLUMN public.subscription_checkout_attempts.asaas_authorization_id IS
  'ID da autorizacao do Pix Automatico; nunca deve ser usado como prova de pagamento.';
COMMENT ON COLUMN public.subscription_checkout_attempts.asaas_payment_id IS
  'ID pay_* correlacionado ao consentimento; somente PAYMENT_RECEIVED/CONFIRMED move dinheiro.';

CREATE OR REPLACE FUNCTION public.claim_subscription_pix_automatic_checkout(
  p_company_id UUID,
  p_amount NUMERIC,
  p_billing_cycle TEXT,
  p_due_date DATE,
  p_purpose TEXT DEFAULT 'renewal',
  p_change_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.subscription_checkout_attempts%ROWTYPE;
  v_created public.subscription_checkout_attempts%ROWTYPE;
  v_id UUID := gen_random_uuid();
BEGIN
  IF p_company_id IS NULL OR p_amount IS NULL OR p_amount <= 0
     OR p_billing_cycle NOT IN ('monthly', 'yearly') OR p_due_date IS NULL THEN
    RAISE EXCEPTION 'invalid_pix_automatic_checkout_claim';
  END IF;

  -- Serializa apenas os checkouts da mesma empresa durante esta transacao.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text, 0));

  SELECT * INTO v_existing
    FROM public.subscription_checkout_attempts
   WHERE company_id = p_company_id
     AND payment_mode = 'pix_automatic'
     AND checkout_status IN ('CREATING', 'CREATE_UNKNOWN', 'PENDING', 'CREATED', 'ACTIVE')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF abs(v_existing.amount - p_amount) > 0.02
       OR v_existing.billing_cycle <> p_billing_cycle
       OR v_existing.purpose <> COALESCE(NULLIF(p_purpose, ''), 'renewal')
       OR COALESCE(v_existing.subscription_change_request_id::text, '') <>
          COALESCE(p_change_request_id::text, '') THEN
      RAISE EXCEPTION 'pix_automatic_checkout_already_in_progress';
    END IF;

    RETURN jsonb_build_object(
      'should_create', false,
      'attempt', to_jsonb(v_existing)
    );
  END IF;

  INSERT INTO public.subscription_checkout_attempts (
    id,
    company_id,
    subscription_change_request_id,
    purpose,
    payment_mode,
    billing_cycle,
    amount,
    due_date,
    checkout_status,
    gateway_correlation_ref
  ) VALUES (
    v_id,
    p_company_id,
    p_change_request_id,
    COALESCE(NULLIF(p_purpose, ''), 'renewal'),
    'pix_automatic',
    p_billing_cycle,
    p_amount,
    p_due_date,
    'CREATING',
    replace(v_id::text, '-', '')
  )
  RETURNING * INTO v_created;

  RETURN jsonb_build_object(
    'should_create', true,
    'attempt', to_jsonb(v_created)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_subscription_pix_automatic_checkout(
  UUID, NUMERIC, TEXT, DATE, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_subscription_pix_automatic_checkout(
  UUID, NUMERIC, TEXT, DATE, TEXT, UUID
) TO service_role;
