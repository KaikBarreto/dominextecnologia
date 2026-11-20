-- =============================================================================
-- Desfazer venda do PDV de verdade (PDV e Financeiro) + exclusão pelo
-- Financeiro de lançamento que veio do PDV.
-- Depende de 20261120130000 (regra de disponível do cofre).
-- =============================================================================
--
-- Problema provado em produção (ensaio 20/11/2026, BR Frio): o cancelamento
-- oficial pdv_cancel_order_v2 -> pdv_cancel_order só cancela financeiro ligado
-- por pdv_order_payments.financial_transaction_id (contrato v1). Em venda v2 essa
-- coluna é nula (o vínculo é settlement_transaction_id/receivable_transaction_id):
-- o pedido vira 'cancelado' e o estoque volta, mas o recebimento continua pago,
-- contando no saldo e na receita, e o dinheiro continua na gaveta do caixa
-- aberto (o operador devolve o troco e o fechamento acusa falta). Também não
-- devolvia saldo do cliente nem vale usados na venda.
--
-- O que muda:
--   1) pdv_guard_financial_treasury_v2: mesma definição da 20261120130000 +
--      UMA exceção estreita à imutabilidade de lançamento ligado à gaveta:
--      marcar cancelled_at no recebimento de uma venda que JÁ está cancelada,
--      só quando a função interna de cancelamento abriu, na mesma transação, a
--      operação idempotente do pedido (criada pelo mesmo usuário) e só
--      mudando cancelled_at/cancelled_reason/updated_at. A gaveta continua
--      append-only: a devolução vira uma linha nova de reversão.
--   2) pdv_order_cancel_block_v2 (interna): recusa, com mensagem clara, venda
--      v2 que só pode ser desfeita pelo pós-venda (saldo do cliente, vale,
--      devolução/cancelamento parcial já feitos), fiado com recebimento e
--      recebimento conciliado com extrato. Cartão NÃO é recusado (decisão do
--      CEO, 20/11/2026): é desfeito no acerto financeiro.
--   3) pdv_cancel_order_financial_internal_v2 (interna): depois do core, marca
--      cancelled_at em todo recebimento/conta a receber v2 da venda. Dinheiro em
--      caixa ABERTO: devolve da gaveta (linha de reversão). Dinheiro em caixa
--      JÁ FECHADO: o fechamento fica como foi (nenhuma linha nova na sessão
--      fechada, sobra/falta intactas); o lançamento sai do saldo do cofre.
--      Recebimento em dinheiro já estornado pelo caixa ("Reversão: …"): não é
--      cancelado de novo (o dinheiro já saiu); item volta com
--      drawer = 'already_reversed'. Contas do cofre são travadas (ordenadas)
--      antes de sessão, gaveta e lançamentos.
--   4) pdv_cancel_order_v2: mesmo contrato público; passa pela recusa (2), chama
--      o core e depois o acerto financeiro (3), tudo numa transação.
--   5) finance_pdv_transaction_undo_plan_v1 (pública, leitura): diz o que
--      acontece ao excluir um lançamento do PDV pelo Financeiro.
--   6) finance_delete_pdv_transaction_v1 (pública): executa o plano. Só para
--      quem tem acesso a todos os caixas (pdv_can_operate_other_cash_v2, a
--      mesma trava da 1.41.32).
--      Movimento manual da gaveta usa a mesma reversão da tela do caixa
--      (pdv_reverse_cash_event_explicit_core_018_v2).
--   7) pdv_cash_session_projection_v3: a linha de devolução da gaveta por
--      cancelamento aparece com descrição, forma de pagamento e pedido.
--   8) pdv_settle_card_authorization_v3: recusa liquidar cartão de venda
--      cancelada ou autorização anulada (code=pdv_card_settlement_order_cancelled).
--   Cartão no cancelamento: ainda não liquidado -> pagamento fica
--   coverage_status 'revoked' / settlement_status 'not_applicable'; já
--   liquidado -> bruto e taxa ganham cancelled_at e o pagamento fica
--   'revoked' / 'reversed'. Estados já aceitos pelo CHECK
--   pdv_order_payments_v2_roles_check; nenhum código lê esses estados hoje.
-- Sem mudança de schema: types.ts precisa ganhar só as 2 funções públicas novas
-- (regenerar após aplicar).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Gatilho de tesouraria: regra da 20261120130000 + exceção do cancelamento.
-- -----------------------------------------------------------------------------
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
  v_order_cancel_ctx jsonb;
  v_order_cancel_update boolean := false;
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

  -- Excecao estreita: cancelamento de VENDA do PDV. A funcao interna
  -- pdv_cancel_order_financial_internal_v2 abre, na mesma transacao, a operacao
  -- idempotente do pedido (criada por este usuario) e informa a linha. So passa
  -- o UPDATE que marca cancelled_at (com motivo) no recebimento de um pagamento
  -- desse pedido, que ja precisa estar cancelado. A gaveta continua append-only:
  -- a devolucao e uma linha nova de reversao, gravada logo depois.
  IF TG_OP = 'UPDATE' THEN
    BEGIN
      v_order_cancel_ctx := NULLIF(current_setting('app.pdv_order_cancel_financial', true), '')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      v_order_cancel_ctx := NULL;
    END;
    IF v_order_cancel_ctx IS NOT NULL
       AND v_order_cancel_ctx->>'company_id' = OLD.company_id::text
       AND v_order_cancel_ctx->>'transaction_id' = OLD.id::text
       AND OLD.cancelled_at IS NULL
       AND NEW.cancelled_at IS NOT NULL
       AND (to_jsonb(NEW) - ARRAY['cancelled_at', 'cancelled_reason', 'updated_at'])
         = (to_jsonb(OLD) - ARRAY['cancelled_at', 'cancelled_reason', 'updated_at'])
       AND EXISTS (
         SELECT 1 FROM public.pdv_operation_requests request
          WHERE request.id::text = v_order_cancel_ctx->>'request_id'
            AND request.company_id = OLD.company_id
            AND request.status = 'pending'
            AND request.operation_type = 'commercial.order.cancel_financial.v2'
            AND request.created_by IS NOT DISTINCT FROM auth.uid()
       )
       AND EXISTS (
         SELECT 1
           FROM public.pdv_order_payments payment
           JOIN public.pdv_orders sale
             ON sale.id = payment.order_id AND sale.company_id = payment.company_id
          WHERE payment.company_id = OLD.company_id
            AND payment.order_id::text = v_order_cancel_ctx->>'order_id'
            AND payment.settlement_transaction_id = OLD.id
            AND sale.status = 'cancelado'
       )
    THEN
      v_order_cancel_update := true;
    END IF;
  END IF;

  -- Fora dos cascades controlados, fato financeiro ligado a custodia e
  -- imutavel. A reversao cria outro fato e outra linha de custodia.
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND NOT v_order_cancel_update
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
-- 2) Recusa de venda que não pode ser desfeita pelo cancelamento simples.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_order_cancel_block_v2(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_order public.pdv_orders%ROWTYPE;
BEGIN
  SELECT o.* INTO v_order FROM public.pdv_orders o WHERE o.id = p_order_id;
  IF NOT FOUND OR v_order.contract_version IS DISTINCT FROM 2 OR v_order.status = 'cancelado' THEN
    RETURN NULL;
  END IF;

  -- Saldo do cliente e vale têm origem de valor própria; o cancelamento
  -- simples não devolve nenhum deles. Cartão é desfeito pelo acerto financeiro
  -- (autorização anulada ou liquidação e taxa canceladas).
  IF EXISTS (
    SELECT 1 FROM public.pdv_order_payments p
     WHERE p.order_id = p_order_id AND p.company_id = v_order.company_id
       AND (p.coverage_kind IN ('customer_credit', 'voucher')
            OR p.voucher_entry_id IS NOT NULL
            OR p.party_credit_entry_id IS NOT NULL)
  ) THEN
    RETURN jsonb_build_object(
      'code', 'pdv_order_cancel_after_sale_required',
      'message', 'Esta venda foi paga com saldo do cliente ou vale. Para desfazer, use a devolução no pós-venda do PDV.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pdv_commercial_returns r
     WHERE r.order_id = p_order_id AND r.company_id = v_order.company_id
       AND r.event_kind = 'return'
       AND NOT EXISTS (SELECT 1 FROM public.pdv_commercial_returns rv WHERE rv.reversal_of_id = r.id)
  ) OR EXISTS (
    SELECT 1 FROM public.pdv_order_residual_cancellations rc
     WHERE rc.order_id = p_order_id AND rc.company_id = v_order.company_id
  ) THEN
    RETURN jsonb_build_object(
      'code', 'pdv_order_cancel_has_return',
      'message', 'Esta venda já tem devolução ou cancelamento parcial registrado. Para desfazer o restante, use o pós-venda do PDV.');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_order_payments p
      JOIN public.financial_transactions t
        ON t.id IN (p.settlement_transaction_id, p.receivable_transaction_id)
       AND t.company_id = p.company_id
     WHERE p.order_id = p_order_id AND p.company_id = v_order.company_id
       AND t.cancelled_at IS NULL
       AND (COALESCE(t.amount_received, 0) > 0
            OR EXISTS (SELECT 1 FROM public.pdv_receivable_settlement_allocations a
                        WHERE a.receivable_transaction_id = t.id OR a.settlement_transaction_id = t.id)
            OR EXISTS (SELECT 1 FROM public.pdv_party_credit_entries e
                        WHERE e.target_financial_transaction_id = t.id))
  ) THEN
    RETURN jsonb_build_object(
      'code', 'pdv_order_cancel_has_receipts',
      'message', 'Esta venda no fiado já tem recebimento. Estorne o recebimento na conta do cliente antes de desfazer a venda.');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_order_payments p
      JOIN public.reconciliation_matches rm
        ON rm.financial_transaction_id IN (p.settlement_transaction_id, p.receivable_transaction_id)
     WHERE p.order_id = p_order_id AND p.company_id = v_order.company_id
  ) THEN
    RETURN jsonb_build_object(
      'code', 'pdv_order_cancel_reconciled',
      'message', 'O recebimento desta venda está conciliado com o extrato bancário. Desfaça a conciliação antes de desfazer a venda.');
  END IF;

  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public.pdv_order_cancel_block_v2(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3) Acerto financeiro de venda v2 cancelada (interna, chamada depois do core).
