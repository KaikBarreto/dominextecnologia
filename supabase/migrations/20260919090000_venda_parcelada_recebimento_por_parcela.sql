-- =====================================================================
-- Venda parcelada no cartão (Asaas) — baixa POR PARCELA, não por venda
-- =====================================================================
-- INCIDENTE ARMADO (Glacial Cold Brasil, 2026-09-17): 3 vendas parceladas
-- reais com a 1ª parcela ainda pendente (`53a48303…` R$3.400, `3b388e52…`
-- e `e83ac994…` R$550 cada). No instante em que a 1ª parcela de QUALQUER
-- uma confirmar no Asaas, `apply_tenant_charge_payment` (a RPC de baixa
-- TOTAL, correta para cobrança avulsa) marca:
--   - `tenant_charges.status = 'CONFIRMED'`      (vira etiqueta "Paga" em
--     `FinanceCobrancas.tsx`, mesmo faltando 9 de 10 parcelas)
--   - `financial_transactions.is_paid = true`    no recebível INTEIRO
-- porque essa RPC só sabe achar a cobrança por `asaas_payment_id` — e a
-- Asaas grava, em `tenant_charges`, só o `payment.id` da 1ª parcela (é o
-- que a criação devolve). Toda parcela tem seu PRÓPRIO `payment.id`, mas
-- `payment.installment` (o id do AGRUPAMENTO) é o mesmo em todas — inclusive
-- na 1ª. Ver `isInstallmentPaymentEvent` em tenant-asaas-webhook/index.ts,
-- já usado desde a migration/commit anterior (1.24.29) para não fabricar
-- tarifa fantasma; esta migration usa o MESMO sinal para rotear a baixa.
--
-- DESENHO (aprovado pelo Tech Lead, não reaberto aqui):
-- - A MÃE (financial_transactions) continua 1 linha, valor CHEIO. Preserva a
--   decisão da 1.24.18 ("a empresa vende R$789 e recebe R$789; quem parcela
--   é o CLIENTE") — não fatiar o recebível.
-- - Cada parcela confirmada vira uma FILHA `category='Recebimento parcial'`
--   (mesmo mecanismo de `20260523234208_pagamento_parcial_recebivel.sql`,
--   já testado e em produção para baixa manual). O trigger
--   `trg_recalc_amount_received` (já existe, INTOCADO aqui) soma as filhas em
--   `amount_received` e só liga `is_paid` quando a soma cobre o total.
-- - Cada filha ganha uma NETA de tarifa = `value - netValue` DAQUELA
--   parcela (nunca do total) — mesmo padrão de `buildReceiptFeeRow` em
--   `useFinancial.ts`.
-- - `getDreAmount` (`src/lib/dre-regime.ts`, já entregue) exige filha REAL
--   para confiar em `amount_received`. Com filhas de verdade, o DRE acerta
--   sozinho. Zero mudança de front nesta migration.
--
-- POR QUE NÃO precisamos de `installmentNumber`/`installmentCount` do
-- payload para saber quando é "a última parcela": o Asaas NÃO manda o total
-- de parcelas no payload do webhook (só `installmentNumber`, a posição, e
-- isso mesmo nem sempre — texto "Parcela X de Y" só existe na `description`,
-- que é editável, PT-BR-dependente e não é fonte de dado). Em vez de
-- depender disso, deixamos o PRÓPRIO trigger decidir: depois de inserir a
-- filha, lemos `financial_transactions.is_paid` da mãe (o trigger já rodou,
-- é AFTER INSERT síncrono). Só quando a soma das filhas cobre o valor total
-- da venda é que `tenant_charges.status` vira `CONFIRMED`. Isso é robusto a
-- venda de qualquer número de parcelas, a parcelas fora de ordem, e não
-- depende de nenhum campo que o Asaas possa não mandar.
--
-- CONCORRÊNCIA REAL OBSERVADA EM PRODUÇÃO: a venda `2a2743c9-640f-4d06-
-- a97a-5069fe72a1bf` (Aldebaran, R$3.133,00, JÁ CONFIRMADA, ver nota de
-- reconstrução no fim) teve as 10 parcelas confirmadas pelo Asaas em ~4
-- segundos uma da outra (cartão de crédito: o emissor garante o parcelamento
-- inteiro no momento da compra, então TODAS as parcelas futuras chegam
-- como CONFIRMED quase juntas, não uma por mês) — 10 POSTs concorrentes no
-- MESMO webhook, para a MESMA venda. O `FOR UPDATE` no SELECT da cobrança
-- por `asaas_payment_id` OU `asaas_installment_id` serializa essas 10
-- chamadas da RPC nesta MESMA linha, uma de cada vez — sem isso, duas
-- transações concorrentes poderiam somar filhas com base num snapshot
-- desatualizado da mãe e nunca fechar `is_paid`.
--
-- IDEMPOTÊNCIA POR PARCELA (não só por evento): a Asaas reentrega evento
-- (o dedupe de `tenant_payment_webhook_events.event_id` já cobre a MESMA
-- entrega), mas o `UNIQUE` parcial em `financial_transactions.asaas_
-- payment_id` cobre reprocessamento por QUALQUER caminho (reentrega tardia,
-- replay manual, bug futuro) sem depender do dedupe de evento — `ON CONFLICT
-- DO NOTHING` na filha garante zero duplicata mesmo assim.
--
-- NÃO TENTAMOS RECONSTRUIR AS 2 VENDAS JÁ CONFIRMADAS SEM FILHA
-- (`2a2743c9…` R$3.133,00 e `1107d0a2…`(*) R$550,00): são dado histórico já
-- gravado pela RPC antiga (baixa total, sem filha). Reescrever isso é
-- decisão de correção de dado, caso a caso — levantamento devolvido à parte
-- ao Tech Lead/CEO, não feito aqui.
-- (*) grupo de parcela real do outro caso citado no briefing; não
-- reconfirmado nesta migration por ser fora de escopo (auditoria de dado).
-- =====================================================================


-- 1) tenant_charges.asaas_installment_id
--    Guarda `payment.installment` (id do AGRUPAMENTO de parcelas do Asaas).
--    É o ÚNICO jeito das parcelas 2..N encontrarem esta cobrança: seu
--    `payment.id` nunca existiu em `tenant_charges` (só o da 1ª parcela foi
--    gravado na criação). Populada por `tenant-asaas-create-charge` quando
--    `installmentCount > 1`, e também via backfill nesta própria RPC (na
--    1ª chamada que processa qualquer parcela, se ainda não tiver sido
--    gravada — cobre venda antiga que nunca teve a coluna).
--    Índice NÃO-único de propósito: não é chave de posse de linha (isso
--    continua sendo `id`/`asaas_payment_id`), só acelera o lookup de
--    fallback.
ALTER TABLE public.tenant_charges
  ADD COLUMN IF NOT EXISTS asaas_installment_id text;

