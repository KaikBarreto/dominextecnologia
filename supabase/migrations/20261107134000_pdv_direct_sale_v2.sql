-- W2-02: venda direta v2 atomica sobre custodia, reserva, entrega e FIFO.
-- Expand only: RPC fechada para authenticated ate a ativacao/UI separada.
BEGIN;

-- Snapshot economico do pedido direto. Nullable para os pedidos v1 e para os
-- pedidos v2 de outras ondas, que continuam com seus contratos inalterados.
ALTER TABLE public.pdv_orders
  ADD COLUMN IF NOT EXISTS transaction_date_v2 date;

COMMENT ON COLUMN public.pdv_orders.transaction_date_v2 IS
  'Data civil de competência congelada por writers v2 que suportam retrodatação. NULL no legado e nos fluxos v2 que ainda não aderiram ao snapshot.';

-- A entrega imediata da venda direta deve reconhecer receita/CMV na data
-- econômica escolhida, sem deslocar a custódia física da sessão atual. Para
-- outros pedidos v2, o fallback preserva a data civil real da entrega.
CREATE OR REPLACE FUNCTION public.pdv_snapshot_delivery_recognition_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_item public.pdv_order_items%ROWTYPE;
  v_delivery public.pdv_deliveries%ROWTYPE;
  v_order_transaction_date date;
  v_prior_quantity numeric;
  v_timezone text;