--    Idempotente pela operação 'commercial.order.cancel_financial.v2' do pedido.
--    Também conserta venda cancelada antes desta migration que ficou com o
--    recebimento contando.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_cancel_order_financial_internal_v2(p_order_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.pdv_orders%ROWTYPE;
  v_claim record;
  v_cash_claim record;
  v_row record;
  v_tx public.financial_transactions%ROWTYPE;
  v_entry public.pdv_cash_custody_entries%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_cancel_reason text;
  v_position numeric(14,2);
  v_drawer text;
  v_reversal_entry uuid;
  v_accounts uuid[];
  v_card record;
  v_items jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_auth_required';
  END IF;

  SELECT o.* INTO v_order
    FROM public.pdv_orders o
   WHERE o.id = p_order_id
     AND o.company_id = public.get_user_company_id(v_uid)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'code=pdv_order_not_found';
  END IF;
  IF v_order.status <> 'cancelado' THEN
    RAISE EXCEPTION 'A venda precisa estar cancelada antes do acerto financeiro.'
      USING ERRCODE = '55000', DETAIL = 'code=pdv_order_cancel_financial_order_active';
  END IF;
  IF v_order.contract_version IS DISTINCT FROM 2 THEN
    RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'order_number', v_order.number,
      'financeiro_cancelado', '[]'::jsonb, 'idempotent', false);
  END IF;

  v_cancel_reason := 'Cancelamento do pedido PDV nº ' || v_order.number::text
                     || COALESCE(': ' || v_reason, '');

  -- Ordem global de lock: contas da tesouraria (ordenadas) ANTES de sessão,
  -- gaveta e lançamentos, igual aos demais fluxos do caixa. Inclui a conta de
  -- cada recebimento e a conta da gaveta ligada a ele.
  SELECT COALESCE(array_agg(DISTINCT account_id ORDER BY account_id), ARRAY[]::uuid[])
    INTO v_accounts
    FROM (
      SELECT t.account_id
        FROM public.pdv_order_payments p
        JOIN public.financial_transactions t
          ON t.id IN (p.settlement_transaction_id, p.receivable_transaction_id)
         AND t.company_id = p.company_id
       WHERE p.order_id = p_order_id AND p.company_id = v_order.company_id
      UNION
      SELECT t.account_id
        FROM public.pdv_card_settlement_details d
        JOIN public.financial_transactions t
          ON t.id = d.fee_transaction_id AND t.company_id = d.company_id
       WHERE d.order_id = p_order_id AND d.company_id = v_order.company_id
      UNION
      SELECT e.cash_account_id
        FROM public.pdv_order_payments p
        JOIN public.pdv_cash_custody_entries e
          ON e.financial_transaction_id = p.settlement_transaction_id
         AND e.company_id = p.company_id
       WHERE p.order_id = p_order_id AND p.company_id = v_order.company_id
    ) accounts
   WHERE account_id IS NOT NULL;
  IF cardinality(v_accounts) > 0 THEN
    PERFORM public.pdv_lock_treasury_accounts(v_order.company_id, v_accounts);
  END IF;

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_order.company_id, 'commercial.order.cancel_financial.v2',
      'order-cancel-financial:' || p_order_id::text,
      jsonb_build_object('order_id', p_order_id));
  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result || jsonb_build_object('idempotent', true);
    END IF;
    RAISE EXCEPTION 'O cancelamento desta venda já está em andamento.'
      USING ERRCODE = '55000', DETAIL = 'code=pdv_order_cancel_in_progress';
  END IF;

  FOR v_row IN
    SELECT p.id AS payment_id, p.method, p.coverage_kind, ref.transaction_id
      FROM public.pdv_order_payments p
      CROSS JOIN LATERAL (VALUES
        (p.settlement_transaction_id),
        (p.receivable_transaction_id),
        -- Taxa da liquidação do cartão acompanha o recebimento bruto.
        ((SELECT d.fee_transaction_id FROM public.pdv_card_settlement_details d
           WHERE d.payment_id = p.id AND d.company_id = p.company_id))
      ) AS ref(transaction_id)
     WHERE p.order_id = p_order_id
       AND p.company_id = v_order.company_id
       AND ref.transaction_id IS NOT NULL
     ORDER BY ref.transaction_id
  LOOP
    SELECT t.* INTO v_tx
      FROM public.financial_transactions t
     WHERE t.id = v_row.transaction_id AND t.company_id = v_order.company_id
     FOR UPDATE;
    IF NOT FOUND OR v_tx.cancelled_at IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_drawer := NULL;
    SELECT e.* INTO v_entry
      FROM public.pdv_cash_custody_entries e
     WHERE e.financial_transaction_id = v_tx.id AND e.company_id = v_order.company_id;

    IF FOUND THEN
      SELECT s.* INTO v_session
        FROM public.pdv_cash_sessions s
       WHERE s.id = v_entry.session_id AND s.company_id = v_order.company_id
       FOR UPDATE;

      -- O recebimento em dinheiro já foi estornado pelo caixa ("Reversão: …"):
      -- o dinheiro já saiu da gaveta e do saldo. Cancelar a entrada original
      -- de novo tiraria o valor duas vezes.
      IF EXISTS (SELECT 1 FROM public.pdv_cash_custody_entries r WHERE r.reversal_of_id = v_entry.id) THEN
        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'payment_id', v_row.payment_id, 'method', v_row.method,
          'amount', round(v_tx.amount, 2), 'transaction_id', v_tx.id,
          'role', v_tx.pdv_financial_role, 'drawer', 'already_reversed', 'card', NULL));
        CONTINUE;
      END IF;

      -- Autoriza, só nesta transação e só para esta linha, o cancelamento de
      -- um recebimento ligado à gaveta (ver gatilho de tesouraria).
      PERFORM set_config('app.pdv_order_cancel_financial', jsonb_build_object(
        'company_id', v_order.company_id, 'order_id', p_order_id,
        'request_id', v_claim.request_id, 'transaction_id', v_tx.id)::text, true);

      IF v_session.status = 'aberta' AND v_session.contract_version = 2 THEN
        SELECT round(COALESCE(sum(e.amount), 0), 2) INTO v_position
          FROM public.pdv_cash_custody_entries e
         WHERE e.session_id = v_session.id AND e.company_id = v_order.company_id;
        IF v_entry.amount > 0 AND v_position < v_entry.amount THEN
          RAISE EXCEPTION 'A gaveta deste caixa não tem dinheiro suficiente para devolver esta venda.'
            USING ERRCODE = '23514', DETAIL = 'code=pdv_order_cancel_drawer_insufficient';
        END IF;

        SELECT * INTO v_cash_claim
          FROM public.pdv_claim_operation_request(
            v_order.company_id, 'cash.reverse.v2',
            'order-cancel-cash:' || v_entry.id::text,
            jsonb_build_object('entry_id', v_entry.id, 'order_id', p_order_id));
        IF v_cash_claim.is_replay THEN
          RAISE EXCEPTION 'O cancelamento desta venda já está em andamento.'
            USING ERRCODE = '55000', DETAIL = 'code=pdv_order_cancel_in_progress';
        END IF;

        PERFORM set_config('app.pdv_treasury_custody_delta', jsonb_build_object(
          'company_id', v_order.company_id, 'account_id', v_entry.cash_account_id,
          'request_id', v_cash_claim.request_id, 'delta', -v_entry.amount)::text, true);
        UPDATE public.financial_transactions t
           SET cancelled_at = now(), cancelled_reason = v_cancel_reason
         WHERE t.id = v_tx.id;
        PERFORM set_config('app.pdv_treasury_custody_delta', '', true);

        INSERT INTO public.pdv_cash_custody_entries (
          company_id, session_id, cash_account_id, operation_request_id,
          entry_kind, amount, source_type, source_id,
          financial_transaction_id, reversal_of_id, metadata, created_by
        ) VALUES (
          v_order.company_id, v_session.id, v_entry.cash_account_id, v_cash_claim.request_id,
          'reversal', -v_entry.amount, 'pdv_order_cancellation', p_order_id,
          NULL, v_entry.id,
          jsonb_build_object('notes', v_cancel_reason, 'reason', v_cancel_reason,
            'description', 'Cancelamento da venda PDV nº ' || v_order.number::text,
            'payment_method', v_row.method, 'transaction_type', 'saida',
            'order_id', p_order_id, 'order_number', v_order.number,
            'original_financial_transaction_id', v_tx.id),
          v_uid
        ) RETURNING id INTO v_reversal_entry;

        PERFORM public.pdv_complete_operation_request(
          v_cash_claim.request_id, 'pdv_cash_custody_entry', v_reversal_entry,
          jsonb_build_object('ok', true, 'entry_id', v_reversal_entry,
            'reversal_of_entry_id', v_entry.id, 'amount', -v_entry.amount));
        v_drawer := 'returned';
      ELSE
        -- Caixa já fechado: o fechamento fica como foi. Nenhuma linha nova na
        -- sessão fechada; o valor sai do saldo do cofre.
        UPDATE public.financial_transactions t
           SET cancelled_at = now(), cancelled_reason = v_cancel_reason
         WHERE t.id = v_tx.id;
        v_drawer := 'closed_session_kept';
      END IF;

      PERFORM set_config('app.pdv_order_cancel_financial', '', true);
    ELSE
      UPDATE public.financial_transactions t
         SET cancelled_at = now(), cancelled_reason = v_cancel_reason
       WHERE t.id = v_tx.id;
    END IF;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'payment_id', v_row.payment_id,
      'method', v_row.method,
      'amount', round(v_tx.amount, 2),
      'transaction_id', v_tx.id,
      'role', v_tx.pdv_financial_role,
      'drawer', v_drawer,
      'card', CASE WHEN v_row.coverage_kind = 'card_authorization' THEN 'settlement_cancelled' END));
  END LOOP;

  -- Cartão: a autorização deixa de valer e não pode mais ser liquidada.
  -- Ainda não liquidado: revoked/not_applicable (não há lançamento).
  -- Já liquidado: revoked/reversed (bruto e taxa cancelados no laço acima).
  FOR v_card IN
    SELECT p.id, p.method, p.amount, p.settlement_status
      FROM public.pdv_order_payments p
     WHERE p.order_id = p_order_id AND p.company_id = v_order.company_id
       AND p.contract_version = 2
       AND p.coverage_kind = 'card_authorization'
       AND p.coverage_status IS DISTINCT FROM 'revoked'
     ORDER BY p.id
     FOR UPDATE
  LOOP
    UPDATE public.pdv_order_payments p
       SET coverage_status = 'revoked',
           settlement_status = CASE WHEN v_card.settlement_status = 'open'
                                    THEN 'not_applicable' ELSE 'reversed' END
     WHERE p.id = v_card.id;
    IF v_card.settlement_status = 'open' THEN
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'payment_id', v_card.id, 'method', v_card.method,
        'amount', round(v_card.amount, 2), 'transaction_id', NULL,
        'role', NULL, 'drawer', NULL, 'card', 'authorization_voided'));
    END IF;
  END LOOP;

  v_result := jsonb_build_object('ok', true, 'order_id', p_order_id, 'order_number', v_order.number,
    'financeiro_cancelado', v_items, 'idempotent', false);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id, 'pdv_order', p_order_id, v_result);
  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.pdv_cancel_order_financial_internal_v2(uuid, text) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) Entrada pública do cancelamento: mesmo contrato, agora completo para v2.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_cancel_order_v2(p_order_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_block jsonb;
  v_result jsonb;
  v_financial jsonb;
BEGIN
  PERFORM public.pdv_assert_order_cash_access_v2(p_order_id, auth.uid());

  v_block := public.pdv_order_cancel_block_v2(p_order_id);
  IF v_block IS NOT NULL THEN
    RAISE EXCEPTION '%', v_block->>'message'
      USING ERRCODE = '55000', DETAIL = 'code=' || (v_block->>'code');
  END IF;

  -- Core: estoque de volta, pedido cancelado, financeiro v1 e fiado legado.
  v_result := public.pdv_cancel_order(p_order_id, p_reason);
  -- Financeiro v2 (recebimentos, conta a receber e gaveta).
  v_financial := public.pdv_cancel_order_financial_internal_v2(p_order_id, p_reason);

  RETURN v_result || jsonb_build_object(
    'financeiro_cancelado',
    COALESCE(v_result->'financeiro_cancelado', '[]'::jsonb)
      || COALESCE(v_financial->'financeiro_cancelado', '[]'::jsonb));
END
$function$;

-- -----------------------------------------------------------------------------
-- 5) Plano de "excluir pelo Financeiro" para lançamento que veio do PDV.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_pdv_transaction_undo_plan_v1(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_tx public.financial_transactions%ROWTYPE;
  v_order public.pdv_orders%ROWTYPE;
  v_entry public.pdv_cash_custody_entries%ROWTYPE;
  v_session_status text;
  v_has_order boolean := false;
  v_has_entry boolean := false;
  v_allowed boolean;
  v_path text;
  v_code text;
  v_message text;
  v_already boolean := false;
  v_block jsonb;
  v_methods jsonb := '[]'::jsonb;
  v_effects jsonb := '[]'::jsonb;
  v_session_closed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_auth_required';
  END IF;
  v_company := public.get_user_company_id(v_uid);

  SELECT t.* INTO v_tx
    FROM public.financial_transactions t
   WHERE t.id = p_transaction_id AND t.company_id = v_company;
  IF v_company IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'code=pdv_finance_transaction_not_found';
  END IF;

  v_allowed := public.pdv_can_operate_other_cash_v2(v_uid) IS TRUE;

  SELECT o.* INTO v_order
    FROM public.pdv_order_payments p
    JOIN public.pdv_orders o ON o.id = p.order_id AND o.company_id = p.company_id
   WHERE p.company_id = v_company
     AND v_tx.id IN (p.settlement_transaction_id, p.receivable_transaction_id, p.financial_transaction_id)
   ORDER BY o.created_at
   LIMIT 1;
  v_has_order := FOUND;
  IF v_has_order AND v_order.cash_session_id IS NOT NULL THEN
    SELECT s.status IS DISTINCT FROM 'aberta' INTO v_session_closed
      FROM public.pdv_cash_sessions s WHERE s.id = v_order.cash_session_id;
  END IF;

  SELECT e.* INTO v_entry
    FROM public.pdv_cash_custody_entries e
   WHERE e.financial_transaction_id = v_tx.id AND e.company_id = v_company;
  v_has_entry := FOUND;
  IF v_has_entry THEN
    SELECT s.status INTO v_session_status FROM public.pdv_cash_sessions s WHERE s.id = v_entry.session_id;
    v_session_closed := v_session_status IS DISTINCT FROM 'aberta';
  END IF;

  IF v_has_order THEN
    v_path := 'cancel_order';
    SELECT COALESCE(jsonb_agg(DISTINCT p.method), '[]'::jsonb) INTO v_methods
      FROM public.pdv_order_payments p
     WHERE p.order_id = v_order.id AND p.company_id = v_company;
    IF v_order.status = 'cancelado' THEN
      v_already := NOT EXISTS (
        SELECT 1 FROM public.pdv_order_payments p
          JOIN public.financial_transactions t
            ON t.id IN (p.settlement_transaction_id, p.receivable_transaction_id, p.financial_transaction_id)
         WHERE p.order_id = v_order.id AND p.company_id = v_company AND t.cancelled_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.pdv_cash_custody_entries e
               JOIN public.pdv_cash_custody_entries r ON r.reversal_of_id = e.id
              WHERE e.financial_transaction_id = t.id))
        AND NOT EXISTS (
          SELECT 1 FROM public.pdv_order_payments p
           WHERE p.order_id = v_order.id AND p.company_id = v_company
             AND p.contract_version = 2 AND p.coverage_kind = 'card_authorization'
             AND p.coverage_status IS DISTINCT FROM 'revoked');
    ELSE
      v_block := public.pdv_order_cancel_block_v2(v_order.id);
      v_code := v_block->>'code';
      v_message := v_block->>'message';
      IF v_order.stock_committed_at IS NOT NULL THEN
        v_effects := v_effects || '["stock_returned"]'::jsonb;
      END IF;
    END IF;
    IF NOT v_already THEN
      v_effects := v_effects || '["finance_cancelled"]'::jsonb;
      IF EXISTS (
        SELECT 1 FROM public.pdv_order_payments p
          JOIN public.pdv_cash_custody_entries e ON e.financial_transaction_id = p.settlement_transaction_id
          JOIN public.pdv_cash_sessions s ON s.id = e.session_id
         WHERE p.order_id = v_order.id AND p.company_id = v_company AND s.status = 'aberta'
           AND NOT EXISTS (SELECT 1 FROM public.pdv_cash_custody_entries r WHERE r.reversal_of_id = e.id)
      ) THEN
        v_effects := v_effects || '["drawer_returned"]'::jsonb;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.pdv_order_payments p
          JOIN public.pdv_cash_custody_entries e ON e.financial_transaction_id = p.settlement_transaction_id
          JOIN public.pdv_cash_sessions s ON s.id = e.session_id
         WHERE p.order_id = v_order.id AND p.company_id = v_company AND s.status <> 'aberta'
           AND NOT EXISTS (SELECT 1 FROM public.pdv_cash_custody_entries r WHERE r.reversal_of_id = e.id)
      ) THEN
        v_effects := v_effects || '["closed_session_kept"]'::jsonb;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.pdv_order_payments p
         WHERE p.order_id = v_order.id AND p.company_id = v_company AND p.receivable_transaction_id IS NOT NULL
      ) THEN
        v_effects := v_effects || '["customer_debt_cancelled"]'::jsonb;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.pdv_order_payments p
         WHERE p.order_id = v_order.id AND p.company_id = v_company
           AND p.coverage_kind = 'card_authorization'
           AND p.coverage_status IS DISTINCT FROM 'revoked'
      ) THEN
        v_effects := v_effects || '["card_cancelled"]'::jsonb;
      END IF;
    END IF;
  ELSIF v_tx.pdv_financial_role = 'pdv_receivable_settlement' THEN
    v_path := 'unsupported'; v_code := 'pdv_finance_undo_use_customer_account';
    v_message := 'Este recebimento é baixa da conta do cliente. Estorne pela conta do cliente no PDV.';
  ELSIF v_tx.pdv_financial_role = 'pdv_receivable_reversal' OR (v_has_entry AND v_entry.entry_kind = 'reversal') THEN
    v_path := 'unsupported'; v_code := 'pdv_finance_undo_is_reversal';
    v_message := 'Este lançamento já é um estorno e não pode ser desfeito por aqui.';
  ELSIF v_tx.pdv_financial_role IN ('pdv_refund', 'pdv_refund_reversal', 'pdv_receivable_principal') THEN
    v_path := 'unsupported'; v_code := 'pdv_finance_undo_use_after_sale';
    v_message := 'Este lançamento foi feito pelo pós-venda do PDV. Desfaça por lá.';
  ELSIF v_tx.pdv_financial_role IN ('pdv_supplier_payment', 'pdv_supplier_obligation') THEN
    v_path := 'unsupported'; v_code := 'pdv_finance_undo_use_purchase';
    v_message := 'Este pagamento pertence a uma compra feita no caixa. Desfaça pela compra.';
  ELSIF v_tx.pdv_financial_role = 'pdv_card_fee' THEN
    v_path := 'unsupported'; v_code := 'pdv_finance_undo_card_fee';
    v_message := 'Esta taxa acompanha um recebimento no cartão e não pode ser excluída sozinha.';
  ELSIF v_tx.pdv_financial_role IN ('pdv_cash_shortage', 'pdv_cash_surplus')
     OR (v_has_entry AND v_entry.entry_kind IN ('surplus', 'shortage', 'opening', 'closing_return'))
     OR (v_tx.origin = 'pdv' AND v_tx.category = 'Quebra de caixa') THEN
    v_path := 'unsupported'; v_code := 'pdv_finance_undo_closing_adjustment';
    v_message := 'Esta sobra ou falta faz parte do fechamento do caixa e não pode ser excluída.';
  ELSIF v_has_entry THEN
    IF EXISTS (SELECT 1 FROM public.pdv_cash_custody_entries r WHERE r.reversal_of_id = v_entry.id) THEN
      v_path := 'reverse_cash_event'; v_already := true;
    ELSIF v_session_closed THEN
      v_path := 'unsupported'; v_code := 'pdv_finance_undo_closed_cash_event';
      v_message := 'Este movimento é de um caixa já fechado e não pode ser desfeito por aqui.';
    ELSE
      v_path := 'reverse_cash_event';
      v_effects := '["drawer_returned"]'::jsonb;
    END IF;
  ELSIF v_tx.origin = 'pdv' OR v_tx.pdv_financial_role IS NOT NULL
     OR v_tx.pdv_settlement_group_id IS NOT NULL OR v_tx.pdv_cash_session_id IS NOT NULL THEN
    IF v_tx.transfer_pair_id IS NOT NULL THEN
      v_path := 'unsupported'; v_code := 'pdv_finance_undo_use_cash_screen';
      v_message := 'Esta sangria ou suprimento deve ser desfeita na tela do caixa.';
    ELSIF v_tx.pdv_financial_role IS NOT NULL THEN
      v_path := 'unsupported'; v_code := 'pdv_finance_undo_unsupported';
      v_message := 'Este lançamento do PDV não pode ser desfeito por aqui.';
    ELSE
      v_path := 'delete_transaction';
      v_effects := '["finance_deleted"]'::jsonb;
    END IF;
  ELSE
    v_path := 'not_pdv';
  END IF;

  IF v_path <> 'not_pdv' AND NOT v_allowed AND v_code IS NULL THEN
    v_code := 'pdv_finance_undo_forbidden';
    v_message := 'Somente quem tem acesso a todos os caixas do PDV pode desfazer lançamentos que vieram do PDV.';
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', v_tx.id,
    'path', v_path,
    'allowed', v_path <> 'not_pdv' AND v_path <> 'unsupported' AND v_allowed AND v_code IS NULL,
    'already_done', v_already,
    'block_code', v_code,
    'message', v_message,
    'order_id', CASE WHEN v_has_order THEN v_order.id END,
    'order_number', CASE WHEN v_has_order THEN v_order.number END,
    'order_status', CASE WHEN v_has_order THEN v_order.status END,
    'session_closed', v_session_closed,
    'methods', v_methods,
    'effects', v_effects);
