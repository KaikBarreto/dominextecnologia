-- Edição atômica de venda do PDV
--
-- A venda original continua ativa enquanto o operador apenas edita na tela.
-- Somente o clique final chama pdv_replace_order, que, numa única transação:
-- valida tenant/assinatura/módulo/permissão, trava a origem e a chave de retry,
-- recusa cobrança ou conciliação já vinculada, cancela a venda pelo caminho
-- canônico, cria a substituta com itens recalculados, reaproveita os anexos e
-- finaliza pelo pdv_settle_order. Qualquer erro desfaz também o cancelamento.

BEGIN;

-- Uma venda pode originar no máximo uma substituta. O lock da RPC entrega uma
-- mensagem amigável; este índice é o cinto estrutural contra qualquer outro
-- caminho de escrita e contra corrida entre duas sessões.
DO $preflight$
DECLARE
  v_source uuid;
BEGIN
  SELECT o.replaces_order_id
    INTO v_source
    FROM public.pdv_orders o
   WHERE o.replaces_order_id IS NOT NULL
   GROUP BY o.replaces_order_id
  HAVING count(*) > 1
   LIMIT 1;

  IF v_source IS NOT NULL THEN
    RAISE EXCEPTION 'Não foi possível ativar a edição atômica: a venda % já possui mais de uma substituta.', v_source
      USING ERRCODE = '23505';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdv_orders_replaces_order
  ON public.pdv_orders (replaces_order_id)
  WHERE replaces_order_id IS NOT NULL;

COMMENT ON INDEX public.uniq_pdv_orders_replaces_order IS
  'Garante uma única venda substituta por original. É o cinto estrutural da pdv_replace_order contra duplo clique, retry concorrente e caminhos de escrita paralelos.';

-- O cliente cria o rascunho, mas todas as mutações posteriores já passam por
-- RPCs SECURITY DEFINER (settle/commit/cancel e, agora, replace). Retirar o
-- UPDATE direto fecha o bypass de trocar status, tenant, número ou datas de
-- auditoria sem executar os efeitos financeiros e de estoque das RPCs.
REVOKE UPDATE ON public.pdv_orders FROM authenticated;

