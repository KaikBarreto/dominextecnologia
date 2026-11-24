-- =============================================================================
-- Cofre do PDV: trava de reserva que não congela o cofre, correção de entrada
-- manual e fim do texto técnico no lançamento da venda.
-- =============================================================================
--
-- 1) pdv_guard_financial_treasury_v2 (gatilho tg_zz_pdv_financial_treasury_v2)
--
--    Regra antiga: barrava qualquer operação que deixasse
--    "saldo do cofre < dinheiro reservado nos caixas abertos". Dois problemas
--    reais (BR Frio, 20/11/2026):
--      a) Excluir uma entrada lançada à mão por engano no cofre (venda que
--         deveria ter passado pelo PDV) era barrado: o cliente ficava obrigado a
--         manter no saldo um dinheiro que nunca existiu.
--      b) Quando o cofre ficava abaixo da reserva por qualquer motivo, TODA
--         operação seguinte na conta era barrada, inclusive venda em dinheiro do
--         PDV (que soma igual no saldo e na reserva): o cofre travava.
--
--    Regra nova:
--      - Disponível = saldo - reserva. Calcula "antes" (estado atual) e
--        "depois" (com o efeito da linha e o delta de reserva da RPC canônica).
--        Só barra se houver caixa aberto (v2) na conta E depois < 0 E
--        depois < antes. Mesma mensagem e mesmo código
--        (23514 / PDV_TREASURY_CUSTODY_RESERVED).
--      - Correção (UPDATE/DELETE) de ENTRADA manual, sem nenhum vínculo com o
--        PDV (origin <> 'pdv', pdv_financial_role, pdv_settlement_group_id e
--        pdv_cash_session_id nulos), não passa pela trava de reserva. O lock das
--        contas e as demais validações continuam, inclusive a imutabilidade de
--        lançamento ligado à custódia (PDV_CUSTODY_FINANCIAL_IMMUTABLE).
--      - UPDATE que só muda observação/descrição (notes, description,
--        updated_at) passa direto: não mexe em saldo nem em reserva. Categoria
--        fica de fora porque decide grupo do DRE e o extrato de crédito do
--        cliente.
--    Assinatura, SECURITY DEFINER, search_path, dono e grants inalterados
--    (CREATE OR REPLACE a partir da definição viva de produção).
--
-- 2) pdv_create_receivable_financial_v2
--
--    Gravava notes = 'Baixa v2 de recebível; request <uuid>' em toda cobertura
--    paga de venda do PDV. O cliente via esse texto no histórico do caixa e no
--    Contas a Receber. Nada lê esse campo (nem front, nem RPC, nem
--    idempotência); o request já está em pdv_settlement_group_id. Passa a
--    gravar NULL. A categoria 'Recebimento parcial' NÃO muda: o extrato de
--    crédito do cliente (pdv_customer_credit_statement_internal_v4) usa o nome
--    da categoria para não listar essas linhas como dívida do cliente.
--
-- 3) Backfill: limpa as observações técnicas já gravadas, em todas as
--    empresas (filtro exato: origin 'pdv' e texto igual ao gerado com o
--    pdv_settlement_group_id da própria linha). Possível por causa da exceção de edição só de texto do item 1
--    (as linhas em dinheiro estão ligadas à custódia). Linhas que participam de
--    baixa de fiado (alocação ou crédito de cliente) são protegidas por outro
--    gatilho (pdv_guard_receivable_financial_v2) e ficam de fora, com contagem
--    no NOTICE, para a migration não abortar.
--
-- Sem mudança de schema: types.ts não precisa ser regenerado.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.pdv_guard_financial_treasury_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_account_ids uuid[];
  v_transaction_id uuid;
  v_account_id uuid;
  v_balance numeric;
  v_custody numeric;
  v_old_effect numeric;
  v_new_effect numeric;
  v_planned_custody_delta numeric := 0;
  v_planned_context jsonb;
  v_planned_request_id uuid;
  v_refund record; v_refund_session uuid; v_expected_hash text;
  v_available_before numeric;
  v_available_after numeric;
  v_manual_entry_correction boolean := false;