END
$function$;

REVOKE ALL ON FUNCTION public.finance_pdv_transaction_undo_plan_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_pdv_transaction_undo_plan_v1(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6) Excluir pelo Financeiro um lançamento que veio do PDV = desfazer de verdade.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_delete_pdv_transaction_v1(p_transaction_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_plan jsonb;
  v_order_id uuid;
  v_result jsonb;
  v_financial jsonb;
  v_entry public.pdv_cash_custody_entries%ROWTYPE;
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_auth_required';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Informe o motivo da exclusão.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_finance_undo_reason_required';
  END IF;

  v_plan := public.finance_pdv_transaction_undo_plan_v1(p_transaction_id);

  IF v_plan->>'path' = 'not_pdv' THEN
    RAISE EXCEPTION 'Este lançamento não veio do PDV. Use a exclusão normal do Financeiro.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_finance_undo_not_pdv';
  END IF;
  IF v_plan->>'block_code' = 'pdv_finance_undo_forbidden' THEN
    RAISE EXCEPTION '%', v_plan->>'message'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_finance_undo_forbidden';
  END IF;
  IF (v_plan->>'already_done')::boolean IS TRUE THEN
    RETURN jsonb_build_object('ok', true,
      'action', CASE v_plan->>'path' WHEN 'cancel_order' THEN 'order_cancelled'
                                     WHEN 'reverse_cash_event' THEN 'cash_event_reversed'
                                     ELSE 'deleted' END,
      'idempotent', true, 'transaction_id', p_transaction_id,
      'order_id', v_plan->'order_id', 'order_number', v_plan->'order_number');
  END IF;
  IF v_plan->>'block_code' IS NOT NULL THEN
    RAISE EXCEPTION '%', v_plan->>'message'
      USING ERRCODE = '55000', DETAIL = 'code=' || (v_plan->>'block_code');
  END IF;

  IF v_plan->>'path' = 'cancel_order' THEN
    v_order_id := (v_plan->>'order_id')::uuid;
    IF v_plan->>'order_status' = 'cancelado' THEN
      -- Venda cancelada antes desta versão com recebimento ainda contando.
      v_financial := public.pdv_cancel_order_financial_internal_v2(v_order_id, v_reason);
      RETURN jsonb_build_object('ok', true, 'action', 'order_cancelled',
        'idempotent', COALESCE((v_financial->>'idempotent')::boolean, false),
        'transaction_id', p_transaction_id, 'order_id', v_order_id,
        'order_number', v_plan->'order_number',
        'stock_returned', '[]'::jsonb,
        'financial_cancelled', COALESCE(v_financial->'financeiro_cancelado', '[]'::jsonb));
    END IF;
    v_result := public.pdv_cancel_order_v2(v_order_id, v_reason);
    RETURN jsonb_build_object('ok', true, 'action', 'order_cancelled', 'idempotent', false,
      'transaction_id', p_transaction_id, 'order_id', v_order_id,
      'order_number', v_plan->'order_number',
      'stock_returned', COALESCE(v_result->'estoque_estornado', '[]'::jsonb),
      'financial_cancelled', COALESCE(v_result->'financeiro_cancelado', '[]'::jsonb));
  END IF;

  IF v_plan->>'path' = 'reverse_cash_event' THEN
    SELECT e.* INTO v_entry FROM public.pdv_cash_custody_entries e
     WHERE e.financial_transaction_id = p_transaction_id;
    -- Mesma regra da tela do caixa (pdv_reverse_cash_event_v2 -> explicit core):
    -- dono do caixa ou quem opera caixas de outros.
    v_result := public.pdv_reverse_cash_event_explicit_core_018_v2(
      v_entry.id, v_entry.cash_account_id, v_reason, 'finance-undo:' || p_transaction_id::text);
    RETURN jsonb_build_object('ok', true, 'action', 'cash_event_reversed',
      'idempotent', COALESCE((v_result->>'idempotent')::boolean, false),
      'transaction_id', p_transaction_id,
      'reversal_transaction_id', v_result->'financial_transaction_id',
      'amount', v_result->'amount');
  END IF;

  IF v_plan->>'path' = 'delete_transaction' THEN
    DELETE FROM public.financial_transactions t
     WHERE t.id = p_transaction_id AND t.company_id = public.get_user_company_id(v_uid);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN jsonb_build_object('ok', true, 'action', 'deleted', 'idempotent', v_rows = 0,
      'transaction_id', p_transaction_id);
  END IF;

  RAISE EXCEPTION 'Este lançamento do PDV não pode ser desfeito por aqui.'
    USING ERRCODE = '55000', DETAIL = 'code=pdv_finance_undo_unsupported';
END
$function$;

REVOKE ALL ON FUNCTION public.finance_delete_pdv_transaction_v1(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_delete_pdv_transaction_v1(uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7) Detalhe/relatório do caixa: a linha de devolução da gaveta por
--    cancelamento de venda aparece com descrição, forma de pagamento e pedido.
--    Só muda a exibição das linhas com source_type 'pdv_order_cancellation'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_cash_session_projection_v3(p_session_id uuid, p_report boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_session public.pdv_cash_sessions%ROWTYPE; v_terminal text; v_operator text; v_closed_by text;
  v_position numeric:=0; v_opening numeric:=0; v_receipts numeric:=0; v_payments numeric:=0;
  v_supplies numeric:=0; v_withdrawals numeric:=0; v_refunds numeric:=0; v_entries jsonb:='[]'::jsonb;
BEGIN
  v_session:=public.pdv_assert_cash_session_actor_v3(p_session_id,NULL,false,p_report);
  IF p_report AND v_session.status<>'fechada' THEN
    RAISE EXCEPTION 'Caixa fechado não encontrado.' USING ERRCODE='P0002',DETAIL='PDV_CASH_SESSION_NOT_FOUND';
  END IF;
  SELECT t.name,COALESCE(NULLIF(btrim(o.full_name),''),NULLIF(btrim(o.email),''),'Operador'),
    COALESCE(NULLIF(btrim(c.full_name),''),NULLIF(btrim(c.email),''),'Operador')
    INTO v_terminal,v_operator,v_closed_by
    FROM public.pdv_terminals t
    LEFT JOIN public.profiles o ON o.user_id=v_session.opened_by AND o.company_id=v_session.company_id
    LEFT JOIN public.profiles c ON c.user_id=v_session.closed_by AND c.company_id=v_session.company_id
    WHERE t.id=v_session.terminal_id AND t.company_id=v_session.company_id;
  SELECT round(COALESCE(sum(e.amount),0),2),
    round(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='opening'),0),2),
    round(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='cash_receipt'),0),2),
    round(abs(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='cash_payment'),0)),2),
    round(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='supply'),0),2),
    round(abs(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='withdrawal'),0)),2),
    round(abs(COALESCE(sum(e.amount) FILTER(WHERE e.entry_kind='refund'),0)),2)
    INTO v_position,v_opening,v_receipts,v_payments,v_supplies,v_withdrawals,v_refunds
    FROM public.pdv_cash_custody_entries e WHERE e.company_id=v_session.company_id
      AND e.session_id=v_session.id AND e.cash_account_id=v_session.cash_account_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.entry_kind,
    'amount',round(e.amount,2),'created_at',e.created_at,'created_by',e.created_by,
    'source_type',e.source_type,'source_id',e.source_id,'reversal_of_id',e.reversal_of_id,
    -- Devolução da gaveta por cancelamento de venda não tem lançamento próprio
    -- (o recebimento original é que fica cancelado): descrição, forma, tipo e
    -- pedido vêm da própria linha da gaveta.
    'description',COALESCE(f.description,CASE WHEN e.source_type='pdv_order_cancellation' THEN e.metadata->>'description' END),
    'notes',COALESCE(NULLIF(f.notes,''),NULLIF(e.metadata->>'notes','')),
    'payment_method',COALESCE(f.payment_method,CASE WHEN e.source_type='pdv_order_cancellation' THEN e.metadata->>'payment_method' END),
    'transaction_type',COALESCE(f.transaction_type::text,CASE WHEN e.source_type='pdv_order_cancellation' THEN e.metadata->>'transaction_type' END),
    'order_id',COALESCE(p.order_id,CASE WHEN e.source_type='pdv_order_cancellation' THEN e.source_id END),
    'financial_transaction_id',e.financial_transaction_id)
    ORDER BY CASE WHEN p_report THEN NULL ELSE e.created_at END DESC,e.created_at,e.id),'[]'::jsonb)
    INTO v_entries FROM public.pdv_cash_custody_entries e
    LEFT JOIN public.financial_transactions f ON f.id=e.financial_transaction_id AND f.company_id=e.company_id
    LEFT JOIN LATERAL(
      SELECT payment.order_id
      FROM public.pdv_order_payments payment
      WHERE payment.company_id=e.company_id
        AND (payment.settlement_transaction_id=e.financial_transaction_id
          OR payment.financial_transaction_id=e.financial_transaction_id)
      ORDER BY CASE WHEN payment.settlement_transaction_id=e.financial_transaction_id THEN 0 ELSE 1 END,
        payment.received_at,payment.id
      LIMIT 1
    ) p ON true
    WHERE e.company_id=v_session.company_id AND e.session_id=v_session.id
      AND e.cash_account_id=v_session.cash_account_id;
  IF NOT p_report THEN
    RETURN jsonb_build_object('session_id',v_session.id,'position',v_position,'opening_amount',v_opening,
      'cash_receipts',v_receipts,'cash_payments',v_payments,'supplies',v_supplies,
      'withdrawals',v_withdrawals,'refunds',v_refunds,'entries',v_entries);
  END IF;
  RETURN jsonb_build_object('session_id',v_session.id,'terminal_name',v_terminal,
    'operator_name',v_operator,'closed_by_name',v_closed_by,'opened_at',v_session.opened_at,
    'closed_at',v_session.closed_at,'cash_account_name',v_session.cash_account_name_snapshot,
    'opening_amount',v_opening,'expected_amount',v_session.expected_amount,
    'counted_amount',v_session.counted_amount,'difference',v_session.difference,
    'cash_receipts',v_receipts,'cash_payments',v_payments,'supplies',v_supplies,
    'withdrawals',v_withdrawals,'refunds',v_refunds,'final_position',v_position,
    'notes',v_session.notes,'entries',v_entries);