COMMENT ON COLUMN public.tenant_charges.asaas_installment_id IS
  'payment.installment do Asaas — id do AGRUPAMENTO de parcelas (mesmo valor em TODAS as parcelas da venda, inclusive a 1ª). asaas_payment_id só guarda o id da 1ª parcela; este campo é o fallback que permite achar a cobrança a partir de uma parcela 2..N.';

CREATE INDEX IF NOT EXISTS idx_tenant_charges_asaas_installment_id
  ON public.tenant_charges (asaas_installment_id)
  WHERE asaas_installment_id IS NOT NULL;


-- 2) financial_transactions.asaas_payment_id
--    Idempotência POR PARCELA (independente do dedupe de evento em
--    tenant_payment_webhook_events.event_id): cada filha "Recebimento
--    parcial" nascida de uma parcela do Asaas carrega o payment.id DAQUELA
--    parcela. UNIQUE parcial (só quando preenchido) — a esmagadora maioria
--    das linhas do banco não vem do Asaas e continua NULL sem custo.
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS asaas_payment_id text;

COMMENT ON COLUMN public.financial_transactions.asaas_payment_id IS
  'payment.id do Asaas que gerou ESTA linha (filha de recebimento parcial de uma parcela). UNIQUE parcial garante que reprocessar a mesma parcela nunca duplica a filha. NULL na esmagadora maioria das linhas (não vem do Asaas).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_transactions_asaas_payment_id
  ON public.financial_transactions (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;


-- 3) RPC apply_tenant_charge_installment_payment
--    Baixa de UMA parcela de uma venda parcelada. Acha a cobrança por
--    asaas_payment_id OU asaas_installment_id, com FOR UPDATE (serializa
--    reentregas concorrentes de VÁRIAS parcelas do MESMO grupo — ver nota
--    de concorrência real no cabeçalho). Insere filha + neta só se a chave
--    (asaas_payment_id da parcela) ainda não existir. Só marca
--    tenant_charges CONFIRMED quando a MÃE (financial_transactions) fecha
--    is_paid=true — ou seja, na ÚLTIMA parcela, seja qual for a ordem em
--    que elas chegarem.
CREATE OR REPLACE FUNCTION public.apply_tenant_charge_installment_payment(
  p_asaas_payment_id      text,
  p_asaas_installment_id  text,
  p_value                 numeric,
  p_net_value             numeric DEFAULT NULL::numeric,
  p_paid_at               timestamp with time zone DEFAULT now(),
  p_installment_number    integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge          public.tenant_charges%ROWTYPE;
  v_parent          public.financial_transactions%ROWTYPE;
  v_child_id        uuid;
  v_fee             numeric;
  v_fee_exists      boolean := false;
  v_fee_posted      boolean := false;
  v_auto_fees       boolean := false;
  v_fee_category    text    := 'Tarifas e Taxas';
  v_is_paid         boolean := false;
  v_amount_received numeric;
  v_installment_tag text;
BEGIN
  IF p_asaas_payment_id IS NULL OR length(trim(p_asaas_payment_id)) = 0 THEN
    RAISE EXCEPTION '[apply_tenant_charge_installment_payment] asaas_payment_id obrigatório';
  END IF;
  IF p_value IS NULL OR p_value <= 0 THEN
    RAISE EXCEPTION '[apply_tenant_charge_installment_payment] p_value deve ser positivo (recebido: %)', p_value;
  END IF;

  v_installment_tag := CASE WHEN p_installment_number IS NOT NULL
                             THEN ' (parcela ' || p_installment_number::text || ')'
                             ELSE '' END;

  -- (a) acha a cobrança; lock serializa reentregas/parcelas concorrentes do
  --     MESMO grupo (ver nota de concorrência real no cabeçalho).
  SELECT * INTO v_charge
  FROM public.tenant_charges
  WHERE asaas_payment_id = p_asaas_payment_id
     OR (p_asaas_installment_id IS NOT NULL AND asaas_installment_id = p_asaas_installment_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'charge_not_found',
      'asaas_payment_id', p_asaas_payment_id,
      'asaas_installment_id', p_asaas_installment_id
    );
  END IF;

  -- Backfill do vínculo: garante que a PRÓXIMA parcela (payment.id diferente
  -- desta) já ache esta charge por asaas_installment_id, mesmo que esta
  -- venda nunca tenha passado por tenant-asaas-create-charge com a coluna
  -- nova (venda anterior a esta migration).
  IF p_asaas_installment_id IS NOT NULL
     AND v_charge.asaas_installment_id IS DISTINCT FROM p_asaas_installment_id THEN
    UPDATE public.tenant_charges
    SET asaas_installment_id = p_asaas_installment_id,
        updated_at = now()
    WHERE id = v_charge.id;
  END IF;

  -- (b) acha o recebível MÃE (linha cheia — nunca fatiada, decisão 1.24.18).
  SELECT * INTO v_parent
  FROM public.financial_transactions
  WHERE tenant_charge_id  = v_charge.id
    AND company_id        = v_charge.company_id
    AND transaction_type  = 'entrada'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'result', 'receivable_not_found',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id
    );
  END IF;

  -- (c) idempotência POR PARCELA: UNIQUE parcial em asaas_payment_id.
  --     Reentrega do MESMO evento cai no ON CONFLICT DO NOTHING — nunca
  --     duplica filha, mesmo se o dedupe de evento (event_id) falhar.
  INSERT INTO public.financial_transactions (
    company_id, transaction_type, amount, description, category,
    customer_id, cost_center_id, transaction_date, due_date, paid_date,
    is_paid, parent_transaction_id, tenant_charge_id, asaas_payment_id,
    created_by
  ) VALUES (
    v_charge.company_id,
    'entrada',
    p_value,
    'Recebimento parcial' || v_installment_tag || ' — '
      || COALESCE(v_parent.description, 'cobrança #' || v_charge.id::text),
    'Recebimento parcial',
    v_parent.customer_id,
    v_parent.cost_center_id,
    p_paid_at::date,
    v_parent.due_date,
    p_paid_at::date,
    true,
    v_parent.id,
    v_charge.id,
    p_asaas_payment_id,
    NULL
  )
  ON CONFLICT (asaas_payment_id) WHERE (asaas_payment_id IS NOT NULL) DO NOTHING
  RETURNING id INTO v_child_id;

  IF v_child_id IS NULL THEN
    -- Esta PARCELA já foi processada antes (reentrega) — no-op idempotente.
    -- Não mexe em tenant_charges nem tenta lançar tarifa de novo.
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_applied',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id,
      'asaas_payment_id', p_asaas_payment_id
    );
  END IF;

  -- (d) [TARIFA] neta = value - netValue DESTA parcela (nunca do total da
  --     venda — era exatamente esse o bug fabricando 90% de tarifa fantasma
  --     em 1.24.29). Mesmo padrão de buildReceiptFeeRow (useFinancial.ts) e
  --     mesmo gate de config (auto_post_fees) do irmão apply_tenant_charge_
  --     payment, para o tenant que desligou tarifa automática não ver
  --     comportamento diferente entre baixa total e baixa parcelada.
  SELECT COALESCE(tpa.auto_post_fees, true),
         COALESCE(NULLIF(trim(tpa.default_fee_category), ''), 'Tarifas e Taxas')
    INTO v_auto_fees, v_fee_category
  FROM public.tenant_payment_accounts tpa
  WHERE tpa.company_id = v_charge.company_id
  LIMIT 1;

  IF NOT FOUND THEN
    v_auto_fees := false;
    v_fee_category := 'Tarifas e Taxas';
  END IF;

  IF v_auto_fees AND p_net_value IS NOT NULL AND p_net_value < p_value THEN
    v_fee := p_value - p_net_value;

    -- Idempotência da neta: amarrada ao ID da filha desta parcela (não ao
    -- tenant_charge_id, que é compartilhado por TODAS as parcelas — usar
    -- tenant_charge_id aqui faria a 2ª parcela em diante nunca lançar tarifa
    -- por achar que "já existe despesa vinculada a esta cobrança").
    SELECT EXISTS (
      SELECT 1 FROM public.financial_transactions
      WHERE parent_transaction_id = v_child_id
        AND company_id            = v_charge.company_id
        AND transaction_type      = 'saida'
    ) INTO v_fee_exists;

    IF NOT v_fee_exists THEN
      INSERT INTO public.financial_transactions (
        company_id, transaction_type, amount, description, category,
        cost_center_id, is_paid, paid_date, transaction_date,
        tenant_charge_id, parent_transaction_id, account_id, customer_id,
        created_by
      ) VALUES (
        v_charge.company_id,
        'saida',
        v_fee,
        'Tarifa de recebimento (Asaas) — cobrança #' || v_charge.id::text || v_installment_tag,
        v_fee_category,
        v_parent.cost_center_id,
        true,
        p_paid_at::date,
        p_paid_at::date,
        v_charge.id,
        v_child_id,   -- neta da FILHA desta parcela, não da mãe
        NULL,
        NULL,         -- tarifa é custo da plataforma, não do cliente
        NULL
      );
      v_fee_posted := true;
    END IF;
  END IF;

  -- (e) o trigger trg_recalc_amount_received já rodou (AFTER INSERT na
  --     filha, síncrono) e atualizou amount_received/is_paid na MÃE. Lê o
  --     resultado para decidir se a VENDA INTEIRA está quitada — só então a
  --     cobrança vira CONFIRMED. Deixa o trigger trabalhar; esta função não
  --     recalcula nada por conta própria.
  SELECT is_paid, amount_received INTO v_is_paid, v_amount_received
  FROM public.financial_transactions
  WHERE id = v_parent.id;

  IF v_is_paid THEN
    UPDATE public.tenant_charges
    SET status       = 'CONFIRMED',
        payment_date = p_paid_at,
        updated_at   = now()
    WHERE id = v_charge.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'paid',
    'charge_id', v_charge.id,
    'company_id', v_charge.company_id,
    'child_id', v_child_id,
    'fee_posted', v_fee_posted,
    'amount_received', v_amount_received,
    'receivable_fully_paid', v_is_paid
  );
END;
$function$;

-- ACL: só service_role executa (é esta RPC que o webhook do Asaas chama
-- para dar baixa de PARCELA — perder o grant é a baixa automática de venda
-- parcelada silenciosamente parar de funcionar até um cliente reclamar).
REVOKE ALL ON FUNCTION public.apply_tenant_charge_installment_payment(text, text, numeric, numeric, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_installment_payment(text, text, numeric, numeric, timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_installment_payment(text, text, numeric, numeric, timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tenant_charge_installment_payment(text, text, numeric, numeric, timestamptz, integer) TO service_role;
