-- =============================================================================
-- Correções pré-existentes encontradas no E2E de "cliente escolhe as parcelas"
-- =============================================================================
-- 1) apply_tenant_charge_installment_payment: idempotência por parcela quebrada
--    pela guarda do PDV. O gatilho BEFORE INSERT
--    tg_pdv_guard_legacy_receivable_writer_v2 (migration 20261107130500) valida
--    saldo ANTES do ON CONFLICT DO NOTHING e levanta 23514
--    PDV_RECEIVABLE_ALLOCATION_EXCEEDS_BALANCE na reentrega de parcela já
--    baixada quando a mãe está (quase) quitada. Em produção: PAYMENT_RECEIVED
--    (crédito, mesmo payment.id do PAYMENT_CONFIRMED) virava 500 e a Asaas
--    parava a fila do tenant. Correção mínima sobre a DEFINIÇÃO VIVA
--    (pg_get_functiondef em 2026-11-26, md5 21697551f4402558f6e990dee5db03ec):
--    checagem explícita da filha antes do INSERT + captura do 23514 do PDV
--    como segunda defesa. Retorno 'already_applied' idêntico ao de antes.
--    Grants preservados pelo CREATE OR REPLACE (só service_role executa).
--
-- 2) tenant_payment_webhook_events_status_check não aceitava 'error' (toda
--    falha do webhook) nem 'orphan' (pagamento sem empresa resolvida). As duas
--    gravações falhavam caladas: motivo do erro perdido, órfão sem rastro. O
--    fluxo de duplicado só trata 'processed' como concluído, então aceitar os
--    dois valores só passa a registrar, sem mudar comportamento.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Baixa por parcela idempotente com a guarda do PDV
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_tenant_charge_installment_payment(p_asaas_payment_id text, p_asaas_installment_id text, p_value numeric, p_net_value numeric DEFAULT NULL::numeric, p_paid_at timestamp with time zone DEFAULT now(), p_installment_number integer DEFAULT NULL::integer)
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
  v_heal            jsonb   := NULL;
  v_err_detail      text;
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
  WHERE tenant_charge_id      = v_charge.id
    AND company_id            = v_charge.company_id
    AND transaction_type      = 'entrada'
    AND parent_transaction_id IS NULL
  LIMIT 1;

  -- (b2) AUTO-CURA. Sem a mãe, cada parcela confirmada era dinheiro entrando e
  --      sumindo. A cura roda depois do FOR UPDATE de (a), então as parcelas do
  --      mesmo grupo serializam e só a primeira a chegar cria a mãe.
  IF NOT FOUND THEN
    v_heal := public.rebuild_tenant_charge_receivable(
      v_charge.id,
      'baixa de parcela de venda parcelada'
    );

    IF COALESCE((v_heal->>'healed')::boolean, false) THEN
      SELECT * INTO v_parent
      FROM public.financial_transactions
      WHERE id = (v_heal->>'receivable_id')::uuid;
    END IF;

    IF NOT FOUND OR v_parent.id IS NULL THEN
      RAISE WARNING '[apply_tenant_charge_installment_payment] parcela % da cobrança % (empresa %) confirmada SEM recebível no financeiro; cura não aplicada (%). Dinheiro entrou e não aparece.',
        COALESCE(p_installment_number::text, '?'), v_charge.id, v_charge.company_id,
        COALESCE(v_heal->>'status', 'missing');

      RETURN jsonb_build_object(
        'ok', false,
        'result', 'receivable_not_found',
        'charge_id', v_charge.id,
        'company_id', v_charge.company_id,
        'receivable_status', COALESCE(v_heal->>'status', 'missing'),
        'heal', v_heal
      );
    END IF;
  END IF;

  -- (c0) 2026-11-26. JÁ BAIXADA? Checagem explícita ANTES do INSERT.
  --      O ON CONFLICT abaixo era a única idempotência, mas o gatilho BEFORE
  --      INSERT tg_pdv_guard_legacy_receivable_writer_v2 (20261107130500) roda
  --      ANTES do ON CONFLICT e levanta 23514 PDV_RECEIVABLE_ALLOCATION_EXCEEDS_
  --      BALANCE quando a mãe já está (quase) toda recebida. Efeito em produção:
  --      PAYMENT_RECEIVED (crédito da parcela, mesmo payment.id do
  --      PAYMENT_CONFIRMED semanas antes) virava 500 e travava a fila do webhook.
  --      Mesmo escopo do irmão apply_tenant_charge_payment (asaas_payment_id +
  --      company). Cai no MESMO retorno 'already_applied' de antes, sem tocar
  --      em nada: é o comportamento anterior à guarda do PDV.
  IF EXISTS (
    SELECT 1 FROM public.financial_transactions ft
     WHERE ft.asaas_payment_id = p_asaas_payment_id
       AND ft.company_id       = v_charge.company_id
  ) THEN
    v_child_id := NULL;
  ELSE
  -- (c) idempotência POR PARCELA: UNIQUE parcial em asaas_payment_id.
  --     Reentrega do MESMO evento cai no ON CONFLICT DO NOTHING — nunca
  --     duplica filha, mesmo se o dedupe de evento (event_id) falhar.
  --     Segunda linha de defesa: se a guarda do PDV levantar saldo excedido /
  --     já pago e a filha desta parcela EXISTIR (corrida resolvida por outro
  --     caminho), é reentrega -> already_applied. Sem a filha, o erro é real
  --     e sobe.
  BEGIN
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
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_err_detail = PG_EXCEPTION_DETAIL;
      IF v_err_detail IN ('PDV_RECEIVABLE_ALLOCATION_EXCEEDS_BALANCE',
                          'PDV_RECEIVABLE_ALREADY_PAID')
         AND EXISTS (
           SELECT 1 FROM public.financial_transactions ft
            WHERE ft.asaas_payment_id = p_asaas_payment_id
              AND ft.company_id       = v_charge.company_id
         ) THEN
        v_child_id := NULL;
      ELSE
        RAISE;
      END IF;
  END;
  END IF;

  IF v_child_id IS NULL THEN
    -- Esta PARCELA já foi processada antes (reentrega) — no-op idempotente.
    -- Não mexe em tenant_charges nem tenta lançar tarifa de novo.
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_applied',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id,
      'asaas_payment_id', p_asaas_payment_id,
      'receivable_status', CASE WHEN v_heal IS NULL THEN 'ok' ELSE 'healed' END,
      'heal', v_heal
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
    'receivable_fully_paid', v_is_paid,
    'receivable_status', CASE WHEN v_heal IS NULL THEN 'ok' ELSE 'healed' END,
    'heal', v_heal
  );
END;
$function$;


-- -----------------------------------------------------------------------------
-- 2. CHECK de status do log de eventos do webhook
-- -----------------------------------------------------------------------------
ALTER TABLE public.tenant_payment_webhook_events
  DROP CONSTRAINT IF EXISTS tenant_payment_webhook_events_status_check;
ALTER TABLE public.tenant_payment_webhook_events
  ADD CONSTRAINT tenant_payment_webhook_events_status_check
  CHECK (status = ANY (ARRAY['received','processing','processed','failed','skipped','error','orphan']::text[]));
