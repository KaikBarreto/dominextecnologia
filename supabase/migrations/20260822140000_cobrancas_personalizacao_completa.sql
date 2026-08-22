-- =====================================================================
-- Módulo Cobranças (Asaas BYO) — PERSONALIZAÇÃO COMPLETA da conta do tenant
-- =====================================================================
-- CONTEXTO: o tenant usa a conta Asaas dele (modelo BYO). Já existiam configs
-- de status, vault_secret_name, auto_post_to_finance, auto_post_fees e
-- default_fine_percent(2.00)/default_interest_percent(1.00). Esta camada
-- fecha a personalização default da cobrança, para a edge/UI pré-preencherem
-- toda nova cobrança a partir da conta:
--   • vencimento padrão (dias a partir de hoje)
--   • desconto por antecipação (% + janela de dias antes do vencimento)
--   • descrição/instrução padrão
--   • meios de pagamento habilitados (Pix / boleto / cartão)
--   • parcelamento máximo no cartão
--   • conta bancária e categoria do Financeiro onde a RECEITA cai
--   • categoria da DESPESA da tarifa Asaas (hoje fixa 'Tarifas e Taxas')
--
-- Além das colunas, ajusta as 2 RPCs do elo com o Financeiro (recriadas a
-- partir da definição VIVA via pg_get_functiondef, não de migration antiga):
--   1) create_tenant_charge_receivable — ganha p_account_id + p_category
--      opcionais no FINAL (compat com chamadas antigas). Passam a preencher
--      account_id/category do recebível (antes fixos em NULL).
--   2) apply_tenant_charge_payment — a despesa da tarifa passa a usar a
--      categoria configurada (tenant_payment_accounts.default_fee_category),
--      com fallback 'Tarifas e Taxas' quando null.
--
-- SCHEMA REAL CONFIRMADO (information_schema, 2026-08-22):
--   financial_accounts(id uuid PK, company_id, name, type, is_active, ...)
--   financial_categories(id, name, type, company_id, ...) — categorias texto
--   financial_transactions.category = text livre; .account_id = uuid;
--   .transaction_type = enum (valores 'entrada'/'saida' já usados).
--
-- MEMÓRIA DO TIME:
--   • RPC SECURITY DEFINER: CREATE OR REPLACE reseta grants → REVOKE explícito
--     de PUBLIC + anon + authenticated e GRANT só service_role, nas DUAS RPCs.
--   • Idempotente: ADD COLUMN IF NOT EXISTS.
-- =====================================================================


-- =====================================================================
-- 1) Novas colunas de config default em tenant_payment_accounts
-- =====================================================================

-- Vencimento padrão em dias a partir de hoje. 0 = vence hoje.
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_due_days int NOT NULL DEFAULT 0;

-- Desconto por antecipação: percentual. NULL = sem desconto default.
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_discount_percent numeric(5,2);

-- Janela do desconto: até quantos dias ANTES do vencimento ele vale.
-- NULL = sem desconto / não aplicável.
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_discount_days int;

-- Descrição/instrução padrão da cobrança. NULL = sem texto default.
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_description text;

-- Meios de pagamento habilitados (todos ligados por padrão).
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS allow_pix boolean NOT NULL DEFAULT true;
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS allow_boleto boolean NOT NULL DEFAULT true;
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS allow_card boolean NOT NULL DEFAULT true;

-- Nº máximo de parcelas no cartão. 1 = à vista (sem parcelamento).
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_max_installments int NOT NULL DEFAULT 1;

-- Conta bancária do Financeiro onde a RECEITA da cobrança cai.
-- ON DELETE SET NULL: apagar a conta não quebra a config (volta a NULL).
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_finance_account_id uuid
    REFERENCES public.financial_accounts(id) ON DELETE SET NULL;

-- Categoria (texto) do Financeiro para a RECEITA das cobranças.
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_income_category text;