-- Venda finalizada não pode ter o cabeçalho reescrito diretamente. As
-- transições canônicas continuam possíveis: settle altera enquanto o pedido
-- ainda está aguardando pagamento; commit pode resolver stock_id junto com o
-- primeiro stock_committed_at; cancel altera apenas status/campos de estorno.
CREATE OR REPLACE FUNCTION public.pdv_block_paid_order_header_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
BEGIN
  -- Cascades/FKs de limpeza e o expurgo auditado do PDV não são edição humana.
  IF pg_trigger_depth() > 1
     OR NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id)
     OR COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text THEN
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('pago', 'entregue') THEN
    RETURN NEW;
  END IF;

  -- A expedição precisa continuar conseguindo concluir o fluxo balcão. Esta é
  -- a única alteração de delivered_at aceita depois do pagamento: pago vira
  -- entregue, registra a data pela primeira vez e não muda nenhum valor ou
  -- vínculo financeiro do cabeçalho.
  IF OLD.status = 'pago'
     AND NEW.status = 'entregue'
     AND OLD.delivered_at IS NULL
     AND NEW.delivered_at IS NOT NULL
     AND NEW.customer_id       IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.id                IS NOT DISTINCT FROM OLD.id
     AND NEW.company_id        IS NOT DISTINCT FROM OLD.company_id
     AND NEW.number            IS NOT DISTINCT FROM OLD.number
     AND NEW.created_at        IS NOT DISTINCT FROM OLD.created_at
     AND NEW.salesperson_id    IS NOT DISTINCT FROM OLD.salesperson_id
     AND NEW.stock_id          IS NOT DISTINCT FROM OLD.stock_id
     AND NEW.terminal_id       IS NOT DISTINCT FROM OLD.terminal_id
     AND NEW.subtotal          IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.discount_amount   IS NOT DISTINCT FROM OLD.discount_amount
     AND NEW.coupon_id         IS NOT DISTINCT FROM OLD.coupon_id
     AND NEW.points_redeemed   IS NOT DISTINCT FROM OLD.points_redeemed
     AND NEW.total             IS NOT DISTINCT FROM OLD.total
     AND NEW.cash_session_id   IS NOT DISTINCT FROM OLD.cash_session_id
     AND NEW.client_request_id IS NOT DISTINCT FROM OLD.client_request_id
     AND NEW.notes             IS NOT DISTINCT FROM OLD.notes
     AND NEW.paid_at           IS NOT DISTINCT FROM OLD.paid_at
     AND NEW.stock_committed_at IS NOT DISTINCT FROM OLD.stock_committed_at
     AND NEW.cancelled_at      IS NOT DISTINCT FROM OLD.cancelled_at
     AND NEW.cancelled_by      IS NOT DISTINCT FROM OLD.cancelled_by
     AND NEW.cancelled_reason  IS NOT DISTINCT FROM OLD.cancelled_reason
     AND NEW.replaces_order_id IS NOT DISTINCT FROM OLD.replaces_order_id THEN
    RETURN NEW;
  END IF;

  IF NOT (
       NEW.status             IS DISTINCT FROM OLD.status
    OR NEW.id                 IS DISTINCT FROM OLD.id
    OR NEW.company_id         IS DISTINCT FROM OLD.company_id
    OR NEW.number             IS DISTINCT FROM OLD.number
    OR NEW.created_at         IS DISTINCT FROM OLD.created_at
    OR NEW.customer_id        IS DISTINCT FROM OLD.customer_id
    OR NEW.salesperson_id     IS DISTINCT FROM OLD.salesperson_id
    OR NEW.stock_id           IS DISTINCT FROM OLD.stock_id
    OR NEW.terminal_id        IS DISTINCT FROM OLD.terminal_id
    OR NEW.subtotal           IS DISTINCT FROM OLD.subtotal
    OR NEW.discount_amount    IS DISTINCT FROM OLD.discount_amount
    OR NEW.coupon_id          IS DISTINCT FROM OLD.coupon_id
    OR NEW.points_redeemed    IS DISTINCT FROM OLD.points_redeemed
    OR NEW.total              IS DISTINCT FROM OLD.total
    OR NEW.cash_session_id    IS DISTINCT FROM OLD.cash_session_id
    OR NEW.client_request_id  IS DISTINCT FROM OLD.client_request_id
    OR NEW.notes              IS DISTINCT FROM OLD.notes
    OR NEW.paid_at            IS DISTINCT FROM OLD.paid_at
    OR NEW.delivered_at       IS DISTINCT FROM OLD.delivered_at
    OR NEW.stock_committed_at IS DISTINCT FROM OLD.stock_committed_at
    OR NEW.cancelled_at       IS DISTINCT FROM OLD.cancelled_at
    OR NEW.cancelled_by       IS DISTINCT FROM OLD.cancelled_by
    OR NEW.cancelled_reason   IS DISTINCT FROM OLD.cancelled_reason
    OR NEW.replaces_order_id  IS DISTINCT FROM OLD.replaces_order_id
  ) THEN
    RETURN NEW;
  END IF;

  -- pdv_commit_order_stock preenche stock_committed_at e resolve stock_id
  -- somente quando ele estava vazio. Nenhum outro campo protegido pode mudar.
  IF OLD.stock_committed_at IS NULL
     AND NEW.stock_committed_at IS NOT NULL
     AND NEW.stock_id IS NOT NULL
     AND (OLD.stock_id IS NULL OR NEW.stock_id IS NOT DISTINCT FROM OLD.stock_id)
     AND NEW.id                IS NOT DISTINCT FROM OLD.id
     AND NEW.company_id        IS NOT DISTINCT FROM OLD.company_id
     AND NEW.number            IS NOT DISTINCT FROM OLD.number
     AND NEW.created_at        IS NOT DISTINCT FROM OLD.created_at
     AND NEW.customer_id       IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.salesperson_id    IS NOT DISTINCT FROM OLD.salesperson_id
     AND NEW.terminal_id       IS NOT DISTINCT FROM OLD.terminal_id
     AND NEW.subtotal          IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.discount_amount   IS NOT DISTINCT FROM OLD.discount_amount
     AND NEW.coupon_id         IS NOT DISTINCT FROM OLD.coupon_id
     AND NEW.points_redeemed   IS NOT DISTINCT FROM OLD.points_redeemed
     AND NEW.total             IS NOT DISTINCT FROM OLD.total
     AND NEW.cash_session_id   IS NOT DISTINCT FROM OLD.cash_session_id
     AND NEW.client_request_id IS NOT DISTINCT FROM OLD.client_request_id
     AND NEW.notes             IS NOT DISTINCT FROM OLD.notes
     AND NEW.paid_at           IS NOT DISTINCT FROM OLD.paid_at
     AND NEW.delivered_at      IS NOT DISTINCT FROM OLD.delivered_at
     AND NEW.status            IS NOT DISTINCT FROM OLD.status
     AND NEW.cancelled_at      IS NOT DISTINCT FROM OLD.cancelled_at
     AND NEW.cancelled_by      IS NOT DISTINCT FROM OLD.cancelled_by
     AND NEW.cancelled_reason  IS NOT DISTINCT FROM OLD.cancelled_reason
     AND NEW.replaces_order_id IS NOT DISTINCT FROM OLD.replaces_order_id THEN
    RETURN NEW;
  END IF;

  -- pdv_cancel_order preserva a identidade e o cabeçalho comercial, registra
  -- a auditoria do cancelamento e limpa somente o marcador do commit de
  -- estoque. O guard financeiro abaixo ainda valida cobrança/conciliação/fiado.
  IF NEW.status = 'cancelado'
     AND NEW.cancelled_at IS NOT NULL
     AND NEW.cancelled_by IS NOT NULL
     AND NEW.stock_committed_at IS NULL
     AND NEW.id                IS NOT DISTINCT FROM OLD.id
     AND NEW.company_id        IS NOT DISTINCT FROM OLD.company_id
     AND NEW.number            IS NOT DISTINCT FROM OLD.number
     AND NEW.created_at        IS NOT DISTINCT FROM OLD.created_at
     AND NEW.customer_id       IS NOT DISTINCT FROM OLD.customer_id
     AND NEW.salesperson_id    IS NOT DISTINCT FROM OLD.salesperson_id
     AND NEW.stock_id          IS NOT DISTINCT FROM OLD.stock_id
     AND NEW.terminal_id       IS NOT DISTINCT FROM OLD.terminal_id
     AND NEW.subtotal          IS NOT DISTINCT FROM OLD.subtotal
     AND NEW.discount_amount   IS NOT DISTINCT FROM OLD.discount_amount
     AND NEW.coupon_id         IS NOT DISTINCT FROM OLD.coupon_id
     AND NEW.points_redeemed   IS NOT DISTINCT FROM OLD.points_redeemed
     AND NEW.total             IS NOT DISTINCT FROM OLD.total
     AND NEW.cash_session_id   IS NOT DISTINCT FROM OLD.cash_session_id
     AND NEW.client_request_id IS NOT DISTINCT FROM OLD.client_request_id
     AND NEW.notes             IS NOT DISTINCT FROM OLD.notes
     AND NEW.paid_at           IS NOT DISTINCT FROM OLD.paid_at
     AND NEW.delivered_at      IS NOT DISTINCT FROM OLD.delivered_at
     AND NEW.replaces_order_id IS NOT DISTINCT FROM OLD.replaces_order_id THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'O cabeçalho do pedido nº % não pode ser alterado depois da finalização. Cancele e substitua a venda pela edição segura.', OLD.number
    USING ERRCODE = '42501';
END
$guard$;

REVOKE ALL ON FUNCTION public.pdv_block_paid_order_header_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_pdv_orders_block_paid_header_change ON public.pdv_orders;
CREATE TRIGGER tg_pdv_orders_block_paid_header_change
  BEFORE UPDATE OF
    id, company_id, number, created_at, status,
    customer_id, salesperson_id, stock_id, stock_committed_at, terminal_id, subtotal,
    discount_amount, coupon_id, points_redeemed, total, cash_session_id,
    client_request_id, notes, paid_at, delivered_at,
    cancelled_at, cancelled_by, cancelled_reason, replaces_order_id
  ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.pdv_block_paid_order_header_change();

