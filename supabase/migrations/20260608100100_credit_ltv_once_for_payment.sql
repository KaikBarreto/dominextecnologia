-- ============================================================
-- Asaas — Bloco 2b: crédito idempotente de LTV por pagamento
-- Decisões: docs/decisoes/2026-06-04-asaas.md
-- Clone adaptado do EcoSistema (harden_credit_ltv_once_dedup).
--
-- Problema: o webhook Asaas (PAYMENT_RECEIVED/CONFIRMED) pode ser reentregue
-- (a Asaas reenvia o mesmo evento até receber 200). companies.ltv não tem
-- chave natural pra deduplicar, então usamos subscription_payments como mutex.
--
-- Solução: marca subscription_payments.ltv_credited_at de forma ATÔMICA via
-- UPDATE ... WHERE ltv_credited_at IS NULL. Só a primeira transação enxerga
-- a linha como "não creditada" e prossegue somando ao LTV. As demais são no-op.
--
-- Guard extra (anti linha-gêmea): se já existe OUTRA subscription_payments do
-- mesmo ciclo (mesma company_id + amount + due_date) já creditada, retorna
-- FALSE mesmo que esta linha ainda não esteja creditada — fecha o buraco em
-- que duas linhas representam a mesma cobrança (ex.: uma com asaas_payment_id
-- NULL na original). Esse bug inflou LTV no EcoSistema; prevenimos aqui.
--
-- Retorno: TRUE = creditou agora (caller registra a receita em
-- admin_financial_transactions); FALSE = no-op / já creditado.
--
-- GRANT: somente service_role. O crédito de LTV é efeito do webhook Asaas
-- (edge function com service_role). O tenant autenticado NÃO chama esta RPC.
--
-- Idempotente: CREATE OR REPLACE. SECURITY DEFINER + search_path fixo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.credit_ltv_once_for_payment(
  p_asaas_payment_id TEXT,
  p_company_id UUID,
  p_amount NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed BOOLEAN := FALSE;
  v_amount NUMERIC;
  v_due_date DATE;
  v_cycle_dupe BOOLEAN := FALSE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN FALSE;
  END IF;

  -- Guard 1: nunca creditar sem asaas_payment_id real. A função usa
  -- subscription_payments.asaas_payment_id como mutex; sem id não-vazio não há
  -- linha confiável pra "reivindicar" e o crédito ficaria solto.
  IF p_asaas_payment_id IS NULL OR btrim(p_asaas_payment_id) = '' THEN
    RETURN FALSE;
  END IF;

  -- Guard 2: dedup por CICLO. Descobre (amount, due_date) da linha apontada por
  -- este asaas_payment_id e checa se QUALQUER OUTRA linha do mesmo ciclo (mesma
  -- company_id + amount + due_date) já teve LTV creditado. Se sim, no-op.
  SELECT sp.amount, sp.due_date
    INTO v_amount, v_due_date
    FROM public.subscription_payments sp
   WHERE sp.asaas_payment_id = p_asaas_payment_id
   ORDER BY sp.ltv_credited_at NULLS LAST
   LIMIT 1;

  IF v_amount IS NOT NULL AND v_due_date IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.subscription_payments sp2
       WHERE sp2.company_id = p_company_id
         AND sp2.amount = v_amount
         AND sp2.due_date = v_due_date
         AND sp2.ltv_credited_at IS NOT NULL
         AND COALESCE(sp2.asaas_payment_id, '') <> p_asaas_payment_id
    ) INTO v_cycle_dupe;

    IF v_cycle_dupe THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Reivindicação atômica: só uma transação enxerga ltv_credited_at IS NULL.
  WITH claimed AS (
    UPDATE public.subscription_payments
       SET ltv_credited_at = now()
     WHERE asaas_payment_id = p_asaas_payment_id
       AND ltv_credited_at IS NULL
     RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM claimed) INTO v_claimed;

  IF NOT v_claimed THEN
    -- Já creditado por outro caller, ou não há subscription_payment com esse id.
    RETURN FALSE;
  END IF;

  UPDATE public.companies
     SET ltv = GREATEST(0, COALESCE(ltv, 0) + p_amount)
   WHERE id = p_company_id;

  RETURN TRUE;
END;
$$;

-- Crédito de LTV é efeito do webhook (service_role). Tenant não chama.
GRANT EXECUTE ON FUNCTION public.credit_ltv_once_for_payment(TEXT, UUID, NUMERIC)
  TO service_role;
