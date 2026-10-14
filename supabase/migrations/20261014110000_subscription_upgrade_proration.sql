-- Upgrade proporcional de assinatura
--
-- Expansoes (plano, modulos ou usuarios) geram uma cotacao server-side e so
-- liberam acesso depois que o webhook Asaas confirma a cobranca. Reducoes
-- continuam usando companies.pending_* e entram no proximo ciclo.

CREATE TABLE IF NOT EXISTS public.subscription_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  change_kind TEXT NOT NULL DEFAULT 'upgrade' CHECK (change_kind IN ('upgrade')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'payment_pending', 'applied', 'expired', 'cancelled', 'failed', 'reversed')),

  source_plan_code TEXT,
  target_plan_code TEXT NOT NULL,
  target_label TEXT,
  source_billing_cycle TEXT NOT NULL CHECK (source_billing_cycle IN ('monthly', 'yearly')),
  target_billing_cycle TEXT NOT NULL CHECK (target_billing_cycle IN ('monthly', 'yearly')),
  source_subscription_value NUMERIC(14,2) NOT NULL,
  source_monthly_value NUMERIC(14,2) NOT NULL,
  target_monthly_value NUMERIC(14,2) NOT NULL,
  source_period_value NUMERIC(14,2) NOT NULL,
  target_period_value NUMERIC(14,2) NOT NULL,
  credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_due NUMERIC(14,2) NOT NULL CHECK (amount_due > 0),
  remaining_ratio NUMERIC(10,8) NOT NULL CHECK (remaining_ratio >= 0 AND remaining_ratio <= 1),

  period_started_at TIMESTAMPTZ NOT NULL,
  period_ends_at TIMESTAMPTZ NOT NULL,
  next_renewal_at TIMESTAMPTZ NOT NULL,
  resets_billing_anchor BOOLEAN NOT NULL DEFAULT false,

  target_modules TEXT[] NOT NULL DEFAULT '{}',
  target_max_users INTEGER NOT NULL CHECK (target_max_users > 0),
  target_extra_users INTEGER NOT NULL DEFAULT 0 CHECK (target_extra_users >= 0),
  source_nfse_tier SMALLINT,
  target_nfse_tier SMALLINT,
  source_whatsapp_tier SMALLINT,
  target_whatsapp_tier SMALLINT,
  request_fingerprint TEXT NOT NULL,
  asaas_payment_id TEXT,
  paid_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_change_requests_company_created
  ON public.subscription_change_requests (company_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_change_requests_active_fingerprint
  ON public.subscription_change_requests (company_id, request_fingerprint)
  WHERE status IN ('pending', 'payment_pending');

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_change_requests_asaas_payment
  ON public.subscription_change_requests (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_subscription_change_requests_updated_at
  ON public.subscription_change_requests;
CREATE TRIGGER update_subscription_change_requests_updated_at
  BEFORE UPDATE ON public.subscription_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.subscription_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin and own company view subscription changes"
  ON public.subscription_change_requests;
CREATE POLICY "Admin and own company view subscription changes"
  ON public.subscription_change_requests FOR SELECT TO authenticated
  USING (
    public.is_admin_user((SELECT auth.uid()))
    OR company_id = public.get_user_company_id((SELECT auth.uid()))
  );

-- Escrita somente por service_role (edge functions). Sem policies de
-- INSERT/UPDATE/DELETE para authenticated.

ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS subscription_change_request_id UUID
    REFERENCES public.subscription_change_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_change_request
  ON public.subscription_payments (subscription_change_request_id)
  WHERE subscription_change_request_id IS NOT NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pending_nfse_tier SMALLINT,
  ADD COLUMN IF NOT EXISTS pending_whatsapp_tier SMALLINT;

COMMENT ON TABLE public.subscription_change_requests IS
  'Cotacoes imutaveis de upgrade proporcional; o acesso so muda apos confirmacao do webhook.';
COMMENT ON COLUMN public.subscription_change_requests.amount_due IS
  'Valor final reconciliado no servidor e cobrado uma unica vez pelo upgrade.';
COMMENT ON COLUMN public.subscription_change_requests.credit_amount IS
  'Credito nao sacavel do periodo ja pago, usado no calculo da mudanca.';

-- Aplica o upgrade e seus efeitos financeiros numa unica transacao. A funcao
-- e idempotente pelo status da request e pelo asaas_payment_id.
CREATE OR REPLACE FUNCTION public.apply_subscription_upgrade_payment(
  p_request_id UUID,
  p_asaas_payment_id TEXT,
  p_paid_amount NUMERIC,
  p_billing_type TEXT DEFAULT 'PIX'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.subscription_change_requests%ROWTYPE;
  v_company public.companies%ROWTYPE;
  v_new_expiration TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
  v_payment_method TEXT := lower(COALESCE(NULLIF(p_billing_type, ''), 'PIX'));
BEGIN
  IF p_request_id IS NULL OR p_asaas_payment_id IS NULL OR btrim(p_asaas_payment_id) = '' THEN
    RAISE EXCEPTION 'upgrade_payment_missing_identifiers';
  END IF;

  SELECT * INTO v_request
    FROM public.subscription_change_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'upgrade_request_not_found';
  END IF;

  IF v_request.status = 'applied' THEN
    RETURN jsonb_build_object(
      'applied', false,
      'already_applied', true,
      'company_id', v_request.company_id,
      'target_monthly_value', v_request.target_monthly_value,
      'target_period_value', v_request.target_period_value,
      'target_billing_cycle', v_request.target_billing_cycle,
      'next_renewal_at', v_request.next_renewal_at
    );
  END IF;

  IF v_request.status NOT IN ('pending', 'payment_pending') THEN
    RAISE EXCEPTION 'upgrade_request_not_payable:%', v_request.status;
  END IF;

  IF p_paid_amount IS NULL OR abs(p_paid_amount - v_request.amount_due) > 0.02 THEN
    RAISE EXCEPTION 'upgrade_payment_amount_mismatch';
  END IF;

  IF v_request.asaas_payment_id IS NOT NULL
     AND v_request.asaas_payment_id <> p_asaas_payment_id THEN
    RAISE EXCEPTION 'upgrade_payment_id_mismatch';
  END IF;

  SELECT * INTO v_company
    FROM public.companies
   WHERE id = v_request.company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'upgrade_company_not_found';
  END IF;

  -- A cotacao nao pode aplicar sobre uma assinatura que mudou enquanto o
  -- checkout estava aberto. Falha fechada; o pagamento fica rastreado para
  -- conciliacao humana em vez de conceder um entitlement incorreto.
  IF COALESCE(v_company.subscription_plan, '') <> COALESCE(v_request.source_plan_code, '')
     OR COALESCE(v_company.billing_cycle, 'monthly') <> v_request.source_billing_cycle
     OR abs(COALESCE(v_company.subscription_value, 0) - v_request.source_subscription_value) > 0.02
     OR abs(
       (CASE
          WHEN COALESCE(v_company.custom_price, 0) > 0
           AND COALESCE(v_company.custom_price_months, 0) > 0
           AND COALESCE(v_company.custom_price_payments_made, 0) < v_company.custom_price_months
          THEN v_company.custom_price
          ELSE COALESCE(v_company.subscription_value, 0)
        END) - v_request.source_monthly_value
     ) > 0.02
     OR (v_request.target_nfse_tier IS NOT NULL AND COALESCE(v_company.nfse_tier, 1) <> v_request.source_nfse_tier)
     OR (v_request.target_whatsapp_tier IS NOT NULL AND COALESCE(v_company.whatsapp_tier, 1) <> v_request.source_whatsapp_tier) THEN
    UPDATE public.subscription_change_requests
       SET status = 'failed',
           asaas_payment_id = p_asaas_payment_id,
           paid_at = v_now
     WHERE id = v_request.id;
    INSERT INTO public.subscription_payments (
      company_id, asaas_payment_id, asaas_customer_id, amount, status,
      billing_type, billing_cycle, due_date, paid_at, payment_method, type,
      subscription_change_request_id
    ) VALUES (
      v_request.company_id, p_asaas_payment_id, v_company.asaas_customer_id,
      p_paid_amount, 'CONFIRMED', upper(COALESCE(p_billing_type, 'PIX')),
      v_request.target_billing_cycle, v_now::date, v_now, v_payment_method,
      'upgrade', v_request.id
    )
    ON CONFLICT (asaas_payment_id) DO UPDATE
      SET status = 'CONFIRMED', paid_at = v_now,
          subscription_change_request_id = EXCLUDED.subscription_change_request_id,
          updated_at = v_now;
    RETURN jsonb_build_object(
      'applied', false,
      'failed', true,
      'reason', 'source_subscription_changed',
      'company_id', v_request.company_id,
      'target_monthly_value', v_request.target_monthly_value
    );
  END IF;

  IF v_request.resets_billing_anchor THEN
    SELECT public.compute_next_expiration(v_now, v_request.target_billing_cycle)
      INTO v_new_expiration;
  ELSE
    v_new_expiration := v_request.period_ends_at;
  END IF;

  UPDATE public.companies
     SET subscription_plan = v_request.target_plan_code,
         subscription_value = v_request.target_monthly_value,
         billing_cycle = v_request.target_billing_cycle,
         subscription_expires_at = v_new_expiration,
         max_users = v_request.target_max_users,
         extra_users = v_request.target_extra_users,
         nfse_tier = COALESCE(v_request.target_nfse_tier, nfse_tier),
         whatsapp_tier = COALESCE(v_request.target_whatsapp_tier, whatsapp_tier),
         custom_price = NULL,
         custom_price_months = NULL,
         custom_price_payments_made = 0,
         custom_price_permanent = false,
         pending_subscription_value = NULL,
         pending_plan_code = NULL,
         pending_billing_cycle = NULL,
         pending_modules = NULL,
         pending_max_users = NULL,
         pending_nfse_tier = NULL,
         pending_whatsapp_tier = NULL,
         ltv = GREATEST(0, COALESCE(ltv, 0) + p_paid_amount)
   WHERE id = v_request.company_id;

  DELETE FROM public.company_modules
   WHERE company_id = v_request.company_id;

  INSERT INTO public.company_modules (company_id, module_code)
  SELECT v_request.company_id, module_code
    FROM unnest(v_request.target_modules) AS module_code
  ON CONFLICT DO NOTHING;

  INSERT INTO public.subscription_history (
    company_id, changed_by, previous_plan, new_plan,
    previous_value, new_value, previous_status, new_status, reason
  ) VALUES (
    v_request.company_id,
    v_request.requested_by,
    v_request.source_plan_code,
    v_request.target_plan_code,
    v_request.source_monthly_value,
    v_request.target_monthly_value,
    v_company.subscription_status,
    v_company.subscription_status,
    format(
      'Upgrade proporcional confirmado: cobrança %s; crédito %s; proporção restante %s; request %s',
      v_request.amount_due,
      v_request.credit_amount,
      v_request.remaining_ratio,
      v_request.id
    )
  );

  INSERT INTO public.company_payments (
    company_id, amount, type, payment_method, payment_date,
    notes, origin, asaas_payment_id
  ) VALUES (
    v_request.company_id,
    p_paid_amount,
    'upgrade',
    v_payment_method,
    v_now,
    format('Upgrade proporcional via Asaas - %s', p_asaas_payment_id),
    v_company.origin,
    p_asaas_payment_id
  );

  BEGIN
    INSERT INTO public.admin_financial_transactions (
      type, category, amount, description, reference_id, reference_type,
      asaas_transaction_id, transaction_date
    ) VALUES (
      'income',
      'renewal',
      p_paid_amount,
      format('Upgrade - %s (Asaas %s)', v_company.name, p_asaas_payment_id),
      v_request.company_id,
      'subscription_upgrade',
      p_asaas_payment_id,
      v_now
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  INSERT INTO public.subscription_payments (
    company_id, asaas_payment_id, asaas_customer_id, amount, status,
    billing_type, billing_cycle, due_date, paid_at, payment_method, type,
    ltv_credited_at, subscription_change_request_id
  ) VALUES (
    v_request.company_id,
    p_asaas_payment_id,
    v_company.asaas_customer_id,
    p_paid_amount,
    'CONFIRMED',
    upper(COALESCE(p_billing_type, 'PIX')),
    v_request.target_billing_cycle,
    v_now::date,
    v_now,
    v_payment_method,
    'upgrade',
    v_now,
    v_request.id
  )
  ON CONFLICT (asaas_payment_id) DO UPDATE
    SET status = 'CONFIRMED',
        amount = EXCLUDED.amount,
        billing_type = EXCLUDED.billing_type,
        billing_cycle = EXCLUDED.billing_cycle,
        paid_at = EXCLUDED.paid_at,
        payment_method = EXCLUDED.payment_method,
        type = 'upgrade',
        ltv_credited_at = COALESCE(public.subscription_payments.ltv_credited_at, EXCLUDED.ltv_credited_at),
        subscription_change_request_id = EXCLUDED.subscription_change_request_id,
        updated_at = v_now;

  UPDATE public.subscription_change_requests
     SET status = 'applied',
         asaas_payment_id = p_asaas_payment_id,
         paid_at = v_now,
         applied_at = v_now,
         next_renewal_at = v_new_expiration
   WHERE id = v_request.id;

  RETURN jsonb_build_object(
    'applied', true,
    'already_applied', false,
    'company_id', v_request.company_id,
    'target_monthly_value', v_request.target_monthly_value,
    'target_period_value', v_request.target_period_value,
    'target_billing_cycle', v_request.target_billing_cycle,
    'next_renewal_at', v_new_expiration
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_subscription_upgrade_payment(UUID, TEXT, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_upgrade_payment(UUID, TEXT, NUMERIC, TEXT)
  TO service_role;
