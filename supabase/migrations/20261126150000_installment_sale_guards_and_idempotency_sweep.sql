-- =============================================================================
-- Guardas de venda parcelada + varredura de idempotência (B + C)
-- =============================================================================
-- B) apply_tenant_charge_payment recusa (sem levantar) cobrança com
--    asaas_installment_id: quitava a venda INTEIRA e lançava tarifa
--    value − p_net com o líquido de UMA parcela (tarifa fantasma de R$ 539,72
--    da Glacial, cobrança 53931cd6). Devolve ok:true, result
--    'installment_sale_requires_per_installment', receivable_status
--    'skipped_installment_sale' (cai no aviso do webhook) e não altera nada.
--    Nenhum fluxo legítimo depende dessa baixa inteira: webhook e reconcile só
--    chamam esta RPC quando o payment NÃO tem `installment`; parcela (inclusive
--    RECEIVED_IN_CASH) vai por apply_tenant_charge_installment_payment.
--
-- C2) Mesmo padrão já corrigido em apply_tenant_charge_installment_payment:
--    o ramo de RECEBIMENTO PARCIAL desta função confiava em ON CONFLICT DO
--    NOTHING atrás do gatilho BEFORE INSERT do PDV, que levanta 23514 antes.
--    Agora: EXISTS antes do INSERT (reentrega -> 'partial_already_applied');
--    23514 PDV_RECEIVABLE_ALLOCATION_EXCEEDS_BALANCE/ALREADY_PAID sem filha
--    (mãe quitada por baixa manual) -> settlement 'receivable_conflict',
--    receivable_status 'conflict', sem levantar. Qualquer outro erro sobe.
--
-- CREATE OR REPLACE a partir da DEFINIÇÃO VIVA (2026-11-26, md5
-- 0fd5018de19054cae51beb7aa33cdea1). Grants preservados (só service_role).
-- =============================================================================

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
  v_mother_id     uuid;
  v_heal          jsonb   := NULL;
  v_recv_status   text;
  -- Baixa com comparação de valor (2026-10-21).
  v_amount        numeric;
  v_received      numeric;
  v_balance       numeric;
  v_child_id      uuid;
  v_settlement    text    := 'none';
  v_mother_desc   text;
  v_mother_cust   uuid;
  v_mother_cc     uuid;
  v_mother_due    date;
  v_err_detail    text;
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

  -- (a2) 2026-11-26. VENDA PARCELADA NO CARTÃO NUNCA É BAIXADA AQUI.
  --      Esta função quita a cobrança INTEIRA e lança tarifa = value − p_net.
  --      Numa venda parcelada (asaas_installment_id preenchido) o value é o
  --      total da venda e o p_net é o líquido de UMA parcela: o reconcile
  --      antigo fabricou assim uma tarifa de R$ 539,72 numa venda de R$ 597
  --      (Glacial, cobrança 53931cd6). A baixa certa é por parcela, em
  --      apply_tenant_charge_installment_payment. Proteção no banco, não em
  --      quem chama. Não levanta (webhook/cron): no-op explícito com aviso;
  --      receivable_status fora de null/'ok'/'healed' cai no aviso do webhook.
  --      Vem ANTES de (b) de propósito: a auto-cura de (b) também quitaria a
  --      venda inteira.
  IF v_charge.asaas_installment_id IS NOT NULL THEN
    RAISE WARNING '[apply_tenant_charge_payment] cobrança % (empresa %) é venda parcelada (agrupamento %); baixa inteira recusada para o payment %.',
      v_charge.id, v_charge.company_id, v_charge.asaas_installment_id, p_asaas_payment_id;
    RETURN jsonb_build_object(
      'ok', true,
      'result', 'installment_sale_requires_per_installment',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id,
      'asaas_payment_id', p_asaas_payment_id,
      'asaas_installment_id', v_charge.asaas_installment_id,
      'fee_posted', false,
      'receivables_settled', 0,
      'receivable_status', 'skipped_installment_sale',
      'settlement', 'none'
    );
  END IF;

  -- (b) idempotência: já pago.
  --     ANTES: return-cedo puro. Isso era exatamente o que impedia a
  --     recuperação do buraco — cobrança já marcada CONFIRMED cujo recebível
  --     foi apagado depois NUNCA mais era olhada por ninguém.
  --     AGORA: continua no-op para tudo, MENOS para o recebível ausente.
  IF v_charge.payment_date IS NOT NULL THEN
    SELECT id INTO v_mother_id
      FROM public.financial_transactions
     WHERE tenant_charge_id      = v_charge.id
       AND company_id            = v_charge.company_id
       AND transaction_type      = 'entrada'
       AND parent_transaction_id IS NULL
     LIMIT 1;

    IF v_mother_id IS NULL THEN
      v_heal := public.rebuild_tenant_charge_receivable(
        v_charge.id,
        'reentrega de pagamento já confirmado'
      );

      IF COALESCE((v_heal->>'healed')::boolean, false) THEN
        v_mother_id := (v_heal->>'receivable_id')::uuid;
        -- Quita SÓ a linha recém-criada. Escopo mínimo de propósito: não
        -- mexe em recebível preexistente que alguém tenha reaberto à mão.
        UPDATE public.financial_transactions
           SET is_paid    = true,
               paid_date  = p_paid_at::date,
               updated_at = now()
         WHERE id         = v_mother_id
           AND company_id = v_charge.company_id;
        v_receivables := 1;
      END IF;
    END IF;

    v_recv_status := CASE
      WHEN v_mother_id IS NOT NULL AND v_heal IS NOT NULL THEN 'healed'
      WHEN v_mother_id IS NOT NULL                        THEN 'ok'
      ELSE COALESCE(v_heal->>'status', 'missing')
    END;

    IF v_mother_id IS NULL THEN
      RAISE WARNING '[apply_tenant_charge_payment] cobrança % (empresa %) está paga e SEM recebível no financeiro; cura não aplicada (%). Dinheiro entrou e não aparece.',
        v_charge.id, v_charge.company_id, v_recv_status;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'result', 'already_paid',
      'charge_id', v_charge.id,
      'company_id', v_charge.company_id,
      'fee_posted', null,
      'receivables_settled', v_receivables,
      'receivable_status', v_recv_status,
      'settlement', 'already_applied',
      'heal', v_heal
    );
  END IF;

  -- (c) marca a cobrança como confirmada
  UPDATE public.tenant_charges
  SET status       = 'CONFIRMED',
      payment_date = p_paid_at,
      net_value    = COALESCE(p_net, net_value),
      updated_at   = now()
  WHERE id = v_charge.id;

  -- (c2) AUTO-CURA. Roda depois do FOR UPDATE de (a), então entregas
  --      concorrentes da mesma cobrança serializam aqui e só uma cria.
  SELECT id INTO v_mother_id
    FROM public.financial_transactions
   WHERE tenant_charge_id      = v_charge.id
     AND company_id            = v_charge.company_id
     AND transaction_type      = 'entrada'
     AND parent_transaction_id IS NULL
   LIMIT 1;

  IF v_mother_id IS NULL THEN
    v_heal := public.rebuild_tenant_charge_receivable(
      v_charge.id,
      'baixa automática de cobrança online'
    );
    IF COALESCE((v_heal->>'healed')::boolean, false) THEN
      v_mother_id := (v_heal->>'receivable_id')::uuid;
    END IF;
  END IF;

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
  --     2026-10-21 — A DECISÃO PASSOU A SER PELO VALOR.
  --     ANTES: UPDATE cego em TODA linha 'entrada' da cobrança, sem comparar
  --     nada. Um boleto de R$ 99,00 quitava uma conta de R$ 352,60 (chamado
  --     KGIE Tecnologia, 21/10/2026).
  --     AGORA: compara o valor da cobrança com o SALDO EM ABERTO da mãe.
  --       · cobrança >= saldo -> quitação TOTAL (idêntico ao histórico,
  --         inclusive em NÃO gravar amount_received);
  --       · cobrança <  saldo -> INSERT da filha 'Recebimento parcial' e
  --         NADA na mãe. Quem fecha a mãe (amount_received / is_paid /
  --         paid_date) é o gatilho trg_recalc_amount_received, dono único
  --         desse fato. Gravar aqui TAMBÉM criaria dois caminhos escrevendo o
  --         mesmo dado — foi exatamente a causa do incidente Aldebaran.
  --     Tolerância de 1 centavo: numeric de 2 casas do gateway e soma de
  --     parciais não fecham ao bit.
  IF v_mother_id IS NULL THEN
    -- Sem mãe (cura não aplicada / recusada): mantém o caminho histórico, que
    -- neste cenário não encontra linha nenhuma. Preserva o retorno antigo.
    UPDATE public.financial_transactions ft
    SET is_paid         = true,
        paid_date       = p_paid_at::date,
        updated_at      = now()
    WHERE ft.tenant_charge_id = v_charge.id
      AND ft.company_id       = v_charge.company_id
      AND ft.transaction_type = 'entrada'
      AND ft.is_paid IS DISTINCT FROM true;

    GET DIAGNOSTICS v_receivables = ROW_COUNT;
    v_settlement := 'no_mother';
  ELSE
    -- FOR UPDATE na mãe: serializa com uma baixa manual simultânea na mesma
    -- conta (dois recebimentos parciais concorrentes não podem ler o mesmo
    -- saldo e ambos acharem que são o último).
    SELECT ft.amount,
           COALESCE(ft.amount_received, 0),
           ft.description,
           ft.customer_id,
           ft.cost_center_id,
           ft.due_date
      INTO v_amount, v_received, v_mother_desc, v_mother_cust, v_mother_cc, v_mother_due
      FROM public.financial_transactions ft
     WHERE ft.id         = v_mother_id
       AND ft.company_id = v_charge.company_id
     FOR UPDATE;

    v_balance := round(COALESCE(v_amount, 0) - COALESCE(v_received, 0), 2);

    -- A DECISÃO:
    --  (i)  mãe JÁ FATIADA (amount_received > 0): o livro-razão dela é a SOMA
    --       DAS FILHAS. Todo recebimento novo TEM que ser uma filha. Marcar
    --       is_paid direto deixaria is_paid = true convivendo com
    --       amount_received < amount — e o gatilho REABRIRIA a conta sozinho na
    --       próxima recalculação (dinheiro recebido virando conta em aberto do
    --       nada). Vale inclusive quando a cobrança cobre o saldo INTEIRO: é
    --       exatamente o caso "cobrar o saldo" (R$ 99,00 numa conta de
    --       R$ 352,60 com R$ 253,60 já recebidos). Nasce a filha; o gatilho
    --       fecha a mãe.
    --  (ii) mãe LIMPA e cobrança menor que a conta: também é parcial.
    --  (iii) resto (mãe limpa e cobrança cobrindo a conta): quitação TOTAL,
    --       idêntica ao histórico e SEM gravar amount_received (Aldebaran).
    IF v_received > 0.005
       OR round(COALESCE(v_charge.value, 0), 2)
            < round(COALESCE(v_amount, 0), 2) - 0.005 THEN
      -- ---------------- RECEBIMENTO PARCIAL ----------------
      v_settlement := 'partial';

      -- 2026-11-26. Idempotência ANTES do INSERT: o gatilho BEFORE INSERT do
      -- PDV (tg_pdv_guard_legacy_receivable_writer_v2) valida saldo antes do
      -- ON CONFLICT e levanta 23514 numa reentrega/conflito legítimo. Mesmo
      -- conserto de apply_tenant_charge_installment_payment (20261126120000/
      -- 20261126130000): filha existe -> reentrega; saldo já quitado por
      -- outro caminho (baixa manual) -> não levanta, sinaliza 'conflict'.
      IF EXISTS (
        SELECT 1 FROM public.financial_transactions ft
         WHERE ft.asaas_payment_id = p_asaas_payment_id
           AND ft.company_id       = v_charge.company_id
      ) THEN
        v_child_id := NULL;
      ELSE
      BEGIN
          INSERT INTO public.financial_transactions (
            company_id, transaction_type, amount, description, category,
            customer_id, cost_center_id, transaction_date, due_date, paid_date,
            is_paid, parent_transaction_id, tenant_charge_id, asaas_payment_id,
            account_id, created_by
          ) VALUES (
            v_charge.company_id,
            'entrada',
            v_charge.value,
            'Recebimento parcial — ' || COALESCE(NULLIF(btrim(v_mother_desc), ''),
                                                 'cobrança #' || v_charge.id::text),
            -- EXATAMENTE 'Recebimento parcial': é o literal que
            -- trg_recalc_amount_received_fn exige pra reconhecer a filha. Qualquer
            -- outra categoria e a mãe nunca fecha — dinheiro entra e não aparece.
            'Recebimento parcial',
            v_mother_cust,
            v_mother_cc,
            p_paid_at::date,
            v_mother_due,
            p_paid_at::date,
            true,
            v_mother_id,
            v_charge.id,
            -- IDEMPOTÊNCIA DA FILHA: uq_financial_transactions_asaas_payment_id
            -- (UNIQUE parcial). Reentrega do mesmo evento cai no DO NOTHING, sem
            -- depender do dedupe por event_id nem da guarda de payment_date.
            p_asaas_payment_id,
            NULL,   -- account_id: NULL (mesmo padrão do recebível e da tarifa)
            NULL    -- created_by: ação automática de sistema
          )
          ON CONFLICT (asaas_payment_id) WHERE (asaas_payment_id IS NOT NULL) DO NOTHING
          RETURNING id INTO v_child_id;
      EXCEPTION
        WHEN check_violation THEN
          GET STACKED DIAGNOSTICS v_err_detail = PG_EXCEPTION_DETAIL;
          IF v_err_detail NOT IN ('PDV_RECEIVABLE_ALLOCATION_EXCEEDS_BALANCE',
                                  'PDV_RECEIVABLE_ALREADY_PAID') THEN
            RAISE;
          END IF;
          v_child_id := NULL;
          IF NOT EXISTS (
            SELECT 1 FROM public.financial_transactions ft
             WHERE ft.asaas_payment_id = p_asaas_payment_id
               AND ft.company_id       = v_charge.company_id
          ) THEN
            v_settlement := 'receivable_conflict';
            RAISE WARNING '[apply_tenant_charge_payment] cobrança % (empresa %): recebível já quitado por outro caminho (%); filha não criada.',
              v_charge.id, v_charge.company_id, v_err_detail;
          END IF;
      END;
      END IF;

      IF v_child_id IS NULL AND v_settlement <> 'receivable_conflict' THEN
        -- Reentrega: a filha desta cobrança já existe. No-op idempotente.
        SELECT ft.id INTO v_child_id
          FROM public.financial_transactions ft
         WHERE ft.asaas_payment_id = p_asaas_payment_id
           AND ft.company_id       = v_charge.company_id
         LIMIT 1;
        v_settlement := 'partial_already_applied';
      END IF;

      -- A MÃE NÃO É TOCADA AQUI. De propósito. Ver cabeçalho do bloco.
      v_receivables := 0;
    ELSE
      -- ---------------- QUITAÇÃO TOTAL (caminho histórico) ----------------
      -- Escopo estreitado para a MÃE (antes era "toda linha 'entrada' da
      -- cobrança"): as filhas nascem is_paid = true e já eram excluídas pelo
      -- predicado is_paid IS DISTINCT FROM true, então o conjunto afetado é o
      -- mesmo. A diferença é só não deixar margem pra ambiguidade.
      v_settlement := 'full';

      UPDATE public.financial_transactions ft
      SET is_paid         = true,
          paid_date       = p_paid_at::date,
          updated_at      = now()
      WHERE ft.id         = v_mother_id
        AND ft.company_id = v_charge.company_id
        AND ft.is_paid IS DISTINCT FROM true;

      GET DIAGNOSTICS v_receivables = ROW_COUNT;
    END IF;
  END IF;

  v_recv_status := CASE
    WHEN v_mother_id IS NOT NULL AND v_heal IS NOT NULL THEN 'healed'
    WHEN v_mother_id IS NOT NULL                        THEN 'ok'
    ELSE COALESCE(v_heal->>'status', 'missing')
  END;

  -- Conflito com baixa feita por outro caminho: aviso no webhook (fora de
  -- null/'ok'/'healed'). A tarifa abaixo continua sendo lançada: é dinheiro
  -- que a Asaas reteve de fato, igual ao caminho de quitação total com a mãe
  -- já paga.
  IF v_settlement = 'receivable_conflict' THEN
    v_recv_status := 'conflict';
  END IF;

  IF v_mother_id IS NULL THEN
    RAISE WARNING '[apply_tenant_charge_payment] baixa aplicada na cobrança % (empresa %) SEM recebível no financeiro; cura não aplicada (%). Dinheiro entrou e não aparece.',
      v_charge.id, v_charge.company_id, v_recv_status;
  END IF;

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
    'fee_posted', v_fee_posted,
    'receivable_status', v_recv_status,
    -- Contrato novo (2026-10-21) pro webhook/observabilidade:
    --   'full'                    quitação total
    --   'partial'                 nasceu filha de recebimento parcial
    --   'partial_already_applied' reentrega; a filha já existia
    --   'no_mother'               cobrança paga sem recebível (alarme acima)
    'settlement', v_settlement,
    'conflict_detail', CASE WHEN v_settlement = 'receivable_conflict' THEN v_err_detail END,
    'child_id', v_child_id,
    'balance_before', v_balance,
    'heal', v_heal
  );
END;
$function$;