-- Categoria (texto) da DESPESA da tarifa Asaas. Default histórico.
ALTER TABLE public.tenant_payment_accounts
  ADD COLUMN IF NOT EXISTS default_fee_category text NOT NULL DEFAULT 'Tarifas e Taxas';

COMMENT ON COLUMN public.tenant_payment_accounts.default_due_days IS
  'Vencimento padrão da cobrança em dias a partir de hoje (0 = vence hoje). A edge usa como due_date default quando o usuário não informa.';
COMMENT ON COLUMN public.tenant_payment_accounts.default_discount_percent IS
  'Desconto % por antecipação aplicado por padrão à cobrança (objeto discount do Asaas). NULL = sem desconto default. Overridável por cobrança.';
COMMENT ON COLUMN public.tenant_payment_accounts.default_discount_days IS
  'Janela do desconto por antecipação: até quantos dias ANTES do vencimento o desconto vale. NULL = sem desconto / não aplicável.';
COMMENT ON COLUMN public.tenant_payment_accounts.default_description IS
  'Descrição/instrução padrão pré-preenchida em toda nova cobrança. NULL = sem texto default.';
COMMENT ON COLUMN public.tenant_payment_accounts.allow_pix IS
  'Habilita Pix como meio de pagamento nas cobranças deste tenant (padrão true).';
COMMENT ON COLUMN public.tenant_payment_accounts.allow_boleto IS
  'Habilita boleto como meio de pagamento nas cobranças deste tenant (padrão true).';
COMMENT ON COLUMN public.tenant_payment_accounts.allow_card IS
  'Habilita cartão de crédito como meio de pagamento nas cobranças deste tenant (padrão true).';
COMMENT ON COLUMN public.tenant_payment_accounts.default_max_installments IS
  'Nº máximo de parcelas no cartão oferecido por padrão (1 = à vista, sem parcelamento).';
COMMENT ON COLUMN public.tenant_payment_accounts.default_finance_account_id IS
  'Conta bancária (financial_accounts) onde a RECEITA das cobranças cai por padrão. Preenche account_id do recebível (financial_transactions.entrada). NULL = sem conta default. ON DELETE SET NULL.';
COMMENT ON COLUMN public.tenant_payment_accounts.default_income_category IS
  'Categoria (texto) do Financeiro para a RECEITA das cobranças. Preenche category do recebível (financial_transactions.entrada). NULL = sem categoria default.';
COMMENT ON COLUMN public.tenant_payment_accounts.default_fee_category IS
  'Categoria (texto) da DESPESA da tarifa Asaas lançada ao confirmar pagamento (financial_transactions.saida). Default ''Tarifas e Taxas''.';


-- =====================================================================
-- 2) create_tenant_charge_receivable — recriada com p_account_id + p_category
-- =====================================================================
-- Base: definição VIVA (pg_get_functiondef, 2026-08-22). Mudanças:
--   • 2 params opcionais no FINAL: p_account_id uuid, p_category text (DEFAULT
--     NULL) — chamadas antigas continuam válidas (sobrecarga por default).
--   • account_id/category do INSERT passam a receber esses params (antes NULL).
-- Restante idêntico: idempotência por tenant_charge_id, is_paid=false,
-- transaction_type='entrada', posse por company_id reaplicada no corpo.
--
-- IMPORTANTE: adicionar params (mesmo com DEFAULT) muda a IDENTIDADE da função
-- no Postgres — CREATE OR REPLACE criaria uma SEGUNDA sobrecarga (6-arg antiga
-- + 8-arg nova) e a chamada de 6 args ficaria AMBÍGUA. Por isso dropamos a
-- assinatura antiga (6 args) explicitamente antes de recriar com 8 args.
-- =====================================================================
DROP FUNCTION IF EXISTS public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text);

