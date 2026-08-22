-- =====================================================================
-- Tarifa Asaas → despesa automática no Financeiro do tenant
-- =====================================================================
-- PROBLEMA: quando uma cobrança é paga via Asaas, o Asaas desconta uma
-- tarifa (ex: R$175,00 cobrado → R$174,01 líquido = tarifa R$0,99).
-- Antes desta migration o webhook registrava apenas a RECEITA cheia em
-- financial_transactions, deixando o saldo do Financeiro do tenant
-- acima do que efetivamente caiu no banco.
--
-- SOLUÇÃO:
--   1) Coluna `auto_post_fees` em tenant_payment_accounts — controla
--      se a tarifa de recebimento deve ser lançada automaticamente como
--      despesa (transaction_type='saida') ao confirmar o pagamento.
--      Ligado por padrão (true).
--   2) RPC apply_tenant_charge_payment modificada: após baixar o
--      recebível (entrada, valor CHEIO), calcula a tarifa (value - p_net)
--      e, se auto_post_fees=true, insere uma 'saida' idempotente
--      (guard por tenant_charge_id + transaction_type='saida').
--
-- MODELO CONTÁBIL: receita bruta intacta (entrada = valor cheio) +
-- tarifa como despesa separada (saida = tarifa). Isso preserva a
-- visibilidade de receita bruta e destaca o custo do meio de pagamento.
--
-- category='Tarifas e Taxas': texto livre em uso real pelos tenants
-- (confirmado via SELECT DISTINCT category). Sem FK, sem seed por
-- company — o tenant vê a despesa já categorizada de forma legível.
--
-- MEMÓRIA DO TIME: CREATE OR REPLACE reseta grants → REVOKE+GRANT
-- explícitos após a redefinição da RPC.
-- =====================================================================


-- =====================================================================
-- 1) Coluna de config: auto_post_fees
-- =====================================================================
-- Quando true (padrão), a tarifa cobrada pelo Asaas ao receber um
-- pagamento é lançada automaticamente como despesa (transaction_type=
-- 'saida', category='Tarifas e Taxas') em financial_transactions.
-- Desabilitar apenas se o tenant quiser registrar as tarifas manualmente.
-- =====================================================================
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS auto_post_fees boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenant_payment_accounts.auto_post_fees IS
  'Quando true (padrão), a tarifa de recebimento cobrada pelo Asaas '
  '(valor_cobrança - líquido_recebido) é lançada automaticamente como '
  'despesa em financial_transactions (transaction_type=saida, '
  'category=''Tarifas e Taxas'', is_paid=true) ao confirmar o pagamento '
  'via webhook. Desabilitar se o tenant preferir registrar tarifas manualmente.';


-- =====================================================================
-- 2) Recriar apply_tenant_charge_payment com lançamento de tarifa
-- =====================================================================
-- Base: pg_get_functiondef ao vivo (20260822) — não a migration antiga.
-- Adições ao corpo original (marcadas com "-- [TARIFA]"):
--   (e) ler auto_post_fees da tenant_payment_accounts da company
--   (f) se true + p_net IS NOT NULL + p_net < v_charge.value:
--         calcular fee; checar idempotência; INSERT despesa
--   Retorno enriquecido: fee_posted boolean
-- =====================================================================
CREATE OR REPLACE FUNCTION public.apply_tenant_charge_payment(
  p_asaas_payment_id text,
  p_paid_at          timestamp with time zone DEFAULT now(),
  p_net              numeric                  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge        public.tenant_charges%ROWTYPE;
  v_receivables   int     := 0;
  -- [TARIFA] variáveis novas
  v_auto_fees     boolean := false;
  v_fee           numeric;
  v_fee_exists    boolean := false;
  v_fee_posted    boolean := false;
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
  --     fee_posted=null indica que não sabemos (foi processado em entrega anterior)
  IF v_charge.payment_date IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_paid',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id,
      'fee_posted', null
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

  -- [TARIFA] (e) ler config auto_post_fees da conta de pagamento da company
  SELECT COALESCE(tpa.auto_post_fees, true)
    INTO v_auto_fees
  FROM public.tenant_payment_accounts tpa
  WHERE tpa.company_id = v_charge.company_id
  LIMIT 1;

  -- [TARIFA] (f) lançar tarifa como despesa se configurado e houver diferença
  IF v_auto_fees
     AND p_net IS NOT NULL
     AND p_net < v_charge.value
  THEN
    v_fee := v_charge.value - p_net;

    -- Idempotência: se já existe despesa vinculada a esta cobrança, pula
    SELECT EXISTS (
      SELECT 1
      FROM public.financial_transactions
      WHERE tenant_charge_id  = v_charge.id
        AND company_id        = v_charge.company_id
        AND transaction_type  = 'saida'
    ) INTO v_fee_exists;

    IF NOT v_fee_exists THEN
      INSERT INTO public.financial_transactions (
        company_id,
        transaction_type,
        amount,
        description,
        category,
        is_paid,
        paid_date,
        transaction_date,
        tenant_charge_id,
        account_id,
        customer_id,
        created_by
      ) VALUES (
        v_charge.company_id,
        'saida',
        v_fee,
        'Tarifa de recebimento (Asaas) — cobrança #' || v_charge.id::text,
        'Tarifas e Taxas',
        true,
        p_paid_at::date,
        p_paid_at::date,
        v_charge.id,
        NULL,   -- account_id: NULL (mesmo padrão do recebível de entrada)
        NULL,   -- customer_id: tarifa é custo da plataforma, não do cliente
        NULL    -- created_by: NULL (ação automática de sistema)
      );
      v_fee_posted := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'paid',
    'charge_id', v_charge.id,
    'company_id', v_charge.company_id,
    'receivables_settled', v_receivables,
    'fee_posted', v_fee_posted
  );
END;
$function$;

COMMENT ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) IS
  'Confirma pagamento de cobrança online do tenant. '
  '(a) Lock + guard de idempotência na cobrança. '
  '(b) Marca tenant_charges.status=CONFIRMED + payment_date + net_value. '
  '(c) Baixa o recebível (financial_transactions entrada) com is_paid=true + amount_received. '
  '(d) Se auto_post_fees=true na tenant_payment_accounts da company e p_net < value: '
  '    lança despesa (saida, category=''Tarifas e Taxas'') pelo valor da tarifa Asaas. '
  '    Idempotente: guard por (tenant_charge_id + saida) antes de inserir. '
  'Retorna fee_posted=true se a despesa foi inserida nesta chamada, false se não '
  'havia taxa, e null se a cobrança já estava paga (already_paid). '
  'SECURITY DEFINER — predicados de company_id reaplicados no corpo.';


-- =====================================================================
-- GRANTS — invariante do time
-- =====================================================================
-- CREATE OR REPLACE reseta os grants da função para o estado padrão do
-- schema public, que concede EXECUTE a anon e authenticated via default
-- privileges. REVOKE FROM PUBLIC não basta (anon/authenticated têm grants
-- próprios). Revogar os três explicitamente e re-grant só service_role.
-- Confirmar com: SELECT grantee, privilege_type FROM
--   information_schema.role_routine_grants
--   WHERE routine_name = 'apply_tenant_charge_payment';
-- Esperado: service_role + postgres apenas.
-- =====================================================================
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) TO service_role;