BEGIN
  v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  v_transaction_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.id END;

  -- A empresa pai ja ausente identifica exclusivamente o cascade do tenant.
  -- Precisa escapar antes de consultar custodia ou adquirir lock, inclusive
  -- para lancamentos sem vinculo com o PDV.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.companies company WHERE company.id = OLD.company_id
  ) THEN
    RETURN OLD;
  END IF;

  -- O expurgo nominal do Zerar Sistema e transaction-local e segue o mesmo
  -- contrato dos guards PDV existentes.
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text
  THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- ON DELETE SET NULL da conta v1 ocorre como trigger referencial aninhado,
  -- depois que a conta pai deixou de estar visivel. Nao ha saldo a reservar
  -- nessa conta; o lifecycle legado permanece compativel.
  IF TG_OP = 'UPDATE'
     AND OLD.account_id IS NOT NULL
     AND NEW.account_id IS NULL
     AND pg_trigger_depth() > 1
     AND NOT EXISTS (
       SELECT 1 FROM public.financial_accounts account
        WHERE account.id = OLD.account_id
     )
  THEN
    RETURN NEW;
  END IF;

  -- Edicao so de texto (observacao/descricao) nao mexe em saldo, valor, conta,
  -- data, tipo nem custodia. Passa direto, inclusive em lancamento ligado a
  -- custodia: o fato financeiro continua imutavel, so o rotulo muda. Categoria
  -- NAO entra aqui de proposito: ela decide grupo do DRE e o extrato de
  -- credito do cliente (pdv_customer_credit_statement_internal_v4 separa
  -- recebimento de venda pela categoria 'Recebimento parcial').
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - ARRAY['notes', 'description', 'updated_at'])
       = (to_jsonb(OLD) - ARRAY['notes', 'description', 'updated_at'])
  THEN
    RETURN NEW;
  END IF;

  -- Fora dos cascades controlados, fato financeiro ligado a custodia e
  -- imutavel. A reversao cria outro fato e outra linha de custodia.
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND EXISTS (
       SELECT 1 FROM public.pdv_cash_custody_entries entry
        WHERE entry.financial_transaction_id = v_transaction_id
     )
  THEN
    RAISE EXCEPTION 'Este lançamento pertence à custódia do caixa e não pode ser alterado ou excluído. Registre uma reversão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CUSTODY_FINANCIAL_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Não é possível transferir um lançamento financeiro entre empresas.'
      USING ERRCODE = '42501', DETAIL = 'PDV_FINANCIAL_COMPANY_IMMUTABLE';
  END IF;

  -- Correcao de ENTRADA lancada a mao (sem nenhum vinculo com o PDV): excluir,
  -- cancelar, desmarcar como paga ou editar continua permitido mesmo que o
  -- cofre fique abaixo do dinheiro reservado nos caixas abertos. A entrada
  -- manual nunca fez parte da custodia; impedir a correcao obrigava o cliente a
  -- manter no saldo um dinheiro que nunca existiu (caso real: venda lancada a
  -- mao no cofre em vez de passar pelo PDV). O lock das contas e todas as
  -- validacoes acima (inclusive a imutabilidade da custodia) continuam valendo.
  -- Saida manual, pagamento de conta pelo cofre e transferencia saindo do
  -- cofre NAO entram aqui.
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.transaction_type::text = 'entrada'
     AND OLD.origin IS DISTINCT FROM 'pdv'
     AND OLD.pdv_financial_role IS NULL
     AND OLD.pdv_settlement_group_id IS NULL
     AND OLD.pdv_cash_session_id IS NULL
     AND (
       TG_OP = 'DELETE'
       OR (
         NEW.transaction_type::text = 'entrada'
         AND NEW.origin IS DISTINCT FROM 'pdv'
         AND NEW.pdv_financial_role IS NULL
         AND NEW.pdv_settlement_group_id IS NULL
         AND NEW.pdv_cash_session_id IS NULL
       )
     )
  THEN
    v_manual_entry_correction := true;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_account_ids := ARRAY[NEW.account_id]::uuid[];
  ELSIF TG_OP = 'UPDATE' THEN
    v_account_ids := ARRAY[OLD.account_id, NEW.account_id]::uuid[];
  ELSE
    v_account_ids := ARRAY[OLD.account_id]::uuid[];
  END IF;

  SELECT COALESCE(array_agg(account_id ORDER BY account_id), ARRAY[]::uuid[])
    INTO v_account_ids
    FROM (
      SELECT DISTINCT account_id
        FROM unnest(v_account_ids) AS requested(account_id)
       WHERE account_id IS NOT NULL
    ) deduplicated;

  -- A porta trava todas as contas tocadas antes de o saldo mudar. Para UPDATE
  -- A->B, a ordem por UUID elimina inversao concorrente B->A.
  IF cardinality(v_account_ids) > 0 THEN
    PERFORM public.pdv_lock_treasury_accounts(v_company_id, v_account_ids);
  END IF;

  -- As RPCs canonicas informam somente o delta de custodia que sera gravado
  -- na MESMA transacao logo depois do fato financeiro. Escritas genericas nao
  -- possuem esse contexto e, portanto, usam delta zero.
  BEGIN
    v_planned_context := NULLIF(
      current_setting('app.pdv_treasury_custody_delta', true), ''
    )::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    v_planned_context := NULL;
  END;
  BEGIN
    v_planned_request_id := NULLIF(v_planned_context->>'request_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_planned_request_id := NULL;
  END;

  FOR v_account_id IN
    SELECT account_id FROM unnest(v_account_ids) AS affected(account_id)
  LOOP
    SELECT round(
      account.initial_balance
      + COALESCE(sum(
          CASE
            WHEN transaction.transaction_type = 'entrada' THEN transaction.amount
            ELSE -transaction.amount
          END
        ) FILTER (
          WHERE transaction.is_paid IS TRUE
            AND transaction.cancelled_at IS NULL
        ), 0),
      2
    )
      INTO v_balance
      FROM public.financial_accounts account
      LEFT JOIN public.financial_transactions transaction
        ON transaction.company_id = account.company_id
       AND transaction.account_id = account.id
     WHERE account.id = v_account_id
       AND account.company_id = v_company_id
     GROUP BY account.initial_balance;

    v_old_effect := 0;
    IF TG_OP IN ('UPDATE', 'DELETE')
       AND OLD.account_id = v_account_id
       AND OLD.is_paid IS TRUE
       AND OLD.cancelled_at IS NULL
    THEN
      v_old_effect := CASE
        WHEN OLD.transaction_type = 'entrada' THEN OLD.amount ELSE -OLD.amount
      END;
    END IF;

    v_new_effect := 0;
    IF TG_OP IN ('INSERT', 'UPDATE')
       AND NEW.account_id = v_account_id
       AND NEW.is_paid IS TRUE
       AND NEW.cancelled_at IS NULL
    THEN
      v_new_effect := CASE
        WHEN NEW.transaction_type = 'entrada' THEN NEW.amount ELSE -NEW.amount
      END;
    END IF;

    SELECT round(COALESCE(sum(entry.amount), 0), 2)
      INTO v_custody
      FROM public.pdv_cash_custody_entries entry
      JOIN public.pdv_cash_sessions session ON session.id = entry.session_id
     WHERE entry.company_id = v_company_id
       AND entry.cash_account_id = v_account_id
       AND session.company_id = v_company_id
       AND session.status = 'aberta'
       AND session.contract_version = 2;

    v_planned_custody_delta := 0;
    IF v_planned_context->>'company_id' = v_company_id::text
       AND v_planned_context->>'account_id' = v_account_id::text
       AND EXISTS (
         SELECT 1 FROM public.pdv_operation_requests request
          WHERE request.id = v_planned_request_id
            AND request.company_id = v_company_id
            AND request.status = 'pending'
            AND request.operation_type IN (
              'cash.event.v2', 'cash.reverse.v2', 'cash.close.v2'
            )
       )
    THEN
      BEGIN
        v_planned_custody_delta := round(
          COALESCE((v_planned_context->>'delta')::numeric, 0), 2
        );
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        v_planned_custody_delta := 0;
      END;
    END IF;

    -- Refund delta is derived from a persisted immutable source + pending
    -- canonical request/hash. A browser-controlled setting is not authorization.
    IF TG_OP='INSERT' AND NEW.pdv_financial_role IN('pdv_refund','pdv_refund_reversal')
      AND NEW.payment_method='dinheiro' THEN
      v_planned_custody_delta:=0;
      SELECT refund.*,requested.metadata requested_metadata INTO v_refund
        FROM public.pdv_refunds refund JOIN public.pdv_refund_events requested
          ON requested.refund_id=refund.id AND requested.event_kind='requested'
        WHERE refund.id=NEW.pdv_settlement_group_id AND refund.company_id=v_company_id;
      IF NOT FOUND OR NEW.amount<>v_refund.amount OR NEW.account_id<>v_account_id
        OR NEW.customer_id IS DISTINCT FROM v_refund.customer_id OR NEW.is_paid IS DISTINCT FROM TRUE
        OR NEW.cancelled_at IS NOT NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'O reembolso não corresponde à origem financeira.' USING ERRCODE='23514',DETAIL='code=pdv_refund_treasury_source_mismatch'; END IF;
      IF NEW.pdv_financial_role='pdv_refund' THEN
        v_refund_session:=(v_refund.requested_metadata->>'cash_session_id')::uuid;
        v_expected_hash:=public.pdv_operation_payload_hash(jsonb_build_object('return_id',v_refund.commercial_return_id,
          'payment_id',v_refund.original_payment_id,'amount',v_refund.amount,'reason',v_refund.reason,
          'account_id',v_account_id,'cash_session_id',v_refund_session)
          ||CASE WHEN v_refund.residual_cancellation_id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('residual_cancellation_id',v_refund.residual_cancellation_id) END);
        IF NEW.transaction_type::text<>'saida' OR (v_refund.requested_metadata->>'account_id')::uuid IS DISTINCT FROM v_account_id
          OR NOT EXISTS(SELECT 1 FROM public.pdv_operation_requests request
            WHERE request.id=v_refund.operation_request_id AND request.company_id=v_company_id
              AND request.created_by=auth.uid() AND request.status='pending'
              AND request.operation_type='after_sale.refund.request.v2' AND request.payload_hash=v_expected_hash)
          OR EXISTS(SELECT 1 FROM public.pdv_refund_events event WHERE event.refund_id=v_refund.id AND event.event_kind IN('settled','reversed')) THEN
          RAISE EXCEPTION 'A solicitação do reembolso não corresponde ao caixa e ao valor.' USING ERRCODE='23514',DETAIL='code=pdv_refund_treasury_request_mismatch'; END IF;
        v_planned_custody_delta:=-v_refund.amount;
      ELSE
        SELECT custody.session_id INTO v_refund_session
          FROM public.pdv_refund_events settled JOIN public.pdv_cash_custody_entries custody ON custody.id=settled.custody_entry_id
          WHERE settled.refund_id=v_refund.id AND settled.event_kind='settled' AND custody.cash_account_id=v_account_id
            AND custody.company_id=v_company_id AND custody.amount=-v_refund.amount;
        v_expected_hash:=public.pdv_operation_payload_hash(jsonb_build_object('refund_id',v_refund.id,'reason',NEW.notes));
        IF NEW.transaction_type::text<>'entrada' OR v_refund_session IS NULL OR NOT EXISTS(
          SELECT 1 FROM public.pdv_operation_requests request WHERE request.id=v_planned_request_id
            AND request.company_id=v_company_id AND request.created_by=auth.uid() AND request.status='pending'
            AND request.operation_type='after_sale.refund.reverse.v2' AND request.payload_hash=v_expected_hash) THEN
          RAISE EXCEPTION 'O estorno do reembolso não corresponde ao caixa original.' USING ERRCODE='23514',DETAIL='code=pdv_refund_treasury_request_mismatch'; END IF;
        v_planned_custody_delta:=v_refund.amount;
      END IF;
      IF NEW.pdv_cash_session_id IS DISTINCT FROM v_refund_session OR NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions session WHERE session.id=v_refund_session
        AND session.company_id=v_company_id AND session.cash_account_id=v_account_id
        AND session.status='aberta' AND session.contract_version=2)
        OR public.pdv_current_actor_can_access_session_v3(v_refund_session) IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'O caixa do reembolso está indisponível para seu perfil.' USING ERRCODE='42501',DETAIL='code=pdv_refund_cash_denied'; END IF;
    END IF;

    -- A consulta ainda enxerga OLD no UPDATE/DELETE e nao enxerga NEW no
    -- INSERT; por isso o proprio delta e removido/adicionado exatamente uma vez.
    -- PDV_SUPPLIER_PURCHASE_CUSTODY_SOURCE_V4
    IF TG_OP='INSERT' AND NEW.pdv_financial_role='pdv_supplier_payment'
      AND NEW.payment_method='dinheiro' AND NEW.pdv_cash_session_id IS NOT NULL THEN
      IF NEW.transaction_type<>'saida' OR NEW.is_paid IS DISTINCT FROM TRUE
        OR NEW.cancelled_at IS NOT NULL OR NEW.account_id IS DISTINCT FROM v_account_id
        OR NOT EXISTS(
          SELECT 1 FROM public.financial_transactions parent
          JOIN public.compra_ordens oc ON oc.financial_transaction_id=parent.id AND oc.company_id=parent.company_id
          JOIN public.compras purchase ON purchase.id=oc.compra_id AND purchase.company_id=oc.company_id
          JOIN public.pdv_operation_requests request ON request.id=NEW.pdv_settlement_group_id AND request.company_id=parent.company_id
          JOIN public.pdv_cash_sessions session ON session.id=purchase.cash_session_id AND session.company_id=purchase.company_id
          WHERE parent.id=NEW.parent_transaction_id AND parent.company_id=NEW.company_id
            AND parent.pdv_financial_role='pdv_supplier_obligation' AND parent.pdv_settlement_group_id=request.id
            AND NEW.amount=parent.amount-parent.amount_received AND NEW.supplier_id IS NOT DISTINCT FROM parent.supplier_id
            AND purchase.flow_type='compra_direta' AND purchase.client_request_id::text=request.idempotency_key
            AND purchase.cash_session_id=NEW.pdv_cash_session_id AND purchase.terminal_id=session.terminal_id
            AND session.cash_account_id=NEW.account_id AND session.status='aberta' AND session.contract_version=2
            AND public.pdv_current_actor_can_access_session_v3(session.id) IS TRUE
            AND request.operation_type='purchase.supplier_credit.v4' AND request.status='pending'
            AND request.created_by=auth.uid() AND NEW.created_by=request.created_by
        ) THEN
        RAISE EXCEPTION 'O pagamento não corresponde à origem da compra.' USING ERRCODE='23514',DETAIL='code=pdv_supplier_payment_invalid';
      END IF;
      v_planned_custody_delta:=-NEW.amount;
    END IF;
    -- Disponivel = saldo do cofre - dinheiro reservado nos caixas abertos.
    -- "antes" e o estado atual (sem a operacao); "depois" aplica o efeito da
    -- linha e o delta de custodia planejado pela RPC canonica.
    v_available_before := round(v_balance - v_custody, 2);
    v_balance := round(v_balance - v_old_effect + v_new_effect, 2);
    v_custody := round(v_custody + v_planned_custody_delta, 2);
    v_available_after := round(v_balance - v_custody, 2);

    -- So barra o que PIORA um disponivel que termina negativo. Se o cofre ja
    -- esta descoberto por qualquer motivo, operacoes que nao pioram (venda em
    -- dinheiro, sangria, entrada nova, estorno que mexe igual no saldo e na
    -- custodia) seguem passando; antes a regra "saldo < custodia" travava o
    -- cofre inteiro.
    IF NOT v_manual_entry_correction
       AND EXISTS (
      SELECT 1 FROM public.pdv_cash_sessions session
       WHERE session.company_id = v_company_id
         AND session.cash_account_id = v_account_id
         AND session.status = 'aberta'
         AND session.contract_version = 2
    ) AND v_available_after < 0
      AND v_available_after < v_available_before THEN
      RAISE EXCEPTION 'Este lançamento deixaria o cofre sem saldo para o dinheiro reservado nos caixas abertos.'
        USING ERRCODE = '23514', DETAIL = 'PDV_TREASURY_CUSTODY_RESERVED';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$function$;

