-- W1C-01: aplicacoes persistidas e projecoes canonicas DRE/DFC v2.
-- Expand only: nao ativa UI nem reabre os writers W1A-03 para authenticated.
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Snapshots de reconhecimento na entrega.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pdv_delivery_items
  ADD COLUMN IF NOT EXISTS commercial_amount_snapshot numeric(14,2),
  ADD COLUMN IF NOT EXISTS cmv_amount_snapshot numeric(14,2),
  ADD COLUMN IF NOT EXISTS recognition_date date,
  ADD COLUMN IF NOT EXISTS recognition_contract_version smallint;

ALTER TABLE public.pdv_delivery_items
  DROP CONSTRAINT IF EXISTS pdv_delivery_items_recognition_snapshot_check;
ALTER TABLE public.pdv_delivery_items
  ADD CONSTRAINT pdv_delivery_items_recognition_snapshot_check CHECK (
    recognition_contract_version IS NULL
    OR (
      recognition_contract_version = 2
      AND commercial_amount_snapshot IS NOT NULL
      AND commercial_amount_snapshot >= 0
      AND commercial_amount_snapshot = round(commercial_amount_snapshot, 2)
      AND (cmv_amount_snapshot IS NULL OR (
        cmv_amount_snapshot >= 0
        AND cmv_amount_snapshot = round(cmv_amount_snapshot, 2)
      ))
      AND recognition_date IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.pdv_snapshot_delivery_recognition_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_item public.pdv_order_items%ROWTYPE;
  v_delivery public.pdv_deliveries%ROWTYPE;
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

  SELECT delivery.* INTO v_delivery
    FROM public.pdv_deliveries delivery
   WHERE delivery.id = NEW.delivery_id
     AND delivery.company_id = NEW.company_id;
  IF NOT FOUND OR v_delivery.order_id <> v_item.order_id THEN
    RAISE EXCEPTION 'A entrega não pertence ao pedido informado.'
      USING ERRCODE = '23514', DETAIL = 'PDV_RECOGNITION_DELIVERY_ORDER_MISMATCH';
  END IF;

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
  NEW.recognition_date := (v_delivery.created_at AT TIME ZONE v_timezone)::date;
  NEW.recognition_contract_version := 2;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_pdv_snapshot_delivery_recognition_v2
  ON public.pdv_delivery_items;
CREATE TRIGGER trg_pdv_snapshot_delivery_recognition_v2
  BEFORE INSERT ON public.pdv_delivery_items
  FOR EACH ROW EXECUTE FUNCTION public.pdv_snapshot_delivery_recognition_v2();

-- ---------------------------------------------------------------------------
-- 2. Livro append-only de aplicacoes comerciais.
-- ---------------------------------------------------------------------------

CREATE TABLE public.pdv_settlement_applications (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id                   uuid NOT NULL REFERENCES public.pdv_orders(id) ON DELETE CASCADE,
  settlement_transaction_id  uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  delivery_item_id           uuid NOT NULL REFERENCES public.pdv_delivery_items(id) ON DELETE CASCADE,
  delivery_slice_sequence    integer NOT NULL CHECK (delivery_slice_sequence > 0),
  application_kind           text NOT NULL CHECK (
    application_kind IN ('settlement', 'payment_reversal')
  ),
  commercial_amount          numeric(14,2) NOT NULL,
  cmv_amount                 numeric(14,2),
  eligible_commercial_snapshot numeric(14,2) NOT NULL CHECK (eligible_commercial_snapshot > 0),
  eligible_cmv_snapshot      numeric(14,2),
  policy_version             smallint NOT NULL DEFAULT 1 CHECK (policy_version = 1),
  application_sequence       integer NOT NULL CHECK (application_sequence > 0),
  effective_date             date NOT NULL,
  reversal_of_id             uuid REFERENCES public.pdv_settlement_applications(id),
  reversal_reference_id      uuid REFERENCES public.financial_transactions(id) ON DELETE RESTRICT,
  metadata                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdv_settlement_app_amount_check CHECK (
    (application_kind = 'settlement'
      AND commercial_amount > 0
      AND (cmv_amount IS NULL OR cmv_amount >= 0))
    OR
    (application_kind = 'payment_reversal'
      AND commercial_amount < 0
      AND (cmv_amount IS NULL OR cmv_amount <= 0))
  ),
  CONSTRAINT pdv_settlement_app_reversal_check CHECK (
    (application_kind = 'settlement' AND reversal_of_id IS NULL AND reversal_reference_id IS NULL)
    OR (application_kind = 'payment_reversal'
        AND reversal_of_id IS NOT NULL AND reversal_reference_id IS NOT NULL)
  ),
  CONSTRAINT pdv_settlement_app_snapshot_cost_check CHECK (
    eligible_cmv_snapshot IS NULL OR eligible_cmv_snapshot >= 0
  ),
  CONSTRAINT pdv_settlement_app_sequence_unique
    UNIQUE (settlement_transaction_id, application_sequence),
  CONSTRAINT pdv_settlement_app_reversal_unique UNIQUE (reversal_of_id)
);

CREATE UNIQUE INDEX idx_pdv_settlement_app_positive_slice
  ON public.pdv_settlement_applications (
    settlement_transaction_id, delivery_item_id, delivery_slice_sequence
  ) WHERE application_kind = 'settlement';
CREATE INDEX idx_pdv_settlement_app_delivery_slice
  ON public.pdv_settlement_applications (
    company_id, delivery_item_id, delivery_slice_sequence, created_at, id
  );
CREATE INDEX idx_pdv_settlement_app_effective
  ON public.pdv_settlement_applications (
    company_id, effective_date, application_sequence, id
  );

ALTER TABLE public.pdv_settlement_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_settlement_applications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_settlement_applications FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pdv_guard_settlement_application_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_delivery public.pdv_delivery_items%ROWTYPE;
  v_settlement public.financial_transactions%ROWTYPE;
  v_reversal public.financial_transactions%ROWTYPE;
  v_original public.pdv_settlement_applications%ROWTYPE;
  v_applied numeric(14,2);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF TG_OP = 'DELETE' AND (
      NOT EXISTS (SELECT 1 FROM public.companies company WHERE company.id = OLD.company_id)
      OR COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Aplicações de liquidação são imutáveis; registre uma compensação.'
      USING ERRCODE = '55000', DETAIL = 'PDV_SETTLEMENT_APPLICATION_IMMUTABLE';
  END IF;

  SELECT item.* INTO v_delivery
    FROM public.pdv_delivery_items item
   WHERE item.id = NEW.delivery_item_id
     AND item.company_id = NEW.company_id;
  IF NOT FOUND OR v_delivery.recognition_contract_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'O item entregue não possui reconhecimento v2 válido.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_DELIVERY_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pdv_deliveries delivery
     WHERE delivery.id = v_delivery.delivery_id
       AND delivery.order_id = NEW.order_id
       AND delivery.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'O item entregue não pertence ao pedido da aplicação.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_ORDER_MISMATCH';
  END IF;

  SELECT transaction.* INTO v_settlement
    FROM public.financial_transactions transaction
   WHERE transaction.id = NEW.settlement_transaction_id
     AND transaction.company_id = NEW.company_id
   FOR UPDATE;
  IF NOT FOUND OR v_settlement.is_paid IS DISTINCT FROM TRUE
     OR v_settlement.pdv_financial_role NOT IN (
       'pdv_receivable_settlement', 'pdv_receivable_reversal'
     )
  THEN
    RAISE EXCEPTION 'A liquidação financeira v2 não é válida.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_FINANCIAL_INVALID';
  END IF;

  IF NEW.application_kind = 'settlement' THEN
    IF v_settlement.pdv_financial_role <> 'pdv_receivable_settlement'
       OR NEW.commercial_amount > NEW.eligible_commercial_snapshot
       OR (NEW.cmv_amount IS NULL) IS DISTINCT FROM (NEW.eligible_cmv_snapshot IS NULL)
    THEN
      RAISE EXCEPTION 'A aplicação excede ou contradiz o snapshot elegível.'
        USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_APPLICATION_INVALID';
    END IF;
    SELECT round(COALESCE(sum(application.commercial_amount), 0), 2)
      INTO v_applied
      FROM public.pdv_settlement_applications application
     WHERE application.settlement_transaction_id = NEW.settlement_transaction_id
       AND application.application_kind = 'settlement';
    IF v_applied + NEW.commercial_amount > round(v_settlement.amount, 2) THEN
      RAISE EXCEPTION 'As aplicações excedem o valor da liquidação.'
        USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_APPLICATION_EXCEEDS_SETTLEMENT';
    END IF;
  ELSE
    SELECT application.* INTO v_original
      FROM public.pdv_settlement_applications application
     WHERE application.id = NEW.reversal_of_id
     FOR UPDATE;
    IF NOT FOUND
       OR v_original.company_id <> NEW.company_id
       OR v_original.application_kind <> 'settlement'
       OR v_original.delivery_item_id <> NEW.delivery_item_id
       OR v_original.delivery_slice_sequence <> NEW.delivery_slice_sequence
       OR NEW.commercial_amount <> -v_original.commercial_amount
       OR (v_original.cmv_amount IS NULL AND NEW.cmv_amount IS NOT NULL)
       OR (
         v_original.cmv_amount IS NOT NULL
         AND NEW.cmv_amount IS DISTINCT FROM -v_original.cmv_amount
       )
    THEN
      RAISE EXCEPTION 'A compensação não corresponde à aplicação original.'
        USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_REVERSAL_INVALID';
    END IF;
    SELECT transaction.* INTO v_reversal
      FROM public.financial_transactions transaction
     WHERE transaction.id = NEW.reversal_reference_id
       AND transaction.company_id = NEW.company_id
       AND transaction.pdv_financial_role = 'pdv_receivable_reversal'
       AND transaction.transaction_type::text = 'saida'
       AND transaction.is_paid IS TRUE
       AND transaction.paid_date IS NOT NULL
     FOR UPDATE;
    IF NOT FOUND
       OR NEW.effective_date <> v_reversal.paid_date
       OR NEW.effective_date < v_original.effective_date
       OR NOT EXISTS (
         SELECT 1
           FROM public.pdv_receivable_settlement_allocations reversal_allocation
           JOIN public.pdv_receivable_settlement_allocations original_allocation
             ON original_allocation.id = reversal_allocation.reversal_of_id
          WHERE reversal_allocation.company_id = NEW.company_id
            AND reversal_allocation.allocation_kind = 'reversal'
            AND reversal_allocation.settlement_transaction_id = v_reversal.id
            AND original_allocation.allocation_kind = 'settlement'
            AND original_allocation.settlement_transaction_id =
                v_original.settlement_transaction_id
       )
    THEN
      RAISE EXCEPTION 'O estorno deve usar a reversão financeira canônica da liquidação.'
        USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_REVERSAL_FINANCIAL_LINK_INVALID';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_pdv_settlement_application_guard_v2
  ON public.pdv_settlement_applications;
CREATE TRIGGER trg_pdv_settlement_application_guard_v2
  BEFORE INSERT OR UPDATE OR DELETE ON public.pdv_settlement_applications
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_settlement_application_v2();

-- ---------------------------------------------------------------------------
-- 3. FIFO estavel: entrega/prestacao primeiro, liquidacao depois.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_apply_settlement_fifo_v2(
  p_company_id uuid,
  p_settlement_transaction_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_settlement public.financial_transactions%ROWTYPE;
  v_remaining numeric(14,2);
  v_applied_before numeric(14,2);
  v_applied_now numeric(14,2) := 0;
  v_sequence integer;
  v_slice record;
  v_slice_applied numeric(14,2);
  v_order_applied numeric(14,2);
  v_amount numeric(14,2);
  v_cmv numeric(14,2);
  v_effective_date date;
  v_application_id uuid;
  v_ids jsonb := '[]'::jsonb;
BEGIN
  IF p_company_id IS NULL OR p_settlement_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Empresa e liquidação são obrigatórias.'
      USING ERRCODE = '22023', DETAIL = 'PDV_SETTLEMENT_INPUT_INVALID';
  END IF;

  SELECT transaction.* INTO v_settlement
    FROM public.financial_transactions transaction
   WHERE transaction.id = p_settlement_transaction_id
     AND transaction.company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND OR v_settlement.pdv_financial_role <> 'pdv_receivable_settlement'
     OR v_settlement.transaction_type::text <> 'entrada'
     OR v_settlement.is_paid IS DISTINCT FROM TRUE
     OR v_settlement.paid_date IS NULL
  THEN
    RAISE EXCEPTION 'Liquidação v2 confirmada não encontrada.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_NOT_CONFIRMED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pdv_order_payments payment
     WHERE payment.company_id = p_company_id
       AND payment.contract_version = 2
       AND payment.settlement_transaction_id = p_settlement_transaction_id
    UNION ALL
    SELECT 1
      FROM public.pdv_receivable_settlement_allocations allocation
      JOIN public.pdv_order_payments payment
        ON payment.receivable_transaction_id = allocation.receivable_transaction_id
       AND payment.company_id = allocation.company_id
     WHERE allocation.company_id = p_company_id
       AND allocation.settlement_transaction_id = p_settlement_transaction_id
       AND payment.contract_version = 2
  ) THEN
    RAISE EXCEPTION 'A liquidação não está vinculada a uma cobertura v2.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_ORDER_LINK_MISSING';
  END IF;

  PERFORM item.id
    FROM public.pdv_delivery_items item
    JOIN public.pdv_deliveries delivery ON delivery.id = item.delivery_id
   WHERE delivery.company_id = p_company_id
     AND delivery.order_id IN (
       SELECT payment.order_id FROM public.pdv_order_payments payment
        WHERE payment.company_id = p_company_id
          AND payment.contract_version = 2
          AND payment.settlement_transaction_id = p_settlement_transaction_id
       UNION
       SELECT payment.order_id
         FROM public.pdv_receivable_settlement_allocations allocation
         JOIN public.pdv_order_payments payment
           ON payment.receivable_transaction_id = allocation.receivable_transaction_id
          AND payment.company_id = allocation.company_id
        WHERE allocation.company_id = p_company_id
          AND allocation.settlement_transaction_id = p_settlement_transaction_id
          AND payment.contract_version = 2
     )
   ORDER BY delivery.created_at, delivery.id, item.id
   FOR UPDATE OF item;

  SELECT round(COALESCE(sum(application.commercial_amount), 0), 2),
         COALESCE(max(application.application_sequence), 0)
    INTO v_applied_before, v_sequence
    FROM public.pdv_settlement_applications application
   WHERE application.settlement_transaction_id = p_settlement_transaction_id
     AND application.application_kind = 'settlement';
  v_remaining := round(v_settlement.amount - v_applied_before, 2);
  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'settlement_transaction_id', p_settlement_transaction_id,
      'applied_now', 0, 'remaining', 0, 'application_ids', v_ids
    );
  END IF;

  FOR v_slice IN
    WITH linked_order_parts AS (
      SELECT payment.order_id, payment.amount::numeric AS eligible_amount
        FROM public.pdv_order_payments payment
       WHERE payment.company_id = p_company_id
         AND payment.contract_version = 2
         AND payment.settlement_transaction_id = p_settlement_transaction_id
      UNION ALL
      SELECT payment.order_id, allocation.amount::numeric
        FROM public.pdv_receivable_settlement_allocations allocation
        JOIN public.pdv_order_payments payment
          ON payment.receivable_transaction_id = allocation.receivable_transaction_id
         AND payment.company_id = allocation.company_id
       WHERE allocation.company_id = p_company_id
         AND allocation.settlement_transaction_id = p_settlement_transaction_id
         AND payment.contract_version = 2
         AND allocation.allocation_kind = 'settlement'
    ), linked_orders AS (
      SELECT order_id, round(sum(eligible_amount),2) AS eligible_amount
        FROM linked_order_parts GROUP BY order_id
    ), delivered AS (
      SELECT item.*, delivery.order_id, linked.eligible_amount AS order_eligible_amount,
             delivery.created_at AS delivery_created_at,
             order_item.sort_order,
             COALESCE(sum(item.quantity) OVER (
               PARTITION BY item.order_item_id
               ORDER BY delivery.created_at, delivery.id, item.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
             ), 0) AS prior_delivered_quantity
        FROM public.pdv_delivery_items item
        JOIN public.pdv_deliveries delivery ON delivery.id = item.delivery_id
        JOIN linked_orders linked ON linked.order_id = delivery.order_id
        JOIN public.pdv_order_items order_item ON order_item.id = item.order_item_id
       WHERE item.company_id = p_company_id
         AND item.recognition_contract_version = 2
         AND item.commercial_amount_snapshot > 0
    )
    SELECT delivered.id AS delivery_item_id, delivered.order_id,
           delivered.recognition_date, delivered.delivery_created_at,
           delivered.order_eligible_amount,
           delivered.sort_order, delivered.item_type,
           slice.sequence AS slice_sequence,
           round(
             delivered.commercial_amount_snapshot
               * LEAST(slice.sequence::numeric, delivered.quantity)
               / delivered.quantity, 2
           ) - round(
             delivered.commercial_amount_snapshot
               * (slice.sequence - 1)::numeric
               / delivered.quantity, 2
           ) AS eligible_commercial,
           CASE WHEN delivered.cmv_amount_snapshot IS NULL THEN NULL ELSE
             round(
               delivered.cmv_amount_snapshot
                 * LEAST(slice.sequence::numeric, delivered.quantity)
                 / delivered.quantity, 2
             ) - round(
               delivered.cmv_amount_snapshot
                 * (slice.sequence - 1)::numeric
                 / delivered.quantity, 2
             )
           END AS eligible_cmv
      FROM delivered
      CROSS JOIN LATERAL generate_series(
        1, CEIL(delivered.quantity)::integer
      ) slice(sequence)
     ORDER BY delivered.recognition_date, delivered.delivery_created_at,
              delivered.order_id, delivered.sort_order,
              delivery_item_id, slice.sequence
  LOOP
    EXIT WHEN v_remaining <= 0;
    SELECT round(COALESCE(sum(application.commercial_amount), 0), 2)
      INTO v_slice_applied
      FROM public.pdv_settlement_applications application
     WHERE application.delivery_item_id = v_slice.delivery_item_id
       AND application.delivery_slice_sequence = v_slice.slice_sequence
       AND application.application_kind IN ('settlement','payment_reversal');
    IF v_slice_applied >= v_slice.eligible_commercial THEN CONTINUE; END IF;

    SELECT round(COALESCE(sum(application.commercial_amount), 0), 2)
      INTO v_order_applied
      FROM public.pdv_settlement_applications application
     WHERE application.settlement_transaction_id = p_settlement_transaction_id
       AND application.order_id = v_slice.order_id
       AND application.application_kind = 'settlement';
    IF v_order_applied >= v_slice.order_eligible_amount THEN CONTINUE; END IF;

    v_amount := LEAST(
      v_remaining,
      round(v_slice.eligible_commercial - v_slice_applied, 2),
      round(v_slice.order_eligible_amount - v_order_applied, 2)
    );
    IF v_amount <= 0 THEN CONTINUE; END IF;
    v_cmv := CASE WHEN v_slice.eligible_cmv IS NULL THEN NULL ELSE
      round(
        v_slice.eligible_cmv * (v_slice_applied + v_amount)
          / v_slice.eligible_commercial, 2
      ) - round(
        v_slice.eligible_cmv * v_slice_applied
          / v_slice.eligible_commercial, 2
      )
    END;
    v_effective_date := GREATEST(v_settlement.paid_date, v_slice.recognition_date);
    v_sequence := v_sequence + 1;

    INSERT INTO public.pdv_settlement_applications (
      company_id, order_id, settlement_transaction_id, delivery_item_id,
      delivery_slice_sequence, application_kind, commercial_amount, cmv_amount,
      eligible_commercial_snapshot, eligible_cmv_snapshot,
      policy_version, application_sequence, effective_date,
      metadata, created_by
    ) VALUES (
      p_company_id, v_slice.order_id, p_settlement_transaction_id,
      v_slice.delivery_item_id, v_slice.slice_sequence, 'settlement',
      v_amount, v_cmv, v_slice.eligible_commercial, v_slice.eligible_cmv,
      1, v_sequence, v_effective_date,
      jsonb_build_object('policy', 'fifo_delivery_slice_v1'), auth.uid()
    ) RETURNING id INTO v_application_id;
    v_ids := v_ids || jsonb_build_array(v_application_id);
    v_applied_now := round(v_applied_now + v_amount, 2);
    v_remaining := round(v_remaining - v_amount, 2);
  END LOOP;

  RETURN jsonb_build_object(
    'settlement_transaction_id', p_settlement_transaction_id,
    'applied_now', v_applied_now,
    'remaining', v_remaining,
    'application_ids', v_ids
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_reverse_settlement_application_v2(
  p_company_id uuid,
  p_application_id uuid,
  p_reversal_transaction_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_original public.pdv_settlement_applications%ROWTYPE;
  v_sequence integer;
  v_id uuid;
  v_effective_date date;
BEGIN
  SELECT application.* INTO v_original
    FROM public.pdv_settlement_applications application
   WHERE application.id = p_application_id
     AND application.company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND OR v_original.application_kind <> 'settlement' THEN
    RAISE EXCEPTION 'Aplicação original não encontrada.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_SETTLEMENT_APPLICATION_NOT_FOUND';
  END IF;
  SELECT transaction.paid_date INTO v_effective_date
    FROM public.financial_transactions transaction
   WHERE transaction.id = p_reversal_transaction_id
     AND transaction.company_id = p_company_id
     AND transaction.pdv_financial_role = 'pdv_receivable_reversal'
     AND transaction.transaction_type::text = 'saida'
     AND transaction.is_paid IS TRUE
     AND transaction.paid_date IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND OR v_effective_date > public.company_today(p_company_id) THEN
    RAISE EXCEPTION 'A reversão financeira canônica não foi encontrada.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_REVERSAL_FINANCIAL_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.pdv_settlement_applications reversal
     WHERE reversal.reversal_of_id = v_original.id
  ) THEN
    RAISE EXCEPTION 'Esta aplicação já foi compensada.'
      USING ERRCODE = '23505', DETAIL = 'PDV_SETTLEMENT_APPLICATION_ALREADY_REVERSED';
  END IF;
  SELECT COALESCE(max(application_sequence), 0) + 1 INTO v_sequence
    FROM public.pdv_settlement_applications
   WHERE settlement_transaction_id = v_original.settlement_transaction_id;

  INSERT INTO public.pdv_settlement_applications (
    company_id, order_id, settlement_transaction_id, delivery_item_id,
    delivery_slice_sequence, application_kind, commercial_amount, cmv_amount,
    eligible_commercial_snapshot, eligible_cmv_snapshot,
    policy_version, application_sequence, effective_date,
    reversal_of_id, reversal_reference_id, metadata, created_by
  ) VALUES (
    v_original.company_id, v_original.order_id,
    v_original.settlement_transaction_id, v_original.delivery_item_id,
    v_original.delivery_slice_sequence, 'payment_reversal',
    -v_original.commercial_amount,
    CASE WHEN v_original.cmv_amount IS NULL THEN NULL ELSE -v_original.cmv_amount END,
    v_original.eligible_commercial_snapshot, v_original.eligible_cmv_snapshot,
    v_original.policy_version, v_sequence, v_effective_date,
    v_original.id, p_reversal_transaction_id,
    jsonb_build_object('policy', 'payment_reversal_v1'), auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Papeis estruturados usados pelas projecoes v2.
-- ---------------------------------------------------------------------------

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_pdv_role_check;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_pdv_role_check CHECK (
    (pdv_financial_role IS NULL AND pdv_settlement_group_id IS NULL)
    OR (
      pdv_financial_role IN (
        'pdv_receivable_principal', 'pdv_receivable_settlement',
        'pdv_receivable_reversal', 'pdv_card_fee',
        'pdv_cash_shortage', 'pdv_cash_surplus', 'pdv_refund',
        'pdv_supplier_obligation', 'pdv_supplier_payment',
        'pdv_custody_transfer'
      )
      AND pdv_settlement_group_id IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Fonte backend canonica. Cada fato escolhe legado OU v2 uma vez.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_financial_projection_rows_v2(p_company_id uuid)
RETURNS TABLE (
  projection_kind text,
  event_id uuid,
  event_date date,
  source_type text,
  revenue numeric,
  cmv numeric,
  expense numeric,
  cash_flow numeric,
  metadata jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  -- Competencia v2: entrega/prestacao. Devoluções comerciais por fatia
  -- pertencem à onda W5 e não são inferidas de estorno financeiro.
  SELECT 'dre_competence', item.id, item.recognition_date,
         'delivery_v2', item.commercial_amount_snapshot,
         item.cmv_amount_snapshot, 0::numeric, 0::numeric,
         jsonb_build_object('delivery_item_id', item.id, 'contract_version', 2)
    FROM public.pdv_delivery_items item
   WHERE item.company_id = p_company_id
     AND item.recognition_contract_version = 2

  UNION ALL
  SELECT 'dre_competence', transaction.id, transaction.transaction_date,
         transaction.pdv_financial_role, 0::numeric, 0::numeric,
         CASE WHEN transaction.pdv_financial_role = 'pdv_cash_surplus'
              THEN -transaction.amount ELSE transaction.amount END,
         0::numeric,
         jsonb_build_object('financial_transaction_id', transaction.id, 'contract_version', 2)
    FROM public.financial_transactions transaction
   WHERE transaction.company_id = p_company_id
     AND transaction.cancelled_at IS NULL
     AND transaction.pdv_financial_role IN ('pdv_card_fee','pdv_cash_shortage','pdv_cash_surplus')

  UNION ALL
  -- Caixa gerencial v2: somente aplicacoes persistidas.
  SELECT 'dre_cash', application.id, application.effective_date,
         CASE WHEN application.application_kind = 'settlement'
              THEN 'settlement_application_v2' ELSE 'payment_reversal_application_v2' END,
         application.commercial_amount, application.cmv_amount,
         0::numeric, 0::numeric,
         jsonb_build_object('settlement_transaction_id', application.settlement_transaction_id,
                            'contract_version', 2)
    FROM public.pdv_settlement_applications application
   WHERE application.company_id = p_company_id

  UNION ALL
  -- Material bonificado/preço zero não possui valor a alocar no FIFO. Seu
  -- CMV conhecido é reconhecido uma única vez pela própria entrega v2.
  SELECT 'dre_cash', item.id, item.recognition_date,
         'zero_value_delivery_cmv_v2', 0::numeric,
         item.cmv_amount_snapshot, 0::numeric, 0::numeric,
         jsonb_build_object('delivery_item_id', item.id, 'contract_version', 2)
    FROM public.pdv_delivery_items item
   WHERE item.company_id = p_company_id
     AND item.recognition_contract_version = 2
     AND item.commercial_amount_snapshot = 0
     AND item.cmv_amount_snapshot > 0

  UNION ALL
  SELECT 'dre_cash', transaction.id,
         COALESCE(transaction.paid_date, transaction.transaction_date),
         transaction.pdv_financial_role, 0::numeric, 0::numeric,
         CASE WHEN transaction.pdv_financial_role = 'pdv_cash_surplus'
              THEN -transaction.amount ELSE transaction.amount END,
         0::numeric,
         jsonb_build_object('financial_transaction_id', transaction.id, 'contract_version', 2)
    FROM public.financial_transactions transaction
   WHERE transaction.company_id = p_company_id
     AND transaction.cancelled_at IS NULL
     AND transaction.is_paid IS TRUE
     AND transaction.pdv_financial_role IN ('pdv_card_fee','pdv_cash_shortage','pdv_cash_surplus')

  UNION ALL
  -- DFC v2: fatos financeiros realizados; custodia e obrigacoes nao entram.
  SELECT 'dfc', transaction.id,
         COALESCE(transaction.paid_date, transaction.transaction_date),
         transaction.pdv_financial_role, 0::numeric, 0::numeric, 0::numeric,
         CASE
           WHEN transaction.pdv_financial_role IN (
             'pdv_receivable_settlement','pdv_cash_surplus'
           ) THEN transaction.amount
           ELSE -transaction.amount
         END,
         jsonb_build_object('financial_transaction_id', transaction.id, 'contract_version', 2)
    FROM public.financial_transactions transaction
   WHERE transaction.company_id = p_company_id
     AND transaction.cancelled_at IS NULL
     AND transaction.is_paid IS TRUE
     AND transaction.paid_date IS NOT NULL
     AND transaction.pdv_financial_role IN (
       'pdv_receivable_settlement','pdv_receivable_reversal',
       'pdv_card_fee','pdv_cash_shortage','pdv_cash_surplus',
       'pdv_refund','pdv_supplier_payment'
     )

  UNION ALL
  -- Adaptador legado: exclui qualquer fato estruturalmente pertencente ao v2.
  SELECT projection.kind, transaction.id,
         CASE WHEN projection.kind = 'dre_competence'
              THEN transaction.transaction_date
              ELSE COALESCE(transaction.paid_date, transaction.transaction_date) END,
         'legacy_financial',
         CASE WHEN transaction.transaction_type::text = 'entrada' THEN transaction.amount ELSE 0 END,
         0::numeric,
         CASE WHEN transaction.transaction_type::text = 'saida' THEN transaction.amount ELSE 0 END,
         CASE WHEN projection.kind = 'dfc' THEN
           CASE WHEN transaction.transaction_type::text = 'entrada'
                THEN transaction.amount ELSE -transaction.amount END
           ELSE 0 END,
         jsonb_build_object('financial_transaction_id', transaction.id, 'contract_version', 1)
    FROM public.financial_transactions transaction
    CROSS JOIN (VALUES ('dre_competence'),('dre_cash'),('dfc')) projection(kind)
   WHERE transaction.company_id = p_company_id
     AND transaction.pdv_financial_role IS NULL
     AND transaction.origin = 'pdv'
     AND transaction.cancelled_at IS NULL
     AND (projection.kind = 'dre_competence' OR (
       transaction.is_paid IS TRUE AND transaction.paid_date IS NOT NULL
     ))
     AND transaction.transfer_pair_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pdv_order_payments payment
        WHERE payment.company_id = p_company_id
          AND payment.contract_version = 2
          AND transaction.id IN (
            payment.receivable_transaction_id,
            payment.settlement_transaction_id,
            payment.financial_transaction_id
          )
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
        WHERE allocation.company_id = p_company_id
          AND transaction.id IN (
            allocation.receivable_transaction_id,
            allocation.settlement_transaction_id
          )
     )
     -- Competencia reconhece a obrigacao, nunca a filha de recebimento.
     AND NOT (
       projection.kind = 'dre_competence'
       AND transaction.parent_transaction_id IS NOT NULL
       AND transaction.category = 'Recebimento parcial'
       AND transaction.transaction_type::text = 'entrada'
     )
     -- Caixa/DFC usam as filhas realizadas. Quando elas existem, a mae nao
     -- pode entrar novamente; quitacao direta sem filha continua pela mae.
     AND NOT (
       projection.kind IN ('dre_cash','dfc')
       AND transaction.parent_transaction_id IS NULL
       AND EXISTS (
         SELECT 1 FROM public.financial_transactions child
          WHERE child.parent_transaction_id = transaction.id
            AND child.category = 'Recebimento parcial'
            AND child.transaction_type::text = 'entrada'
            AND child.cancelled_at IS NULL
       )
     );
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_financial_projection_page_v2(
  p_company_id uuid,
  p_projection text,
  p_from date,
  p_to date,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_total_count bigint;
  v_revenue numeric(14,2);
  v_cmv numeric(14,2);
  v_expense numeric(14,2);
  v_cash_flow numeric(14,2);
  v_entries jsonb;
  v_unknown_cmv_count integer;
BEGIN
  IF p_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.companies company WHERE company.id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Empresa não encontrada.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_PROJECTION_COMPANY_NOT_FOUND';
  END IF;
  IF p_projection NOT IN ('dre_competence','dre_cash','dfc')
     OR p_from IS NULL OR p_to IS NULL OR p_from > p_to
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
     OR p_offset IS NULL OR p_offset < 0
  THEN
    RAISE EXCEPTION 'Parâmetros de período ou paginação inválidos.'
      USING ERRCODE = '22023', DETAIL = 'PDV_PROJECTION_INPUT_INVALID';
  END IF;

  SELECT count(*), round(COALESCE(sum(row.revenue),0),2),
         round(COALESCE(sum(row.cmv),0),2),
         round(COALESCE(sum(row.expense),0),2),
         round(COALESCE(sum(row.cash_flow),0),2),
         count(*) FILTER (WHERE row.revenue <> 0 AND row.cmv IS NULL)
    INTO v_total_count, v_revenue, v_cmv, v_expense, v_cash_flow,
         v_unknown_cmv_count
    FROM public.pdv_financial_projection_rows_v2(p_company_id) row
   WHERE row.projection_kind = p_projection
     AND row.event_date BETWEEN p_from AND p_to;
  IF p_projection IN ('dre_competence','dre_cash') AND v_unknown_cmv_count > 0 THEN
    v_cmv := NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(page) ORDER BY page.event_date, page.event_id), '[]'::jsonb)
    INTO v_entries
    FROM (
      SELECT row.event_id, row.event_date, row.source_type,
             row.revenue, row.cmv, row.expense, row.cash_flow, row.metadata
        FROM public.pdv_financial_projection_rows_v2(p_company_id) row
       WHERE row.projection_kind = p_projection
         AND row.event_date BETWEEN p_from AND p_to
       ORDER BY row.event_date, row.event_id
       LIMIT p_limit OFFSET p_offset
    ) page;

  RETURN jsonb_build_object(
    'scope', 'pdv_partial',
    'projection', p_projection, 'from', p_from, 'to', p_to,
    'total_count', v_total_count, 'limit', p_limit, 'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_entries) < v_total_count,
    'revenue', v_revenue, 'cmv', v_cmv, 'expense', v_expense,
    'result', CASE WHEN v_cmv IS NULL AND p_projection IN ('dre_competence','dre_cash')
                   THEN NULL ELSE round(v_revenue - v_cmv - v_expense,2) END,
    'cash_flow', v_cash_flow,
    -- Esta projeção contém somente o componente PDV. Disponibilidade total
    -- depende de todos os fatos do Financeiro/RH e permanece no motor DFC
    -- canônico até a etapa de composição, evitando publicar saldo parcial.
    'initial_balance', NULL,
    'opening_availability', NULL,
    'closing_availability', NULL,
    'availability_status', 'not_calculated_for_partial_projection',
    'entries', v_entries
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_dre_competence_projection_v2(
  p_company_id uuid, p_from date, p_to date, p_limit integer, p_offset integer
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
  SELECT public.pdv_financial_projection_page_v2(
    p_company_id,'dre_competence',p_from,p_to,p_limit,p_offset
  );
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_dre_cash_projection_v2(
  p_company_id uuid, p_from date, p_to date, p_limit integer, p_offset integer
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
  SELECT public.pdv_financial_projection_page_v2(
    p_company_id,'dre_cash',p_from,p_to,p_limit,p_offset
  );
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_dfc_projection_v2(
  p_company_id uuid, p_from date, p_to date, p_limit integer, p_offset integer
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $fn$
  SELECT public.pdv_financial_projection_page_v2(
    p_company_id,'dfc',p_from,p_to,p_limit,p_offset
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Lifecycle e ACL: tudo fechado ate gate financeiro/ativacao separada.
-- ---------------------------------------------------------------------------

DO $patch_reset$
DECLARE v_oid regprocedure; v_src text; v_anchor text; v_insert text;
BEGIN
  SELECT procedure.oid::regprocedure, pg_get_functiondef(procedure.oid)
    INTO v_oid, v_src
    FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
   WHERE namespace.nspname='public' AND procedure.proname='reset_system_step'
     AND pg_get_function_identity_arguments(procedure.oid)=
       'p_company_id uuid, p_step text, p_audit_id uuid';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'reset_system_step não encontrada'; END IF;
  IF position('DELETE FROM public.pdv_settlement_applications' in v_src)=0 THEN
    v_anchor := 'DELETE FROM public.pdv_receivable_settlement_allocations';
    v_insert := 'DELETE FROM public.pdv_settlement_applications' || chr(10) ||
      '     WHERE company_id = p_company_id;' || chr(10) ||
      '    ' || v_anchor;
    IF position(v_anchor in v_src)=0 THEN RAISE EXCEPTION 'Âncora do reset PDV mudou'; END IF;
    v_src := replace(v_src,v_anchor,v_insert);
    EXECUTE v_src;
  END IF;
END
$patch_reset$;

REVOKE ALL ON FUNCTION public.pdv_snapshot_delivery_recognition_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_guard_settlement_application_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_apply_settlement_fifo_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_reverse_settlement_application_v2(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_financial_projection_rows_v2(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_financial_projection_page_v2(uuid,text,date,date,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_dre_competence_projection_v2(uuid,date,date,integer,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_dre_cash_projection_v2(uuid,date,date,integer,integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pdv_dfc_projection_v2(uuid,date,date,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_dre_competence_projection_v2(uuid,date,date,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_dre_cash_projection_v2(uuid,date,date,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pdv_dfc_projection_v2(uuid,date,date,integer,integer) TO service_role;

COMMENT ON TABLE public.pdv_settlement_applications IS
  'FIFO persistido por fatia entregue. NULL de CMV permanece desconhecido; zero conhecido permanece zero. Apenas estorno financeiro canônico é compensado aqui; devolução comercial por fatia fica para W5. Escrita owner-only até ativação separada.';
COMMENT ON FUNCTION public.pdv_dre_cash_projection_v2(uuid,date,date,integer,integer) IS
  'Componente backend canônico do domínio PDV: escolhe aplicações v2 ou fatos PDV legados uma vez. Financeiro/RH fora do PDV continua no motor vigente; UI não ativada nesta migration.';

COMMIT;