BEGIN
  SELECT item.* INTO v_item
    FROM public.pdv_order_items item
   WHERE item.id = NEW.order_item_id
     AND item.company_id = NEW.company_id;
  IF NOT FOUND OR v_item.contract_version IS DISTINCT FROM 2 THEN
    RETURN NEW;
  END IF;

  SELECT delivery.*
    INTO v_delivery
    FROM public.pdv_deliveries delivery
   WHERE delivery.id = NEW.delivery_id
     AND delivery.company_id = NEW.company_id;
  IF NOT FOUND OR v_delivery.order_id <> v_item.order_id THEN
    RAISE EXCEPTION 'A entrega não pertence ao pedido informado.'
      USING ERRCODE = '23514', DETAIL = 'PDV_RECOGNITION_DELIVERY_ORDER_MISMATCH';
  END IF;

  SELECT order_row.transaction_date_v2
    INTO v_order_transaction_date
    FROM public.pdv_orders order_row
   WHERE order_row.id = v_delivery.order_id
     AND order_row.company_id = NEW.company_id;

  SELECT COALESCE(sum(item.quantity), 0)
    INTO v_prior_quantity
    FROM public.pdv_delivery_items item
   WHERE item.order_item_id = NEW.order_item_id;
  IF v_prior_quantity + NEW.quantity > v_item.quantity THEN
    RAISE EXCEPTION 'A entrega ultrapassa a quantidade comercial do item.'
      USING ERRCODE = '23514', DETAIL = 'PDV_RECOGNITION_QUANTITY_EXCEEDED';
  END IF;

  SELECT COALESCE(settings.timezone, 'America/Sao_Paulo')
    INTO v_timezone
    FROM public.company_settings settings
   WHERE settings.company_id = NEW.company_id;
  v_timezone := COALESCE(v_timezone, 'America/Sao_Paulo');

  NEW.commercial_amount_snapshot := round(
    v_item.total * (v_prior_quantity + NEW.quantity) / v_item.quantity, 2
  ) - round(v_item.total * v_prior_quantity / v_item.quantity, 2);
  NEW.cmv_amount_snapshot := CASE
    WHEN NEW.unit_cost_snapshot IS NULL THEN NULL
    ELSE round(NEW.unit_cost_snapshot * NEW.quantity, 2)
  END;
  NEW.recognition_date := COALESCE(
    v_order_transaction_date,
    (v_delivery.created_at AT TIME ZONE v_timezone)::date
  );
  NEW.recognition_contract_version := 2;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.pdv_snapshot_delivery_recognition_v2()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_complete_direct_sale_v2(
  p_terminal_id uuid,
  p_cash_session_id uuid,
  p_cash_account_id uuid,
  p_customer_id uuid,
  p_cart jsonb,
  p_payments jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $fn$
DECLARE
  v_context record;
  v_uid uuid;
  v_company uuid;
  v_cart_input jsonb;
  v_cart jsonb;
  v_priced_cart jsonb := '[]'::jsonb;
  v_payments jsonb;
  v_payload jsonb;
  v_claim record;
  v_terminal public.pdv_terminals%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_account_ids uuid[];
  v_stock_count integer;
  v_line jsonb;
  v_payment jsonb;
  v_inventory public.inventory%ROWTYPE;
  v_order_id uuid := gen_random_uuid();
  v_order_number integer;
  v_order_item_id uuid;
  v_reservation public.pdv_stock_reservation_items%ROWTYPE;
  v_delivery_lines jsonb := '[]'::jsonb;
  v_delivery jsonb;
  v_settlement_ids uuid[] := ARRAY[]::uuid[];
  v_settlement_id uuid;
  v_receivable_id uuid;
  v_method text;
  v_amount numeric(14,2);
  v_change_amount numeric(14,2);
  v_unit_price numeric;
  v_line_discount numeric(14,2);
  v_line_gross numeric(14,2);
  v_line_net numeric(14,2);
  v_order_discount numeric := 0;
  v_order_discount_allocated numeric(14,2);
  v_account_id uuid;
  v_due_date date;
  v_subtotal numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_payment_total numeric(14,2) := 0;
  v_fiado_total numeric(14,2) := 0;
  v_open_credit numeric(14,2) := 0;
  v_all_settled boolean := false;
  v_today date;
  v_transaction_date date;
  v_notes text;
  v_timezone text;
  v_paid_at timestamptz;
  v_sort integer := 0;
  v_result jsonb;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  v_uid := v_context.user_id;
  v_company := v_context.company_id;
  v_today := public.company_today(v_company);

  IF NOT public.is_admin_or_gestor(v_uid)
     AND NOT public.is_super_admin(v_uid)
     AND public.pdv_has_explicit_action_permission_v2(
       v_uid, 'fn:complete_direct_sale'
     ) IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'Você não tem permissão para concluir venda direta.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_forbidden';
  END IF;
  IF p_terminal_id IS NULL OR p_cash_session_id IS NULL
     OR p_cash_account_id IS NULL
  THEN
    RAISE EXCEPTION 'Informe o terminal e o caixa aberto desta venda.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_context_required';
  END IF;
  IF p_cart IS NULL OR jsonb_typeof(p_cart) NOT IN ('array','object')
     OR p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array'
  THEN
    RAISE EXCEPTION 'Informe um carrinho e as formas de cobertura válidas.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_payload_invalid';
  END IF;

  -- Array antigo permanece aceito somente como compatibilidade de rollout;
  -- o contrato v2 oficial e o objeto com cabecalho e items.
  IF jsonb_typeof(p_cart) = 'array' THEN
    v_cart_input := p_cart;
    v_order_discount := 0;
    v_notes := NULL;
    v_transaction_date := v_today;
  ELSE
    IF (p_cart - ARRAY[
      'items','order_discount_amount','notes','transaction_date'
    ]::text[]) <> '{}'::jsonb
       OR jsonb_typeof(p_cart->'items') IS DISTINCT FROM 'array'
       OR (p_cart ? 'notes' AND jsonb_typeof(p_cart->'notes') NOT IN ('string','null'))
       OR (p_cart ? 'transaction_date'
           AND jsonb_typeof(p_cart->'transaction_date') NOT IN ('string','null'))
       OR (p_cart ? 'order_discount_amount'
           AND jsonb_typeof(p_cart->'order_discount_amount') NOT IN ('number','null'))
    THEN
      RAISE EXCEPTION 'O carrinho possui campos não reconhecidos.'
        USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_cart_header_invalid';
    END IF;
    v_cart_input := p_cart->'items';
    BEGIN
      v_order_discount := COALESCE(
        NULLIF(p_cart->>'order_discount_amount','')::numeric,0
      );
      v_transaction_date := COALESCE(
        NULLIF(p_cart->>'transaction_date','')::date,v_today
      );
    EXCEPTION WHEN data_exception THEN
      RAISE EXCEPTION 'Desconto ou data do carrinho é inválido.'
        USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_header_value_invalid';
    END;
    v_notes := NULLIF(btrim(COALESCE(p_cart->>'notes','')),'');
  END IF;

  IF jsonb_array_length(v_cart_input) = 0
     OR jsonb_array_length(v_cart_input) > 100
     OR v_order_discount < 0
     OR v_order_discount <> round(v_order_discount,2)
     OR lower(v_order_discount::text) IN ('nan','infinity','-infinity')
     OR length(COALESCE(v_notes,'')) > 2000
  THEN
    RAISE EXCEPTION 'Informe itens, desconto e observações válidos.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_cart_header_invalid';
  END IF;
  IF v_transaction_date > v_today THEN
    RAISE EXCEPTION 'Esta data não pode ser no futuro. Já foi pago (ou recebido) é, no máximo, hoje.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_future_date';
  END IF;
  IF v_transaction_date < v_today
     AND NOT public.is_admin_or_gestor(v_uid)
     AND NOT public.is_super_admin(v_uid)
     AND public.pdv_has_explicit_action_permission_v2(
       v_uid,'fn:backdate_pdv_sale'
     ) IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'Você não tem permissão para retroceder a data desta venda.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_backdate_forbidden';
  END IF;
  IF v_order_discount > 0
     AND NOT public.is_admin_or_gestor(v_uid)
     AND NOT public.is_super_admin(v_uid)
     AND public.pdv_has_explicit_action_permission_v2(
       v_uid,'fn:apply_pdv_discount'
     ) IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'Você não tem permissão para aplicar desconto nesta venda.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_discount_forbidden';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cart_input) line
     WHERE jsonb_typeof(line) <> 'object'
        OR NOT (line ? 'inventory_id') OR NOT (line ? 'stock_id')
        OR NOT (line ? 'quantity')
        OR (line - ARRAY[
          'inventory_id','stock_id','quantity','unit_price','discount_amount',
          'unit_cost','cost'
        ]::text[]) <> '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'Cada item deve informar somente material, local e quantidade.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_cart_shape_invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cart_input) line
     WHERE lower(btrim(COALESCE(line->>'quantity',''))) IN (
       'nan','infinity','-infinity'
     )
        OR lower(btrim(COALESCE(line->>'unit_price',''))) IN (
          'nan','infinity','-infinity'
        )
        OR lower(btrim(COALESCE(line->>'discount_amount',''))) IN (
          'nan','infinity','-infinity'
        )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payments) payment
     WHERE lower(btrim(COALESCE(payment->>'amount',''))) IN (
       'nan','infinity','-infinity'
     )
  ) THEN
    RAISE EXCEPTION 'Quantidade e valor devem ser números finitos.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_non_finite';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_payments) payment
     WHERE jsonb_typeof(payment) <> 'object'
        OR NOT (payment ? 'method') OR NOT (payment ? 'amount')
        OR (payment - ARRAY[
          'method','amount','change_amount','account_id','due_date'
        ]::text[])
           <> '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'Cada cobertura deve informar somente método, valor, conta e vencimento.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_payment_shape_invalid';
  END IF;

  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'inventory_id', NULLIF(line->>'inventory_id','')::uuid,
      'stock_id', NULLIF(line->>'stock_id','')::uuid,
      'quantity', trim_scale(NULLIF(line->>'quantity','')::numeric),
      'unit_price', CASE WHEN NULLIF(line->>'unit_price','') IS NULL
        THEN NULL ELSE trim_scale((line->>'unit_price')::numeric) END,
      'discount_amount', trim_scale(
        COALESCE(NULLIF(line->>'discount_amount','')::numeric,0)
      )
    ) ORDER BY NULLIF(line->>'inventory_id','')::uuid,
               NULLIF(line->>'stock_id','')::uuid)
      INTO v_cart
      FROM jsonb_array_elements(v_cart_input) line;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'method', lower(btrim(payment->>'method')),
      'amount', round(NULLIF(payment->>'amount','')::numeric,2),
      'change_amount', round(
        COALESCE(NULLIF(payment->>'change_amount','')::numeric,0),2
      ),
      'account_id', NULLIF(payment->>'account_id','')::uuid,
      'due_date', NULLIF(payment->>'due_date','')::date
    ) ORDER BY lower(btrim(payment->>'method')),
               NULLIF(payment->>'account_id','')::uuid NULLS FIRST,
               NULLIF(payment->>'due_date','')::date NULLS FIRST),
      '[]'::jsonb)
      INTO v_payments
      FROM jsonb_array_elements(p_payments) payment;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Carrinho ou cobertura contém identificador ou valor inválido.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_value_invalid';
  END;
  v_payments := COALESCE(v_payments, '[]'::jsonb);

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cart) line
     WHERE NULLIF(line->>'inventory_id','')::uuid IS NULL
        OR NULLIF(line->>'stock_id','')::uuid IS NULL
        OR NULLIF(line->>'quantity','')::numeric IS NULL
        OR NULLIF(line->>'quantity','')::numeric <= 0
        OR scale(NULLIF(line->>'quantity','')::numeric) > 6
        OR lower(line->>'quantity') IN ('nan','infinity','-infinity')
        OR (line->>'unit_price' IS NOT NULL AND (
          NULLIF(line->>'unit_price','')::numeric < 0
          OR NULLIF(line->>'unit_price','')::numeric <>
             round(NULLIF(line->>'unit_price','')::numeric,2)
          OR lower(line->>'unit_price') IN ('nan','infinity','-infinity')
        ))
        OR NULLIF(line->>'discount_amount','')::numeric < 0
        OR NULLIF(line->>'discount_amount','')::numeric <>
           round(NULLIF(line->>'discount_amount','')::numeric,2)
        OR lower(line->>'discount_amount') IN ('nan','infinity','-infinity')
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cart) line
     GROUP BY NULLIF(line->>'inventory_id','')::uuid,
              NULLIF(line->>'stock_id','')::uuid
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Os itens devem ser únicos e ter quantidade positiva válida.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_cart_invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cart) line
     WHERE NULLIF(line->>'discount_amount','')::numeric > 0
  )
     AND NOT public.is_admin_or_gestor(v_uid)
     AND NOT public.is_super_admin(v_uid)
     AND public.pdv_has_explicit_action_permission_v2(
       v_uid,'fn:apply_pdv_discount'
     ) IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'Você não tem permissão para aplicar desconto nesta venda.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_discount_forbidden';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_payments) payment
     WHERE payment->>'method' NOT IN (
       'dinheiro','pix','transferencia','debito','credito','fiado'
     )
        OR NULLIF(payment->>'amount','')::numeric IS NULL
        OR NULLIF(payment->>'amount','')::numeric <= 0
        OR NULLIF(payment->>'amount','')::numeric <>
           round(NULLIF(payment->>'amount','')::numeric,2)
        OR lower(payment->>'amount') IN ('nan','infinity','-infinity')
        OR NULLIF(payment->>'change_amount','')::numeric < 0
        OR NULLIF(payment->>'change_amount','')::numeric <>
           round(NULLIF(payment->>'change_amount','')::numeric,2)
        OR lower(payment->>'change_amount') IN ('nan','infinity','-infinity')
        OR (payment->>'method' <> 'dinheiro'
            AND NULLIF(payment->>'change_amount','')::numeric <> 0)
        OR (payment->>'method' IN ('pix','transferencia','debito','credito')
            AND NULLIF(payment->>'account_id','')::uuid IS NULL)
        OR (payment->>'method' NOT IN ('pix','transferencia','debito','credito')
            AND NULLIF(payment->>'account_id','')::uuid IS NOT NULL)
        OR (payment->>'method' <> 'fiado' AND payment->>'due_date' IS NOT NULL)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_payments) payment
     GROUP BY payment->>'method'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'As coberturas devem ser únicas por método e coerentes com conta/vencimento.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_payments_invalid';
  END IF;

  SELECT array_agg(account_id ORDER BY account_id) INTO v_account_ids
    FROM (
      SELECT p_cash_account_id account_id
      UNION
      SELECT NULLIF(payment->>'account_id','')::uuid
        FROM jsonb_array_elements(v_payments) payment
       WHERE NULLIF(payment->>'account_id','')::uuid IS NOT NULL
    ) accounts;
  PERFORM public.pdv_lock_treasury_accounts(v_company, v_account_ids);

  v_payload := jsonb_build_object(
    'terminal_id', p_terminal_id,
    'cash_session_id', p_cash_session_id,
    'cash_account_id', p_cash_account_id,
    'customer_id', p_customer_id,
    'cart', jsonb_build_object(
      'items',v_cart,
      'order_discount_amount',v_order_discount,
      'notes',v_notes,
      'transaction_date',v_transaction_date
    ),
    'payments', v_payments
  );
  SELECT * INTO v_claim FROM public.pdv_claim_operation_request(
    v_company, 'direct_sale.complete.v2', p_idempotency_key, v_payload
  );
  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN
      RETURN v_claim.stored_result || jsonb_build_object('idempotent',true);
    END IF;
    RAISE EXCEPTION 'Esta venda já está em processamento ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'code=pdv_direct_sale_in_progress';
  END IF;

  SELECT terminal.* INTO v_terminal
    FROM public.pdv_terminals terminal
   WHERE terminal.id = p_terminal_id
     AND terminal.company_id = v_company
     AND terminal.is_active IS TRUE
   FOR UPDATE;
  IF NOT FOUND OR v_terminal.stock_id IS NULL
     OR public.can_access_stock(v_uid, v_terminal.stock_id) IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'O terminal ou seu local de estoque não está disponível.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_terminal_invalid';
  END IF;
  SELECT count(DISTINCT NULLIF(line->>'stock_id','')::uuid)
    INTO v_stock_count FROM jsonb_array_elements(v_cart) line;
  IF v_stock_count <> 1 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_cart) line
     WHERE NULLIF(line->>'stock_id','')::uuid <> v_terminal.stock_id
  ) THEN
    RAISE EXCEPTION 'A venda direta deve usar somente o local configurado no terminal.'
      USING ERRCODE = '23514', DETAIL = 'code=pdv_direct_sale_stock_mismatch';
  END IF;

  SELECT session.* INTO v_session
    FROM public.pdv_cash_sessions session
   WHERE session.id = p_cash_session_id
     AND session.company_id = v_company
     AND session.terminal_id = p_terminal_id
     AND session.cash_account_id = p_cash_account_id
     AND session.contract_version = 2
     AND session.status = 'aberta'
   FOR UPDATE;
  IF NOT FOUND OR (
    v_session.opened_by IS DISTINCT FROM v_uid
    AND NOT public.is_admin_or_gestor(v_uid)
    AND NOT public.is_super_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'Use um caixa v2 aberto por você neste terminal.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_session_invalid';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT customer.* INTO v_customer
      FROM public.customers customer
     WHERE customer.id = p_customer_id
       AND customer.company_id = v_company
       AND customer.is_deleted IS FALSE
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'
        USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_customer_invalid';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_payments) payment
     WHERE payment->>'method' IN ('pix','transferencia','debito','credito')
  ) AND NOT (
    public.is_admin_or_gestor(v_uid) OR public.is_super_admin(v_uid)
    OR public.pdv_has_explicit_action_permission_v2(
      v_uid, 'fn:use_bank_accounts'
    )
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para receber em conta bancária.'
      USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_bank_forbidden';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_payments) payment
     WHERE payment->>'method' = 'fiado'
  ) THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'Venda no fiado exige cliente identificado.'
        USING ERRCODE = '23502', DETAIL = 'code=pdv_direct_sale_credit_customer_required';
    END IF;
    IF NOT public.is_admin_or_gestor(v_uid)
       AND NOT public.is_super_admin(v_uid)
       AND public.pdv_has_explicit_action_permission_v2(
         v_uid, 'fn:approve_pdv_credit'
       ) IS DISTINCT FROM TRUE
    THEN
      RAISE EXCEPTION 'Você não tem permissão para aprovar venda no fiado.'
        USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_credit_forbidden';
    END IF;
  END IF;

  -- Material e local são travados em ordem estável antes de reservar.
  PERFORM inventory.id
    FROM public.inventory inventory
    JOIN (
      SELECT DISTINCT NULLIF(line->>'inventory_id','')::uuid id
        FROM jsonb_array_elements(v_cart) line
    ) requested ON requested.id = inventory.id
   ORDER BY inventory.id FOR UPDATE OF inventory;
  PERFORM stock.id
    FROM public.stocks stock
    JOIN (
      SELECT DISTINCT NULLIF(line->>'stock_id','')::uuid id
        FROM jsonb_array_elements(v_cart) line
    ) requested ON requested.id = stock.id
   ORDER BY stock.id FOR UPDATE OF stock;

  -- Congela preço/custo somente depois dos locks. O preço informado pelo
  -- cliente é uma intenção auditável; ausência/NULL usa o catálogo. Custo do
  -- payload nunca participa do cálculo nem do hash.
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_cart) LOOP
    SELECT inventory.* INTO v_inventory
      FROM public.inventory inventory
     WHERE inventory.id = NULLIF(v_line->>'inventory_id','')::uuid
       AND inventory.company_id = v_company
       AND inventory.customer_id IS NULL
       AND inventory.archived_at IS NULL
       AND inventory.id IN (SELECT public.get_accessible_inventory_ids())
     FOR UPDATE;
    IF NOT FOUND OR v_inventory.sale_price IS NULL OR v_inventory.sale_price < 0
       OR lower(v_inventory.sale_price::text) IN ('nan','infinity','-infinity')
       OR lower(COALESCE(v_inventory.cost_price::text,'')) IN (
         'nan','infinity','-infinity'
       )
    THEN
      RAISE EXCEPTION 'Um material do carrinho não está disponível para venda.'
        USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_inventory_invalid';
    END IF;

    v_unit_price := COALESCE(
      NULLIF(v_line->>'unit_price','')::numeric,
      round(v_inventory.sale_price,2)
    );
    IF NULLIF(v_line->>'unit_price','') IS NOT NULL
       AND v_unit_price IS DISTINCT FROM round(v_inventory.sale_price,2)
       AND NOT public.is_admin_or_gestor(v_uid)
       AND NOT public.is_super_admin(v_uid)
       AND public.pdv_has_explicit_action_permission_v2(
         v_uid,'fn:override_pdv_sale_price'
       ) IS DISTINCT FROM TRUE
    THEN
      RAISE EXCEPTION 'Você não tem permissão para alterar o preço deste item.'
        USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_price_override_forbidden';
    END IF;
    v_line_discount := NULLIF(v_line->>'discount_amount','')::numeric;
    v_line_gross := round(
      v_unit_price * NULLIF(v_line->>'quantity','')::numeric,2
    );
    IF v_line_discount > v_line_gross THEN
      RAISE EXCEPTION 'O desconto de um item não pode superar o valor desse item.'
        USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_line_discount_exceeded';
    END IF;
    v_line_net := round(v_line_gross-v_line_discount,2);
    v_priced_cart := v_priced_cart || jsonb_build_array(
      v_line || jsonb_build_object(
        'unit_price',v_unit_price,
        'line_gross',v_line_gross,
        'line_net',v_line_net
      )
    );
    v_subtotal := round(v_subtotal+v_line_net,2);
  END LOOP;

  IF v_order_discount > v_subtotal THEN
    RAISE EXCEPTION 'O desconto geral não pode superar o subtotal dos itens.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_order_discount_exceeded';
  END IF;
  v_total := round(v_subtotal-v_order_discount,2);

  SELECT COALESCE(settings.timezone,'America/Sao_Paulo') INTO v_timezone
    FROM public.company_settings settings WHERE settings.company_id=v_company;
  v_timezone := COALESCE(v_timezone,'America/Sao_Paulo');
  v_paid_at := CASE
    WHEN v_transaction_date=v_today THEN now()
    ELSE (v_transaction_date+time '12:00') AT TIME ZONE v_timezone
  END;

  v_order_number := public.next_pdv_order_number(v_company);
  INSERT INTO public.pdv_orders(
    id,company_id,number,customer_id,salesperson_id,stock_id,terminal_id,
    status,subtotal,discount_amount,total,cash_session_id,client_request_id,
    notes,contract_version,operation_mode_snapshot,transaction_date_v2
  ) VALUES(
    v_order_id,v_company,v_order_number,p_customer_id,v_uid,v_terminal.stock_id,
    p_terminal_id,'aguardando_pagamento',v_subtotal,v_order_discount,v_total,
    p_cash_session_id,v_claim.request_id::text,v_notes,2,'direct',
    v_transaction_date
  );

  FOR v_line IN
    WITH base AS (
      SELECT line.value AS item,line.ordinality AS sort_order,
             NULLIF(line.value->>'line_net','')::numeric AS line_net
        FROM jsonb_array_elements(v_priced_cart) WITH ORDINALITY line(value,ordinality)
    ), shares AS (
      SELECT base.*,CASE
        WHEN v_order_discount=0 OR v_subtotal=0 THEN 0::numeric
        ELSE v_order_discount*100*base.line_net/v_subtotal
      END AS raw_alloc_cents
        FROM base
    ), ranked AS (
      SELECT shares.*,
             floor(shares.raw_alloc_cents)::bigint AS base_alloc_cents,
             row_number() OVER(
               ORDER BY shares.raw_alloc_cents-floor(shares.raw_alloc_cents) DESC,
                        shares.item->>'inventory_id',shares.item->>'stock_id'
             ) AS remainder_rank,
             sum(floor(shares.raw_alloc_cents)::bigint) OVER() AS allocated_floor_cents
        FROM shares
    )
    SELECT ranked.item || jsonb_build_object(
      'sort_order',ranked.sort_order,
      'order_discount_allocated',(
        ranked.base_alloc_cents+CASE
          WHEN ranked.remainder_rank <=
            round(v_order_discount*100)::bigint-ranked.allocated_floor_cents
          THEN 1 ELSE 0
        END
      )::numeric/100
    )
      FROM ranked ORDER BY ranked.sort_order
  LOOP
    v_sort := v_sort + 1;
    v_order_item_id := gen_random_uuid();
    v_line_discount := NULLIF(v_line->>'discount_amount','')::numeric;
    v_order_discount_allocated :=
      NULLIF(v_line->>'order_discount_allocated','')::numeric;
    v_amount := round(
      NULLIF(v_line->>'line_gross','')::numeric-v_line_discount-
      v_order_discount_allocated,2
    );
    SELECT inventory.* INTO v_inventory
      FROM public.inventory inventory
     WHERE inventory.id=NULLIF(v_line->>'inventory_id','')::uuid
       AND inventory.company_id=v_company
     FOR UPDATE;
    INSERT INTO public.pdv_order_items(
      id,company_id,order_id,inventory_id,description,quantity,unit_price,
      unit_cost,discount_amount,total,sort_order,item_type,unit_cost_v2,
      contract_version,gross_total_v2,line_discount_amount_v2,
      order_discount_allocated_v2,unit_factor_snapshot
    ) VALUES(
      v_order_item_id,v_company,v_order_id,v_inventory.id,v_inventory.name,
      NULLIF(v_line->>'quantity','')::numeric,
      NULLIF(v_line->>'unit_price','')::numeric,
      COALESCE(v_inventory.cost_price,0),
      round(v_line_discount+v_order_discount_allocated,2),v_amount,
      NULLIF(v_line->>'sort_order','')::integer,'material',
      v_inventory.cost_price,2,NULLIF(v_line->>'line_gross','')::numeric,
      v_line_discount,v_order_discount_allocated,1
    );
    v_reservation := public.pdv_reserve_stock_internal_v2(
      v_company,v_inventory.id,NULLIF(v_line->>'stock_id','')::uuid,
      v_order_item_id,NULL,NULLIF(v_line->>'quantity','')::numeric,
      'coverage',NULL,1
    );
    v_delivery_lines := v_delivery_lines || jsonb_build_array(
      jsonb_build_object(
        'order_item_id',v_order_item_id,
        'reservation_id',v_reservation.id,
        'quantity',NULLIF(v_line->>'quantity','')::numeric
      )
    );
  END LOOP;

  IF (SELECT round(COALESCE(sum(item.total),0),2)
        FROM public.pdv_order_items item WHERE item.order_id=v_order_id)
     IS DISTINCT FROM v_total
  THEN
    RAISE EXCEPTION 'Não foi possível conciliar os descontos entre os itens.'
      USING ERRCODE = '23514', DETAIL = 'code=pdv_direct_sale_discount_allocation_mismatch';
  END IF;

  SELECT round(COALESCE(sum(NULLIF(payment->>'amount','')::numeric),0),2),
         round(COALESCE(sum(NULLIF(payment->>'amount','')::numeric)
           FILTER (WHERE payment->>'method'='fiado'),0),2),
         COALESCE(bool_and(
           payment->>'method' IN ('dinheiro','pix','transferencia')
         ),true)
    INTO v_payment_total,v_fiado_total,v_all_settled
    FROM jsonb_array_elements(v_payments) payment;
  IF (v_total = 0 AND jsonb_array_length(v_payments) <> 0)
     OR (v_total > 0 AND (
       jsonb_array_length(v_payments) = 0 OR v_payment_total <> v_total
     ))
  THEN
    RAISE EXCEPTION 'A soma das coberturas deve ser igual ao total da venda.'
      USING ERRCODE = '23514', DETAIL = 'code=pdv_direct_sale_coverage_mismatch';
  END IF;

  IF v_fiado_total > 0 THEN
    SELECT round(COALESCE(sum(statement.amount),0),2)
      INTO v_open_credit
      FROM public.pdv_customer_credit_statement_v2(p_customer_id) statement;
    IF v_customer.credit_limit IS NULL
       OR v_open_credit + v_fiado_total > v_customer.credit_limit
    THEN
      RAISE EXCEPTION 'O limite disponível do cliente não cobre esta venda.'
        USING ERRCODE = '23514', DETAIL = 'code=pdv_direct_sale_credit_limit_exceeded';
    END IF;
  END IF;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(v_payments) LOOP
    v_method := v_payment->>'method';
    v_amount := NULLIF(v_payment->>'amount','')::numeric;
    v_change_amount := COALESCE(
      NULLIF(v_payment->>'change_amount','')::numeric,0
    );
    v_account_id := NULLIF(v_payment->>'account_id','')::uuid;
    v_settlement_id := NULL;
    v_receivable_id := NULL;
    IF v_method IN ('pix','transferencia','debito','credito')
       AND NOT EXISTS (
        SELECT 1 FROM public.financial_accounts account
         WHERE account.id=v_account_id AND account.company_id=v_company
           AND account.is_active IS TRUE AND account.type='banco'
      ) THEN
      RAISE EXCEPTION 'A conta bancária da cobertura não está disponível.'
        USING ERRCODE = '42501', DETAIL = 'code=pdv_direct_sale_bank_invalid';
    END IF;
    IF v_method IN ('dinheiro','pix','transferencia') THEN
      v_account_id := CASE WHEN v_method='dinheiro'
                           THEN p_cash_account_id ELSE v_account_id END;
      v_settlement_id := public.pdv_create_receivable_financial_v2(
        v_company,v_uid,p_customer_id,v_account_id,
        CASE WHEN v_method='dinheiro' THEN p_cash_session_id ELSE NULL END,
        v_method,v_amount,v_transaction_date,
        'Venda direta PDV nº ' || v_order_number::text,
        v_claim.request_id,false
      );
      v_settlement_ids := array_append(v_settlement_ids,v_settlement_id);
      INSERT INTO public.pdv_order_payments(
        company_id,order_id,method,amount,change_amount,
        financial_account_id,financial_transaction_id,created_by,
        contract_version,coverage_kind,coverage_status,settlement_status,
        settlement_transaction_id,authorized_at,settled_at
      ) VALUES(
        v_company,v_order_id,v_method,v_amount,v_change_amount,v_account_id,NULL,v_uid,
        2,CASE v_method WHEN 'dinheiro' THEN 'cash'
                        WHEN 'transferencia' THEN 'transfer'
                        ELSE v_method END,
        'authorized','settled',v_settlement_id,now(),now()
      );
    ELSIF v_method IN ('debito','credito') THEN
      INSERT INTO public.pdv_order_payments(
        company_id,order_id,method,amount,change_amount,
        financial_account_id,financial_transaction_id,created_by,contract_version,coverage_kind,
        coverage_status,settlement_status,authorized_at
      ) VALUES(
        v_company,v_order_id,v_method,v_amount,v_change_amount,v_account_id,NULL,v_uid,2,
        'card_authorization','authorized','open',now()
      );
    ELSE
      v_due_date := COALESCE(
        NULLIF(v_payment->>'due_date','')::date,
        (v_transaction_date + interval '1 month')::date
      );
      IF v_due_date < v_transaction_date THEN
        RAISE EXCEPTION 'O vencimento do fiado não pode estar no passado.'
          USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_due_date_invalid';
      END IF;
      INSERT INTO public.financial_transactions(
        company_id,transaction_type,description,amount,category,
        transaction_date,due_date,is_paid,customer_id,origin,payment_method,
        created_by,pdv_financial_role,pdv_settlement_group_id
      ) VALUES(
        v_company,'entrada'::public.transaction_type,
        'Venda no fiado, pedido PDV nº ' || v_order_number::text,
        v_amount,'Venda no fiado',v_transaction_date,v_due_date,false,p_customer_id,
        'pdv','fiado',v_uid,'pdv_receivable_principal',v_claim.request_id
      ) RETURNING id INTO v_receivable_id;
      INSERT INTO public.pdv_order_payments(
        company_id,order_id,method,amount,change_amount,
        financial_transaction_id,created_by,contract_version,coverage_kind,
        coverage_status,settlement_status,receivable_transaction_id,
        authorized_at
      ) VALUES(
        v_company,v_order_id,'fiado',v_amount,v_change_amount,NULL,v_uid,2,'receivable',
        'authorized','open',v_receivable_id,now()
      );
    END IF;
  END LOOP;

  v_delivery := public.pdv_complete_delivery_internal_v2(
    v_company,v_order_id,gen_random_uuid(),v_delivery_lines
  );
  FOREACH v_settlement_id IN ARRAY v_settlement_ids LOOP
    PERFORM public.pdv_apply_settlement_fifo_v2(v_company,v_settlement_id);
  END LOOP;
  UPDATE public.pdv_orders
     SET status='entregue',
         paid_at=CASE WHEN v_all_settled THEN v_paid_at ELSE NULL END,
         delivered_at=now(),stock_committed_at=now()
   WHERE id=v_order_id;

  v_result := jsonb_build_object(
    'ok',true,'order_id',v_order_id,'order_number',v_order_number,
    'delivery_id',v_delivery->>'delivery_id','total',v_total,
    'subtotal',v_subtotal,'discount_amount',v_order_discount,
    'transaction_date',v_transaction_date,
    'idempotent',false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id,'pdv_order',v_order_id,v_result
  );
  RETURN v_result;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Carrinho ou cobertura contém valor inválido.'
      USING ERRCODE = '22023', DETAIL = 'code=pdv_direct_sale_value_invalid';
