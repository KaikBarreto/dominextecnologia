-- W1A-02: RPCs paralelas de caixa/custodia v2.
--
-- Expansao aditiva: nenhuma RPC v1 e substituida e nenhuma empresa e ativada.
-- Toda operacao v2 recebe a conta apenas para adquirir o lock antes de ler
-- configuracao/sessao; o servidor valida tenant e igualdade com o snapshot.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_cash_sessions_v2_open_by_operator
  ON public.pdv_cash_sessions (company_id, opened_by)
  WHERE status = 'aberta'
    AND contract_version = 2
    AND opened_by IS NOT NULL;

-- O reset vigente apaga sessoes do PDV sob uma GUC transaction-local. A
-- custodia pertence integralmente a sessao; fora do reset, a sessao continua
-- protegida pelo historico e pelos guards de dominio.
ALTER TABLE public.pdv_cash_custody_entries
  DROP CONSTRAINT IF EXISTS pdv_cash_custody_entries_session_id_fkey;
ALTER TABLE public.pdv_cash_custody_entries
  ADD CONSTRAINT pdv_cash_custody_entries_session_id_fkey
  FOREIGN KEY (session_id)
  REFERENCES public.pdv_cash_sessions(id)
  ON DELETE CASCADE;

-- Um financeiro vinculado so pode ser excluido pelos cascades controlados,
-- pois o guard abaixo bloqueia DELETE normal. No cascade, a custodia deve sair
-- junto em vez de tentar um SET NULL que violaria o livro append-only.
ALTER TABLE public.pdv_cash_custody_entries
  DROP CONSTRAINT IF EXISTS pdv_cash_custody_entries_financial_transaction_id_fkey;
ALTER TABLE public.pdv_cash_custody_entries
  ADD CONSTRAINT pdv_cash_custody_entries_financial_transaction_id_fkey
  FOREIGN KEY (financial_transaction_id)
  REFERENCES public.financial_transactions(id)
  ON DELETE CASCADE;

-- A exclusao administrativa da conta precisa conseguir limpar a sessao v2,
-- mas somente depois de passar pelo guard de DELETE da propria conta.
ALTER TABLE public.pdv_cash_sessions
  DROP CONSTRAINT IF EXISTS pdv_cash_sessions_cash_account_id_fkey;