-- pdv_cancel_order é público e continua sendo o caminho de cancelamento fora
-- da edição. A proteção não pode morar apenas em pdv_replace_order: este guard
-- roda quando qualquer caminho tenta mudar o pedido para cancelado. Na RPC
-- canônica ele dispara no UPDATE final; se recusar, o PostgreSQL reverte junto
-- os estornos de estoque, financeiro e ledger feitos antes no mesmo statement.
CREATE OR REPLACE FUNCTION public.pdv_guard_order_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
BEGIN
  IF NEW.status IS DISTINCT FROM 'cancelado'
     OR OLD.status = 'cancelado'
     OR NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = OLD.company_id)
     OR COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text THEN
    RETURN NEW;
  END IF;

  -- Serializa o cancelamento explícito também com cobrança, conciliação e
  -- recebimento parcial concorrentes. Na pdv_cancel_order as mães já foram
  -- atualizadas/lockadas; estes locks são reentrantes e fecham os outros
  -- caminhos que tentem cancelar mudando o status diretamente.
  PERFORM 1
    FROM public.pdv_order_payments pay
   WHERE pay.order_id = OLD.id
     AND pay.company_id = OLD.company_id
   ORDER BY pay.id
   FOR UPDATE;

  PERFORM 1
    FROM public.financial_transactions parent
   WHERE parent.company_id = OLD.company_id
     AND parent.id IN (
       SELECT pay.financial_transaction_id
         FROM public.pdv_order_payments pay
        WHERE pay.order_id = OLD.id
          AND pay.company_id = OLD.company_id
          AND pay.financial_transaction_id IS NOT NULL
     )
   ORDER BY parent.id
   FOR UPDATE;

  PERFORM 1
    FROM public.financial_transactions child
   WHERE child.company_id = OLD.company_id
     AND child.parent_transaction_id IN (
       SELECT pay.financial_transaction_id
         FROM public.pdv_order_payments pay
        WHERE pay.order_id = OLD.id
          AND pay.company_id = OLD.company_id
          AND pay.method = 'fiado'
          AND pay.financial_transaction_id IS NOT NULL
     )
   ORDER BY child.id
   FOR UPDATE;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_order_payments pay
      LEFT JOIN public.financial_transactions t
        ON t.id = pay.financial_transaction_id
       AND t.company_id = OLD.company_id
     WHERE pay.order_id = OLD.id
       AND pay.company_id = OLD.company_id
       AND (pay.tenant_charge_id IS NOT NULL OR t.tenant_charge_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Esta venda possui uma cobrança vinculada. Estorne a cobrança antes de cancelar a venda.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_order_payments pay
      JOIN public.reconciliation_matches rm ON (
        rm.financial_transaction_id = pay.financial_transaction_id
        OR EXISTS (
          SELECT 1
            FROM public.financial_transactions child
           WHERE child.id = rm.financial_transaction_id
             AND child.company_id = OLD.company_id
             AND child.parent_transaction_id = pay.financial_transaction_id
        )
      )
     WHERE pay.order_id = OLD.id
       AND pay.company_id = OLD.company_id
       AND rm.company_id = OLD.company_id
  ) THEN
    RAISE EXCEPTION 'Esta venda possui pagamento conciliado com o extrato bancário. Desfaça a conciliação antes de cancelar a venda.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_order_payments pay
      JOIN public.financial_transactions parent
        ON parent.id = pay.financial_transaction_id
       AND parent.company_id = OLD.company_id
     WHERE pay.order_id = OLD.id
       AND pay.company_id = OLD.company_id
       AND pay.method = 'fiado'
       AND (
         parent.is_paid IS TRUE
         OR COALESCE(parent.amount_received, 0) > 0
         OR EXISTS (
           SELECT 1
             FROM public.financial_transactions child
            WHERE child.parent_transaction_id = parent.id
              AND child.company_id = OLD.company_id
              AND child.category = 'Recebimento parcial'
              AND child.transaction_type::text = 'entrada'
              AND child.cancelled_at IS NULL
         )
       )
  ) THEN
    RAISE EXCEPTION 'Esta venda no fiado já possui recebimento. Estorne as baixas antes de cancelar a venda.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$guard$;

REVOKE ALL ON FUNCTION public.pdv_guard_order_cancellation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_pdv_orders_guard_cancellation ON public.pdv_orders;
CREATE TRIGGER tg_pdv_orders_guard_cancellation
  BEFORE UPDATE OF status ON public.pdv_orders
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_order_cancellation();

-- Fecha a corrida entre uma substituição e um recebimento parcial criado pelo
-- client: os dois serializam na transação-mãe. Se a substituição ganhou, a
-- filha vê o lançamento/pedido cancelado e recusa; se a filha ganhou, a RPC
-- verá is_paid/amount_received/filha viva e manterá a venda original ativa.
CREATE OR REPLACE FUNCTION public.pdv_guard_partial_receipt_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $guard$
DECLARE
  v_parent_cancelled_at timestamptz;
  v_order_status text;
  v_order_number integer;
BEGIN
  IF NEW.parent_transaction_id IS NULL
     OR NEW.category IS DISTINCT FROM 'Recebimento parcial'
     OR NEW.transaction_type::text IS DISTINCT FROM 'entrada' THEN
    RETURN NEW;
  END IF;

  SELECT t.cancelled_at
    INTO v_parent_cancelled_at
    FROM public.financial_transactions t
   WHERE t.id = NEW.parent_transaction_id
     AND t.company_id = NEW.company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT o.status, o.number
    INTO v_order_status, v_order_number
    FROM public.pdv_order_payments pay
    JOIN public.pdv_orders o ON o.id = pay.order_id
   WHERE pay.financial_transaction_id = NEW.parent_transaction_id
     AND pay.company_id = NEW.company_id
     AND o.company_id = NEW.company_id
   LIMIT 1;

  IF FOUND AND (v_parent_cancelled_at IS NOT NULL OR v_order_status = 'cancelado') THEN
    RAISE EXCEPTION 'O pedido PDV nº % foi cancelado e não pode receber baixa parcial.', v_order_number
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$guard$;

REVOKE ALL ON FUNCTION public.pdv_guard_partial_receipt_parent() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_pdv_guard_partial_receipt_parent ON public.financial_transactions;
CREATE TRIGGER tg_pdv_guard_partial_receipt_parent
  BEFORE INSERT OR UPDATE OF parent_transaction_id, category, transaction_type
  ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_partial_receipt_parent();