-- -----------------------------------------------------------------------------
-- 2) Lançamento da venda do PDV sem texto técnico na observação.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_create_receivable_financial_v2(p_company_id uuid, p_user_id uuid, p_customer_id uuid, p_account_id uuid, p_session_id uuid, p_method text, p_amount numeric, p_received_on date, p_description text, p_outer_request_id uuid, p_is_reversal boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_financial_id uuid;
  v_cash_request record;
  v_cash_request_id uuid;
  v_custody_id uuid;
  v_signed_custody numeric := CASE WHEN p_is_reversal THEN -p_amount ELSE p_amount END;
  v_kind text := CASE WHEN p_is_reversal THEN 'refund' ELSE 'cash_receipt' END;
  v_result jsonb;
BEGIN
  PERFORM public.pdv_lock_treasury_account(p_company_id, p_account_id);

  IF p_method = 'dinheiro' THEN
    SELECT * INTO v_cash_request
      FROM public.pdv_claim_operation_request(
        p_company_id,
        'cash.event.v2',
        'receivable-cash:' || p_outer_request_id::text,
        jsonb_build_object(
          'outer_request_id', p_outer_request_id,
          'session_id', p_session_id,
          'account_id', p_account_id,
          'amount', round(p_amount, 2),
          'reversal', p_is_reversal
        )
      );
    IF v_cash_request.is_replay THEN
      IF v_cash_request.request_status = 'completed' THEN
        RETURN (v_cash_request.stored_result->>'financial_transaction_id')::uuid;
      END IF;
      RAISE EXCEPTION 'O evento de dinheiro desta baixa já está em processamento.'
        USING ERRCODE = '55000', DETAIL = 'PDV_RECEIVABLE_CASH_IN_PROGRESS';
    END IF;
    v_cash_request_id := v_cash_request.request_id;

    PERFORM set_config(
      'app.pdv_treasury_custody_delta',
      jsonb_build_object(
        'company_id', p_company_id,
        'account_id', p_account_id,
        'request_id', v_cash_request_id,
        'delta', v_signed_custody
      )::text,
      true
    );
  END IF;

  INSERT INTO public.financial_transactions (
    company_id, transaction_type, description, amount, category,
    transaction_date, paid_date, is_paid, account_id, customer_id,
    origin, payment_method, created_by, notes,
    pdv_financial_role, pdv_settlement_group_id, pdv_cash_session_id
  ) VALUES (
    p_company_id,
    CASE WHEN p_is_reversal
      THEN 'saida'::public.transaction_type
      ELSE 'entrada'::public.transaction_type
    END,
    p_description, round(p_amount, 2), 'Recebimento parcial',
    p_received_on, p_received_on, true, p_account_id, p_customer_id,
    'pdv', p_method, p_user_id,
    -- Sem texto técnico na observação: o cliente vê este campo no histórico
    -- do caixa e no Contas a Receber. O request já fica em
    -- pdv_settlement_group_id.
    NULL,
    CASE WHEN p_is_reversal
      THEN 'pdv_receivable_reversal'
      ELSE 'pdv_receivable_settlement'
    END,
    p_outer_request_id, p_session_id
  ) RETURNING id INTO v_financial_id;

  IF p_method = 'dinheiro' THEN
    PERFORM set_config('app.pdv_treasury_custody_delta', '', true);
    INSERT INTO public.pdv_cash_custody_entries (
      company_id, session_id, cash_account_id, operation_request_id,
      entry_kind, amount, source_type, source_id,
      financial_transaction_id, metadata, created_by
    ) VALUES (
      p_company_id, p_session_id, p_account_id, v_cash_request_id,
      v_kind, v_signed_custody, 'financial_transaction', v_financial_id,
      v_financial_id,
      jsonb_build_object('receivable_operation_request_id', p_outer_request_id),
      p_user_id
    ) RETURNING id INTO v_custody_id;

    v_result := jsonb_build_object(
      'financial_transaction_id', v_financial_id,
      'custody_entry_id', v_custody_id
    );
    PERFORM public.pdv_complete_operation_request(
      v_cash_request_id, 'financial_transaction', v_financial_id, v_result
    );
  END IF;

  RETURN v_financial_id;
END
$function$;

-- -----------------------------------------------------------------------------
-- 3) Backfill das observações técnicas já gravadas.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_total integer;
  v_protected integer;
  v_updated integer;
  v_company record;