END $function$;

-- -----------------------------------------------------------------------------
-- 8) Liquidação de cartão recusa venda cancelada ou autorização anulada.
--    Recriada a partir da definição viva; só ganha a recusa abaixo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pdv_settle_card_authorization_v3(p_payment_id uuid, p_account_id uuid, p_settled_on date, p_acquirer text, p_nsu text, p_installments integer, p_fee_amount numeric, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_context record; v_claim record; v_payment public.pdv_order_payments%ROWTYPE;
  v_order public.pdv_orders%ROWTYPE; v_gross numeric(14,2); v_fee numeric(14,2);
  v_settlement uuid; v_fee_tx uuid; v_category text:='Taxa de cartao PDV'; v_result jsonb;
  v_date date; v_acquirer text; v_nsu text;
BEGIN
  SELECT * INTO v_context FROM public.pdv_card_settlement_context_v3();
  IF public.can_use_bank_accounts(v_context.user_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Voce nao pode usar contas bancarias.' USING ERRCODE='42501',DETAIL='code=pdv_card_bank_permission_denied';
  END IF;
  v_date:=COALESCE(p_settled_on,public.company_today(v_context.company_id));
  v_acquirer:=NULLIF(btrim(COALESCE(p_acquirer,'')),''); v_nsu:=NULLIF(btrim(COALESCE(p_nsu,'')),'');
  v_fee:=round(COALESCE(p_fee_amount,0),2);
  IF v_date>public.company_today(v_context.company_id) OR v_acquirer IS NULL OR char_length(v_acquirer)>80
     OR v_nsu IS NULL OR char_length(v_nsu)>80 OR p_installments NOT BETWEEN 1 AND 36 OR v_fee<0 THEN
    RAISE EXCEPTION 'Revise os dados da liquidacao.' USING ERRCODE='22023',DETAIL='code=pdv_card_input_invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.financial_accounts account WHERE account.id=p_account_id
      AND account.company_id=v_context.company_id AND account.is_active AND account.type='banco') THEN
    RAISE EXCEPTION 'Conta bancaria invalida.' USING ERRCODE='P0002',DETAIL='code=pdv_card_account_invalid';
  END IF;
  SELECT payment.* INTO v_payment
  FROM public.pdv_order_payments payment JOIN public.pdv_orders orders ON orders.id=payment.order_id
  WHERE payment.id=p_payment_id AND payment.company_id=v_context.company_id AND orders.company_id=v_context.company_id
  FOR UPDATE OF payment,orders;
  IF FOUND THEN
    SELECT orders.* INTO v_order
      FROM public.pdv_orders orders
     WHERE orders.id=v_payment.order_id;
  END IF;
  -- Venda cancelada ou cartão anulado no cancelamento: não liquida mais.
  IF v_payment.id IS NOT NULL
     AND (v_order.status = 'cancelado' OR v_payment.coverage_status = 'revoked') THEN
    RAISE EXCEPTION 'Esta venda foi cancelada e o cartão não pode mais ser liquidado.'
      USING ERRCODE='55000',DETAIL='code=pdv_card_settlement_order_cancelled';
  END IF;
  IF v_payment.id IS NULL OR v_payment.contract_version IS DISTINCT FROM 2 OR v_payment.coverage_kind<>'card_authorization'
     OR v_payment.coverage_status<>'authorized' THEN
    RAISE EXCEPTION 'Autorizacao nao encontrada.' USING ERRCODE='P0002',DETAIL='code=pdv_card_authorization_not_found';
  END IF;
  IF v_order.cash_session_id IS NULL OR v_order.terminal_id IS NULL
     OR NOT EXISTS(SELECT 1 FROM public.pdv_cash_sessions session
       WHERE session.id=v_order.cash_session_id AND session.company_id=v_context.company_id
         AND session.terminal_id=v_order.terminal_id AND session.contract_version=2)
     OR public.pdv_can_access_cash_session_v3(v_context.user_id,v_context.company_id,v_order.cash_session_id)
        IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Este cartao pertence a outro caixa.'
      USING ERRCODE='42501',DETAIL='code=pdv_card_cash_session_denied';
  END IF;
  v_gross:=round(v_payment.amount,2);
  IF v_fee>v_gross THEN RAISE EXCEPTION 'A taxa nao pode superar o valor bruto.' USING ERRCODE='22023',DETAIL='code=pdv_card_fee_invalid'; END IF;
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(v_context.company_id,'card.settle.v3',p_idempotency_key,
    jsonb_build_object('payment_id',p_payment_id,'account_id',p_account_id,'settled_on',v_date,
      'acquirer',v_acquirer,'nsu',v_nsu,'installments',p_installments,'fee_amount',v_fee));
  IF v_claim.is_replay THEN
    IF v_claim.request_status='completed' THEN RETURN v_claim.stored_result||jsonb_build_object('idempotent',TRUE); END IF;
    RAISE EXCEPTION 'Liquidacao em processamento.' USING ERRCODE='55000',DETAIL='code=pdv_card_in_progress';
  END IF;
  IF v_payment.settlement_status<>'open' OR v_payment.settlement_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta autorizacao ja foi liquidada.' USING ERRCODE='23505',DETAIL='code=pdv_card_already_settled';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pdv_card_settlement_details detail WHERE detail.company_id=v_context.company_id
      AND detail.acquirer=v_acquirer AND detail.nsu=v_nsu) THEN
    RAISE EXCEPTION 'Este NSU ja foi conciliado.' USING ERRCODE='23505',DETAIL='code=pdv_card_nsu_duplicated';
  END IF;
  INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
    transaction_date,paid_date,is_paid,account_id,customer_id,origin,payment_method,created_by,
    pdv_financial_role,pdv_settlement_group_id,pdv_cash_session_id)
  VALUES(v_context.company_id,'entrada'::public.transaction_type,'Liquidacao de cartao, pedido PDV nº '||v_order.number,
    v_gross,'Recebimento parcial',v_date,v_date,TRUE,p_account_id,v_order.customer_id,'pdv',v_payment.method,
    v_context.user_id,'pdv_receivable_settlement',v_claim.request_id,v_order.cash_session_id)
  RETURNING id INTO v_settlement;
  IF v_fee>0 THEN
    INSERT INTO public.financial_categories(company_id,name,type,color,icon,dre_group,is_system,is_active)
    VALUES(v_context.company_id,v_category,'saida','#ef4444','CreditCard','opex',TRUE,TRUE)
    ON CONFLICT(company_id,name) DO NOTHING;
    INSERT INTO public.financial_transactions(company_id,transaction_type,description,amount,category,
      transaction_date,paid_date,is_paid,account_id,customer_id,origin,payment_method,created_by,
      pdv_financial_role,pdv_settlement_group_id,pdv_cash_session_id)
    VALUES(v_context.company_id,'saida'::public.transaction_type,'Taxa da liquidacao de cartao, pedido PDV nº '||v_order.number,
      v_fee,v_category,v_date,v_date,TRUE,p_account_id,v_order.customer_id,'pdv',v_payment.method,
      v_context.user_id,'pdv_card_fee',v_claim.request_id,v_order.cash_session_id)
    RETURNING id INTO v_fee_tx;
  END IF;
  UPDATE public.pdv_order_payments SET financial_account_id=p_account_id,
    settlement_transaction_id=v_settlement,settlement_status='settled',settled_at=now()
  WHERE id=v_payment.id;
  INSERT INTO public.pdv_card_settlement_details(company_id,payment_id,order_id,gross_amount,fee_amount,
    bank_account_id,settlement_transaction_id,fee_transaction_id,acquirer,nsu,installments,settled_on,
    operation_request_id,created_by)
  VALUES(v_context.company_id,v_payment.id,v_order.id,v_gross,v_fee,p_account_id,v_settlement,v_fee_tx,
    v_acquirer,v_nsu,p_installments,v_date,v_claim.request_id,v_context.user_id);
  PERFORM public.pdv_apply_settlement_fifo_v2(v_context.company_id,v_settlement);
  IF NOT EXISTS(SELECT 1 FROM public.pdv_order_payments p WHERE p.order_id=v_order.id
      AND p.contract_version=2 AND p.settlement_status IN('open','partial')) THEN
    UPDATE public.pdv_orders SET paid_at=COALESCE(paid_at,now()) WHERE id=v_order.id;
  END IF;
  v_result:=jsonb_build_object('ok',TRUE,'payment_id',v_payment.id,'order_id',v_order.id,
    'settlement_transaction_id',v_settlement,'fee_transaction_id',v_fee_tx,'gross_amount',v_gross,
    'fee_amount',v_fee,'net_amount',v_gross-v_fee,'idempotent',FALSE);
  PERFORM public.pdv_complete_operation_request(v_claim.request_id,'financial_transaction',v_settlement,v_result);
  RETURN v_result;
END $function$;

-- Guarda de privilégios.
DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.finance_delete_pdv_transaction_v1(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.finance_pdv_transaction_undo_plan_v1(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pdv_cancel_order_v2(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon não pode executar as funções públicas de desfazer venda.';
  END IF;
  IF has_function_privilege('authenticated', 'public.pdv_cancel_order_financial_internal_v2(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pdv_order_cancel_block_v2(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pdv_cancel_order(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'As funções internas de cancelamento devem ficar fechadas para authenticated.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.finance_delete_pdv_transaction_v1(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pdv_cancel_order_v2(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated precisa executar as entradas públicas.';
  END IF;
END
$check$;