CREATE OR REPLACE FUNCTION public.pdv_replace_order(
  p_source_order_id   uuid,
  p_order             jsonb,
  p_items             jsonb,
  p_payments          jsonb,
  p_client_request_id text,
  p_transaction_date  date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid                 uuid := auth.uid();
  v_company             uuid;
  v_request_id          text := NULLIF(btrim(COALESCE(p_client_request_id, '')), '');
  v_source              public.pdv_orders;
  v_replacement         public.pdv_orders;
  v_existing_order      record;
  v_unknown_key         text;
  v_customer_id         uuid;
  v_terminal_id         uuid;
  v_stock_id            uuid;
  v_cash_session_id     uuid;
  v_discount_amount     numeric := 0;
  v_notes               text;
  v_item                jsonb;
  v_item_index          integer;
  v_inventory_id        uuid;
  v_description         text;
  v_quantity            numeric;
  v_unit_price          numeric;
  v_unit_cost           numeric;
  v_item_discount       numeric;
  v_item_gross          numeric;
  v_item_total          numeric;
  v_payload_total       numeric;
  v_pay                 jsonb;
  v_pay_index           integer;
  v_method              text;
  v_pay_amount          numeric;
  v_change_amount       numeric;
  v_sum_payments        numeric := 0;
  v_expected_total      numeric;
  v_has_cash            boolean := false;
  v_uses_bank_account   boolean := false;
  v_normalized_items    jsonb := '[]'::jsonb;
  v_subtotal            numeric := 0;
  v_terminal_active     boolean;
  v_session_terminal_id uuid;
  v_new_cash_session_id uuid;
  v_lock_session_id     uuid;
  v_session_status      text;
  v_settle_result       jsonb;
  v_effective_date      date;
  v_attachments         integer := 0;
BEGIN
  -- -----------------------------------------------------------------------
  -- 1) Identidade, tenant, vigência, módulo e permissão fina
  -- -----------------------------------------------------------------------
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre de novo para continuar.' USING ERRCODE = '42501';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a nenhuma empresa.' USING ERRCODE = '42501';
  END IF;

  IF public.tenant_subscription_allows_access(v_company) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A assinatura desta empresa não permite editar vendas agora.' USING ERRCODE = '42501';
  END IF;

  IF public.company_has_module(v_company, 'pdv') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'O módulo PDV e Loja não está ativo nesta empresa.' USING ERRCODE = '42501';
  END IF;

  -- Não usa user_has_permission aqui: o fallback legado daquela função libera
  -- qualquer usuário que tenha role e ainda não tenha user_permissions. Editar
  -- venda paga é mais sensível que vender e exige concessão explícita.
  IF (
    public.is_super_admin(v_uid)
    OR public.is_admin_or_gestor(v_uid)
    OR public.has_full_permissions(v_uid)
    OR EXISTS (
      SELECT 1
        FROM public.user_permissions up
       WHERE up.user_id = v_uid
         AND up.is_active IS TRUE
         AND (up.permissions ? '*' OR up.permissions ? 'fn:edit_pdv_sales')
    )
  ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Sem permissão para editar uma venda já finalizada.' USING ERRCODE = '42501';
  END IF;

  IF p_source_order_id IS NULL THEN
    RAISE EXCEPTION 'Informe a venda original que será substituída.' USING ERRCODE = '22023';
  END IF;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória para editar a venda.' USING ERRCODE = '22023';
  END IF;
  IF length(v_request_id) > 200 THEN
    RAISE EXCEPTION 'A chave de idempotência pode ter no máximo 200 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'Os dados do novo pedido precisam ser um objeto JSON.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Adicione pelo menos um item à venda substituta.' USING ERRCODE = '22023';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'Informe pelo menos uma forma de pagamento.' USING ERRCODE = '22023';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2) Locks e retry. Ordem fixa: venda original, depois chave da requisição.
  -- pdv_cancel_order retomará o primeiro lock e pdv_settle_order tomará o lock
  -- da substituta; advisory locks transacionais são reentrantes na sessão.
  -- -----------------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtextextended('pdv-order:' || p_source_order_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'pdv-replace-request:' || v_company::text || ':' || v_request_id,
    0
  ));

  SELECT *
    INTO v_source
    FROM public.pdv_orders o
   WHERE o.id = p_source_order_id
     AND o.company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    -- Mesma mensagem para ID inexistente e ID de outro tenant: sem oráculo.
    RAISE EXCEPTION 'Venda original não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  -- Retry depois de resposta perdida: devolve somente o resultado já
  -- persistido. O payload do retry não reabre nem modifica a venda concluída.
  SELECT *
    INTO v_replacement
    FROM public.pdv_orders o
   WHERE o.company_id = v_company
     AND o.replaces_order_id = v_source.id
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_replacement.client_request_id = v_request_id
       AND v_replacement.status IN ('pago', 'entregue') THEN
      SELECT min(t.transaction_date)
        INTO v_effective_date
        FROM public.pdv_order_payments pay
        JOIN public.financial_transactions t
          ON t.id = pay.financial_transaction_id
       WHERE pay.order_id = v_replacement.id
         AND pay.company_id = v_company;

      SELECT count(*)
        INTO v_attachments
        FROM public.pdv_order_attachments a
       WHERE a.order_id = v_replacement.id
         AND a.company_id = v_company;

      RETURN public.pdv_order_summary(v_replacement.id)
             || jsonb_build_object(
                  'source_order_id',      v_source.id,
                  'replacement_order_id', v_replacement.id,
                  'idempotente',          true,
                  'avisos',               '[]'::jsonb,
                  'data_lancamento',       v_effective_date,
                  'anexos_reaproveitados', v_attachments
                );
    END IF;

    RAISE EXCEPTION 'A venda original já possui o pedido substituto nº %. Atualize o histórico antes de tentar novamente.',
      v_replacement.number
      USING ERRCODE = '23505';
  END IF;

  -- A mesma chave não pode identificar outra venda ou outro fluxo. O advisory
  -- lock acima fecha a janela entre esta sondagem e o INSERT.
  SELECT o.id, o.number
    INTO v_existing_order
    FROM public.pdv_orders o
   WHERE o.company_id = v_company
     AND o.client_request_id = v_request_id
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Esta edição já foi registrada no pedido nº %.', v_existing_order.number
      USING ERRCODE = '23505';
  END IF;

  IF v_source.status NOT IN ('pago', 'entregue') THEN
    RAISE EXCEPTION 'Somente uma venda paga ou entregue pode ser substituída. O pedido nº % está com status %.',
      v_source.number, v_source.status
      USING ERRCODE = '42501';
  END IF;

  -- Trava primeiro os pagamentos e lançamentos. A conciliação também toma
  -- FOR UPDATE no financial_transactions: se ela ganhou a corrida, veremos o
  -- match; se esta RPC ganhou, ela verá cancelled_at e recusará o casamento.
  PERFORM 1
    FROM public.pdv_order_payments pay
   WHERE pay.order_id = v_source.id
     AND pay.company_id = v_company
   ORDER BY pay.id
   FOR UPDATE;

  PERFORM 1
    FROM public.financial_transactions t
   WHERE t.company_id = v_company
     AND t.id IN (
       SELECT pay.financial_transaction_id
         FROM public.pdv_order_payments pay
        WHERE pay.order_id = v_source.id
          AND pay.company_id = v_company
          AND pay.financial_transaction_id IS NOT NULL
     )
   ORDER BY t.id
   FOR UPDATE;

  -- Filhas de recebimento parcial também ficam estáveis durante a decisão. O
  -- trigger pdv_guard_partial_receipt_parent fecha a janela para filha nova.
  PERFORM 1
    FROM public.financial_transactions child
   WHERE child.company_id = v_company
     AND child.parent_transaction_id IN (
       SELECT pay.financial_transaction_id
         FROM public.pdv_order_payments pay
        WHERE pay.order_id = v_source.id
          AND pay.company_id = v_company
          AND pay.method = 'fiado'
          AND pay.financial_transaction_id IS NOT NULL
     )
   ORDER BY child.id
   FOR UPDATE;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_order_payments pay
      LEFT JOIN public.financial_transactions t
        ON t.id = pay.financial_transaction_id
       AND t.company_id = v_company
     WHERE pay.order_id = v_source.id
       AND pay.company_id = v_company
       AND (pay.tenant_charge_id IS NOT NULL OR t.tenant_charge_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Esta venda possui uma cobrança vinculada. Estorne a cobrança antes de editar a venda.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_order_payments pay
      JOIN public.reconciliation_matches rm ON (
        rm.financial_transaction_id = pay.financial_transaction_id
        OR EXISTS (
          SELECT 1
            FROM public.financial_transactions child
           WHERE child.id = rm.financial_transaction_id
             AND child.company_id = v_company
             AND child.parent_transaction_id = pay.financial_transaction_id
        )
      )
     WHERE pay.order_id = v_source.id
       AND pay.company_id = v_company
       AND rm.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Esta venda possui pagamento conciliado com o extrato bancário. Desfaça a conciliação antes de editar a venda.'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.pdv_order_payments pay
      JOIN public.financial_transactions t
        ON t.id = pay.financial_transaction_id
       AND t.company_id = v_company
     WHERE pay.order_id = v_source.id
       AND pay.company_id = v_company
       AND t.cancelled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A venda original possui lançamento financeiro já cancelado. Revise o histórico antes de substituí-la.'
      USING ERRCODE = '23514';
  END IF;

  -- Fiado deixa de ser uma dívida "virgem" assim que a mãe é quitada, recebe
  -- valor parcial, ganha filha viva ou é conciliada. pdv_cancel_order sozinho
  -- apenas criaria ajuste no ledger e marcaria a mãe cancelada, o que apagaria
  -- contabilmente dinheiro já recebido. Nesses estados a edição falha fechada.
  IF EXISTS (
    SELECT 1
      FROM public.pdv_order_payments pay
      JOIN public.financial_transactions parent
        ON parent.id = pay.financial_transaction_id
       AND parent.company_id = v_company
     WHERE pay.order_id = v_source.id
       AND pay.company_id = v_company
       AND pay.method = 'fiado'
       AND (
         parent.is_paid IS TRUE
         OR COALESCE(parent.amount_received, 0) > 0
         OR EXISTS (
           SELECT 1
             FROM public.financial_transactions child
            WHERE child.parent_transaction_id = parent.id
              AND child.company_id = v_company
              AND child.category = 'Recebimento parcial'
              AND child.transaction_type::text = 'entrada'
              AND child.cancelled_at IS NULL
         )
         OR EXISTS (
           SELECT 1
             FROM public.reconciliation_matches rm
            WHERE rm.company_id = v_company
              AND (
                rm.financial_transaction_id = parent.id
                OR EXISTS (
                  SELECT 1
                    FROM public.financial_transactions child
                   WHERE child.id = rm.financial_transaction_id
                     AND child.parent_transaction_id = parent.id
                )
              )
         )
       )
  ) THEN
    RAISE EXCEPTION 'Esta venda no fiado já possui recebimento ou conciliação. Estorne as baixas antes de editar a venda.'
      USING ERRCODE = '42501';
  END IF;

  -- -----------------------------------------------------------------------
  -- 3) Payload do pedido e referências multi-tenant, ainda antes de cancelar.
  -- -----------------------------------------------------------------------
  SELECT k.key
    INTO v_unknown_key
    FROM jsonb_object_keys(p_order) AS k(key)
   WHERE NOT (k.key = ANY (ARRAY[
     'customer_id', 'terminal_id', 'stock_id', 'cash_session_id',
     'discount_amount', 'notes'
   ]::text[]))
   LIMIT 1;
  IF v_unknown_key IS NOT NULL THEN
    RAISE EXCEPTION 'Campo não permitido em p_order: %.', v_unknown_key USING ERRCODE = '22023';
  END IF;

  IF p_order ? 'customer_id'
     AND jsonb_typeof(p_order->'customer_id') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'customer_id precisa ser UUID ou nulo.' USING ERRCODE = '22023';
  END IF;
  IF p_order ? 'terminal_id'
     AND jsonb_typeof(p_order->'terminal_id') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'terminal_id precisa ser UUID ou nulo.' USING ERRCODE = '22023';
  END IF;
  IF p_order ? 'stock_id'
     AND jsonb_typeof(p_order->'stock_id') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'stock_id precisa ser UUID ou nulo.' USING ERRCODE = '22023';
  END IF;
  IF p_order ? 'cash_session_id'
     AND jsonb_typeof(p_order->'cash_session_id') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'cash_session_id precisa ser UUID ou nulo.' USING ERRCODE = '22023';
  END IF;
  IF p_order ? 'discount_amount'
     AND jsonb_typeof(p_order->'discount_amount') NOT IN ('number', 'null') THEN
    RAISE EXCEPTION 'discount_amount do pedido precisa ser numérico.' USING ERRCODE = '22023';
  END IF;
  IF p_order ? 'notes'
     AND jsonb_typeof(p_order->'notes') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'notes precisa ser texto ou nulo.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_customer_id     := NULLIF(p_order->>'customer_id', '')::uuid;
    v_terminal_id     := NULLIF(p_order->>'terminal_id', '')::uuid;
    v_stock_id        := NULLIF(p_order->>'stock_id', '')::uuid;
    v_cash_session_id := NULLIF(p_order->>'cash_session_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Uma referência do novo pedido não é um UUID válido.' USING ERRCODE = '22023';
  END;

  v_discount_amount := COALESCE((p_order->>'discount_amount')::numeric, 0);
  v_notes := NULLIF(btrim(COALESCE(p_order->>'notes', '')), '');

  IF v_discount_amount < 0 THEN
    RAISE EXCEPTION 'O desconto adicional do pedido não pode ser negativo.' USING ERRCODE = '22023';
  END IF;
  v_discount_amount := round(v_discount_amount, 2);

  PERFORM public.pdv_assert_ref_company('public.customers', v_customer_id, v_company, 'O cliente');
  PERFORM public.pdv_assert_ref_company('public.pdv_terminals', v_terminal_id, v_company, 'O terminal');
  PERFORM public.pdv_assert_ref_company('public.stocks', v_stock_id, v_company, 'O local de estoque');
  PERFORM public.pdv_assert_ref_company('public.pdv_cash_sessions', v_cash_session_id, v_company, 'A sessão de caixa');

  IF v_stock_id IS NOT NULL
     AND public.can_access_stock(v_uid, v_stock_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Sem acesso ao local de estoque escolhido para a venda.' USING ERRCODE = '42501';
  END IF;

  IF v_terminal_id IS NOT NULL THEN
    SELECT t.is_active INTO v_terminal_active
      FROM public.pdv_terminals t
     WHERE t.id = v_terminal_id AND t.company_id = v_company;
    IF v_terminal_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'O terminal escolhido está desativado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_cash_session_id IS NOT NULL AND v_terminal_id IS NOT NULL THEN
    SELECT s.terminal_id INTO v_session_terminal_id
      FROM public.pdv_cash_sessions s
     WHERE s.id = v_cash_session_id AND s.company_id = v_company;
    IF v_session_terminal_id IS DISTINCT FROM v_terminal_id THEN
      RAISE EXCEPTION 'A sessão de caixa informada pertence a outro terminal.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 4) Itens. O cliente não decide total: o servidor recalcula por linha.
  -- -----------------------------------------------------------------------
  FOR v_item, v_item_index IN
    SELECT e.value, e.ordinality::integer
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, ordinality)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'O item % precisa ser um objeto JSON.', v_item_index USING ERRCODE = '22023';
    END IF;

    v_unknown_key := NULL;
    SELECT k.key
      INTO v_unknown_key
      FROM jsonb_object_keys(v_item) AS k(key)
     WHERE NOT (k.key = ANY (ARRAY[
       'inventory_id', 'description', 'quantity', 'unit_price',
       'unit_cost', 'discount_amount', 'total'
     ]::text[]))
     LIMIT 1;
    IF v_unknown_key IS NOT NULL THEN
      RAISE EXCEPTION 'Campo não permitido no item %: %.', v_item_index, v_unknown_key USING ERRCODE = '22023';
    END IF;

    IF NOT (v_item ? 'description') OR jsonb_typeof(v_item->'description') <> 'string' THEN
      RAISE EXCEPTION 'Informe a descrição do item %.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF NOT (v_item ? 'quantity') OR jsonb_typeof(v_item->'quantity') <> 'number' THEN
      RAISE EXCEPTION 'A quantidade do item % precisa ser numérica.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF NOT (v_item ? 'unit_price') OR jsonb_typeof(v_item->'unit_price') <> 'number' THEN
      RAISE EXCEPTION 'O preço unitário do item % precisa ser numérico.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF v_item ? 'inventory_id'
       AND jsonb_typeof(v_item->'inventory_id') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'inventory_id do item % precisa ser UUID ou nulo.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF v_item ? 'unit_cost'
       AND jsonb_typeof(v_item->'unit_cost') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'O custo unitário do item % precisa ser numérico.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF v_item ? 'discount_amount'
       AND jsonb_typeof(v_item->'discount_amount') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'O desconto do item % precisa ser numérico.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF v_item ? 'total'
       AND jsonb_typeof(v_item->'total') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'O total informado do item % precisa ser numérico.', v_item_index USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_inventory_id := NULLIF(v_item->>'inventory_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'inventory_id do item % não é um UUID válido.', v_item_index USING ERRCODE = '22023';
    END;

    v_description   := NULLIF(btrim(COALESCE(v_item->>'description', '')), '');
    v_quantity      := (v_item->>'quantity')::numeric;
    v_unit_price    := (v_item->>'unit_price')::numeric;
    v_unit_cost     := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_item_discount := COALESCE((v_item->>'discount_amount')::numeric, 0);

    IF v_description IS NULL THEN
      RAISE EXCEPTION 'A descrição do item % não pode ficar vazia.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'A quantidade do item % precisa ser maior que zero.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'O preço unitário do item % não pode ser negativo.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF v_unit_cost < 0 THEN
      RAISE EXCEPTION 'O custo unitário do item % não pode ser negativo.', v_item_index USING ERRCODE = '22023';
    END IF;
    IF v_item_discount < 0 THEN
      RAISE EXCEPTION 'O desconto do item % não pode ser negativo.', v_item_index USING ERRCODE = '22023';
    END IF;

    -- Primeiro valida os valores originais para que um negativo fracionário
    -- (por exemplo, -0,004) não vire zero pelo arredondamento. Depois grava e
    -- calcula somente com os mesmos valores normalizados que ficarão na linha.
    IF v_item_discount > v_quantity * v_unit_price THEN
      RAISE EXCEPTION 'O desconto do item % não pode ser maior que o valor bruto da linha (%).',
        v_item_index, round(v_quantity * v_unit_price, 2)
        USING ERRCODE = '23514';
    END IF;

    v_unit_price    := round(v_unit_price, 2);
    v_unit_cost     := round(v_unit_cost, 2);
    v_item_discount := round(v_item_discount, 2);
    v_item_gross := round(v_quantity * v_unit_price, 2);
    IF v_item_discount > v_item_gross THEN
      RAISE EXCEPTION 'O desconto do item % não pode ser maior que o valor bruto da linha (%).',
        v_item_index, round(v_item_gross, 2)
        USING ERRCODE = '23514';
    END IF;

    v_item_total := round(GREATEST(v_quantity * v_unit_price - v_item_discount, 0), 2);

    IF v_item ? 'total' AND jsonb_typeof(v_item->'total') = 'number' THEN
      v_payload_total := (v_item->>'total')::numeric;
      IF v_payload_total < 0
         OR round(v_payload_total, 2) IS DISTINCT FROM v_item_total THEN
        RAISE EXCEPTION 'O total do item % não confere. Esperado: %.',
          v_item_index, round(v_item_total, 2)
          USING ERRCODE = '23514';
      END IF;
    END IF;

    PERFORM public.pdv_assert_ref_company(
      'public.inventory', v_inventory_id, v_company, 'O produto do item ' || v_item_index::text
    );

    v_subtotal := v_subtotal + v_item_total;
    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'inventory_id',    v_inventory_id,
      'description',     v_description,
      'quantity',        v_quantity,
      'unit_price',      v_unit_price,
      'unit_cost',       v_unit_cost,
      'discount_amount', v_item_discount,
      'total',           v_item_total,
      'sort_order',      v_item_index - 1
    ));
  END LOOP;

  v_subtotal := round(v_subtotal, 2);
  v_expected_total := round(GREATEST(v_subtotal - v_discount_amount, 0), 2);
  IF v_expected_total <= 0 THEN
    RAISE EXCEPTION 'O total da venda substituta ficou em zero. Revise os descontos antes de finalizar.'
      USING ERRCODE = '22023';
  END IF;

  -- Validação adicional à pdv_settle_order: esta operação sensível exige soma
  -- EXATA em centavos, não a tolerância histórica de um centavo. Também fecha
  -- o troco fora de dinheiro e impede introduzir nova cobrança no replacement.
  FOR v_pay, v_pay_index IN
    SELECT e.value, e.ordinality::integer
      FROM jsonb_array_elements(p_payments) WITH ORDINALITY AS e(value, ordinality)
  LOOP
    IF jsonb_typeof(v_pay) <> 'object' THEN
      RAISE EXCEPTION 'O pagamento % precisa ser um objeto JSON.', v_pay_index USING ERRCODE = '22023';
    END IF;
    IF NOT (v_pay ? 'method') OR jsonb_typeof(v_pay->'method') <> 'string' THEN
      RAISE EXCEPTION 'Escolha a forma do pagamento %.', v_pay_index USING ERRCODE = '22023';
    END IF;
    IF NOT (v_pay ? 'amount') OR jsonb_typeof(v_pay->'amount') <> 'number' THEN
      RAISE EXCEPTION 'O valor do pagamento % precisa ser numérico.', v_pay_index USING ERRCODE = '22023';
    END IF;
    IF v_pay ? 'change_amount'
       AND jsonb_typeof(v_pay->'change_amount') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'O troco do pagamento % precisa ser numérico.', v_pay_index USING ERRCODE = '22023';
    END IF;

    v_method        := NULLIF(btrim(v_pay->>'method'), '');
    v_pay_amount    := round((v_pay->>'amount')::numeric, 2);
    v_change_amount := COALESCE((v_pay->>'change_amount')::numeric, 0);

    IF v_method IS NULL
       OR v_method NOT IN ('dinheiro', 'pix', 'transferencia', 'debito', 'credito', 'fiado') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida no pagamento %: %.', v_pay_index, COALESCE(v_method, '(vazia)')
        USING ERRCODE = '22023';
    END IF;
    IF v_pay_amount <= 0 THEN
      RAISE EXCEPTION 'O valor do pagamento % precisa ser maior que zero.', v_pay_index USING ERRCODE = '22023';
    END IF;
    IF v_change_amount < 0 THEN
      RAISE EXCEPTION 'O troco do pagamento % não pode ser negativo.', v_pay_index USING ERRCODE = '22023';
    END IF;
    IF v_method <> 'dinheiro' AND v_change_amount <> 0 THEN
      RAISE EXCEPTION 'Troco só pode ser informado em pagamento em dinheiro.' USING ERRCODE = '22023';
    END IF;
    v_change_amount := round(v_change_amount, 2);
    IF NULLIF(btrim(COALESCE(v_pay->>'tenant_charge_id', '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'A venda substituta não pode reutilizar nem criar cobrança neste fluxo. Finalize com pagamento manual ou gere uma nova cobrança fora da edição.'
        USING ERRCODE = '42501';
    END IF;

    v_sum_payments := v_sum_payments + v_pay_amount;
    v_has_cash := v_has_cash OR v_method = 'dinheiro';
    v_uses_bank_account := v_uses_bank_account
      OR v_method IN ('pix', 'transferencia', 'debito', 'credito');
  END LOOP;

  v_sum_payments := round(v_sum_payments, 2);
  IF v_sum_payments IS DISTINCT FROM v_expected_total THEN
    RAISE EXCEPTION 'A soma dos pagamentos (%) precisa ser exatamente igual ao total da venda (%).',
      round(v_sum_payments, 2), round(v_expected_total, 2)
      USING ERRCODE = '23514';
  END IF;

  IF v_uses_bank_account
     AND public.can_use_bank_accounts(v_uid) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Sem permissão para usar contas bancárias nesta edição de venda.' USING ERRCODE = '42501';
  END IF;

  -- Resolve a sessão exatamente como pdv_settle_order para poder tomar a mesma
  -- trava do fechamento antes de cancelar a origem. As duas IDs são travadas
  -- em ordem determinística, evitando inversão quando vendas cruzam sessões.
  v_new_cash_session_id := v_cash_session_id;
  IF v_new_cash_session_id IS NULL AND v_terminal_id IS NOT NULL THEN
    SELECT s.id INTO v_new_cash_session_id
      FROM public.pdv_cash_sessions s
     WHERE s.terminal_id = v_terminal_id
       AND s.company_id = v_company
       AND s.status = 'aberta'
     LIMIT 1;
  END IF;
  IF v_new_cash_session_id IS NULL THEN
    SELECT s.id INTO v_new_cash_session_id
      FROM public.pdv_cash_sessions s
     WHERE s.company_id = v_company
       AND s.status = 'aberta'
       AND s.opened_by = v_uid
     ORDER BY s.opened_at DESC
     LIMIT 1;
  END IF;

  FOR v_lock_session_id IN
    SELECT DISTINCT x.session_id
      FROM unnest(ARRAY[v_source.cash_session_id, v_new_cash_session_id]::uuid[]) AS x(session_id)
     WHERE x.session_id IS NOT NULL
     ORDER BY x.session_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'pdv-cash-session:' || v_lock_session_id::text,
      0
    ));
  END LOOP;

  PERFORM 1
    FROM public.pdv_cash_sessions s
   WHERE s.id = ANY (ARRAY[v_source.cash_session_id, v_new_cash_session_id]::uuid[])
     AND s.company_id = v_company
   ORDER BY s.id
   FOR UPDATE;

  IF v_source.cash_session_id IS NOT NULL THEN
    SELECT s.status INTO v_session_status
      FROM public.pdv_cash_sessions s
     WHERE s.id = v_source.cash_session_id
       AND s.company_id = v_company;
    IF v_session_status IS DISTINCT FROM 'aberta' THEN
      RAISE EXCEPTION 'A venda original pertence a um caixa já fechado. Reabra o período por um ajuste contábil; esta venda não pode ser substituída.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_new_cash_session_id IS NOT NULL THEN
    SELECT s.status INTO v_session_status
      FROM public.pdv_cash_sessions s
     WHERE s.id = v_new_cash_session_id
       AND s.company_id = v_company;
    IF v_session_status IS DISTINCT FROM 'aberta' THEN
      RAISE EXCEPTION 'A sessão escolhida para a nova venda já foi fechada.' USING ERRCODE = '42501';
    END IF;
  ELSIF v_has_cash THEN
    RAISE EXCEPTION 'Abra o caixa antes de receber em dinheiro.' USING ERRCODE = '42501';
  END IF;

  -- Persiste a sessão que foi efetivamente validada/travada. Para venda sem
  -- dinheiro isto preserva o comportamento do settle (associa caixa aberto se
  -- houver); com dinheiro elimina qualquer nova resolução entre os passos.
  v_cash_session_id := v_new_cash_session_id;

  -- -----------------------------------------------------------------------
  -- 5) Escrita atômica. O trigger de replaces_order_id exige a origem já
  -- cancelada, por isso o cancelamento canônico vem imediatamente antes do
  -- INSERT. Ainda é a mesma transação: qualquer erro abaixo restaura a origem.
  -- -----------------------------------------------------------------------
  PERFORM public.pdv_cancel_order(
    v_source.id,
    'Venda substituída por edição atômica (' || v_request_id || ')'
  );

  INSERT INTO public.pdv_orders (
    company_id, customer_id, salesperson_id, stock_id, terminal_id, status,
    discount_amount, cash_session_id, client_request_id, notes,
    replaces_order_id
  ) VALUES (
    v_company, v_customer_id, v_uid, v_stock_id, v_terminal_id,
    'aguardando_pagamento', v_discount_amount, v_cash_session_id,
    v_request_id, v_notes, v_source.id
  )
  RETURNING * INTO v_replacement;

  INSERT INTO public.pdv_order_items (
    company_id, order_id, inventory_id, description, quantity,
    unit_price, unit_cost, discount_amount, total, sort_order
  )
  SELECT
    v_company, v_replacement.id, i.inventory_id, i.description, i.quantity,
    i.unit_price, i.unit_cost, i.discount_amount, i.total, i.sort_order
    FROM jsonb_to_recordset(v_normalized_items) AS i(
      inventory_id uuid,
      description text,
      quantity numeric,
      unit_price numeric,
      unit_cost numeric,
      discount_amount numeric,
      total numeric,
      sort_order integer
    );

  -- O mesmo objeto privado pode documentar as duas pontas da cadeia. Copiar a
  -- linha preserva o histórico da original e reaproveita o upload, exatamente
  -- como o fluxo anterior fazia no cliente, agora dentro da transação.
  INSERT INTO public.pdv_order_attachments (
    company_id, order_id, storage_path, file_name, mime_type, size_bytes,
    uploaded_by, uploaded_at
  )
  SELECT
    a.company_id, v_replacement.id, a.storage_path, a.file_name, a.mime_type,
    a.size_bytes, a.uploaded_by, a.uploaded_at
    FROM public.pdv_order_attachments a
   WHERE a.order_id = v_source.id
     AND a.company_id = v_company
  ON CONFLICT (order_id, storage_path) DO NOTHING;
  GET DIAGNOSTICS v_attachments = ROW_COUNT;

  -- Reutiliza o caminho financeiro/estoque existente. Ele valida pagamentos,
  -- contas, caixa, fiado e estoque e toda falha propaga, revertendo esta função.
  v_settle_result := public.pdv_settle_order(
    v_replacement.id,
    p_payments,
    v_request_id,
    p_transaction_date
  );

  RETURN v_settle_result
         || jsonb_build_object(
              'source_order_id',       v_source.id,
              'replacement_order_id',  v_replacement.id,
              'idempotente',           false,
              'anexos_reaproveitados', v_attachments
            );
