-- ============================================================================
-- Cartão de crédito — pagamento de fatura transacional (Onda 1 do plano
-- docs/planos/2026-09-04-cartao-limite-e-pagamento-fatura.md)
-- Regra de acesso definida em docs/planos/2026-09-04-cartao-seguranca-rpc.md
-- (🛡️ dev-plataforma-multitenant). Aqui só a implementação SQL.
--
-- DEFEITO QUE ISTO CORRIGE
-- ------------------------
-- Pagar a fatura NÃO devolvia o limite do cartão. O "Disponível" só descia.
-- Causa: useCreditCardBills.payBill fazia UMA perna só — uma `saida` na conta
-- que paga — e o limite disponível é calculado (useFinancialAccounts) como
-- SUM(saida do cartão) - SUM(entrada do cartão). Sem a perna de `entrada` no
-- cartão, o total nunca descia e um cartão de R$ 10.000 aparecia estourado
-- depois de alguns meses com tudo pago.
--
-- Agora o pagamento é um PAR (igual a uma transferência entre contas):
--   perna 1 = saida na conta que paga
--   perna 2 = entrada NO CARTÃO  ← é ESTA que devolve o limite
-- e o par inteiro vive dentro de UMA transação. Antes eram dois `await` soltos
-- contra o PostgREST: se o segundo falhasse, o dinheiro tinha saído do banco e
-- a fatura continuava em aberto — o usuário pagava de novo e saía em dobro.
--
-- ⚠️ As duas pernas nascem com credit_card_bill_date = NULL de propósito. Se a
-- perna do cartão levasse data de fatura, ela seria contada como "lançamento"
-- da fatura correspondente e o total daquela fatura ficaria negativo. Essa
-- coluna marca DESPESA do cartão; pagamento não é despesa do cartão.
-- O vínculo com a fatura é a coluna bill_id (20260904100000).
--
-- ⚠️ SECURITY DEFINER DESLIGA A RLS DENTRO DO CORPO. A consolidação de policies
-- da migration anterior NÃO protege estas funções — ela protege o acesso direto
-- do PostgREST. Todo predicado de tenant está reescrito à mão aqui embaixo.
-- Precedente do repo: get_stock_balance_at_date (v1.19.9) vazava todos os locais
-- porque o guard vivia só na RLS e a RPC só filtrava company_id.
--
-- ⚠️ TODO UUID QUE ENTRA POR PARÂMETRO É HOSTIL. Cada um tem o seu próprio
-- `AND <tabela>.company_id = v_company_id`. Nada de "esse já veio filtrado da
-- tela": p_payment_account_id vem cru do navegador, e sem o gate próprio dava
-- pra eu abrir MINHA fatura (legítima) e mandar a conta bancária de OUTRO
-- tenant como pagadora — a função, rodando como postgres e portanto sem RLS,
-- debitaria o caixa do concorrente sem violar policy nenhuma (IDOR clássico).
--
-- ⚠️ MENSAGEM ÚNICA POR OBJETO. Não existe ramo que diferencie "não existe" de
-- "é de outro tenant": duas mensagens distintas transformam a função num
-- oráculo de enumeração (descubro, um UUID por vez, o que existe no banco
-- inteiro). Uma única busca já com o predicado de company, uma única mensagem.
--
-- Sem OR is_super_admin: é operação financeira DE TENANT. O super_admin da
-- Dominex não tem razão legítima pra debitar o caixa de um cliente, e
-- get_user_company_id() dele devolve a própria empresa, então ele não trava.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- pay_credit_card_bill — registra o pagamento (par de lançamentos) e atualiza
-- a fatura, tudo numa transação.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_credit_card_bill(
  p_bill_id            uuid,
  p_payment_account_id uuid,
  p_payment_date       date,
  p_amount             numeric,
  p_notes              text DEFAULT NULL
)
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

  RETURN jsonb_build_object(
    'bill_id',                 v_bill_id,
    'status',                  v_new_status,
    'amount_paid',             round(v_new_paid, 2),
    'bill_total',              round(v_bill_total, 2),
    'paid_at',                 to_char(v_paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'transfer_pair_id',        v_pair_id,
    'payment_transaction_id',  v_out_txn_id,
    'card_leg_transaction_id', v_card_txn_id
  );
END;
$$;

COMMENT ON FUNCTION public.pay_credit_card_bill(uuid, uuid, date, numeric, text) IS
  'Paga (total ou parcialmente) uma fatura de cartão criando o PAR de lançamentos: saida na conta pagadora + entrada no cartão (esta devolve o limite). Transacional, com FOR UPDATE na fatura e guarda de tenant nos 3 objetos (fatura, cartão da fatura, conta pagadora).';

-- ----------------------------------------------------------------------------
-- revert_credit_card_bill_payment — estorna o pagamento.
-- Recebe o id de QUALQUER UMA das duas pernas e apaga AS DUAS.
--
-- 🔴 ESTA FUNÇÃO É A MAIS PERIGOSA DA ENTREGA. Ela apaga de
-- financial_transactions rodando como postgres, sem RLS. Se o único predicado
-- fosse `company_id`, ela seria uma PRIMITIVA DE DELETE ARBITRÁRIO: qualquer
-- usuário do tenant passaria o UUID de um recebível, de uma folha ou de um
-- pagamento a fornecedor e a função apagaria — sem policy, sem aparecer como
-- exclusão na tela. Escalada de privilégio dentro do próprio tenant.
--
-- Por isso o vínculo com a fatura é CUMULATIVO e OBRIGATÓRIO:
--   t.category = 'Pagamento de Fatura'   E
--   t.transfer_pair_id IS NOT NULL       E
--   t.bill_id IS NOT NULL, com a fatura existindo e sendo do mesmo tenant,
--   e o cartão dessa fatura também sendo do mesmo tenant e type='cartao'.
--
-- category sozinha NÃO basta: é texto livre editável pelo usuário.
-- payment_transaction_id da fatura NÃO serve de âncora: só é preenchido em
-- pagamento integral e é 1 coluna pra N pagamentos. Por isso NÃO há fallback
-- por ele aqui — pagamento antigo sem bill_id não é estornável por esta RPC,
-- e é exatamente pra isso que existe o backfill (20260904120000), que popula
-- bill_id NAS DUAS PERNAS de todo pagamento que tocar.
-- Heurística (casar por conta + valor + data) é PROIBIDA: acerta a linha errada
-- em algum cliente, fatalmente. Sem vínculo certo → exceção.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_credit_card_bill_payment(
  p_transaction_id uuid
)
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

  RETURN jsonb_build_object(
    'bill_id',       v_bill_id,
    'status',        v_new_status,
    'amount_paid',   round(v_new_paid, 2),
    'deleted_count', v_deleted
  );
END;
$$;

COMMENT ON FUNCTION public.revert_credit_card_bill_payment(uuid) IS
  'Estorna um pagamento de fatura de cartão. Recebe o id de qualquer uma das duas pernas, exige vínculo explícito com a fatura (bill_id + category + transfer_pair_id, todos do mesmo tenant), apaga AS DUAS pernas pelo transfer_pair_id e recomputa amount_paid/status/paid_at por SUM (idempotente).';

-- ----------------------------------------------------------------------------
-- GRANTS
--
-- Régua deste projeto: o schema public do Supabase tem DEFAULT PRIVILEGES que
-- concedem EXECUTE nominalmente a anon e authenticated em toda função nova.
-- Esses grants são explícitos ao papel nomeado, não herdados de PUBLIC —
-- portanto REVOKE FROM PUBLIC SOZINHO NÃO BASTA e uma RPC SECURITY DEFINER que
-- movimenta caixa ficaria chamável por visitante não logado.
--
-- Assinatura COMPLETA de tipos (Postgres identifica função por nome + tipos):
-- sem ela, sobrecarga futura nasceria com EXECUTE pra anon pelo default
-- privilege. `p_notes text DEFAULT NULL` entra como só `text` — escrever o
-- DEFAULT aqui é erro de sintaxe.
--
-- Ordem importa: REVOKE primeiro, GRANT depois. Invertido, o revoke apaga o grant.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.pay_credit_card_bill(uuid, uuid, date, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_credit_card_bill(uuid, uuid, date, numeric, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.revert_credit_card_bill_payment(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_credit_card_bill_payment(uuid)
  TO authenticated, service_role;
