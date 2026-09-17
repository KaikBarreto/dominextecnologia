-- =====================================================================
-- apply_tenant_charge_payment — quitação total para de gravar
-- amount_received cheio sem nunca criar a filha "Recebimento parcial"
-- =====================================================================
-- INCIDENTE: cobrança de R$ 3.133,00 (Glacial Cold Brasil / cliente
-- Aldebaran), paga via Asaas em 2026-09-15, sumiu do DRE em Regime de
-- Caixa (só aparecia em Competência). Causa: esta RPC, na quitação
-- total do recebível espelho, gravava
--
--   amount_received = ft.amount
--
-- numa linha RAIZ sem nunca inserir a filha `category='Recebimento
-- parcial'` que o próprio contrato da coluna exige (ver comentário em
-- `20260523234208_pagamento_parcial_recebivel.sql`:
-- "Soma das filhas ... Sempre 0 em filhas"). Sem filha, o campo
-- descreve um recebimento parcial que nunca existiu — e o cálculo do
-- Caixa (amount - amount_received) zera uma linha que na verdade tem
-- R$ 3.133,00 entrando. Linha de valor zero não entra no relatório:
-- o dinheiro "evapora" do Caixa mesmo estando pago e datado certo.
--
-- POR QUE PARAR DE GRAVAR (em vez de criar a filha):
-- O fluxo legado de baixa manual (`useFinancial.ts` → `markAsPaid`,
-- ramo "quitação total") já resolve exatamente este mesmo caso — uma
-- cobrança paga de uma vez só, sem histórico de parcial — SEM tocar
-- `amount_received`:
--
--   UPDATE financial_transactions SET is_paid = true, paid_date = ...
--   -- (sem amount_received)
--
-- Essa é a origem real do bug: dois caminhos de código gravam o MESMO
-- fato ("cobrança quitada de uma vez") de duas formas diferentes. Esta
-- migration alinha a RPC do Asaas ao caminho legado já provado, em vez
-- de inventar um terceiro comportamento (criar filha).
--
-- O trigger `trg_recalc_amount_received` (mesma migration de origem)
-- só recalcula `amount_received` quando a ROW ALTERADA é filha
-- (`parent_transaction_id` setado + `category='Recebimento parcial'`
-- + `transaction_type='entrada'`). Um UPDATE direto na mãe — como o
-- desta RPC — nunca dispara o trigger. Ou seja: mesmo que a RPC não
-- grave nada em `amount_received`, o valor fica no DEFAULT 0, que é
-- exatamente o que o contrato da coluna descreve para uma mãe sem
-- filhas. Nenhum recálculo do trigger é necessário aqui.
--
-- CONSUMIDORES DE `amount_received` AUDITADOS (nenhum quebra):
-- - DRE (Regime de Caixa/Competência): já blindado por outro dev em
--   `src/lib/dre-regime.ts` para não confiar em `amount_received` sem
--   filha REAL — mas de qualquer forma, com esta migration, a coluna
--   passa a refletir a realidade (0 = não há parcial).
-- - `src/components/financial/FinanceContas.tsx`: só exibe
--   "recebido: X de Y" quando `getStatus(t) === 'parcial'`, e
--   `getStatus` retorna 'paga' (não 'parcial') sempre que
--   `is_paid = true` — independente de `amount_received`. Nenhuma tela
--   muda de comportamento para linha paga de uma vez.
-- - `ReceivableDetailModal.tsx` / `CustomerTransactionDetailModal.tsx`:
--   o bloco "já recebido / restante" só é alcançável (via clique) em
--   linhas com status 'parcial' ou, no caso do modal do cliente, exige
--   `remaining > 0` — que numa quitação total é sempre 0. Não regride.
-- - `update_tenant_charge_local` / `delete_tenant_charge_local`: usam
--   `amount_received > 0` apenas em OR com `is_paid IS TRUE` para
--   decidir se o espelho tem "dinheiro em cima" e deve ser preservado
--   (não editado / não apagado). `is_paid` já cobre sozinho o caso de
--   quitação total — a condição extra em `amount_received` era
--   redundante para este caminho.
-- - Nenhuma RLS policy, view ou outra função lê a coluna (auditado via
--   `pg_policies` e `pg_proc.prosrc` no banco linkado).
--
-- DADOS JÁ GRAVADOS: NÃO corrigidos por esta migration (fora de
-- escopo — decisão de correção de dado é caso a caso com o CEO).
-- Auditoria de tamanho do estrago ficou só em consulta de leitura,
-- reportada à parte.
--
-- Recriada a partir da DEFINIÇÃO VIVA no banco (pg_get_functiondef),
-- não da migration antiga, para não perder alterações de outra sessão.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_tenant_charge_payment(p_asaas_payment_id text, p_paid_at timestamp with time zone DEFAULT now(), p_net numeric DEFAULT NULL::numeric)
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
  --     NÃO grava `amount_received`: esta é uma quitação TOTAL, de uma
  --     vez só, sem filha de "Recebimento parcial" — mesmo contrato do
  --     fluxo legado de baixa manual (useFinancial.ts). Gravar
  --     `amount_received = amount` aqui, sem criar a filha que o
  --     contrato da coluna exige, foi a causa do incidente Aldebaran
  --     (cobrança paga sumindo do DRE em Regime de Caixa).
  UPDATE public.financial_transactions ft
  SET is_paid         = true,
      paid_date       = p_paid_at::date,
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

-- ACL: CREATE OR REPLACE preserva os grants existentes, mas reafirmamos
-- explicitamente (idempotente) pra não depender disso. Estado auditado
-- antes desta migration: só {postgres, service_role} têm EXECUTE — é
-- essa RPC que o webhook do Asaas chama para dar baixa automática;
-- perder o grant para service_role para a baixa automática de
-- funcionar sem ninguém perceber até um cliente reclamar.
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tenant_charge_payment(text, timestamptz, numeric) TO service_role;
