-- =====================================================================
-- Elo cobrança do tenant ↔ recebível interno + baixa automática
-- =====================================================================
-- O "recebível" do tenant é uma row em public.financial_transactions com
-- transaction_type='entrada' (confirmado em useReceivablePayments.ts e na
-- migration 20260523234208_pagamento_parcial_recebivel). O "pago" é marcado
-- por is_paid=true + paid_date; amount_received espelha o total recebido
-- (recalculado por trigger quando há filhas de recebimento parcial).
--
-- Aqui:
--   1) coluna tenant_charge_id em financial_transactions (nullable) → liga o
--      recebível à cobrança online que o originou;
--   2) RPC SECURITY DEFINER idempotente apply_tenant_charge_payment(...) que,
--      ao receber a confirmação do webhook, marca a tenant_charge como paga e
--      dá baixa no recebível vinculado.
--
-- MEMÓRIA DO TIME: RLS NÃO cobre função SECURITY DEFINER — o predicado de
-- posse (company_id) é reaplicado no corpo. A baixa do recebível só toca a
-- row cuja company_id bate com a company da cobrança.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Coluna de elo no recebível
-- ---------------------------------------------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS tenant_charge_id uuid REFERENCES public.tenant_charges(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.financial_transactions.tenant_charge_id IS
  'Liga este recebível (transaction_type=entrada) à cobrança online (tenant_charges) que o originou. NULL = recebível manual/sem cobrança online.';

CREATE INDEX IF NOT EXISTS idx_financial_transactions_tenant_charge
  ON public.financial_transactions (tenant_charge_id)
  WHERE tenant_charge_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- 2) RPC idempotente de baixa
-- ---------------------------------------------------------------------
-- Chamada pela edge (webhook PAYMENT_RECEIVED/PAYMENT_CONFIRMED) com o id
-- global do Asaas. Idempotente: rodar 2x não duplica baixa nem reescreve a
-- data de pagamento já registrada.
--
-- Passos:
--   a) acha a tenant_charge pelo asaas_payment_id;
--   b) se já estiver paga (payment_date NOT NULL), retorna 'already_paid' (no-op);
--   c) marca a cobrança como CONFIRMED + payment_date + net_value;
--   d) dá baixa no recebível vinculado (mesma company_id — predicado de posse
--      reaplicado): is_paid=true, paid_date, amount_received=amount.
--
-- Retorna um jsonb com o resultado (auditável pela edge).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_tenant_charge_payment(
  p_asaas_payment_id text,
  p_paid_at          timestamptz DEFAULT now(),
  p_net              numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge      public.tenant_charges%ROWTYPE;
  v_receivables int := 0;
BEGIN
  IF p_asaas_payment_id IS NULL OR length(trim(p_asaas_payment_id)) = 0 THEN
    RAISE EXCEPTION '[apply_tenant_charge_payment] asaas_payment_id obrigatório';
  END IF;

  -- (a) acha a cobrança; lock pra serializar reentregas concorrentes do webhook
  SELECT * INTO v_charge
  FROM public.tenant_charges
  WHERE asaas_payment_id = p_asaas_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'charge_not_found',
      'asaas_payment_id', p_asaas_payment_id
    );
  END IF;

  -- (b) idempotência: já pago → no-op
  IF v_charge.payment_date IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_paid',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id
    );
  END IF;

  -- (c) marca a cobrança como confirmada
  UPDATE public.tenant_charges
  SET status       = 'CONFIRMED',
      payment_date = p_paid_at,
      net_value    = COALESCE(p_net, net_value),
      updated_at   = now()
  WHERE id = v_charge.id;

  -- (d) baixa no recebível vinculado — predicado de posse reaplicado
  --     (company_id da row TEM que bater com a company da cobrança).
  --     Só baixa o que ainda está pendente (is_paid distinto de true),
  --     tornando a operação idempotente também do lado do recebível.
  UPDATE public.financial_transactions ft
  SET is_paid         = true,
      paid_date       = p_paid_at::date,
      amount_received = ft.amount,
      updated_at      = now()
  WHERE ft.tenant_charge_id = v_charge.id
    AND ft.company_id       = v_charge.company_id
    AND ft.transaction_type = 'entrada'
    AND ft.is_paid IS DISTINCT FROM true;

  GET DIAGNOSTICS v_receivables = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'paid',
    'charge_id', v_charge.id,
    'company_id', v_charge.company_id,
    'receivables_settled', v_receivables
  );
END;
$$;

COMMENT ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) IS
  'Webhook Asaas do tenant → baixa automática. Idempotente (já pago = no-op). Marca tenant_charge como CONFIRMED e baixa o recebível vinculado (mesma company_id, predicado de posse reaplicado no corpo pois RLS não cobre SECURITY DEFINER).';

-- Só a edge (service_role) chama esta RPC. NÃO conceder a authenticated:
-- baixa de recebível por confirmação de pagamento é operação de servidor.
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) TO service_role;