END;
$fn$;

-- O reset de PDV/Financeiro não pode deixar replay apontando para pedido ou
-- liquidação removidos. A função já foi autorizada e versionada pelas ondas W1.
DO $patch_reset$
DECLARE v_oid regprocedure; v_src text; v_old text; v_new text;
BEGIN
  SELECT procedure.oid::regprocedure,pg_get_functiondef(procedure.oid)
    INTO v_oid,v_src
    FROM pg_proc procedure JOIN pg_namespace namespace
      ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='public' AND procedure.proname='reset_system_step'
     AND pg_get_function_identity_arguments(procedure.oid)=
       'p_company_id uuid, p_step text, p_audit_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'reset_system_step não encontrada'; END IF;
  IF position('direct_sale.complete.v2' in v_src)=0 THEN
    v_old := '''receivable.settle.v2'', ''receivable.reverse.v2'', ''cash.event.v2''';
    v_new := '''receivable.settle.v2'', ''receivable.reverse.v2'', ''cash.event.v2'', ''direct_sale.complete.v2''';
    IF position(v_old in v_src)=0 THEN
      RAISE EXCEPTION 'Âncora dos requests do reset mudou';
    END IF;
    v_src := replace(v_src,v_old,v_new);
    EXECUTE v_src;
  END IF;
END
$patch_reset$;

REVOKE ALL ON FUNCTION public.pdv_complete_direct_sale_v2(
  uuid,uuid,uuid,uuid,jsonb,jsonb,text
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_complete_direct_sale_v2(
  uuid,uuid,uuid,uuid,jsonb,jsonb,text
) TO service_role;

COMMENT ON FUNCTION public.pdv_complete_direct_sale_v2(
  uuid,uuid,uuid,uuid,jsonb,jsonb,text
) IS
  'Venda direta v2 atômica/idempotente. Custo e preço-base vêm do servidor; preço especial, descontos e retrodatação exigem capacidades explícitas. Cobertura, reserva, entrega, Kardex, custódia e FIFO são concluídos na mesma transação. Anexos ficam no fluxo pós-sucesso. Fechada para authenticated até ativação separada.';

COMMIT;