ALTER TABLE public.pdv_cash_sessions
  ADD CONSTRAINT pdv_cash_sessions_cash_account_id_fkey
  FOREIGN KEY (cash_account_id)
  REFERENCES public.financial_accounts(id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.pdv_block_custody_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND (
    NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id)
    OR COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'O lançamento de custódia é imutável. Registre uma reversão.'
    USING ERRCODE = '55000', DETAIL = 'PDV_CUSTODY_ENTRY_IMMUTABLE';
END
$fn$;

-- ---------------------------------------------------------------------------
-- 1. Contexto de autorizacao comum das RPCs publicas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_cash_v2_context()
RETURNS TABLE (user_id uuid, company_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente para continuar.'
      USING ERRCODE = '42501', DETAIL = 'PDV_AUTH_REQUIRED';
  END IF;

  v_company := public.get_user_company_id(v_user);
  IF v_company IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles profile
     WHERE profile.user_id = v_user
       AND profile.company_id = v_company
       AND COALESCE(profile.is_active, true)
  ) THEN
    RAISE EXCEPTION 'Seu usuário não está ativo em nenhuma empresa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_ACTIVE_COMPANY_REQUIRED';
  END IF;

  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A assinatura da empresa não permite operar o caixa agora.'
      USING ERRCODE = '42501', DETAIL = 'PDV_SUBSCRIPTION_INACTIVE';
  END IF;

  IF NOT public.company_has_module(v_company, 'pdv') THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_MODULE_INACTIVE';
  END IF;

  IF NOT public.user_has_permission(v_user, 'screen:pdv') THEN
    RAISE EXCEPTION 'Você não tem permissão para operar o caixa do PDV.'
      USING ERRCODE = '42501', DETAIL = 'PDV_SCREEN_FORBIDDEN';
  END IF;

  RETURN QUERY SELECT v_user, v_company;
END
$fn$;

-- Gate interno comum para RPCs SECURITY DEFINER do PDV. O helper resolve o
-- local direto ou todos os locais envolvidos em pedido/entrega/devolucao e
-- nunca e exposto as roles da API. As verificacoes condicionais permitem que
-- esta migration seja aplicada antes das tabelas de entrega/devolucao.
CREATE OR REPLACE FUNCTION public.pdv_has_stock_access_scope_v2(
  p_user_id uuid,
  p_company_id uuid,
  p_stock_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_delivery_id uuid DEFAULT NULL,
  p_return_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_order_id uuid := p_order_id;
  v_order_stock_id uuid;
  v_stock_ids uuid[] := ARRAY[]::uuid[];
  v_extra_stock_ids uuid[];
  v_has_material boolean := false;
  v_stock uuid;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL
     OR num_nonnulls(p_stock_id, p_order_id, p_delivery_id, p_return_id) <> 1 THEN
    RETURN false;
  END IF;

  IF p_stock_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
        FROM public.stocks stock
       WHERE stock.id = p_stock_id
         AND stock.company_id = p_company_id
         AND public.can_access_stock(p_user_id, stock.id) IS TRUE
    );
  END IF;

  IF p_delivery_id IS NOT NULL THEN
    IF to_regclass('public.pdv_deliveries') IS NULL THEN
      RETURN false;
    END IF;
    SELECT delivery.order_id
      INTO v_order_id
      FROM public.pdv_deliveries delivery
     WHERE delivery.id = p_delivery_id
       AND delivery.company_id = p_company_id;
    IF NOT FOUND THEN RETURN false; END IF;
  ELSIF p_return_id IS NOT NULL THEN
    IF to_regclass('public.pdv_commercial_returns') IS NULL THEN
      RETURN false;
    END IF;
    SELECT header.order_id
      INTO v_order_id
      FROM public.pdv_commercial_returns header
     WHERE header.id = p_return_id
       AND header.company_id = p_company_id;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;

  SELECT orders.stock_id,
         EXISTS (
           SELECT 1
             FROM public.pdv_order_items item
            WHERE item.order_id = orders.id
              AND (item.inventory_id IS NOT NULL OR to_jsonb(item)->>'item_type' = 'material')
         )
    INTO v_order_stock_id, v_has_material
    FROM public.pdv_orders orders
   WHERE orders.id = v_order_id
     AND orders.company_id = p_company_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_order_stock_id IS NOT NULL THEN
    v_stock_ids := array_append(v_stock_ids, v_order_stock_id);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT reservation.stock_id), ARRAY[]::uuid[])
    INTO v_extra_stock_ids
    FROM public.pdv_stock_reservation_items reservation
    JOIN public.pdv_order_items item ON item.id = reservation.order_item_id
   WHERE item.order_id = v_order_id
     AND reservation.company_id = p_company_id;
  v_stock_ids := v_stock_ids || v_extra_stock_ids;

  IF to_regclass('public.pdv_deliveries') IS NOT NULL
     AND to_regclass('public.pdv_delivery_items') IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT source.stock_id), ARRAY[]::uuid[])
      INTO v_extra_stock_ids
      FROM (
        SELECT reservation.stock_id
          FROM public.pdv_deliveries delivery
          JOIN public.pdv_delivery_items delivery_item
            ON delivery_item.delivery_id = delivery.id
          JOIN public.pdv_stock_reservation_items reservation
            ON reservation.id = delivery_item.reservation_id
         WHERE delivery.order_id = v_order_id
           AND delivery.company_id = p_company_id
        UNION
        SELECT movement.stock_id
          FROM public.pdv_deliveries delivery
          JOIN public.pdv_delivery_items delivery_item
            ON delivery_item.delivery_id = delivery.id
          JOIN public.inventory_movements movement
            ON movement.id = delivery_item.inventory_movement_id
         WHERE delivery.order_id = v_order_id
           AND delivery.company_id = p_company_id
      ) source
     WHERE source.stock_id IS NOT NULL;
    v_stock_ids := v_stock_ids || v_extra_stock_ids;
  END IF;

  IF to_regclass('public.pdv_commercial_returns') IS NOT NULL
     AND to_regclass('public.pdv_commercial_return_items') IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT return_item.destination_stock_id), ARRAY[]::uuid[])
      INTO v_extra_stock_ids
      FROM public.pdv_commercial_returns header
      JOIN public.pdv_commercial_return_items return_item
        ON return_item.commercial_return_id = header.id
     WHERE header.order_id = v_order_id
       AND header.company_id = p_company_id
       AND return_item.destination_stock_id IS NOT NULL;
    v_stock_ids := v_stock_ids || v_extra_stock_ids;
  END IF;

  -- Material sem qualquer origem resolvida falha fechado. Pedidos apenas de
  -- servico/item livre nao dependem de local e continuam permitidos.
  IF COALESCE(array_length(v_stock_ids, 1), 0) = 0 THEN
    RETURN NOT v_has_material;
  END IF;

  FOREACH v_stock IN ARRAY v_stock_ids LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.stocks stock
       WHERE stock.id = v_stock
         AND stock.company_id = p_company_id
         AND public.can_access_stock(p_user_id, stock.id) IS TRUE
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_has_stock_access_scope_v2(uuid,uuid,uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Snapshot interno. Sempre trava empresa+conta antes de qualquer saldo.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_cash_snapshot_v2_internal(
  p_company_id uuid,
  p_cash_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_account record;
  v_balance numeric(14,2) := 0;
  v_custody numeric(14,2) := 0;
  v_open_v2 integer := 0;
  v_open_legacy integer := 0;
  v_inconsistent integer := 0;
  v_reconciliation boolean;
BEGIN
  PERFORM public.pdv_lock_treasury_account(p_company_id, p_cash_account_id);

  SELECT account.id, account.name, account.type, account.is_active,
         account.initial_balance
    INTO v_account
    FROM public.financial_accounts account
   WHERE account.id = p_cash_account_id
     AND account.company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta do cofre não encontrada.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_TREASURY_ACCOUNT_NOT_FOUND';
  END IF;
  IF v_account.type <> 'caixa' THEN
    RAISE EXCEPTION 'A conta escolhida para o cofre precisa ser do tipo Caixa.'
      USING ERRCODE = '22023', DETAIL = 'PDV_TREASURY_ACCOUNT_TYPE_INVALID';
  END IF;

  SELECT
    round(
      v_account.initial_balance
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
    FROM public.financial_transactions transaction
   WHERE transaction.company_id = p_company_id
     AND transaction.account_id = p_cash_account_id;

  SELECT count(*) INTO v_open_legacy
    FROM public.pdv_cash_sessions session
   WHERE session.company_id = p_company_id
     AND session.status = 'aberta'
     AND session.contract_version IS DISTINCT FROM 2;

  SELECT count(*) INTO v_open_v2
    FROM public.pdv_cash_sessions session
   WHERE session.company_id = p_company_id
     AND session.status = 'aberta'
     AND session.contract_version = 2
     AND session.cash_account_id = p_cash_account_id;

  SELECT count(*) INTO v_inconsistent
    FROM public.pdv_cash_sessions session
   WHERE session.company_id = p_company_id
     AND session.status = 'aberta'
     AND session.contract_version = 2
     AND (
       session.cash_account_id IS NULL
       OR (
         SELECT count(*)
           FROM public.pdv_cash_custody_entries entry
          WHERE entry.session_id = session.id
            AND entry.company_id = p_company_id
            AND entry.entry_kind = 'opening'
       ) <> 1
     );

  SELECT round(COALESCE(sum(entry.amount), 0), 2)
    INTO v_custody
    FROM public.pdv_cash_custody_entries entry
    JOIN public.pdv_cash_sessions session ON session.id = entry.session_id
   WHERE entry.company_id = p_company_id
     AND entry.cash_account_id = p_cash_account_id
     AND session.company_id = p_company_id
     AND session.status = 'aberta'
     AND session.contract_version = 2;

  v_reconciliation := v_open_legacy > 0 OR v_inconsistent > 0 OR v_custody < 0;

  RETURN jsonb_build_object(
    'account_id', p_cash_account_id,
    'account_name', v_account.name,
    'account_active', v_account.is_active,
    'balance', v_balance,
    'custody', v_custody,
    'available', CASE WHEN v_reconciliation THEN NULL ELSE round(v_balance - v_custody, 2) END,
    'open_v2_sessions', v_open_v2,
    'open_legacy_sessions', v_open_legacy,
    'inconsistent_v2_sessions', v_inconsistent,
    'reconciliation_required', v_reconciliation
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_note_cash_reconciliation_issue(
  p_company_id uuid,
  p_issue_code text,
  p_evidence jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_issue_id uuid;
BEGIN
  SELECT issue.id INTO v_issue_id
    FROM public.pdv_reconciliation_issues issue
   WHERE issue.company_id = p_company_id
     AND issue.issue_domain = 'cash_custody'
     AND issue.issue_code = p_issue_code
     AND issue.resource_type = 'cash_treasury'
     AND issue.resource_id IS NULL
     AND issue.status IN ('open', 'in_review')
   ORDER BY issue.detected_at, issue.id
   LIMIT 1
   FOR UPDATE;

  IF v_issue_id IS NULL THEN
    INSERT INTO public.pdv_reconciliation_issues (
      company_id, issue_domain, issue_code, resource_type, evidence
    ) VALUES (
      p_company_id, 'cash_custody', p_issue_code, 'cash_treasury', p_evidence
    ) RETURNING id INTO v_issue_id;
  END IF;

  RETURN v_issue_id;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Porta comum dos writes financeiros com conta.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_guard_financial_treasury_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
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

    -- A consulta ainda enxerga OLD no UPDATE/DELETE e nao enxerga NEW no
    -- INSERT; por isso o proprio delta e removido/adicionado exatamente uma vez.
    v_balance := round(v_balance - v_old_effect + v_new_effect, 2);
    v_custody := round(v_custody + v_planned_custody_delta, 2);

    IF EXISTS (
      SELECT 1 FROM public.pdv_cash_sessions session
       WHERE session.company_id = v_company_id
         AND session.cash_account_id = v_account_id
         AND session.status = 'aberta'
         AND session.contract_version = 2
    ) AND v_balance < v_custody THEN
      RAISE EXCEPTION 'Este lançamento deixaria o cofre sem saldo para o dinheiro reservado nos caixas abertos.'
        USING ERRCODE = '23514', DETAIL = 'PDV_TREASURY_CUSTODY_RESERVED';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS tg_pdv_financial_treasury_v2
  ON public.financial_transactions;
DROP TRIGGER IF EXISTS tg_zz_pdv_financial_treasury_v2
  ON public.financial_transactions;
-- O prefixo zz garante que company_id e transaction_date ja foram preenchidos
-- pelos BEFORE triggers canonicos antes do lock/validacao.
CREATE TRIGGER tg_zz_pdv_financial_treasury_v2
  BEFORE INSERT OR UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_financial_treasury_v2();

-- Saldo inicial e parte da mesma fonte de saldo do snapshot. Depois do
-- primeiro movimento ou custodia ele vira fato historico imutavel; correcao
-- passa por lancamento financeiro, que usa a porta serializada acima.
CREATE OR REPLACE FUNCTION public.pdv_guard_financial_account_treasury_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_custody numeric := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.companies company WHERE company.id = OLD.company_id
    ) OR COALESCE(
      current_setting('app.pdv_purge_company', true), ''
    ) = OLD.company_id::text THEN
      RETURN OLD;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.pdv_cash_sessions session
       WHERE session.company_id = OLD.company_id
         AND session.cash_account_id = OLD.id
         AND session.contract_version = 2
    ) OR EXISTS (
      SELECT 1 FROM public.pdv_cash_custody_entries entry
       WHERE entry.company_id = OLD.company_id
         AND entry.cash_account_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Esta conta possui histórico de custódia do PDV e não pode ser excluída fora do expurgo da empresa.'
        USING ERRCODE = '55000', DETAIL = 'PDV_TREASURY_ACCOUNT_HAS_CUSTODY';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Não é possível transferir uma conta financeira entre empresas.'
      USING ERRCODE = '42501', DETAIL = 'PDV_TREASURY_ACCOUNT_COMPANY_IMMUTABLE';
  END IF;

  IF NEW.initial_balance IS NOT DISTINCT FROM OLD.initial_balance THEN
    RETURN NEW;
  END IF;

  PERFORM public.pdv_lock_treasury_account(OLD.company_id, OLD.id);

  IF EXISTS (
    SELECT 1 FROM public.financial_transactions transaction
     WHERE transaction.company_id = OLD.company_id
       AND transaction.account_id = OLD.id
  ) OR EXISTS (
    SELECT 1 FROM public.pdv_cash_custody_entries entry
     WHERE entry.company_id = OLD.company_id
       AND entry.cash_account_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'O saldo inicial não pode ser alterado após a conta começar a ser usada. Registre um ajuste financeiro.'
      USING ERRCODE = '55000', DETAIL = 'PDV_TREASURY_INITIAL_BALANCE_IMMUTABLE';
  END IF;

  SELECT round(COALESCE(sum(entry.amount), 0), 2)
    INTO v_custody
    FROM public.pdv_cash_custody_entries entry
    JOIN public.pdv_cash_sessions session ON session.id = entry.session_id
   WHERE entry.company_id = OLD.company_id
     AND entry.cash_account_id = OLD.id
     AND session.company_id = OLD.company_id
     AND session.status = 'aberta'
     AND session.contract_version = 2;

  IF round(NEW.initial_balance, 2) < v_custody THEN
    RAISE EXCEPTION 'O novo saldo inicial não cobre o dinheiro reservado nos caixas abertos.'
      USING ERRCODE = '23514', DETAIL = 'PDV_TREASURY_CUSTODY_RESERVED';
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS tg_zz_pdv_financial_account_treasury_v2
  ON public.financial_accounts;
CREATE TRIGGER tg_zz_pdv_financial_account_treasury_v2
  BEFORE UPDATE OF company_id, initial_balance ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_financial_account_treasury_v2();

DROP TRIGGER IF EXISTS tg_zz_pdv_financial_account_delete_v2
  ON public.financial_accounts;
CREATE TRIGGER tg_zz_pdv_financial_account_delete_v2
  BEFORE DELETE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_financial_account_treasury_v2();

-- ---------------------------------------------------------------------------
-- 4. Abertura v2: lock -> idempotencia -> config/terminal -> saldo -> fatos.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_open_cash_session_v2(
  p_terminal_id uuid,
  p_cash_account_id uuid,
  p_opening_amount numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_claim record;
  v_settings record;
  v_terminal record;
  v_snapshot jsonb;
  v_session public.pdv_cash_sessions;
  v_result jsonb;
  v_issue_id uuid;
  v_can_view boolean;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta do cofre não informada.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_ACCOUNT_REQUIRED';
  END IF;
  IF p_opening_amount IS NULL OR p_opening_amount < 0
     OR p_opening_amount <> round(p_opening_amount, 2)
  THEN
    RAISE EXCEPTION 'Informe um valor de abertura válido, com até duas casas decimais.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_OPENING_AMOUNT_INVALID';
  END IF;

  -- O parametro da conta existe para que nenhum SELECT de sessao/configuracao
  -- aconteca antes do lock. A igualdade com a configuracao e validada depois.
  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id,
      'cash.open.v2',
      p_idempotency_key,
      jsonb_build_object(
        'terminal_id', p_terminal_id,
        'cash_account_id', p_cash_account_id,
        'opening_amount', round(p_opening_amount, 2)
      )
    );

  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result;
    END IF;
    RAISE EXCEPTION 'Esta abertura de caixa já está sendo processada ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_OPEN_IN_PROGRESS';
  END IF;

  SELECT settings.pdv_cash_account_id,
         COALESCE(settings.pdv_strict_cash_tracking, true) AS strict_tracking,
         COALESCE(NULLIF(btrim(settings.pdv_mode), ''), 'simples') AS pdv_mode,
         account.name AS account_name,
         account.type AS account_type,
         account.is_active AS account_active
    INTO v_settings
    FROM public.company_settings settings
    JOIN public.financial_accounts account
      ON account.id = settings.pdv_cash_account_id
     AND account.company_id = settings.company_id
   WHERE settings.company_id = v_context.company_id;

  IF NOT FOUND OR v_settings.pdv_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Configure a conta do cofre antes de abrir o caixa.'
      USING ERRCODE = '23502', DETAIL = 'PDV_TREASURY_ACCOUNT_NOT_CONFIGURED';
  END IF;
  IF v_settings.pdv_cash_account_id <> p_cash_account_id THEN
    RAISE EXCEPTION 'A conta informada não é a conta do cofre configurada para esta empresa.'
      USING ERRCODE = '42501', DETAIL = 'PDV_TREASURY_ACCOUNT_MISMATCH';
  END IF;
  IF v_settings.account_type <> 'caixa' OR NOT v_settings.account_active THEN
    RAISE EXCEPTION 'A conta do cofre precisa estar ativa e ser do tipo Caixa.'
      USING ERRCODE = '22023', DETAIL = 'PDV_TREASURY_ACCOUNT_UNAVAILABLE';
  END IF;

  SELECT terminal.id, terminal.name, terminal.is_active, terminal.stock_id
    INTO v_terminal
    FROM public.pdv_terminals terminal
   WHERE terminal.id = p_terminal_id
     AND terminal.company_id = v_context.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terminal de caixa não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_TERMINAL_NOT_FOUND';
  END IF;
  IF NOT v_terminal.is_active THEN
    RAISE EXCEPTION 'O terminal de caixa está desativado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_TERMINAL_INACTIVE';
  END IF;
  IF v_terminal.stock_id IS NOT NULL
     AND public.pdv_has_stock_access_scope_v2(
       v_context.user_id, v_context.company_id, p_stock_id => v_terminal.stock_id
     ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Você não tem acesso ao local de estoque deste terminal.'
      USING ERRCODE = '42501', DETAIL = 'PDV_TERMINAL_STOCK_FORBIDDEN';
  END IF;

  v_snapshot := public.pdv_cash_snapshot_v2_internal(
    v_context.company_id, p_cash_account_id
  );

  IF COALESCE((v_snapshot->>'reconciliation_required')::boolean, true) THEN
    v_issue_id := public.pdv_note_cash_reconciliation_issue(
      v_context.company_id,
      'open_legacy_or_inconsistent_session',
      jsonb_build_object(
        'open_legacy_sessions', v_snapshot->'open_legacy_sessions',
        'inconsistent_v2_sessions', v_snapshot->'inconsistent_v2_sessions'
      )
    );
    v_result := jsonb_build_object(
      'ok', false,
      'requires_reconciliation', true,
      'message', 'Existe um caixa antigo ou inconsistente aberto. Concilie ou encerre esse caixa antes de iniciar o modelo novo.',
      'reconciliation_issue_id', v_issue_id
    );
    PERFORM public.pdv_complete_operation_request(
      v_claim.request_id, 'pdv_reconciliation_issue', v_issue_id, v_result
    );
    RETURN v_result;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions session
     WHERE session.company_id = v_context.company_id
       AND session.terminal_id = p_terminal_id
       AND session.status = 'aberta'
  ) THEN
    RAISE EXCEPTION 'Este terminal já possui um caixa aberto.'
      USING ERRCODE = '23505', DETAIL = 'PDV_TERMINAL_SESSION_ALREADY_OPEN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pdv_cash_sessions session
     WHERE session.company_id = v_context.company_id
       AND session.opened_by = v_context.user_id
       AND session.status = 'aberta'
       AND session.contract_version = 2
  ) THEN
    RAISE EXCEPTION 'Você já possui um caixa aberto. Feche-o antes de abrir outro.'
      USING ERRCODE = '23505', DETAIL = 'PDV_OPERATOR_SESSION_ALREADY_OPEN';
  END IF;

  IF v_settings.strict_tracking
     AND p_opening_amount > (v_snapshot->>'available')::numeric
  THEN
    RAISE EXCEPTION 'O valor de abertura é maior que o disponível no cofre.'
      USING ERRCODE = '23514', DETAIL = 'PDV_TREASURY_AVAILABLE_INSUFFICIENT';
  END IF;

  INSERT INTO public.pdv_cash_sessions (
    company_id, terminal_id, opened_by, opening_amount, status,
    cash_account_id, cash_account_name_snapshot, cash_policy_snapshot,
    contract_version
  ) VALUES (
    v_context.company_id, p_terminal_id, v_context.user_id,
    round(p_opening_amount, 2), 'aberta', p_cash_account_id,
    v_settings.account_name,
    jsonb_build_object(
      'strict_tracking', v_settings.strict_tracking,
      'pdv_mode', v_settings.pdv_mode
    ),
    2
  ) RETURNING * INTO v_session;

  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id, created_by
  ) VALUES (
    v_context.company_id, v_session.id, p_cash_account_id,
    v_claim.request_id, 'opening', round(p_opening_amount, 2),
    'pdv_cash_session', v_session.id, v_context.user_id
  );

  v_snapshot := public.pdv_cash_snapshot_v2_internal(
    v_context.company_id, p_cash_account_id
  );
  v_can_view := public.can_manage_bank_accounts(v_context.user_id);

  v_result := jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'terminal_id', v_session.terminal_id,
    'terminal_name', v_terminal.name,
    'cash_account_id', p_cash_account_id,
    'cash_account_name', v_settings.account_name,
    'opening_amount', round(v_session.opening_amount, 2),
    'opened_at', v_session.opened_at,
    'available_after', CASE
      WHEN v_can_view THEN v_snapshot->'available' ELSE '0'::jsonb
    END,
    'idempotent', false
  );

  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'pdv_cash_session', v_session.id, v_result
  );
  RETURN v_result;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Evento de dinheiro v2: transacao financeira e custodia na mesma tx.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_record_cash_event_v2(
  p_session_id uuid,
  p_cash_account_id uuid,
  p_entry_kind text,
  p_amount numeric,
  p_description text,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_claim record;
  v_session public.pdv_cash_sessions;
  v_snapshot jsonb;
  v_position numeric(14,2) := 0;
  v_signed_amount numeric(14,2);
  v_entry_id uuid;
  v_financial_id uuid;
  v_today date;
  v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta do caixa não informada.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_ACCOUNT_REQUIRED';
  END IF;
  IF p_entry_kind NOT IN (
    'cash_receipt', 'cash_payment', 'refund', 'supply', 'withdrawal'
  ) THEN
    RAISE EXCEPTION 'Tipo de evento de caixa inválido.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_EVENT_KIND_INVALID';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Informe um valor maior que zero, com até duas casas decimais.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_EVENT_AMOUNT_INVALID';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id,
      'cash.event.v2',
      p_idempotency_key,
      jsonb_build_object(
        'session_id', p_session_id,
        'cash_account_id', p_cash_account_id,
        'entry_kind', p_entry_kind,
        'amount', round(p_amount, 2),
        'description', NULLIF(btrim(COALESCE(p_description, '')), ''),
        'notes', NULLIF(btrim(COALESCE(p_notes, '')), '')
      )
    );

  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result;
    END IF;
    RAISE EXCEPTION 'Este evento de caixa já está sendo processado ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_EVENT_IN_PROGRESS';
  END IF;

  SELECT session.* INTO v_session
    FROM public.pdv_cash_sessions session
   WHERE session.id = p_session_id
     AND session.company_id = v_context.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_SESSION_NOT_FOUND';
  END IF;
  IF v_session.contract_version IS DISTINCT FROM 2
     OR v_session.cash_account_id <> p_cash_account_id
  THEN
    RAISE EXCEPTION 'Este caixa não usa o contrato de custódia informado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_CONTRACT_MISMATCH';
  END IF;
  IF v_session.status <> 'aberta' THEN
    RAISE EXCEPTION 'Este caixa já foi fechado e não aceita novos lançamentos.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_CLOSED';
  END IF;
  IF v_session.opened_by IS DISTINCT FROM v_context.user_id
     AND NOT public.is_admin_or_gestor(v_context.user_id)
     AND NOT EXISTS (
       SELECT 1
         FROM public.user_permissions permission
        WHERE permission.user_id = v_context.user_id
          AND permission.is_active
          AND (
            permission.permissions ? '*'
            OR permission.permissions ? 'fn:edit_pdv_sales'
          )
     )
  THEN
    RAISE EXCEPTION 'Você não pode movimentar o caixa de outro operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
  END IF;

  v_snapshot := public.pdv_cash_snapshot_v2_internal(
    v_context.company_id, p_cash_account_id
  );
  IF COALESCE((v_snapshot->>'reconciliation_required')::boolean, true) THEN
    RAISE EXCEPTION 'A custódia precisa ser conciliada antes de registrar outro evento.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_RECONCILIATION_REQUIRED';
  END IF;

  SELECT COALESCE(position.custody_amount, 0)
    INTO v_position
    FROM public.pdv_cash_custody_position(v_context.company_id, p_session_id) position;
  v_position := COALESCE(v_position, 0);

  v_signed_amount := CASE
    WHEN p_entry_kind IN ('cash_receipt', 'supply') THEN round(p_amount, 2)
    ELSE -round(p_amount, 2)
  END;

  IF v_signed_amount < 0 AND abs(v_signed_amount) > v_position THEN
    RAISE EXCEPTION 'O valor é maior que o dinheiro disponível nesta gaveta.'
      USING ERRCODE = '23514', DETAIL = 'PDV_CASH_CUSTODY_INSUFFICIENT';
  END IF;

  IF p_entry_kind = 'supply'
     AND COALESCE((v_session.cash_policy_snapshot->>'strict_tracking')::boolean, true)
     AND p_amount > (v_snapshot->>'available')::numeric
  THEN
    RAISE EXCEPTION 'O suprimento é maior que o disponível no cofre.'
      USING ERRCODE = '23514', DETAIL = 'PDV_TREASURY_AVAILABLE_INSUFFICIENT';
  END IF;

  IF p_entry_kind IN ('cash_receipt', 'cash_payment', 'refund') THEN
    IF NULLIF(btrim(COALESCE(p_description, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Descreva o evento financeiro do caixa.'
        USING ERRCODE = '22023', DETAIL = 'PDV_CASH_DESCRIPTION_REQUIRED';
    END IF;

    v_today := public.company_today(v_context.company_id);
    PERFORM set_config(
      'app.pdv_treasury_custody_delta',
      jsonb_build_object(
        'company_id', v_context.company_id,
        'account_id', p_cash_account_id,
        'request_id', v_claim.request_id,
        'delta', v_signed_amount
      )::text,
      true
    );
    INSERT INTO public.financial_transactions (
      company_id, transaction_type, description, amount,
      transaction_date, paid_date, is_paid, account_id, origin,
      created_by, notes
    ) VALUES (
      v_context.company_id,
      CASE WHEN p_entry_kind = 'cash_receipt'
        THEN 'entrada'::public.transaction_type
        ELSE 'saida'::public.transaction_type
      END,
      btrim(p_description), round(p_amount, 2), v_today, v_today, true,
      p_cash_account_id, 'pdv', v_context.user_id,
      NULLIF(btrim(COALESCE(p_notes, '')), '')
    ) RETURNING id INTO v_financial_id;
    PERFORM set_config('app.pdv_treasury_custody_delta', '', true);
  END IF;

  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id,
    financial_transaction_id, metadata, created_by
  ) VALUES (
    v_context.company_id, p_session_id, p_cash_account_id,
    v_claim.request_id, p_entry_kind, v_signed_amount,
    CASE
      WHEN v_financial_id IS NULL THEN 'pdv_operation_request'
      ELSE 'financial_transaction'
    END,
    COALESCE(v_financial_id, v_claim.request_id),
    v_financial_id,
    jsonb_build_object('notes', NULLIF(btrim(COALESCE(p_notes, '')), '')),
    v_context.user_id
  ) RETURNING id INTO v_entry_id;

  v_result := jsonb_build_object(
    'ok', true,
    'entry_id', v_entry_id,
    'session_id', p_session_id,
    'entry_kind', p_entry_kind,
    'amount', v_signed_amount,
    'financial_transaction_id', v_financial_id,
    'custody_after', round(v_position + v_signed_amount, 2),
    'idempotent', false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'pdv_cash_custody_entry', v_entry_id, v_result
  );
  RETURN v_result;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Reversao compensatoria de evento financeiro enquanto a sessao esta aberta.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_reverse_cash_event_v2(
  p_entry_id uuid,
  p_cash_account_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_claim record;
  v_entry public.pdv_cash_custody_entries%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE;
  v_original public.financial_transactions%ROWTYPE;
  v_position numeric(14,2) := 0;
  v_reversal_amount numeric(14,2);
  v_reversal_transaction uuid;
  v_reversal_entry uuid;
  v_today date;
  v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta do caixa não informada.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_ACCOUNT_REQUIRED';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da reversão.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_REVERSAL_REASON_REQUIRED';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id,
      'cash.reverse.v2',
      p_idempotency_key,
      jsonb_build_object(
        'entry_id', p_entry_id,
        'cash_account_id', p_cash_account_id,
        'reason', btrim(p_reason)
      )
    );
  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result;
    END IF;
    RAISE EXCEPTION 'Esta reversão já está sendo processada ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_REVERSAL_IN_PROGRESS';
  END IF;

  SELECT entry.* INTO v_entry
    FROM public.pdv_cash_custody_entries entry
   WHERE entry.id = p_entry_id
     AND entry.company_id = v_context.company_id
     AND entry.cash_account_id = p_cash_account_id
   FOR UPDATE;
  IF NOT FOUND OR v_entry.financial_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Evento financeiro de caixa não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_EVENT_NOT_FOUND';
  END IF;
  IF v_entry.entry_kind = 'reversal' OR EXISTS (
    SELECT 1 FROM public.pdv_cash_custody_entries reversal
     WHERE reversal.reversal_of_id = v_entry.id
  ) THEN
    RAISE EXCEPTION 'Este evento já foi revertido.'
      USING ERRCODE = '23505', DETAIL = 'PDV_CASH_EVENT_ALREADY_REVERSED';
  END IF;

  SELECT session.* INTO v_session
    FROM public.pdv_cash_sessions session
   WHERE session.id = v_entry.session_id
     AND session.company_id = v_context.company_id
   FOR UPDATE;
  IF v_session.status <> 'aberta' OR v_session.contract_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Eventos de caixa fechado exigem uma compensação pós-fechamento própria.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_REVERSAL_CLOSED_SESSION';
  END IF;
  IF v_session.opened_by IS DISTINCT FROM v_context.user_id
     AND NOT public.is_admin_or_gestor(v_context.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_permissions permission
        WHERE permission.user_id = v_context.user_id
          AND permission.is_active
          AND (
            permission.permissions ? '*'
            OR permission.permissions ? 'fn:edit_pdv_sales'
          )
     )
  THEN
    RAISE EXCEPTION 'Você não pode reverter evento do caixa de outro operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
  END IF;

  SELECT transaction.* INTO v_original
    FROM public.financial_transactions transaction
   WHERE transaction.id = v_entry.financial_transaction_id
     AND transaction.company_id = v_context.company_id
     AND transaction.account_id = p_cash_account_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento financeiro original não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_FINANCIAL_NOT_FOUND';
  END IF;

  v_reversal_amount := -v_entry.amount;
  SELECT COALESCE(position.custody_amount, 0)
    INTO v_position
    FROM public.pdv_cash_custody_position(v_context.company_id, v_session.id) position;
  v_position := round(COALESCE(v_position, 0), 2);
  IF v_reversal_amount < 0 AND abs(v_reversal_amount) > v_position THEN
    RAISE EXCEPTION 'A gaveta não possui dinheiro suficiente para esta reversão.'
      USING ERRCODE = '23514', DETAIL = 'PDV_CASH_REVERSAL_INSUFFICIENT_CUSTODY';
  END IF;

  v_today := public.company_today(v_context.company_id);
  PERFORM set_config(
    'app.pdv_treasury_custody_delta',
    jsonb_build_object(
      'company_id', v_context.company_id,
      'account_id', p_cash_account_id,
      'request_id', v_claim.request_id,
      'delta', v_reversal_amount
    )::text,
    true
  );
  INSERT INTO public.financial_transactions (
    company_id, transaction_type, description, amount, category,
    transaction_date, paid_date, is_paid, account_id, origin,
    created_by, notes
  ) VALUES (
    v_context.company_id,
    CASE WHEN v_original.transaction_type::text = 'entrada'
      THEN 'saida'::public.transaction_type
      ELSE 'entrada'::public.transaction_type
    END,
    'Reversão: ' || v_original.description,
    v_original.amount,
    v_original.category,
    v_today, v_today, true, p_cash_account_id, 'pdv', v_context.user_id,
    btrim(p_reason) || ' | Lançamento original: ' || v_original.id::text
  ) RETURNING id INTO v_reversal_transaction;
  PERFORM set_config('app.pdv_treasury_custody_delta', '', true);

  INSERT INTO public.pdv_cash_custody_entries (
    company_id, session_id, cash_account_id, operation_request_id,
    entry_kind, amount, source_type, source_id,
    financial_transaction_id, reversal_of_id, metadata, created_by
  ) VALUES (
    v_context.company_id, v_session.id, p_cash_account_id,
    v_claim.request_id, 'reversal', v_reversal_amount,
    'financial_transaction', v_reversal_transaction,
    v_reversal_transaction, v_entry.id,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'original_financial_transaction_id', v_original.id
    ),
    v_context.user_id
  ) RETURNING id INTO v_reversal_entry;

  v_result := jsonb_build_object(
    'ok', true,
    'entry_id', v_reversal_entry,
    'reversal_of_entry_id', v_entry.id,
    'financial_transaction_id', v_reversal_transaction,
    'amount', v_reversal_amount,
    'idempotent', false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'pdv_cash_custody_entry', v_reversal_entry, v_result
  );
  RETURN v_result;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Fechamento v2: retorno neutro separado da quebra financeira.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_close_cash_session_v2(
  p_session_id uuid,
  p_cash_account_id uuid,
  p_counted_amount numeric,
  p_notes text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_claim record;
  v_session public.pdv_cash_sessions;
  v_expected numeric(14,2) := 0;
  v_difference numeric(14,2);
  v_adjustment_id uuid;
  v_adjustment_kind text;
  v_today date;
  v_final numeric(14,2);
  v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta do caixa não informada.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_ACCOUNT_REQUIRED';
  END IF;
  IF p_counted_amount IS NULL OR p_counted_amount < 0
     OR p_counted_amount <> round(p_counted_amount, 2)
  THEN
    RAISE EXCEPTION 'Informe o valor contado, com até duas casas decimais.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_COUNTED_AMOUNT_INVALID';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id,
      'cash.close.v2',
      p_idempotency_key,
      jsonb_build_object(
        'session_id', p_session_id,
        'cash_account_id', p_cash_account_id,
        'counted_amount', round(p_counted_amount, 2),
        'notes', NULLIF(btrim(COALESCE(p_notes, '')), '')
      )
    );

  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result;
    END IF;
    RAISE EXCEPTION 'Este fechamento já está sendo processado ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_CLOSE_IN_PROGRESS';
  END IF;

  SELECT session.* INTO v_session
    FROM public.pdv_cash_sessions session
   WHERE session.id = p_session_id
     AND session.company_id = v_context.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caixa não encontrado.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_CASH_SESSION_NOT_FOUND';
  END IF;
  IF v_session.contract_version IS DISTINCT FROM 2
     OR v_session.cash_account_id <> p_cash_account_id
  THEN
    RAISE EXCEPTION 'Este caixa não usa o contrato de custódia informado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_CONTRACT_MISMATCH';
  END IF;
  IF v_session.status <> 'aberta' THEN
    RAISE EXCEPTION 'Este caixa já foi fechado.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_CLOSED';
  END IF;
  IF v_session.opened_by IS DISTINCT FROM v_context.user_id
     AND NOT public.is_admin_or_gestor(v_context.user_id)
     AND NOT EXISTS (
       SELECT 1
         FROM public.user_permissions permission
        WHERE permission.user_id = v_context.user_id
          AND permission.is_active
          AND (
            permission.permissions ? '*'
            OR permission.permissions ? 'fn:edit_pdv_sales'
          )
     )
  THEN
    RAISE EXCEPTION 'Você não pode fechar o caixa de outro operador.'
      USING ERRCODE = '42501', DETAIL = 'PDV_CASH_SESSION_FORBIDDEN';
  END IF;

  SELECT COALESCE(position.custody_amount, 0)
    INTO v_expected
    FROM public.pdv_cash_custody_position(v_context.company_id, p_session_id) position;
  v_expected := round(COALESCE(v_expected, 0), 2);
  IF v_expected < 0 THEN
    RAISE EXCEPTION 'A custódia deste caixa está inconsistente e precisa ser conciliada.'
      USING ERRCODE = '55000', DETAIL = 'PDV_CASH_RECONCILIATION_REQUIRED';
  END IF;

  v_difference := round(p_counted_amount - v_expected, 2);
  v_today := public.company_today(v_context.company_id);

  IF v_difference <> 0 THEN
    INSERT INTO public.financial_categories (
      company_id, name, type, dre_group, icon, color
    ) VALUES (
      v_context.company_id, 'Quebra de caixa', 'ambos', 'opex', 'Scale', '#f59e0b'
    ) ON CONFLICT (company_id, name) DO NOTHING;

    PERFORM set_config(
      'app.pdv_treasury_custody_delta',
      jsonb_build_object(
        'company_id', v_context.company_id,
        'account_id', p_cash_account_id,
        'request_id', v_claim.request_id,
        'delta', v_difference
      )::text,
      true
    );
    INSERT INTO public.financial_transactions (
      company_id, transaction_type, description, amount, category,
      transaction_date, paid_date, is_paid, account_id, origin,
      created_by, notes
    ) VALUES (
      v_context.company_id,
      CASE WHEN v_difference > 0
        THEN 'entrada'::public.transaction_type
        ELSE 'saida'::public.transaction_type
      END,
      CASE WHEN v_difference > 0
        THEN 'Sobra de caixa no fechamento'
        ELSE 'Falta de caixa no fechamento'
      END,
      abs(v_difference), 'Quebra de caixa', v_today, v_today, true,
      p_cash_account_id, 'pdv', v_context.user_id,
      'Esperado ' || public.pdv_fmt_brl(v_expected)
        || ', contado ' || public.pdv_fmt_brl(p_counted_amount)
        || COALESCE('. ' || NULLIF(btrim(COALESCE(p_notes, '')), ''), '')
    ) RETURNING id INTO v_adjustment_id;
    PERFORM set_config('app.pdv_treasury_custody_delta', '', true);
  END IF;

  -- O valor contado retorna fisicamente ao cofre, mas nao cria transacao:
  -- continua dentro da mesma conta financeira da empresa.
  IF p_counted_amount > 0 THEN
    INSERT INTO public.pdv_cash_custody_entries (
      company_id, session_id, cash_account_id, operation_request_id,
      entry_kind, amount, source_type, source_id, metadata, created_by
    ) VALUES (
      v_context.company_id, p_session_id, p_cash_account_id,
      v_claim.request_id, 'closing_return', -round(p_counted_amount, 2),
      'pdv_cash_session', p_session_id,
      jsonb_build_object('notes', NULLIF(btrim(COALESCE(p_notes, '')), '')),
      v_context.user_id
    );
  END IF;

  IF v_difference < 0 THEN
    v_adjustment_kind := 'shortage';
  ELSIF v_difference > 0 THEN
    v_adjustment_kind := 'surplus';
  END IF;

  IF v_adjustment_kind IS NOT NULL THEN
    INSERT INTO public.pdv_cash_custody_entries (
      company_id, session_id, cash_account_id, operation_request_id,
      entry_kind, amount, source_type, source_id,
      financial_transaction_id, created_by
    ) VALUES (
      v_context.company_id, p_session_id, p_cash_account_id,
      v_claim.request_id, v_adjustment_kind, v_difference,
      'financial_transaction', v_adjustment_id, v_adjustment_id,
      v_context.user_id
    );
  END IF;

  SELECT COALESCE(position.custody_amount, 0)
    INTO v_final
    FROM public.pdv_cash_custody_position(v_context.company_id, p_session_id) position;
  v_final := round(COALESCE(v_final, 0), 2);
  IF v_final <> 0 THEN
    RAISE EXCEPTION 'O fechamento não zerou a custódia da gaveta.'
      USING ERRCODE = '23514', DETAIL = 'PDV_CASH_CLOSE_NOT_BALANCED';
  END IF;

  UPDATE public.pdv_cash_sessions
     SET status = 'fechada',
         closed_by = v_context.user_id,
         closed_at = now(),
         counted_amount = round(p_counted_amount, 2),
         expected_amount = v_expected,
         difference = v_difference,
         notes = COALESCE(NULLIF(btrim(COALESCE(p_notes, '')), ''), notes)
   WHERE id = p_session_id
  RETURNING * INTO v_session;

  v_result := jsonb_build_object(
    'ok', true,
    'session_id', v_session.id,
    'expected_amount', v_expected,
    'counted_amount', round(p_counted_amount, 2),
    'difference', v_difference,
    'closing_return', round(p_counted_amount, 2),
    'adjustment_kind', v_adjustment_kind,
    'adjustment_transaction_id', v_adjustment_id,
    'closed_at', v_session.closed_at,
    'idempotent', false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'pdv_cash_session', v_session.id, v_result
  );
  RETURN v_result;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Snapshot publico seguro. Operador sem permissao bancaria recebe zeros.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_cash_snapshot_v2(p_cash_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
  v_configured_account uuid;
  v_snapshot jsonb;
  v_can_view boolean;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF p_cash_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta do cofre não informada.'
      USING ERRCODE = '22023', DETAIL = 'PDV_CASH_ACCOUNT_REQUIRED';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_cash_account_id);

  SELECT settings.pdv_cash_account_id INTO v_configured_account
    FROM public.company_settings settings
   WHERE settings.company_id = v_context.company_id;
  IF v_configured_account IS DISTINCT FROM p_cash_account_id THEN
    RAISE EXCEPTION 'A conta informada não é a conta do cofre configurada.'
      USING ERRCODE = '42501', DETAIL = 'PDV_TREASURY_ACCOUNT_MISMATCH';
  END IF;

  v_snapshot := public.pdv_cash_snapshot_v2_internal(
    v_context.company_id, p_cash_account_id
  );
  v_can_view := public.can_manage_bank_accounts(v_context.user_id);

  RETURN jsonb_build_object(
    'account_id', v_snapshot->'account_id',
    'account_name', v_snapshot->'account_name',
    'account_active', v_snapshot->'account_active',
    'balance', CASE WHEN v_can_view THEN v_snapshot->'balance' ELSE '0'::jsonb END,
    'custody', CASE WHEN v_can_view THEN v_snapshot->'custody' ELSE '0'::jsonb END,
    'available', CASE WHEN v_can_view THEN v_snapshot->'available' ELSE '0'::jsonb END,
    'open_v2_sessions', v_snapshot->'open_v2_sessions',
    'open_legacy_sessions', v_snapshot->'open_legacy_sessions',
    'reconciliation_required', v_snapshot->'reconciliation_required'
  );
END
$fn$;

-- ---------------------------------------------------------------------------
-- 8. Lifecycle administrativo: envolve a RPC canonica sem copiar seu corpo.
-- ---------------------------------------------------------------------------

DO $rename_admin_delete$
BEGIN
  IF to_regprocedure('public.pdv_admin_delete_company_base(uuid)') IS NULL THEN
    EXECUTE 'ALTER FUNCTION public.admin_delete_company(uuid) '
      || 'RENAME TO pdv_admin_delete_company_base';
  END IF;
END
$rename_admin_delete$;

REVOKE ALL ON FUNCTION public.pdv_admin_delete_company_base(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir empresas.'
      USING ERRCODE = '42501', DETAIL = 'ADMIN_COMPANY_DELETE_FORBIDDEN';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Empresa não informada.'
      USING ERRCODE = '22023', DETAIL = 'ADMIN_COMPANY_ID_REQUIRED';
  END IF;

  -- A funcao-base conserva toda autorizacao e toda ordem historica. A GUC so
  -- libera guards para a mesma empresa, durante esta transacao, e nao e
  -- alcancavel como bypass persistente pelo Data API.
  PERFORM set_config('app.pdv_purge_company', p_company_id::text, true);

  -- Pedido/pagamento referencia a sessao. A base historica apaga contas
  -- financeiras antes do DELETE final da empresa; por isso soltamos primeiro
  -- os filhos PDV do tenant, ja sob o bypass nominal e autorizado da wrapper.
  DELETE FROM public.pdv_order_payments payment
   WHERE payment.company_id = p_company_id;
  DELETE FROM public.pdv_orders order_row
   WHERE order_row.company_id = p_company_id;

  PERFORM public.pdv_admin_delete_company_base(p_company_id);
  PERFORM set_config('app.pdv_purge_company', '', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.pdv_purge_company', '', true);
  RAISE;
END
$fn$;

REVOKE ALL ON FUNCTION public.admin_delete_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_company(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. ACL: RPCs publicas; todos os helpers permanecem internos.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.pdv_open_cash_session_v2(uuid,uuid,numeric,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_open_cash_session_v2(uuid,uuid,numeric,text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pdv_record_cash_event_v2(uuid,uuid,text,numeric,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_record_cash_event_v2(uuid,uuid,text,numeric,text,text,text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pdv_reverse_cash_event_v2(uuid,uuid,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_reverse_cash_event_v2(uuid,uuid,text,text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pdv_close_cash_session_v2(uuid,uuid,numeric,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_close_cash_session_v2(uuid,uuid,numeric,text,text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pdv_cash_snapshot_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pdv_cash_snapshot_v2(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pdv_cash_v2_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_cash_snapshot_v2_internal(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_note_cash_reconciliation_issue(uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_guard_financial_treasury_v2()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_guard_financial_account_treasury_v2()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_block_custody_entry_mutation()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pdv_cash_v2_context() TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_cash_snapshot_v2_internal(uuid,uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_note_cash_reconciliation_issue(uuid,text,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_guard_financial_treasury_v2()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_guard_financial_account_treasury_v2()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_block_custody_entry_mutation()
  TO service_role;

COMMIT;