END
$fn$;

COMMENT ON FUNCTION public.pdv_replace_order(uuid, jsonb, jsonb, jsonb, text, date) IS
  'Substitui uma venda paga/entregue do PDV numa única transação. Exige assinatura e módulo ativos e admin/gestor, super_admin, permissões totais/* ou fn:edit_pdv_sales explícita. Serializa por venda e chave do cliente; retry devolve a substituta já persistida. Recusa cobrança vinculada e qualquer financial_transaction da origem já conciliado. Cancela a origem pela pdv_cancel_order, cria pedido/itens (total de linha recalculado no servidor), copia metadados dos anexos e finaliza pela pdv_settle_order. Se criar/finalizar a substituta falhar, o cancelamento da origem também sofre rollback.';

REVOKE ALL ON FUNCTION public.pdv_replace_order(uuid, jsonb, jsonb, jsonb, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_replace_order(uuid, jsonb, jsonb, jsonb, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.pdv_replace_order(uuid, jsonb, jsonb, jsonb, text, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_replace_order(uuid, jsonb, jsonb, jsonb, text, date)
  TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- Self-checks: assinatura única, DEFAULT, SECURITY DEFINER/search_path, ACL,
-- RLS do agregado e os dois cintos de unicidade necessários ao retry.
-- -------------------------------------------------------------------------
DO $self_check$
DECLARE
  v_count integer;
  v_proc  record;
  v_oid   oid := 'public.pdv_replace_order(uuid,jsonb,jsonb,jsonb,text,date)'::regprocedure::oid;
BEGIN
  SELECT count(*)
    INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'pdv_replace_order';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'pdv_replace_order ficou com % assinaturas; esperado exatamente 1.', v_count;
  END IF;

  SELECT p.pronargs, p.pronargdefaults, p.prosecdef, p.proconfig
    INTO v_proc
    FROM pg_proc p
   WHERE p.oid = v_oid;

  IF v_proc.pronargs <> 6 OR v_proc.pronargdefaults <> 1 THEN
    RAISE EXCEPTION 'Contrato inválido de pdv_replace_order: esperado 6 argumentos e 1 DEFAULT.';
  END IF;
  IF v_proc.prosecdef IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'pdv_replace_order precisa ser SECURITY DEFINER.';
  END IF;
  IF NOT (COALESCE(v_proc.proconfig, '{}'::text[]) @> ARRAY['search_path=public, extensions']::text[]) THEN
    RAISE EXCEPTION 'pdv_replace_order precisa de search_path fixo public, extensions.';
  END IF;

  -- anon herda PUBLIC; checar anon depois dos dois REVOKEs detecta tanto grant
  -- direto quanto grant residual em PUBLIC.
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: anon/PUBLIC não pode executar pdv_replace_order.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated e service_role precisam executar pdv_replace_order.';
  END IF;

  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.pdv_orders'::regclass) THEN
    RAISE EXCEPTION 'RLS precisa continuar ativa em pdv_orders.';
  END IF;

  IF has_table_privilege('authenticated', 'public.pdv_orders', 'UPDATE')
     OR has_any_column_privilege('authenticated', 'public.pdv_orders', 'UPDATE') THEN
    RAISE EXCEPTION 'ACL: authenticated não pode atualizar pdv_orders diretamente; use as RPCs canônicas.';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.pdv_orders', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.pdv_orders', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.pdv_orders', 'DELETE') THEN
    RAISE EXCEPTION 'ACL: SELECT/INSERT/DELETE de pdv_orders precisam permanecer compatíveis com o fluxo atual.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
     WHERE i.indexrelid = 'public.uniq_pdv_orders_replaces_order'::regclass
       AND i.indisunique
       AND i.indisvalid
  ) THEN
    RAISE EXCEPTION 'Índice único de replaces_order_id ausente ou inválido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_index i
     WHERE i.indexrelid = 'public.uniq_pdv_orders_company_client_request'::regclass
       AND i.indisunique
       AND i.indisvalid
  ) THEN
    RAISE EXCEPTION 'Índice único de client_request_id do PDV ausente ou inválido.';
  END IF;

  IF has_function_privilege('authenticated', 'public.pdv_block_paid_order_header_change()'::regprocedure::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pdv_guard_order_cancellation()'::regprocedure::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pdv_guard_partial_receipt_parent()'::regprocedure::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: funções internas de trigger não podem ser executadas por authenticated.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.pdv_orders'::regclass
       AND t.tgname = 'tg_pdv_orders_block_paid_header_change'
       AND NOT t.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.pdv_orders'::regclass
       AND t.tgname = 'tg_pdv_orders_guard_cancellation'
       AND NOT t.tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.financial_transactions'::regclass
       AND t.tgname = 'tg_pdv_guard_partial_receipt_parent'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Triggers de imutabilidade/concorrência da edição atômica estão ausentes.';
  END IF;

  RAISE NOTICE 'Conferido: pdv_replace_order atômica, ACL fechada, RLS ativa, triggers de proteção e unicidade de substituta/idempotência válidos.';
END
$self_check$;

COMMIT;
