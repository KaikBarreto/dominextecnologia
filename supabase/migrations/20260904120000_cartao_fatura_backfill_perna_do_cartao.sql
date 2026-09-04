-- ============================================================================
-- Cartão de crédito — BACKFILL da perna faltante no cartão
-- (Onda 1.3 do plano docs/planos/2026-09-04-cartao-limite-e-pagamento-fatura.md)
--
-- 🔴 MEXE EM DADO FINANCEIRO DE PRODUÇÃO. Ler a seção "ANTES DE APLICAR".
--
-- POR QUÊ
-- -------
-- Todas as faturas já pagas hoje foram pagas pelo payBill antigo, que fazia UMA
-- perna só (a saída da conta bancária). A perna de `entrada` no cartão — a que
-- devolve o limite — nunca existiu. Sem este backfill, a RPC nova conserta os
-- pagamentos NOVOS mas o limite dos clientes atuais continua errado pra sempre:
-- um cartão de R$ 10.000 segue aparecendo estourado.
--
-- Segundo motivo, tão importante quanto: a RPC de estorno exige vínculo
-- explícito `financial_transactions.bill_id` (é o que impede que ela vire uma
-- primitiva de DELETE arbitrário). Pagamento antigo sem `bill_id` NÃO é
-- estornável. Por isso este backfill popula `bill_id` NAS DUAS PERNAS de todo
-- pagamento que tocar, inclusive nas pernas de SAÍDA que já existem.
--
-- IDEMPOTÊNCIA (rodar 2x não pode duplicar nada)
-- ----------------------------------------------
-- Antes de mexer em cada fatura, o bloco checa se JÁ EXISTE uma `entrada` de
-- category='Pagamento de Fatura' na conta do cartão amarrada àquela fatura, por
-- `bill_id` OU pelo `transfer_pair_id` da saída existente. Na 1ª execução
-- nenhuma linha antiga tem `bill_id` (a coluna nasceu em 20260904100000), então
-- nada é pulado indevidamente; na 2ª execução TODAS as linhas criadas aqui têm
-- `bill_id` preenchido e a fatura inteira é pulada. Fatura paga depois do deploy
-- pela RPC nova também já nasce com `bill_id` nas duas pernas → pulada também.
--
-- Residual: uma `entrada` que um humano tenha criado à mão na conta do cartão e
-- categorizado exatamente como 'Pagamento de Fatura' não tem `bill_id` nem par,
-- então não é reconhecida e a fatura receberia a perna mesmo assim. Nenhum
-- caminho do app cria entrada em conta de cartão com essa categoria (transfer é
-- 'Transferência entre contas'), então o risco é teórico — mas está aqui
-- declarado, e a query de contagem abaixo permite conferir o volume antes.
--
-- ANTES DE APLICAR — rodar esta contagem e conferir o volume:
-- -----------------------------------------------------------
--   SELECT
--     count(*) FILTER (WHERE t.id IS NOT NULL)                      AS caso_a_com_saida_conhecida,
--     count(*) FILTER (WHERE t.id IS NULL)                          AS caso_b_sem_saida_conhecida,
--     count(*) FILTER (WHERE t.id IS NOT NULL
--                        AND b.amount_paid > t.amount + 0.01)       AS terao_perna_residual,
--     count(*)                                                      AS faturas_a_tocar,
--     round(sum(b.amount_paid), 2)                                  AS limite_total_a_devolver
--   FROM public.credit_card_bills b
--   LEFT JOIN public.financial_transactions t
--     ON t.id = b.payment_transaction_id
--    AND t.company_id = b.company_id
--    AND t.transaction_type = 'saida'
--   WHERE COALESCE(b.amount_paid, 0) > 0
--     AND NOT EXISTS (
--       SELECT 1 FROM public.financial_transactions e
--        WHERE e.account_id = b.account_id
--          AND e.transaction_type = 'entrada'
--          AND e.category = 'Pagamento de Fatura'
--          AND ( e.bill_id = b.id
--                OR (t.transfer_pair_id IS NOT NULL AND e.transfer_pair_id = t.transfer_pair_id) )
--     );
--
-- Linhas criadas = caso_a + caso_b + terao_perna_residual.
-- `limite_total_a_devolver` é quanto de limite volta pros clientes, somado.
-- ============================================================================