CREATE OR REPLACE FUNCTION public.create_tenant_charge_receivable(
  p_company_id       uuid,
  p_tenant_charge_id uuid,
  p_customer_id      uuid,
  p_amount           numeric,
  p_due_date         date,
  p_description      text,
  p_account_id       uuid DEFAULT NULL,
  p_category         text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  -- pois RLS não cobre SECURITY DEFINER. account_id/category agora vêm dos
  -- params (config default da conta, resolvida pela edge). NULL = sem conta/
  -- categoria (mesmo comportamento anterior).
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
    p_account_id,
    p_category,
    NULL
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text) IS
  'Cria um "a receber" (financial_transactions, transaction_type=entrada, is_paid=false) vinculado a uma cobrança online do tenant (tenant_charge_id). Idempotente: se o elo já existir, retorna o id sem duplicar. p_account_id/p_category (opcionais) preenchem a conta/categoria do Financeiro (config default da conta, resolvida pela edge). Chamada pela edge de criação de cobrança (service_role). SECURITY DEFINER — predicado de company_id reaplicado no corpo.';


-- =====================================================================
-- 3) apply_tenant_charge_payment — despesa da tarifa usa categoria configurada
-- =====================================================================
-- Base: definição VIVA (pg_get_functiondef, 2026-08-22). Única mudança:
--   • ao ler auto_post_fees, também lê default_fee_category da conta;
--   • a despesa da tarifa (saida) usa essa categoria, com fallback
--     'Tarifas e Taxas' quando null.
-- Restante idêntico: lock + idempotência da cobrança, baixa do recebível,
-- guard de idempotência da despesa, predicados de company_id no corpo.
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
  v_auto_fees     boolean := false;
  v_fee_category  text    := 'Tarifas e Taxas';
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

  -- [TARIFA] (e) ler config auto_post_fees + categoria da despesa da tarifa
  SELECT COALESCE(tpa.auto_post_fees, true),
         COALESCE(NULLIF(trim(tpa.default_fee_category), ''), 'Tarifas e Taxas')
    INTO v_auto_fees, v_fee_category
  FROM public.tenant_payment_accounts tpa
  WHERE tpa.company_id = v_charge.company_id
  LIMIT 1;

  -- Se não achou conta de pagamento, mantém os defaults das variáveis
  -- (v_auto_fees=false, v_fee_category='Tarifas e Taxas').
  IF NOT FOUND THEN
    v_auto_fees := false;
    v_fee_category := 'Tarifas e Taxas';
  END IF;

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
        v_fee_category,
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
  '    lança despesa (saida) pelo valor da tarifa Asaas, usando a categoria '
  '    configurada (default_fee_category; fallback ''Tarifas e Taxas''). '
  '    Idempotente: guard por (tenant_charge_id + saida) antes de inserir. '
  'Retorna fee_posted=true se a despesa foi inserida nesta chamada, false se não '
  'havia taxa, e null se a cobrança já estava paga (already_paid). '
  'SECURITY DEFINER — predicados de company_id reaplicados no corpo.';


-- =====================================================================
-- 4) GRANTS — invariante do time (CREATE OR REPLACE reseta grants)
-- =====================================================================
-- Default privilege do schema public concede EXECUTE a anon/authenticated.
-- REVOKE FROM PUBLIC não basta. Revogar PUBLIC + anon + authenticated e
-- conceder EXECUTE só ao service_role, nas DUAS RPCs. Estas são operações de
-- SERVIDOR (edge com service_role): criação do recebível e baixa por webhook.
--
-- ATENÇÃO: create_tenant_charge_receivable agora tem NOVA assinatura (8 args).
-- A assinatura antiga (6 args) foi SUBSTITUÍDA pelo CREATE OR REPLACE porque
-- os 2 params novos têm DEFAULT (mesma identidade de sobrecarga base). Os
-- grants abaixo referenciam a assinatura completa nova.
-- =====================================================================
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_charge_receivable(uuid, uuid, uuid, numeric, date, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) TO service_role;
