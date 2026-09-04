-- ============================================================================
-- Fatura fechada continua fechada depois de um estorno + CHECK de status
-- ============================================================================
--
-- (1) revert_credit_card_bill_payment devolvia a fatura pra 'open' sempre que o
--     estorno zerava o pago, MESMO quando o fechamento já tinha passado. Isso
--     era inofensivo enquanto "fechada" só existia na tela; agora que o status
--     é persistido (close_due_credit_card_bills + cron close-credit-card-bills-
--     daily, 20260904160000), o banco passava a mentir até a execução seguinte
--     do cron. Único ponto alterado: o ramo final do CASE de status.
--     'paid' e 'partial' seguem exatamente como estavam.
--
--     Recriada a partir da DEFINIÇÃO VIVA (pg_get_functiondef), não de uma
--     migration antiga — recriar de base velha é como se perde payload de RPC
--     grande sem ninguém perceber.
--
-- (2) O CHECK de status declarado na 20260418210000 NÃO existia no banco vivo
--     (conferido em pg_constraint: a tabela só tinha PK, UNIQUE e as FKs —
--     provavelmente perdido num reset de schema). Como agora 'closed' é escrito
--     por RPC e por cron, a constraint volta pra valer como contrato.
--     Conferido antes de aplicar: 0 linhas violam (open 6, closed 6, paid 1).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revert_credit_card_bill_payment(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- ----------------------------------------------------------------------------
-- (2) CHECK de status de volta
-- ----------------------------------------------------------------------------
-- ADD CONSTRAINT não aceita IF NOT EXISTS; o DO guarda a idempotência.
-- Se alguma linha violar, o ALTER estoura aqui em vez de gravar lixo depois.
DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.credit_card_bills'::regclass
       AND conname  = 'credit_card_bills_status_check'
  ) THEN
    ALTER TABLE public.credit_card_bills
      ADD CONSTRAINT credit_card_bills_status_check
      CHECK (status IN ('open', 'closed', 'paid', 'partial'));

    RAISE NOTICE 'credit_card_bills_status_check criada';
  ELSE
    RAISE NOTICE 'credit_card_bills_status_check ja existia';
  END IF;
END
$chk$;
