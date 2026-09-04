-- ============================================================================
-- DRE — pagar a fatura do cartão QUITA as compras daquela fatura (Onda A do
-- plano docs/planos/2026-09-04-dre-regime-caixa-competencia.md)
--
-- O DEFEITO
-- ---------
-- Compra no cartão de crédito NUNCA entrava na DRE. Nem no dia da compra, nem
-- nunca. Três peças que, isoladas, fazem sentido, e juntas abrem o buraco:
--   1. a compra nasce `is_paid = false` (TransactionFormDialog:563 —
--      `const isPaidFinal = isCardSaida ? false : data.is_paid`), porque no dia
--      da compra o dinheiro de fato ainda não saiu de conta nenhuma;
--   2. a DRE só soma `t.is_paid` (FinanceDRE.tsx:52);
--   3. pagar a fatura mexia SÓ na fatura e criava as duas pernas do pagamento,
--      que são neutras de propósito (transfer_pair_id) pra não contar o gasto
--      duas vezes.
-- Resultado: a despesa não aparece na compra (pendente) e não aparece no
-- pagamento (neutro). Ela some.
--
-- Medido em produção antes desta migration: Glacial Cold Brasil com R$ 7.875,61
-- em 45 compras invisíveis no resultado — o lucro na tela dela estava melhor que
-- a realidade, que é a pior classe de erro num sistema financeiro: não dá erro,
-- não dá alerta, só mente pra melhor.
--
-- O QUE MUDA
-- ----------
-- pay_credit_card_bill: quando o pagamento leva a fatura a 'paid', marca as
-- compras daquela fatura como pagas, com paid_date = data do pagamento.
-- revert_credit_card_bill_payment: quando o estorno tira a fatura de 'paid',
-- desmarca as mesmas compras. Simétrico — pagar quita, estornar despaga.
--
-- Pagamento PARCIAL não quita nada (decisão do CEO).
--
-- ⚠️ AS DUAS FUNÇÕES FORAM RECRIADAS A PARTIR DA DEFINIÇÃO VIVA
-- (pg_get_functiondef), não do arquivo 20260904110000. Régua deste repo:
-- recriar função grande partindo de migration antiga já derrubou campo de
-- payload em produção por ~1 mês, calado (get_public_os, v1.19.7). O corpo
-- abaixo é byte-a-byte o que estava rodando + os dois blocos novos.
--
-- Backfill das faturas JÁ pagas: migration 20260904140000 (separada, idempotente).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pay_credit_card_bill(p_bill_id uuid, p_payment_account_id uuid, p_payment_date date, p_amount numeric, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- DEFEITO QUE ISTO CORRIGE: compra no cartão nasce is_paid = false
  -- (TransactionFormDialog: `const isPaidFinal = isCardSaida ? false : ...`) e a
  -- DRE só soma o que tem is_paid. Como pagar a fatura nunca mexia nas compras,
  -- e as duas pernas do pagamento são neutras de propósito (transfer_pair_id),
  -- a compra no cartão NUNCA entrava no resultado. Nem no dia da compra, nem no
  -- dia do pagamento. Medido em produção: R$ 7.875,61 em 45 compras invisíveis
  -- num único cliente, com o lucro na tela melhor que a realidade.
  --
  -- O predicado abaixo é O MESMO do passo 4 (o que soma v_bill_total). Tem que
  -- ser: se divergir, o sistema quita um conjunto de linhas diferente do que ele
  -- cobrou, e a fatura fecha com sobra ou falta. Se um dia mudar lá, muda aqui.
  -- (`AND company_id` é defesa em profundidade sobre o account_id, que já é do
  -- tenant pelo gate do passo 2; conferido em produção que não estreita nada.)
  --
  -- SÓ EM PAGAMENTO INTEGRAL. Decisão do CEO: em pagamento parcial não há como
  -- saber QUAIS compras foram pagas, e qualquer critério inventado (mais antigas
  -- primeiro, rateio) produz dado falso na DRE, que é pior que dado ausente.
  -- 'partial' deixa tudo pendente e só o pagamento que fecha a fatura quita.
  --
  -- As duas pernas do pagamento não são alcançadas por este UPDATE: nascem com
  -- credit_card_bill_date = NULL e is_paid = true. Conferido no banco (0 linhas
  -- de 'Pagamento de Fatura' com credit_card_bill_date preenchida, 0 com
  -- is_paid <> true), não deduzido.
  IF v_new_status = 'paid' THEN
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
  END IF;

  RETURN jsonb_build_object(
    'bill_id',                 v_bill_id,
    'status',                  v_new_status,
    'amount_paid',             round(v_new_paid, 2),
    'bill_total',              round(v_bill_total, 2),
    'paid_at',                 to_char(v_paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'transfer_pair_id',        v_pair_id,
    'payment_transaction_id',  v_out_txn_id,
    'card_leg_transaction_id', v_card_txn_id,
    'purchases_settled',       v_settled
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_credit_card_bill_payment(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_payment_txn_id uuid;
  v_unsettled      integer := 0;
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
  SELECT t.transfer_pair_id, b.id, b.account_id, b.reference_month, b.paid_at
    INTO v_pair_id, v_bill_id, v_card_id, v_reference, v_old_paid_at
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
  v_new_status := CASE
    WHEN v_new_paid > 0 AND v_new_paid >= v_bill_total - 0.01 THEN 'paid'
    WHEN v_new_paid > 0                                        THEN 'partial'
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

  -- DESQUITA AS COMPRAS, espelhando o passo 8 de pay_credit_card_bill.
  --
  -- SIMETRIA É O PONTO. Se pagar quita mas estornar não desquita, a DRE fica
  -- presa num estado que o usuário não consegue desfazer pela tela: ele estorna
  -- o pagamento, a fatura volta pra aberta, o limite do cartão desce de novo, e
  -- mesmo assim a despesa continua contada como paga no resultado do mês.
  --
  -- Roda sempre que a fatura NÃO estiver mais em 'paid' (e não só quando ela
  -- "saiu de paid"): assim o estorno também cura estado inconsistente herdado,
  -- e quando não há nada a fazer o próprio `AND is_paid = true` devolve 0 linhas.
  --
  -- `AND credit_card_bill_date IS NOT NULL` é redundante com a igualdade a
  -- v_reference (que já é NOT NULL), e está aqui de propósito: é a garantia
  -- explícita de que este UPDATE JAMAIS toca as duas pernas do pagamento, que
  -- vivem com credit_card_bill_date = NULL. Se um dia v_reference vier NULL por
  -- bug, a igualdade devolve NULL (não TRUE) e nada é atualizado — mas não
  -- quero depender de lógica de três valores num UPDATE que mexe em dinheiro.
  IF v_new_status <> 'paid' THEN
    UPDATE public.financial_transactions t
       SET is_paid    = false,
           paid_date  = NULL,
           updated_at = now()
     WHERE t.account_id             = v_card_id
       AND t.company_id             = v_company_id
       AND t.transaction_type       = 'saida'
       AND t.credit_card_bill_date  = v_reference
       AND t.credit_card_bill_date IS NOT NULL
       AND t.is_paid                = true;
    GET DIAGNOSTICS v_unsettled = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'bill_id',             v_bill_id,
    'status',              v_new_status,
    'amount_paid',         round(v_new_paid, 2),
    'deleted_count',       v_deleted,
    'purchases_unsettled', v_unsettled
  );
END;
$$;

COMMENT ON FUNCTION public.pay_credit_card_bill(uuid, uuid, date, numeric, text) IS
  'Paga (total ou parcialmente) uma fatura de cartão criando o PAR de lançamentos: saida na conta pagadora + entrada no cartão (esta devolve o limite). Quando o pagamento fecha a fatura (status paid), marca as compras daquela fatura como is_paid/paid_date — é isso que faz a compra no cartão finalmente entrar na DRE. Transacional, com FOR UPDATE na fatura e guarda de tenant nos 3 objetos (fatura, cartão da fatura, conta pagadora).';

COMMENT ON FUNCTION public.revert_credit_card_bill_payment(uuid) IS
  'Estorna um pagamento de fatura de cartão. Recebe o id de qualquer uma das duas pernas, exige vínculo explícito com a fatura (bill_id + category + transfer_pair_id, todos do mesmo tenant), apaga AS DUAS pernas pelo transfer_pair_id e recomputa amount_paid/status/paid_at por SUM (idempotente). Se a fatura deixar de estar paga, desmarca as compras (is_paid=false, paid_date=NULL) — simétrico ao pay_credit_card_bill.';

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