DO $$
DECLARE
  r              RECORD;
  v_pair         uuid;
  v_leg_amount   numeric;
  v_leg_date     date;
  v_residual     numeric;
  v_created      integer := 0;
  v_residual_qty integer := 0;
  v_linked       integer := 0;
  v_skipped      integer := 0;
  v_total        numeric := 0;
BEGIN
  FOR r IN
    SELECT b.id            AS bill_id,
           b.company_id    AS company_id,
           b.account_id    AS card_account_id,
           b.reference_month,
           b.closing_date,
           b.due_date,
           COALESCE(b.amount_paid, 0) AS amount_paid,
           t.id            AS out_txn_id,
           t.amount        AS out_amount,
           t.transaction_date AS out_date,
           t.paid_date     AS out_paid_date,
           t.transfer_pair_id AS out_pair,
           t.bill_id       AS out_bill_id
      FROM public.credit_card_bills b
      -- Só considero "saída conhecida" o que o payment_transaction_id aponta E
      -- que é de fato uma saída da MESMA empresa. Qualquer outra coisa cai no
      -- caso B. Heurística (casar por conta+valor+data) é proibida.
      LEFT JOIN public.financial_transactions t
        ON t.id = b.payment_transaction_id
       AND t.company_id = b.company_id
       AND t.transaction_type = 'saida'
     WHERE COALESCE(b.amount_paid, 0) > 0
     ORDER BY b.company_id, b.account_id, b.reference_month
  LOOP
    -- guarda de idempotência
    IF EXISTS (
      SELECT 1
        FROM public.financial_transactions e
       WHERE e.account_id = r.card_account_id
         AND e.transaction_type = 'entrada'
         AND e.category = 'Pagamento de Fatura'
         AND ( e.bill_id = r.bill_id
               OR (r.out_pair IS NOT NULL AND e.transfer_pair_id = r.out_pair) )
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF r.out_txn_id IS NOT NULL THEN
      -- CASO A — a saída existe e é identificável com certeza.
      -- Reusa o par se já tiver um; senão cria. E carimba transfer_pair_id +
      -- bill_id NA SAÍDA EXISTENTE, que é o que torna este pagamento antigo
      -- estornável pela RPC nova e o que o mantém fora do faturamento/DRE.
      v_pair       := COALESCE(r.out_pair, gen_random_uuid());
      v_leg_amount := r.out_amount;
      v_leg_date   := r.out_date;

      UPDATE public.financial_transactions
         SET transfer_pair_id = v_pair,
             bill_id          = COALESCE(bill_id, r.bill_id),
             updated_at       = now()
       WHERE id = r.out_txn_id;
      v_linked := v_linked + 1;
    ELSE
      -- CASO B — pagamento antigo (tipicamente PARCIAL) sem payment_transaction_id.
      -- O payBill antigo só preenchia esse campo em pagamento integral
      -- (`isFullPayment ? paymentTxn.id : bill.payment_transaction_id`), então a
      -- saída original pode até existir no extrato, mas NÃO HÁ COMO
      -- IDENTIFICÁ-LA COM SEGURANÇA. Não invento perna de saída nem tento
      -- adivinhar por conta+valor+data: erraria a linha em algum cliente.
      -- Crio só a entrada, no valor de amount_paid, pra devolver o limite.
      -- Consequência assumida: essa entrada fica sozinha no "par" (não existe
      -- perna de saída amarrada a ela). Por isso ela NÃO é estornável:
      -- revert_credit_card_bill_payment (20260904110000) recusa par órfão com
      -- mensagem explícita. Estornar deixaria o dinheiro fora da conta bancária
      -- E a fatura em aberto ao mesmo tempo, induzindo o dono a PAGAR DE NOVO.
      -- Ajuste desses casos é manual, pelo extrato.
      v_pair       := gen_random_uuid();
      v_leg_amount := r.amount_paid;
      v_leg_date   := COALESCE(r.due_date, r.closing_date);
    END IF;

    IF v_leg_amount IS NULL OR v_leg_amount <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- A PERNA QUE FALTAVA: entrada no cartão. credit_card_bill_date = NULL
    -- OBRIGATORIAMENTE — com data de fatura ela viraria "lançamento" e deixaria
    -- o total daquela fatura negativo.
    INSERT INTO public.financial_transactions (
      company_id, account_id, transaction_type, description, amount,
      transaction_date, paid_date, is_paid, category, notes,
      transfer_pair_id, credit_card_bill_date, bill_id
    ) VALUES (
      r.company_id, r.card_account_id, 'entrada',
      'Pagamento de fatura — ' || to_char(r.reference_month, 'MM/YYYY'),
      v_leg_amount,
      v_leg_date, COALESCE(r.out_paid_date, v_leg_date), true,
      'Pagamento de Fatura',
      'Regularização automática (04/09/2026): perna do cartão que faltava no pagamento desta fatura. É ela que devolve o limite disponível.',
      v_pair, NULL, r.bill_id
    );
    v_created := v_created + 1;
    v_total   := v_total + v_leg_amount;

    -- RESIDUAL (só no caso A): quando a fatura acumulou pagamentos parciais
    -- ANTES do integral, amount_paid > valor da saída conhecida. Devolver só o
    -- valor da saída conhecida deixaria o limite parcialmente preso. Crio uma
    -- segunda entrada pela diferença, com par próprio (o transfer_pair_id é o
    -- que a mantém fora do faturamento e da DRE) e bill_id da fatura.
    IF r.out_txn_id IS NOT NULL AND r.amount_paid > v_leg_amount + 0.01 THEN
      v_residual := round(r.amount_paid - v_leg_amount, 2);

      INSERT INTO public.financial_transactions (
        company_id, account_id, transaction_type, description, amount,
        transaction_date, paid_date, is_paid, category, notes,
        transfer_pair_id, credit_card_bill_date, bill_id
      ) VALUES (
        r.company_id, r.card_account_id, 'entrada',
        'Pagamento de fatura — ' || to_char(r.reference_month, 'MM/YYYY') || ' (parcial anterior)',
        v_residual,
        v_leg_date, v_leg_date, true,
        'Pagamento de Fatura',
        'Regularização automática (04/09/2026): diferença de pagamentos parciais anteriores desta fatura, cujas saídas originais não são identificáveis com segurança.',
        gen_random_uuid(), NULL, r.bill_id
      );
      v_created      := v_created + 1;
      v_residual_qty := v_residual_qty + 1;
      v_total        := v_total + v_residual;
    END IF;
  END LOOP;

  RAISE NOTICE 'backfill cartão: % entradas criadas (sendo % residuais de parcial), % saídas existentes vinculadas (transfer_pair_id + bill_id), % faturas puladas, R$ % de limite devolvido',
    v_created, v_residual_qty, v_linked, v_skipped, round(v_total, 2);
END $$;

-- ============================================================================
-- CONFERIR DEPOIS DE APLICAR
--
-- (1) Nenhuma perna de pagamento pode ter credit_card_bill_date preenchido
--     (se tiver, ela entra como "compra" e deixa o total da fatura negativo).
--     Esperado: 0.
--
--   SELECT count(*) FROM public.financial_transactions
--    WHERE category = 'Pagamento de Fatura' AND credit_card_bill_date IS NOT NULL;
--
-- (2) Toda fatura com amount_paid > 0 tem entrada correspondente no cartão,
--     e a soma das entradas bate com o amount_paid. Esperado: 0 linhas.
--
--   SELECT b.id, b.reference_month, b.amount_paid,
--          COALESCE(SUM(e.amount), 0) AS entradas_no_cartao
--     FROM public.credit_card_bills b
--     LEFT JOIN public.financial_transactions e
--       ON e.bill_id = b.id
--      AND e.transaction_type = 'entrada'
--      AND e.category = 'Pagamento de Fatura'
--    WHERE COALESCE(b.amount_paid, 0) > 0
--    GROUP BY b.id, b.reference_month, b.amount_paid
--   HAVING COALESCE(SUM(e.amount), 0) < b.amount_paid - 0.01;
--
-- (3) Nenhuma perna de pagamento ficou sem transfer_pair_id (senão vira receita
--     fantasma no Dashboard/Faturamento). Esperado: 0.
--
--   SELECT count(*) FROM public.financial_transactions
--    WHERE category = 'Pagamento de Fatura' AND transfer_pair_id IS NULL;
--
-- (4) Rodar o bloco DO uma 2ª vez e conferir que o NOTICE reporta
--     "0 entradas criadas" e todas as faturas puladas (prova de idempotência).
-- ============================================================================