BEGIN
  SELECT count(*) INTO v_total
    FROM public.financial_transactions t
   WHERE t.origin = 'pdv'
     AND t.notes = 'Baixa v2 de recebível; request ' || t.pdv_settlement_group_id::text;

  SELECT count(*) INTO v_protected
    FROM public.financial_transactions t
   WHERE t.origin = 'pdv'
     AND t.notes = 'Baixa v2 de recebível; request ' || t.pdv_settlement_group_id::text
     AND (
       EXISTS (SELECT 1 FROM public.pdv_receivable_settlement_allocations a
                WHERE a.receivable_transaction_id = t.id
                   OR a.settlement_transaction_id = t.id)
       OR EXISTS (SELECT 1 FROM public.pdv_party_credit_entries e
                   WHERE e.target_financial_transaction_id = t.id)
     );

  FOR v_company IN
    SELECT t.company_id, count(*) AS n
      FROM public.financial_transactions t
     WHERE t.origin = 'pdv'
     AND t.notes = 'Baixa v2 de recebível; request ' || t.pdv_settlement_group_id::text
     GROUP BY t.company_id
     ORDER BY t.company_id
  LOOP
    RAISE NOTICE 'Observação técnica: empresa % tem % linha(s).', v_company.company_id, v_company.n;
  END LOOP;

  UPDATE public.financial_transactions t
     SET notes = NULL
   WHERE t.origin = 'pdv'
     AND t.notes = 'Baixa v2 de recebível; request ' || t.pdv_settlement_group_id::text
     AND NOT EXISTS (SELECT 1 FROM public.pdv_receivable_settlement_allocations a
                      WHERE a.receivable_transaction_id = t.id
                         OR a.settlement_transaction_id = t.id)
     AND NOT EXISTS (SELECT 1 FROM public.pdv_party_credit_entries e
                      WHERE e.target_financial_transaction_id = t.id);
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RAISE NOTICE 'Observação técnica limpa: % de % linha(s); % protegida(s) por baixa de fiado ficaram como estavam.',
    v_updated, v_total, v_protected;

  IF v_updated <> v_total - v_protected THEN
    RAISE EXCEPTION 'Backfill inconsistente: esperado %, atualizado %.', v_total - v_protected, v_updated;
  END IF;
END
$$;
