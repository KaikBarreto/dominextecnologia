-- =====================================================================
-- Cobrança avulsa → "a receber" automático no Financeiro do tenant
-- =====================================================================
-- GAP FECHADO: cobrança avulsa paga marcava tenant_charges.status=CONFIRMED
-- e o webhook processava, MAS o valor não aparecia no Financeiro do tenant
-- porque nenhum recebível era criado em financial_transactions.
--
-- SOLUÇÃO em 2 partes:
--   1) Coluna de config `auto_post_to_finance` em tenant_payment_accounts
--      (ligado por padrão) — controla se cada cobrança gera automaticamente
--      um "a receber" no Financeiro.
--   2) RPC SECURITY DEFINER `create_tenant_charge_receivable` — chamada pela
--      edge de create-charge após a cobrança ser criada no Asaas; insere o
--      recebível em financial_transactions com transaction_type='entrada',
--      is_paid=false, tenant_charge_id = elo; idempotente (existência prévia
--      do elo = retorna id existente sem duplicar).
--
-- A baixa do recebível já está implementada em apply_tenant_charge_payment
-- (20260820120200): marca is_paid=true + paid_date + amount_received na row
-- financial_transactions com tenant_charge_id correspondente.
--
-- MEMÓRIA DO TIME: RPC SECURITY DEFINER nova → REVOKE de anon/authenticated
-- (default privilege do schema public concede EXECUTE; REVOKE FROM PUBLIC
-- não basta). Padrão: REVOKE FROM PUBLIC + FROM anon + FROM authenticated;
-- GRANT só ao service_role.
-- =====================================================================


-- =====================================================================
-- 1) Coluna de config: auto_post_to_finance
-- =====================================================================
-- Controla se cada cobrança emitida gera automaticamente um "a receber"
-- em financial_transactions (transaction_type='entrada', is_paid=false).
-- Ligado por padrão (true). O tenant pode desabilitar se quiser gerenciar
-- o Financeiro manualmente.
-- =====================================================================
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS auto_post_to_finance boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenant_payment_accounts.auto_post_to_finance IS
  'Quando true (padrão), cada cobrança emitida gera automaticamente um "a receber" em financial_transactions (transaction_type=entrada, is_paid=false, tenant_charge_id=elo). A baixa ocorre automaticamente via webhook (apply_tenant_charge_payment). Desabilitar se o tenant quiser gerenciar o Financeiro manualmente.';


-- =====================================================================
-- 2) RPC create_tenant_charge_receivable
-- =====================================================================
-- Chamada pela edge de criação de cobrança (service_role) após a cobrança
-- ser registrada no Asaas e ter seu ID confirmado. Insere o recebível em
-- financial_transactions, vinculando via tenant_charge_id.
--
-- IDEMPOTÊNCIA: se já existir um financial_transactions com aquele
-- tenant_charge_id, retorna o id existente sem duplicar (guard antes do
-- INSERT). Idempotência por tenant_charge_id, não por (company_id + amount),
-- pois o elo é semanticamente único.
--
-- POSSE: p_company_id é resolvido pela edge via profile (nunca do payload
-- de fora). Mesmo sendo SECURITY DEFINER, o predicado de company_id é
-- reaplicado no corpo do INSERT — RLS não protege funções SECURITY DEFINER.
--
-- Retorna o UUID do recebível criado (ou existente).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_tenant_charge_receivable(
  p_company_id      uuid,
  p_tenant_charge_id uuid,
  p_customer_id     uuid,
  p_amount          numeric,
  p_due_date        date,
  p_description     text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id      uuid;
BEGIN
  -- Validações mínimas de entrada
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_company_id obrigatório';
  END IF;
  IF p_tenant_charge_id IS NULL THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_tenant_charge_id obrigatório';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_amount deve ser positivo (recebido: %)', p_amount;
  END IF;
  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RAISE EXCEPTION '[create_tenant_charge_receivable] p_description obrigatório';
  END IF;

  -- Guard de idempotência: retorna id existente sem inserir de novo
  SELECT id INTO v_existing_id
  FROM public.financial_transactions
  WHERE tenant_charge_id = p_tenant_charge_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- INSERT do recebível — predicado de posse (company_id) explícito no corpo
  -- pois RLS não cobre SECURITY DEFINER.
  INSERT INTO public.financial_transactions (
    company_id,
    transaction_type,
    amount,
    description,
    customer_id,
    due_date,
    tenant_charge_id,
    is_paid,
    transaction_date,
    -- account_id e category ficam NULL (dev-financeiro define estratégia depois)
    account_id,
    category,
    created_by
  ) VALUES (
    p_company_id,
    'entrada',
    p_amount,
    p_description,
    p_customer_id,
    p_due_date,
    p_tenant_charge_id,
    false,
    now()::date,
    NULL,
    NULL,
    NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text) IS
  'Cria um "a receber" (financial_transactions, transaction_type=entrada, is_paid=false) vinculado a uma cobrança online do tenant (tenant_charge_id). Idempotente: se o elo já existir, retorna o id sem duplicar. Chamada pela edge de criação de cobrança (service_role). SECURITY DEFINER — predicado de company_id reaplicado no corpo. account_id e category ficam NULL (estratégia de categoria definida pelo dev-financeiro em iteração futura).';


-- =====================================================================
-- GRANTS — invariante do time
-- =====================================================================
-- Default privilege do schema public concede EXECUTE a anon/authenticated.
-- REVOKE FROM PUBLIC não basta (só remove o grant do role PUBLIC; os grants
-- por-role de anon/authenticated foram concedidos separadamente via default
-- privileges). REVOKE explícito dos dois roles é obrigatório.
-- Esta RPC é operação de SERVIDOR — só service_role pode chamar.
-- =====================================================================
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text) TO service_role;
