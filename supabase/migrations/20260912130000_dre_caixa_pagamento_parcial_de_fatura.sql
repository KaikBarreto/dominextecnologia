-- ============================================================================
-- Fatura de cartão paga EM PARTES passa a aparecer no regime de CAIXA
--
-- O DEFEITO
-- ---------
-- pay_credit_card_bill (20260904130000, passo 8) só quita as compras quando o
-- pagamento leva a fatura a `paid`. Enquanto o status for `partial`, NENHUMA
-- compra entra no Caixa — e as duas pernas do pagamento estão fora da DRE de
-- propósito (transfer_pair_id + category 'Pagamento de Fatura', cortadas em
-- FinanceDRE nos dois regimes). Resultado:
--
--   fatura R$ 8.000, dono paga R$ 5.000 em 10/03 e R$ 3.000 em 10/04
--     · até 10/04 a DRE em Caixa mostra R$ 0 dessas compras, apesar de
--       R$ 5.000 terem saído do banco em março;
--     · em 10/04 os R$ 8.000 INTEIROS caem em abril.
--
-- ⚠️ ZERO faturas em `partial` em produção hoje (conferido 12/09/2026: 5 open,
-- 2 closed, 0 partial, 0 paid). Como na outra trava desta leva, é bomba armada,
-- não explodida: NÃO HÁ BACKFILL nesta migration, nada a corrigir pra trás.
--
-- O DESENHO ESCOLHIDO — (a) QUITAR COMPRAS ATÉ ESGOTAR O VALOR PAGO
-- ----------------------------------------------------------------
-- Cada pagamento recebe um ORÇAMENTO = (total já pago da fatura) − (total já
-- quitado em compras). Percorre as compras ainda pendentes da fatura, da mais
-- ANTIGA pra mais nova, e quita as que CABEM no orçamento, pulando (sem quitar)
-- as que não cabem e seguindo pras próximas. A compra quitada leva
-- paid_date = data DAQUELE pagamento — e nunca mais muda de mês.
--
-- Três invariantes que este desenho respeita e que os outros caminhos quebram:
--
--   1. NUNCA quita mais do que saiu do banco. O Caixa é "o dinheiro que se
--      moveu"; marcar como paga uma compra cujo dinheiro não saiu é inventar
--      fato — e apareceria como "Paga" na linha, não só no total.
--   2. MÊS FECHADO NÃO MUDA DEPOIS DE FECHADO. Cada compra é carimbada com a
--      data do pagamento que a cobriu e fica lá. É a regra que o cabeçalho de
--      FinanceDRE.tsx levanta como razão de existir do toggle de regime.
--   3. COMPETÊNCIA INTACTA. `transaction_date` não é tocado em nenhum ramo:
--      a compra continua contando no mês da compra, pago ou não.
--
-- O orçamento CARREGA A SOBRA de um pagamento pro seguinte (é sempre
-- "pago acumulado − quitado acumulado"), então a soma ao longo da vida da
-- fatura é exata: quando o último pagamento fecha a fatura, o ramo integral
-- (idêntico ao de hoje) quita tudo o que restou.
--
-- O QUE FOI DESCARTADO E POR QUÊ
-- ------------------------------
-- (b) FATOR DE QUITAÇÃO PROPORCIONAL (coluna nova com o % quitado de cada
--     compra). É ESTRUTURALMENTE INCAPAZ de resolver o problema: uma linha só
--     tem UMA data de caixa. Ao chegar o pagamento final, a mesma linha passa a
--     valer 100% com paid_date do último pagamento — os R$ 5.000 de março
--     SOMEM de março e os R$ 8.000 aparecem em abril, que é exatamente metade
--     do defeito original. Só rateia bem ENQUANTO a fatura está aberta, e mente
--     no fechamento. Descartado por isso, antes ainda de considerar que exigiria
--     mudança em `src/lib/dre-regime.ts` (fora do meu escopo).
--     · Variante "sem coluna nova": marcar a compra `is_paid = true` e usar
--       `amount_received` como "parte ainda não paga", porque `getDreAmount`
--       calcula `amount − amount_received` no Caixa. Funcionaria HOJE por
--       acidente e tem o mesmo defeito de data única; além disso inverte o
--       significado de uma coluna compartilhada ("Valor Recebido" numa despesa
--       valendo o que NÃO foi pago) e depende de uma fórmula que outro dev está
--       editando nesta mesma semana (accrual de folha). Descartada.
-- (c) PAGAMENTO PARCIAL COMO DESPESA PRÓPRIA DO MÊS. Exigiria que a perna de
--     saída contasse na DRE — mas a DRE corta 'Pagamento de Fatura' e
--     `transfer_pair_id` nos DOIS regimes (src, fora do meu escopo), e no
--     fechamento da fatura essa despesa teria que ser APAGADA pra não somar com
--     as compras quitadas: apagar despesa de um mês já fechado é a regressão
--     que o próprio FinanceDRE documenta como inaceitável. Além disso perderia
--     a quebra por categoria e por centro de custo (tudo viraria "Pagamento de
--     Fatura"). Descartado.
-- (d) LINHA FILHA por compra a cada pagamento (espelho do "Recebimento
--     parcial"). É o único desenho EXATO para todos os casos, e não cabe aqui:
--     a filha de saída não é excluída da Competência (o corte de hoje só cobre
--     filha de ENTRADA), então dobraria a despesa no regime que não pode mudar;
--     e uma saída nova na conta do cartão dobraria o limite usado. Depende de
--     mudança em `src` — devolvido ao Tech Lead como evolução possível, não
--     feito aqui.
-- (e) DIVIDIR A COMPRA em duas linhas (parte paga / parte pendente). Mutila um
--     registro real do usuário (uma compra vira duas na tela, com anexo e
--     observação de uma só) e o estorno precisaria remontar. Descartado.
--
-- LIMITE CONHECIDO E ACEITO
-- -------------------------
-- Quando NENHUMA compra pendente cabe no valor pago (caso extremo: a fatura
-- tem UMA compra só, maior que o pagamento), este desenho quita ZERO e o
-- comportamento é o de hoje — o Caixa só reconhece no pagamento que fechar a
-- fatura. É o preço de não inventar dado. Medido em produção hoje: 1,2 compra
-- por fatura aberta e 2,5 por fatura fechada, com a maior compra valendo
-- 68%–93% do total — ou seja, nas faturas ATUAIS o ganho é pequeno; ele cresce
-- conforme a fatura ganha mais compras. Está no relatório como risco em aberto.
--
-- ESTORNO SIMÉTRICO POR CONSTRUÇÃO
-- --------------------------------
-- revert_credit_card_bill_payment desfaz pelo mesmo critério, ao contrário:
-- desquita da MAIS RECENTEMENTE quitada pra trás até que o total quitado caiba
-- de novo no total pago que sobrou. Estornar o último pagamento devolve
-- exatamente o estado anterior a ele; estornar tudo (pago = 0) desquita tudo,
-- que é o comportamento de hoje.
--
-- ⚠️ AS DUAS FUNÇÕES FORAM RECRIADAS A PARTIR DA DEFINIÇÃO VIVA
-- (pg_get_functiondef em 12/09/2026), não das migrations 20260904110000 /
-- 20260904130000 / 20260904180000. Régua deste repo: recriar função grande
-- partindo de migration antiga já derrubou campo de payload em produção por
-- ~1 mês, calado (get_public_os, v1.19.7). O corpo abaixo é byte-a-byte o que
-- está rodando + os dois blocos trocados (passo 8 e o espelho no estorno).
--
-- ⚠️ REGRA QUE NÃO PODE QUEBRAR (e não quebra aqui): despesa de cartão NUNCA
-- NASCE PAGA — quem nasce e fica pago é a FATURA. Nenhum ramo abaixo cria
-- lançamento de compra; todos só mudam is_paid/paid_date de compra que já
-- existe, e só a partir de dinheiro que saiu de uma conta bancária.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pay_credit_card_bill(p_bill_id uuid, p_payment_account_id uuid, p_payment_date date, p_amount numeric, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_company_id    uuid;
  v_bill_id       uuid;
  v_card_id       uuid;
  v_reference     date;
  v_closing       date;
  v_amount_paid   numeric;
  v_payer_type    text;
  v_today         date;
  v_payment_date  date;
  v_bill_total    numeric;
  v_remaining     numeric;
  v_new_paid      numeric;
  v_new_status    text;
  v_paid_at       timestamptz;
  v_pair_id       uuid;
  v_description   text;
  v_out_txn_id    uuid;
  v_card_txn_id   uuid;
  v_settled       integer := 0;
  v_settled_total numeric  := 0;
  v_settled_now   numeric  := 0;
  v_budget        numeric  := 0;
  v_row           record;
BEGIN
  -- 1) Fail-closed. SECURITY DEFINER também é chamável com service_role, e aí
  --    auth.uid() é NULL. NULL = NULL nunca é TRUE, mas não deixar implícito:
  --    errar alto é o que impede um refactor futuro de abrir o buraco.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(auth.uid());

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  -- 2) FATURA + CARTÃO numa tacada só, já com o predicado de tenant nos DOIS,
  --    e com trava de linha. O FOR UPDATE OF b é o que impede pagamento duplo
  --    por clique duplo / duas abas: a segunda chamada espera a primeira
  --    commitar e aí enxerga o amount_paid atualizado, batendo na validação de
  --    saldo. O gate do cartão é defesa em profundidade: se por qualquer bug
  --    uma fatura do tenant A apontar pra um cartão do tenant B, o estrago não
  --    se propaga.
  SELECT b.id, b.account_id, b.reference_month, b.closing_date, COALESCE(b.amount_paid, 0)
    INTO v_bill_id, v_card_id, v_reference, v_closing, v_amount_paid
    FROM public.credit_card_bills b
    JOIN public.financial_accounts ca
      ON ca.id = b.account_id
     AND ca.company_id = v_company_id
     AND ca.type = 'cartao'
   WHERE b.id = p_bill_id
     AND b.company_id = v_company_id
     FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você não tem acesso a esta fatura.' USING ERRCODE = '42501';
  END IF;

  -- 3) CONTA PAGADORA. Mensagem única: serve tanto pra "não existe" quanto pra
  --    "é de outro tenant" (contrato congelado do Tech Lead).
  SELECT pa.type
    INTO v_payer_type
    FROM public.financial_accounts pa
   WHERE pa.id = p_payment_account_id
     AND pa.company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta de pagamento não encontrada.' USING ERRCODE = '42501';
  END IF;

  -- Validação de negócio (já passou pelo gate de tenant, pode ser específica).
  IF v_payer_type = 'cartao' THEN
    RAISE EXCEPTION 'Não é possível pagar uma fatura com outro cartão.';
  END IF;

  -- 4) Total da fatura NÃO é coluna: é a soma das compras (saidas) do cartão
  --    carimbadas com aquele reference_month. Mesma definição que o frontend
  --    usa em useCreditCardBills.billsQuery — as duas TÊM que bater.
  SELECT COALESCE(SUM(t.amount), 0)
    INTO v_bill_total
    FROM public.financial_transactions t
   WHERE t.account_id = v_card_id
     AND t.transaction_type = 'saida'
     AND t.credit_card_bill_date = v_reference;

  v_remaining := v_bill_total - v_amount_paid;

  -- 5) Validações de negócio, na ordem do contrato congelado.
  --    "Fechou" = hoje em America/Sao_Paulo >= closing_date, ou seja o PRÓPRIO
  --    DIA do fechamento já libera o pagamento.
  --
  --    O >= (e não >) é deliberado, por três razões:
  --    1. É o comportamento de produção HOJE. CreditCardInvoiceRow.tsx faz
  --       `canPay = !isBefore(today, closingDate)`, que é today >= closingDate,
  --       com o comentário "Após o fechamento (inclusive o próprio dia) pode
  --       pagar". Com `>` a RPC ficaria MAIS RESTRITIVA que a tela e tiraria do
  --       usuário uma ação que ele já faz — regressão de contrato server-side.
  --    2. Bate com a regra de acumulação: computeBillDate() manda a compra do
  --       próprio dia do fechamento pra fatura SEGUINTE. Com closing_day=20, a
  --       fatura de referência 2026-09-01 acumula de 20/08 a 19/09 e fecha em
  --       20/09 — no dia 20 ela já está COMPLETA, nenhuma compra nova cai nela.
  --       Travar o pagamento nesse dia não protegeria de nada.
  --    3. Faz a mensagem de erro ficar literalmente verdadeira: formatando a
  --       própria closing_date, "liberado a partir de 20/09/2026" é exato. Por
  --       isso a mensagem NÃO leva `+ 1`.
  --
  --    Nunca current_date cru: pegaria UTC e erraria a virada do dia.
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF NOT (v_today >= v_closing) THEN
    RAISE EXCEPTION 'Esta fatura ainda não fechou. O pagamento é liberado a partir de %.',
      to_char(v_closing, 'DD/MM/YYYY');
  END IF;

  IF p_amount > v_remaining + 0.01 THEN
    RAISE EXCEPTION 'O valor informado é maior que o saldo restante da fatura.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor do pagamento precisa ser maior que zero.';
  END IF;

  -- Defensivo: transaction_date é NOT NULL. Sem data informada, usa hoje em
  -- São Paulo em vez de estourar erro de constraint na cara do usuário.
  v_payment_date := COALESCE(p_payment_date, v_today);

  -- 6) O PAR. transfer_pair_id marca as duas pernas como transferência interna
  --    (é o que mantém o pagamento fora da DRE e do faturamento).
  --    created_by = auth.uid(), NUNCA valor vindo do client.
  v_pair_id     := gen_random_uuid();
  v_description := 'Pagamento de fatura — ' || to_char(v_reference, 'MM/YYYY');

  -- perna 1: saída da conta que paga
  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, description, amount,
    transaction_date, paid_date, is_paid, category, notes,
    transfer_pair_id, credit_card_bill_date, bill_id, created_by
  ) VALUES (
    v_company_id, p_payment_account_id, 'saida', v_description, p_amount,
    v_payment_date, v_payment_date, true, 'Pagamento de Fatura', p_notes,
    v_pair_id, NULL, v_bill_id, auth.uid()
  )
  RETURNING id INTO v_out_txn_id;

  -- perna 2: entrada no CARTÃO — É ESTA QUE DEVOLVE O LIMITE
  INSERT INTO public.financial_transactions (
    company_id, account_id, transaction_type, description, amount,
    transaction_date, paid_date, is_paid, category, notes,
    transfer_pair_id, credit_card_bill_date, bill_id, created_by
  ) VALUES (
    v_company_id, v_card_id, 'entrada', v_description, p_amount,
    v_payment_date, v_payment_date, true, 'Pagamento de Fatura', p_notes,
    v_pair_id, NULL, v_bill_id, auth.uid()
  )
  RETURNING id INTO v_card_txn_id;

  -- 7) Atualiza a fatura.
  v_new_paid   := v_amount_paid + p_amount;
  v_new_status := CASE WHEN v_new_paid >= v_bill_total - 0.01 THEN 'paid' ELSE 'partial' END;
  v_paid_at    := CASE WHEN v_new_status = 'paid' THEN now() ELSE NULL END;

  UPDATE public.credit_card_bills
     SET amount_paid            = v_new_paid,
         status                 = v_new_status,
         payment_transaction_id = v_out_txn_id,
         paid_at                = v_paid_at,
         updated_at             = now()
   WHERE id = v_bill_id
     AND company_id = v_company_id;

  -- 8) QUITA AS COMPRAS DA FATURA.
  --
  -- DEFEITO ORIGINAL (20260904130000): compra no cartão nasce is_paid = false
  -- (TransactionFormDialog: `const isPaidFinal = isCardSaida ? false : ...`) e a
  -- DRE só soma o que tem is_paid. Como pagar a fatura nunca mexia nas compras,
  -- e as duas pernas do pagamento são neutras de propósito (transfer_pair_id),
  -- a compra no cartão NUNCA entrava no resultado. Medido em produção na época:
  -- R$ 7.875,61 em 45 compras invisíveis num único cliente.
  --
  -- O predicado das duas consultas abaixo é O MESMO do passo 4 (o que soma
  -- v_bill_total). Tem que ser: se divergir, o sistema quita um conjunto de
  -- linhas diferente do que ele cobrou, e a fatura fecha com sobra ou falta.
  -- Se um dia mudar lá, muda aqui. (`AND company_id` é defesa em profundidade
  -- sobre o account_id, que já é do tenant pelo gate do passo 2.)
  --
  -- As duas pernas do pagamento não são alcançadas por nenhum UPDATE daqui:
  -- nascem com credit_card_bill_date = NULL e is_paid = true. Conferido no
  -- banco (0 linhas de 'Pagamento de Fatura' com credit_card_bill_date
  -- preenchida, 0 com is_paid <> true), não deduzido.
  IF v_new_status = 'paid' THEN
    -- RAMO INTEGRAL — IDÊNTICO AO DE HOJE, de propósito. É o único caminho que
    -- produção já exerceu; mantê-lo byte-a-byte é o que garante zero regressão
    -- no que funciona. Aqui não há orçamento a respeitar: a fatura inteira foi
    -- paga, então TODA compra pendente dela é quitada, sem sobra de centavo.
    -- Soma ANTES do UPDATE (chave de QA `purchases_settled_amount`): depois do
    -- UPDATE não dá mais pra distinguir o que ESTE pagamento quitou do que já
    -- estava quitado, e filtrar por paid_date erraria se dois pagamentos
    -- tivessem a mesma data.
    SELECT COALESCE(SUM(t.amount), 0)
      INTO v_settled_now
      FROM public.financial_transactions t
     WHERE t.account_id             = v_card_id
       AND t.company_id             = v_company_id
       AND t.transaction_type       = 'saida'
       AND t.credit_card_bill_date  = v_reference
       AND t.is_paid                = false;

    UPDATE public.financial_transactions t
       SET is_paid    = true,
           paid_date  = v_payment_date,
           updated_at = now()
     WHERE t.account_id             = v_card_id
       AND t.company_id             = v_company_id
       AND t.transaction_type       = 'saida'
       AND t.credit_card_bill_date  = v_reference
       AND t.is_paid                = false;
    GET DIAGNOSTICS v_settled = ROW_COUNT;
  ELSE
    -- RAMO PARCIAL — NOVO.
    --
    -- ORÇAMENTO = pago acumulado − já quitado. Nunca `p_amount` cru: se um
    -- pagamento anterior deixou sobra (nenhuma compra coube nela), a sobra
    -- precisa continuar valendo neste pagamento, senão dinheiro que saiu do
    -- banco ficaria fora do Caixa pra sempre.
    --
    -- O "já quitado" é lido do estado REAL das linhas (SUM de is_paid = true),
    -- não de contador guardado: é a mesma disciplina do recompute por SUM do
    -- estorno — idempotente, e cura estado herdado em vez de gravar o erro.
    -- Compra que o usuário marcou como paga na mão também entra nessa soma, e
    -- isso é o certo: ela já está contada no Caixa.
    SELECT COALESCE(SUM(t.amount), 0)
      INTO v_settled_total
      FROM public.financial_transactions t
     WHERE t.account_id             = v_card_id
       AND t.company_id             = v_company_id
       AND t.transaction_type       = 'saida'
       AND t.credit_card_bill_date  = v_reference
       AND t.credit_card_bill_date IS NOT NULL
       AND t.is_paid                = true;

    v_budget := v_new_paid - v_settled_total;

    IF v_budget > 0.01 THEN
      -- Da mais ANTIGA pra mais nova. Ordem determinística até o desempate
      -- (data, criação, id) pra que a mesma fatura produza sempre o mesmo
      -- resultado — dinheiro não pode depender da ordem que o Postgres
      -- resolveu devolver.
      --
      -- Compra que NÃO cabe é PULADA, e o laço continua: uma compra grande
      -- travando o orçamento faria o pagamento inteiro não reconhecer nada,
      -- mesmo havendo compras menores que cabem. Nenhuma linha é quitada por
      -- metade — ou o valor inteiro dela coube no que saiu do banco, ou ela
      -- fica pendente pro próximo pagamento.
      FOR v_row IN
        SELECT t.id, t.amount
          FROM public.financial_transactions t
         WHERE t.account_id             = v_card_id
           AND t.company_id             = v_company_id
           AND t.transaction_type       = 'saida'
           AND t.credit_card_bill_date  = v_reference
           AND t.credit_card_bill_date IS NOT NULL
           AND t.is_paid                = false
         ORDER BY t.transaction_date, t.created_at, t.id
      LOOP
        EXIT WHEN v_budget <= 0.01;

        IF v_row.amount <= v_budget + 0.01 THEN
          UPDATE public.financial_transactions
             SET is_paid    = true,
                 paid_date  = v_payment_date,  -- mês de Caixa DESTA parcela
                 updated_at = now()
           WHERE id         = v_row.id
             AND company_id = v_company_id;

          v_budget      := v_budget - v_row.amount;
          v_settled_now := v_settled_now + v_row.amount;
          v_settled     := v_settled + 1;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'bill_id',                  v_bill_id,
    'status',                   v_new_status,
    'amount_paid',              round(v_new_paid, 2),
    'bill_total',               round(v_bill_total, 2),
    'paid_at',                  to_char(v_paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'transfer_pair_id',         v_pair_id,
    'payment_transaction_id',   v_out_txn_id,
    'card_leg_transaction_id',  v_card_txn_id,
    'purchases_settled',        v_settled,
    -- Chaves ADITIVAS (o hook useCreditCardBills ignora o que não conhece):
    -- servem de prova de QA, mostrando quanto de compra este pagamento
    -- reconheceu no Caixa e quanto do valor pago ficou sem compra que coubesse.
    'purchases_settled_amount', round(v_settled_now, 2),
    'unallocated_amount',       round(GREATEST(v_budget, 0), 2)
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.revert_credit_card_bill_payment(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_company_id     uuid;
  v_pair_id        uuid;
  v_bill_id        uuid;
  v_card_id        uuid;
  v_reference      date;
  v_old_paid_at    timestamptz;
  v_deleted        integer := 0;
  v_bill_total     numeric;
  v_new_paid       numeric;
  v_new_status     text;
  v_closing        date;
  v_payment_txn_id uuid;
  v_unsettled      integer := 0;
  v_settled_total  numeric := 0;
  v_unsettled_amt  numeric := 0;
  v_row            record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  v_company_id := public.get_user_company_id(auth.uid());

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.' USING ERRCODE = '42501';
  END IF;

  -- Os QUATRO objetos numa busca só, com mensagem única e trava na fatura:
  -- (a) a transação é do tenant e é comprovadamente pagamento de fatura;
  -- (b) a fatura vinculada existe e é do tenant;
  -- (c) o cartão da fatura é do tenant e é mesmo um cartão.
  SELECT t.transfer_pair_id, b.id, b.account_id, b.reference_month, b.paid_at, b.closing_date
    INTO v_pair_id, v_bill_id, v_card_id, v_reference, v_old_paid_at, v_closing
    FROM public.financial_transactions t
    JOIN public.credit_card_bills b
      ON b.id = t.bill_id
     AND b.company_id = v_company_id
    JOIN public.financial_accounts ca
      ON ca.id = b.account_id
     AND ca.company_id = v_company_id
     AND ca.type = 'cartao'
   WHERE t.id = p_transaction_id
     AND t.company_id = v_company_id
     AND t.category = 'Pagamento de Fatura'
     AND t.transfer_pair_id IS NOT NULL
     AND t.bill_id IS NOT NULL
     FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você não tem acesso a este pagamento.' USING ERRCODE = '42501';
  END IF;

  -- ⛔ PAR ÓRFÃO (só a perna de entrada) = pagamento importado pelo backfill no
  -- CASO B (20260904120000), onde a saída original EXISTE no extrato do banco
  -- mas não foi identificável (o payBill antigo não gravava
  -- payment_transaction_id em pagamento parcial).
  --
  -- POR QUE RECUSAR EM VEZ DE ESTORNAR — cenário de PAGAMENTO EM DOBRO:
  -- estornar aqui apagaria só a entrada do cartão e deixaria este estado:
  --   1. o dinheiro CONTINUA saído da conta bancária (a saída antiga segue lá,
  --      intocada, porque não sabemos qual linha é);
  --   2. a fatura volta pra 'open', dizendo que o cliente DEVE aquele valor;
  --   3. o limite do cartão desce de novo.
  -- O dono olha, vê fatura em aberto, e paga DE NOVO. Ou seja: trocaríamos um
  -- limite errado (o defeito que esta entrega corrige) por um débito duplicado,
  -- que é pior. Um estorno impossível é menos grave que um débito em dobro.
  --
  -- A mensagem diz a verdade e devolve a decisão pro usuário, em vez de o
  -- sistema produzir em silêncio um estado que induz a pagar duas vezes.
  --
  -- ⚠️ NÃO REMOVER achando que é excesso de zelo. E não "consertar" o caso B
  -- inventando a perna de saída: adivinhar por conta+valor+data acerta a linha
  -- errada em algum cliente, fatalmente.
  -- Caso A (as duas pernas) segue estornável normalmente por este caminho.
  IF NOT EXISTS (
    SELECT 1
      FROM public.financial_transactions t
     WHERE t.transfer_pair_id = v_pair_id
       AND t.company_id = v_company_id
       AND t.bill_id = v_bill_id
       AND t.transaction_type = 'saida'
       AND t.category = 'Pagamento de Fatura'
  ) THEN
    RAISE EXCEPTION 'Este pagamento foi importado de um registro antigo e não pode ser estornado automaticamente, porque a saída original da conta bancária não pôde ser identificada. Ajuste manualmente pelo extrato.';
  END IF;

  -- Apaga AS DUAS pernas pelo par. Nunca só uma: meia perna apagada é
  -- exatamente o desequilíbrio que esta correção existe pra eliminar.
  -- O WHERE repete TODO o vínculo (tenant + fatura + categoria) pra que nem um
  -- transfer_pair_id colidido consiga arrastar linha alheia junto.
  -- (credit_card_bills.payment_transaction_id é FK ON DELETE SET NULL, então o
  -- DELETE não estoura e zera o campo sozinho; o valor certo é reescrito
  -- abaixo — não dá pra confiar em ler esse campo depois do DELETE.)
  DELETE FROM public.financial_transactions t
   WHERE t.transfer_pair_id = v_pair_id
     AND t.company_id = v_company_id
     AND t.bill_id = v_bill_id
     AND t.category = 'Pagamento de Fatura';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Recompute por SUM, NUNCA `amount_paid - delta`: SUM é idempotente e cura
  -- erro antigo; incremento por delta grava a falha parcial pra sempre.
  SELECT COALESCE(SUM(t.amount), 0)
    INTO v_new_paid
    FROM public.financial_transactions t
   WHERE t.bill_id = v_bill_id
     AND t.company_id = v_company_id
     AND t.transaction_type = 'saida'
     AND t.category = 'Pagamento de Fatura';

  SELECT COALESCE(SUM(t.amount), 0)
    INTO v_bill_total
    FROM public.financial_transactions t
   WHERE t.account_id = v_card_id
     AND t.transaction_type = 'saida'
     AND t.credit_card_bill_date = v_reference;

  -- Recalcula o status olhando o que SOBROU. Nunca forçar 'open': isso sumiria
  -- com o registro de pagamentos parciais anteriores.
  -- `v_new_paid > 0 AND` no primeiro ramo evita o caso 0 >= 0 - 0.01, que
  -- marcaria como 'paid' uma fatura sem compras e sem pagamento.
  --
  -- O ramo final NÃO é mais 'open' cego. Desde que o status "fechada" passou a
  -- ser persistido (close_due_credit_card_bills + cron diário), devolver uma
  -- fatura de fechamento vencido pra 'open' fazia o banco mentir até a
  -- madrugada seguinte: a tela mostrava "Fechada" (effectiveBillStatus deriva a
  -- mesma coisa no client) e o SQL dizia "Aberta". Aqui aplicamos a MESMA régua
  -- inclusiva do resto do módulo — fechou quando hoje em America/Sao_Paulo já
  -- alcançou closing_date, inclusive no próprio dia.
  -- Nunca current_date cru: pegaria UTC e erraria a virada do dia.
  v_new_status := CASE
    WHEN v_new_paid > 0 AND v_new_paid >= v_bill_total - 0.01 THEN 'paid'
    WHEN v_new_paid > 0                                        THEN 'partial'
    WHEN (now() AT TIME ZONE 'America/Sao_Paulo')::date >= v_closing THEN 'closed'
    ELSE 'open'
  END;

  -- Reaponta pra uma perna de saída ainda viva, se sobrou alguma.
  SELECT t.id
    INTO v_payment_txn_id
    FROM public.financial_transactions t
   WHERE t.bill_id = v_bill_id
     AND t.company_id = v_company_id
     AND t.transaction_type = 'saida'
     AND t.category = 'Pagamento de Fatura'
   ORDER BY t.transaction_date DESC, t.created_at DESC
   LIMIT 1;

  UPDATE public.credit_card_bills
     SET amount_paid            = round(v_new_paid, 2),
         status                 = v_new_status,
         paid_at                = CASE WHEN v_new_status = 'paid'
                                       THEN COALESCE(v_old_paid_at, now())
                                       ELSE NULL END,
         payment_transaction_id = v_payment_txn_id,
         updated_at             = now()
   WHERE id = v_bill_id
     AND company_id = v_company_id;

  -- DESQUITA AS COMPRAS ATÉ CABER NO QUE SOBROU DE PAGO — espelho exato do
  -- passo 8 de pay_credit_card_bill.
  --
  -- SIMETRIA É O PONTO. Se pagar quita mas estornar não desquita, a DRE fica
  -- presa num estado que o usuário não consegue desfazer pela tela: ele estorna
  -- o pagamento, a fatura volta pra aberta, o limite do cartão desce de novo, e
  -- mesmo assim a despesa continua contada como paga no resultado do mês.
  --
  -- Antes: o estorno desquitava TUDO sempre que a fatura saía de 'paid'. Isso
  -- era certo quando só pagamento integral quitava. Agora que pagamento parcial
  -- também quita, zerar tudo apagaria do Caixa compras cobertas por um
  -- pagamento ANTERIOR que continua de pé — sumiria dinheiro que saiu mesmo.
  --
  -- Regra nova: desquita da MAIS RECENTEMENTE quitada pra trás, até que o total
  -- quitado volte a caber no total pago que restou. Com pago = 0 o laço desquita
  -- tudo, que é exatamente o comportamento antigo — e é o caso que produção
  -- exerce hoje (estorno do único pagamento).
  --
  -- `AND credit_card_bill_date IS NOT NULL` é redundante com a igualdade a
  -- v_reference (que já é NOT NULL), e está aqui de propósito: é a garantia
  -- explícita de que isto JAMAIS toca as duas pernas do pagamento, que vivem
  -- com credit_card_bill_date = NULL. Se um dia v_reference vier NULL por bug,
  -- a igualdade devolve NULL (não TRUE) e nada é atualizado — mas não quero
  -- depender de lógica de três valores num UPDATE que mexe em dinheiro.
  IF v_new_status <> 'paid' THEN
    SELECT COALESCE(SUM(t.amount), 0)
      INTO v_settled_total
      FROM public.financial_transactions t
     WHERE t.account_id             = v_card_id
       AND t.company_id             = v_company_id
       AND t.transaction_type       = 'saida'
       AND t.credit_card_bill_date  = v_reference
       AND t.credit_card_bill_date IS NOT NULL
       AND t.is_paid                = true;

    FOR v_row IN
      SELECT t.id, t.amount
        FROM public.financial_transactions t
       WHERE t.account_id             = v_card_id
         AND t.company_id             = v_company_id
         AND t.transaction_type       = 'saida'
         AND t.credit_card_bill_date  = v_reference
         AND t.credit_card_bill_date IS NOT NULL
         AND t.is_paid                = true
       -- Mais recente primeiro. paid_date NULL vem antes de propósito: quitação
       -- sem data é a menos confiável de todas, logo a primeira a cair.
       ORDER BY t.paid_date DESC NULLS FIRST, t.updated_at DESC, t.created_at DESC, t.id DESC
    LOOP
      EXIT WHEN v_settled_total <= v_new_paid + 0.01;

      UPDATE public.financial_transactions
         SET is_paid    = false,
             paid_date  = NULL,
             updated_at = now()
       WHERE id         = v_row.id
         AND company_id = v_company_id;

      v_settled_total := v_settled_total - v_row.amount;
      v_unsettled_amt := v_unsettled_amt + v_row.amount;
      v_unsettled     := v_unsettled + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'bill_id',                    v_bill_id,
    'status',                     v_new_status,
    'amount_paid',                round(v_new_paid, 2),
    'deleted_count',              v_deleted,
    'purchases_unsettled',        v_unsettled,
    -- Chave ADITIVA, prova de QA: quanto de compra saiu do Caixa neste estorno.
    'purchases_unsettled_amount', round(v_unsettled_amt, 2)
  );
END;
$fn$;

COMMENT ON FUNCTION public.pay_credit_card_bill(uuid, uuid, date, numeric, text) IS
  'Paga (total ou parcialmente) uma fatura de cartão criando o PAR de lançamentos: saida na conta pagadora + entrada no cartão (esta devolve o limite). Quita as compras da fatura: em pagamento integral, todas; em pagamento PARCIAL, as mais antigas que couberem no orçamento (pago acumulado − já quitado), cada uma com paid_date do pagamento que a cobriu — é isso que faz a compra no cartão entrar na DRE em Caixa no mês certo, sem nunca reconhecer mais do que saiu do banco. Competência não muda (transaction_date intocado). Transacional, com FOR UPDATE na fatura e guarda de tenant nos 3 objetos (fatura, cartão da fatura, conta pagadora).';

COMMENT ON FUNCTION public.revert_credit_card_bill_payment(uuid) IS
  'Estorna um pagamento de fatura de cartão. Recebe o id de qualquer uma das duas pernas, exige vínculo explícito com a fatura (bill_id + category + transfer_pair_id, todos do mesmo tenant), apaga AS DUAS pernas pelo transfer_pair_id e recomputa amount_paid/status/paid_at por SUM (idempotente). Desquita compras da mais recentemente quitada pra trás até o total quitado caber no total pago restante — simétrico ao pay_credit_card_bill, inclusive em fatura com vários pagamentos parciais.';

-- ----------------------------------------------------------------------------
-- GRANTS — reaplicados porque CREATE OR REPLACE não altera ACL, mas se algum
-- dia esta migration rodar num banco onde as funções não existem (reset, clone,
-- ambiente novo), elas nasceriam com o DEFAULT PRIVILEGE do schema public do
-- Supabase, que concede EXECUTE nominalmente a anon e authenticated. Grant
-- nominal não é herdado de PUBLIC, então REVOKE FROM PUBLIC sozinho NÃO basta —
-- uma RPC SECURITY DEFINER que movimenta caixa ficaria chamável por visitante
-- não logado. Assinatura COMPLETA de tipos, e REVOKE antes do GRANT.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pay_credit_card_bill(uuid, uuid, date, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_credit_card_bill(uuid, uuid, date, numeric, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revert_credit_card_bill_payment(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_credit_card_bill_payment(uuid)
  TO authenticated, service_role;
