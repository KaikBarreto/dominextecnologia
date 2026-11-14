-- W1A-03: recebiveis/fiado v2, liquidacao N:N e extrato compativel.
-- Expansao aditiva: nao ativa venda v2 e nao cria aplicacoes DRE-caixa.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Papel explicito da cobertura em pdv_order_payments.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pdv_order_payments
  ADD COLUMN IF NOT EXISTS contract_version smallint,
  ADD COLUMN IF NOT EXISTS coverage_kind text,
  ADD COLUMN IF NOT EXISTS coverage_status text,
  ADD COLUMN IF NOT EXISTS settlement_status text,
  ADD COLUMN IF NOT EXISTS receivable_transaction_id uuid
    REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_transaction_id uuid
    REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

-- Papel financeiro estruturado para que W1C adapte DRE/DFC sem inferir por
-- descricao. As RPCs desta migration permanecem fechadas ate essa projecao
-- estar pronta, pois os motores atuais ainda duplicariam mae + liquidacao.
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS pdv_financial_role text,
  ADD COLUMN IF NOT EXISTS pdv_settlement_group_id uuid;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_order_payments'::regclass
       AND conname = 'pdv_order_payments_contract_version_check'
  ) THEN
    ALTER TABLE public.pdv_order_payments
      ADD CONSTRAINT pdv_order_payments_contract_version_check
      CHECK (contract_version IS NULL OR contract_version IN (1, 2));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.pdv_order_payments'::regclass
       AND conname = 'pdv_order_payments_v2_roles_check'
  ) THEN
    ALTER TABLE public.pdv_order_payments
      ADD CONSTRAINT pdv_order_payments_v2_roles_check CHECK (
        contract_version IS DISTINCT FROM 2
        OR (
          coverage_kind IN (
            'cash', 'pix', 'transfer', 'card_authorization',
            'receivable', 'customer_credit', 'voucher'
          )
          AND coverage_status IN (
            'pending', 'authorized', 'revoked', 'failed'
          )
          AND settlement_status IN (
            'not_applicable', 'open', 'partial', 'settled', 'reversed'
          )
          AND financial_transaction_id IS NULL
          AND (
            (coverage_kind = 'receivable' AND receivable_transaction_id IS NOT NULL)
            OR (coverage_kind <> 'receivable' AND receivable_transaction_id IS NULL)
          )
          AND (
            settlement_transaction_id IS NULL
            OR settlement_status IN ('settled', 'reversed')
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.financial_transactions'::regclass
       AND conname = 'financial_transactions_pdv_role_check'
  ) THEN
    ALTER TABLE public.financial_transactions
      ADD CONSTRAINT financial_transactions_pdv_role_check CHECK (
        (pdv_financial_role IS NULL AND pdv_settlement_group_id IS NULL)
        OR (
          pdv_financial_role IN (
            'pdv_receivable_principal',
            'pdv_receivable_settlement',
            'pdv_receivable_reversal'
          )
          AND pdv_settlement_group_id IS NOT NULL
        )
      );
  END IF;
END
$constraints$;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_pdv_role
  ON public.financial_transactions (company_id, pdv_financial_role, pdv_settlement_group_id)
  WHERE pdv_financial_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pdv_order_payments_receivable_v2
  ON public.pdv_order_payments (company_id, receivable_transaction_id)
  WHERE contract_version = 2 AND receivable_transaction_id IS NOT NULL;

COMMENT ON COLUMN public.pdv_order_payments.receivable_transaction_id IS
  'Obrigacao principal da cobertura fiado v2. Nunca representa a liquidacao.';
COMMENT ON COLUMN public.pdv_order_payments.settlement_transaction_id IS
  'Liquidacao integral de uma cobertura v2 quando houver uma unica liquidacao. Baixas N:N permanecem na tabela de alocacoes.';

-- ---------------------------------------------------------------------------
-- 2. Junção canonica liquidacao financeira <-> obrigacao principal.
-- ---------------------------------------------------------------------------

CREATE TABLE public.pdv_receivable_settlement_allocations (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id                uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  settlement_transaction_id  uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  receivable_transaction_id  uuid NOT NULL REFERENCES public.financial_transactions(id) ON DELETE CASCADE,
  operation_request_id       uuid NOT NULL REFERENCES public.pdv_operation_requests(id) ON DELETE CASCADE,
  allocation_kind            text NOT NULL,
  amount                     numeric(14,2) NOT NULL,
  settlement_method          text NOT NULL,
  cash_session_id            uuid REFERENCES public.pdv_cash_sessions(id) ON DELETE SET NULL,
  reversal_of_id             uuid REFERENCES public.pdv_receivable_settlement_allocations(id),
  metadata                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pdv_receivable_alloc_kind_check CHECK (
    allocation_kind IN ('settlement', 'reversal')
  ),
  CONSTRAINT pdv_receivable_alloc_amount_check CHECK (
    (allocation_kind = 'settlement' AND amount > 0 AND reversal_of_id IS NULL)
    OR (allocation_kind = 'reversal' AND amount < 0 AND reversal_of_id IS NOT NULL)
  ),
  CONSTRAINT pdv_receivable_alloc_method_check CHECK (
    settlement_method IN ('dinheiro', 'pix', 'transferencia')
  ),
  CONSTRAINT pdv_receivable_alloc_cash_session_check CHECK (
    (settlement_method = 'dinheiro' AND cash_session_id IS NOT NULL)
    OR (settlement_method <> 'dinheiro' AND cash_session_id IS NULL)
  ),
  CONSTRAINT pdv_receivable_alloc_pair_unique
    UNIQUE (settlement_transaction_id, receivable_transaction_id),
  CONSTRAINT pdv_receivable_alloc_reversal_unique UNIQUE (reversal_of_id)
);

CREATE INDEX idx_pdv_receivable_alloc_receivable
  ON public.pdv_receivable_settlement_allocations
    (company_id, receivable_transaction_id, created_at, id);
CREATE INDEX idx_pdv_receivable_alloc_customer
  ON public.pdv_receivable_settlement_allocations
    (company_id, customer_id, created_at, id);

ALTER TABLE public.pdv_receivable_settlement_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_receivable_settlement_allocations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pdv_receivable_settlement_allocations FROM PUBLIC;
REVOKE ALL ON public.pdv_receivable_settlement_allocations FROM anon;
REVOKE ALL ON public.pdv_receivable_settlement_allocations FROM authenticated;
GRANT ALL ON public.pdv_receivable_settlement_allocations TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Integridade, somas e append-only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_receivable_received_total_v2(
  p_receivable_id uuid,
  p_exclude_legacy_child_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT round(
    COALESCE((
      SELECT sum(child.amount)
        FROM public.financial_transactions child
       WHERE child.parent_transaction_id = p_receivable_id
         AND child.id IS DISTINCT FROM p_exclude_legacy_child_id
         AND child.category = 'Recebimento parcial'
         AND child.transaction_type::text = 'entrada'
         AND child.cancelled_at IS NULL
         -- Uma perna v2 e representada pela alocacao. Esta exclusao impede
         -- dupla soma caso W1C passe a materializar pernas filhas.
         AND child.pdv_financial_role IS NULL
         AND NOT EXISTS (
           SELECT 1
             FROM public.pdv_receivable_settlement_allocations allocation
            WHERE allocation.settlement_transaction_id = child.id
              AND allocation.receivable_transaction_id = p_receivable_id
         )
    ), 0)
    + COALESCE((
      SELECT sum(allocation.amount)
        FROM public.pdv_receivable_settlement_allocations allocation
       WHERE allocation.receivable_transaction_id = p_receivable_id
    ), 0),
    2
  )
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_can_manage_receivables_v2(
  p_user_id uuid,
  p_reversal boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT COALESCE(
    (
      public.is_admin_or_gestor(p_user_id)
      OR public.is_super_admin(p_user_id)
      OR EXISTS (
        SELECT 1
          FROM public.user_permissions permission
         WHERE permission.user_id = p_user_id
           AND permission.is_active
           AND (
             permission.permissions ? '*'
             OR permission.permissions ? CASE
               WHEN p_reversal THEN 'fn:reverse_pdv_receivable'
               ELSE 'fn:receive_pdv_receivable'
             END
           )
      )
    )
    ,
    false
  )
$fn$;

-- O escritor legado e o v2 usam a mesma trava da obrigacao. Assim uma filha
-- v1 e uma alocacao v2 concorrentes nao aprovam ambas contra o mesmo saldo.
CREATE OR REPLACE FUNCTION public.pdv_guard_legacy_receivable_writer_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_parent_ids uuid[];
  v_account_ids uuid[];
  v_company_id uuid;
  v_parent public.financial_transactions%ROWTYPE;
  v_received numeric(14,2);
BEGIN
  IF TG_OP = 'DELETE' AND (
    NOT EXISTS (SELECT 1 FROM public.companies company WHERE company.id = OLD.company_id)
    OR COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text
  ) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Não é possível transferir um recebimento entre empresas.'
      USING ERRCODE = '42501', DETAIL = 'PDV_FINANCIAL_COMPANY_IMMUTABLE';
  END IF;

  SELECT COALESCE(array_agg(parent_id ORDER BY parent_id), ARRAY[]::uuid[])
    INTO v_parent_ids
    FROM (
      SELECT DISTINCT parent_id
        FROM unnest(ARRAY[
          CASE WHEN TG_OP <> 'INSERT'
                 AND OLD.parent_transaction_id IS NOT NULL
                 AND OLD.category = 'Recebimento parcial'
                 AND OLD.transaction_type::text = 'entrada'
               THEN OLD.parent_transaction_id END,
          CASE WHEN TG_OP <> 'DELETE'
                 AND NEW.parent_transaction_id IS NOT NULL
                 AND NEW.category = 'Recebimento parcial'
                 AND NEW.transaction_type::text = 'entrada'
               THEN NEW.parent_transaction_id END
        ]::uuid[]) requested(parent_id)
       WHERE parent_id IS NOT NULL
    ) locked;

  IF cardinality(v_parent_ids) = 0 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_company_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.company_id ELSE NEW.company_id END;
  SELECT COALESCE(array_agg(account_id ORDER BY account_id), ARRAY[]::uuid[])
    INTO v_account_ids
    FROM (
      SELECT DISTINCT account_id
        FROM unnest(ARRAY[
          CASE WHEN TG_OP <> 'INSERT' THEN OLD.account_id END,
          CASE WHEN TG_OP <> 'DELETE' THEN NEW.account_id END
        ]::uuid[]) requested(account_id)
       WHERE account_id IS NOT NULL
    ) locked;

  -- Ordem global: empresa, contas e somente depois obrigacoes.
  IF cardinality(v_account_ids) > 0 THEN
    PERFORM public.pdv_lock_treasury_accounts(v_company_id, v_account_ids);
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.companies company WHERE company.id = v_company_id) THEN
      RAISE EXCEPTION 'Empresa da tesouraria não encontrada.'
        USING ERRCODE = 'P0002', DETAIL = 'PDV_TREASURY_COMPANY_NOT_FOUND';
    END IF;
    PERFORM pg_advisory_xact_lock(
      hashtextextended('pdv-treasury-company:' || v_company_id::text, 0)
    );
  END IF;

  PERFORM 1
    FROM public.financial_transactions parent
   WHERE parent.id = ANY(v_parent_ids)
   ORDER BY parent.id
   FOR UPDATE;

  IF TG_OP <> 'DELETE'
     AND NEW.parent_transaction_id IS NOT NULL
     AND NEW.category = 'Recebimento parcial'
     AND NEW.transaction_type::text = 'entrada'
  THEN
    IF NEW.amount <= 0 OR NEW.amount <> round(NEW.amount, 2) THEN
      RAISE EXCEPTION 'O recebimento parcial deve ser positivo e ter no máximo duas casas decimais.'
        USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_LEGACY_AMOUNT_INVALID';
    END IF;

    SELECT parent.* INTO v_parent
      FROM public.financial_transactions parent
     WHERE parent.id = NEW.parent_transaction_id;
    IF NOT FOUND
       OR v_parent.transaction_type::text <> 'entrada'
       OR v_parent.parent_transaction_id IS NOT NULL
       OR v_parent.company_id IS DISTINCT FROM NEW.company_id
       OR (NEW.customer_id IS NOT NULL
           AND v_parent.customer_id IS DISTINCT FROM NEW.customer_id)
       OR v_parent.cancelled_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'A conta a receber principal não é válida.'
        USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_LEGACY_PARENT_INVALID';
    END IF;

    v_received := public.pdv_receivable_received_total_v2(
      v_parent.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END
    );
    IF v_parent.is_paid IS TRUE AND v_received <= 0 THEN
      RAISE EXCEPTION 'Esta parcela já está marcada como recebida.'
        USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_ALREADY_PAID';
    END IF;
    IF round(v_received + NEW.amount, 2) > round(v_parent.amount, 2) THEN
      RAISE EXCEPTION 'O recebimento ultrapassa o saldo da parcela.'
        USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_ALLOCATION_EXCEEDS_BALANCE';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS tg_pdv_guard_legacy_receivable_writer_v2
  ON public.financial_transactions;
CREATE TRIGGER tg_pdv_guard_legacy_receivable_writer_v2
  BEFORE INSERT OR UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_legacy_receivable_writer_v2();

CREATE OR REPLACE FUNCTION public.pdv_assert_receivable_allocation_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_receivable public.financial_transactions%ROWTYPE;
  v_settlement public.financial_transactions%ROWTYPE;
  v_original public.pdv_receivable_settlement_allocations%ROWTYPE;
  v_receivable_total numeric;
  v_settlement_total numeric;
BEGIN
  SELECT transaction.* INTO v_receivable
    FROM public.financial_transactions transaction
   WHERE transaction.id = NEW.receivable_transaction_id
     AND transaction.company_id = NEW.company_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_receivable.transaction_type::text <> 'entrada'
     OR v_receivable.parent_transaction_id IS NOT NULL
     OR v_receivable.customer_id IS DISTINCT FROM NEW.customer_id
     OR v_receivable.cancelled_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'A parcela informada não é um recebível válido deste cliente.'
      USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_INVALID';
  END IF;

  SELECT transaction.* INTO v_settlement
    FROM public.financial_transactions transaction
   WHERE transaction.id = NEW.settlement_transaction_id
     AND transaction.company_id = NEW.company_id
     AND transaction.customer_id IS NOT DISTINCT FROM NEW.customer_id
   FOR UPDATE;
  IF NOT FOUND OR v_settlement.is_paid IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'A liquidação financeira não foi encontrada.'
      USING ERRCODE = '23503', DETAIL = 'PDV_SETTLEMENT_FINANCIAL_NOT_FOUND';
  END IF;

  IF NEW.allocation_kind = 'settlement'
     AND v_settlement.transaction_type::text <> 'entrada'
  THEN
    RAISE EXCEPTION 'A liquidação deve ser uma entrada financeira.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_FINANCIAL_KIND_INVALID';
  END IF;
  IF NEW.allocation_kind = 'reversal'
     AND v_settlement.transaction_type::text <> 'saida'
  THEN
    RAISE EXCEPTION 'O estorno deve ser uma saída financeira compensatória.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_REVERSAL_KIND_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
     WHERE allocation.settlement_transaction_id = NEW.settlement_transaction_id
       AND (
         allocation.company_id <> NEW.company_id
         OR allocation.customer_id <> NEW.customer_id
         OR allocation.settlement_method <> NEW.settlement_method
         OR allocation.cash_session_id IS DISTINCT FROM NEW.cash_session_id
       )
  ) THEN
    RAISE EXCEPTION 'As alocações da liquidação não possuem o mesmo cliente e método.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_ALLOCATION_CONTEXT_MISMATCH';
  END IF;

  IF NEW.reversal_of_id IS NOT NULL THEN
    SELECT allocation.* INTO v_original
      FROM public.pdv_receivable_settlement_allocations allocation
     WHERE allocation.id = NEW.reversal_of_id
     FOR UPDATE;
    IF NOT FOUND
       OR v_original.company_id <> NEW.company_id
       OR v_original.customer_id <> NEW.customer_id
       OR v_original.receivable_transaction_id <> NEW.receivable_transaction_id
       OR v_original.allocation_kind <> 'settlement'
       OR NEW.amount <> -v_original.amount
    THEN
      RAISE EXCEPTION 'A alocação original do estorno não é válida.'
        USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_REVERSAL_INVALID';
    END IF;
  END IF;

  v_receivable_total := round(
    public.pdv_receivable_received_total_v2(NEW.receivable_transaction_id)
    + NEW.amount,
    2
  );
  IF NEW.allocation_kind = 'settlement'
     AND v_receivable.is_paid IS TRUE
     AND public.pdv_receivable_received_total_v2(NEW.receivable_transaction_id) <= 0
  THEN
    RAISE EXCEPTION 'Esta parcela já está marcada como recebida.'
      USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_ALREADY_PAID';
  END IF;
  IF v_receivable_total < 0 OR v_receivable_total > round(v_receivable.amount, 2) THEN
    RAISE EXCEPTION 'A baixa ultrapassa o saldo da parcela.'
      USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_ALLOCATION_EXCEEDS_BALANCE';
  END IF;

  SELECT round(COALESCE(sum(abs(allocation.amount)), 0) + abs(NEW.amount), 2)
    INTO v_settlement_total
    FROM public.pdv_receivable_settlement_allocations allocation
   WHERE allocation.company_id = NEW.company_id
     AND allocation.settlement_transaction_id = NEW.settlement_transaction_id;
  IF v_settlement_total > round(v_settlement.amount, 2) THEN
    RAISE EXCEPTION 'As alocações ultrapassam o valor da liquidação.'
      USING ERRCODE = '23514', DETAIL = 'PDV_SETTLEMENT_ALLOCATION_EXCEEDS_AMOUNT';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_block_receivable_allocation_mutation_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' AND (
    NOT EXISTS (SELECT 1 FROM public.companies company WHERE company.id = OLD.company_id)
    OR COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'A alocação de recebível é imutável. Registre um estorno.'
    USING ERRCODE = '55000', DETAIL = 'PDV_RECEIVABLE_ALLOCATION_IMMUTABLE';
END
$fn$;

DROP TRIGGER IF EXISTS tg_pdv_assert_receivable_allocation_v2
  ON public.pdv_receivable_settlement_allocations;
CREATE TRIGGER tg_pdv_assert_receivable_allocation_v2
  BEFORE INSERT ON public.pdv_receivable_settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION public.pdv_assert_receivable_allocation_v2();

DROP TRIGGER IF EXISTS tg_pdv_receivable_allocation_append_only_v2
  ON public.pdv_receivable_settlement_allocations;
CREATE TRIGGER tg_pdv_receivable_allocation_append_only_v2
  BEFORE UPDATE OR DELETE ON public.pdv_receivable_settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION public.pdv_block_receivable_allocation_mutation_v2();

-- ---------------------------------------------------------------------------
-- 4. Obrigacao derivada de filhos legados + alocacoes v2, sem segunda mae.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recalc_amount_received(p_parent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_total numeric(14,2);
  v_amount numeric(14,2);
  v_last_paid date;
BEGIN
  IF p_parent_id IS NULL THEN RETURN; END IF;

  SELECT public.pdv_receivable_received_total_v2(p_parent_id),
         GREATEST(
           COALESCE((
             SELECT max(child.paid_date)
               FROM public.financial_transactions child
              WHERE child.parent_transaction_id = p_parent_id
                AND child.category = 'Recebimento parcial'
                AND child.transaction_type::text = 'entrada'
                AND child.cancelled_at IS NULL
                AND child.pdv_financial_role IS NULL
                AND NOT EXISTS (
                  SELECT 1
                    FROM public.pdv_receivable_settlement_allocations allocation
                   WHERE allocation.settlement_transaction_id = child.id
                     AND allocation.receivable_transaction_id = p_parent_id
                )
           ), '-infinity'::date),
           COALESCE((
             SELECT max(settlement.paid_date)
               FROM public.pdv_receivable_settlement_allocations allocation
               JOIN public.financial_transactions settlement
                 ON settlement.id = allocation.settlement_transaction_id
              WHERE allocation.receivable_transaction_id = p_parent_id
                AND allocation.amount > 0
           ), '-infinity'::date)
         )
    INTO v_total, v_last_paid;

  IF v_last_paid = '-infinity'::date THEN v_last_paid := NULL; END IF;

  SELECT transaction.amount INTO v_amount
    FROM public.financial_transactions transaction
   WHERE transaction.id = p_parent_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM set_config('app.pdv_receivable_recalc', p_parent_id::text, true);
  UPDATE public.financial_transactions
     SET amount_received = v_total,
         is_paid = v_total >= v_amount,
         paid_date = CASE WHEN v_total >= v_amount THEN v_last_paid ELSE NULL END
   WHERE id = p_parent_id;
  PERFORM set_config('app.pdv_receivable_recalc', '', true);
END
$fn$;

CREATE OR REPLACE FUNCTION public.pdv_guard_receivable_financial_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
BEGIN
  IF TG_OP = 'DELETE' AND (
    NOT EXISTS (SELECT 1 FROM public.companies company WHERE company.id = OLD.company_id)
    OR COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text
  ) THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND COALESCE(current_setting('app.pdv_purge_company', true), '') = OLD.company_id::text
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND COALESCE(current_setting('app.pdv_receivable_recalc', true), '') = OLD.id::text
     AND (
       to_jsonb(NEW) - ARRAY['amount_received', 'is_paid', 'paid_date', 'updated_at']
     ) = (
       to_jsonb(OLD) - ARRAY['amount_received', 'is_paid', 'paid_date', 'updated_at']
     )
  THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
     WHERE allocation.receivable_transaction_id = v_id
        OR allocation.settlement_transaction_id = v_id
  ) THEN
    RAISE EXCEPTION 'Este lançamento participa de uma baixa de recebível e não pode ser alterado ou excluído. Registre um estorno.'
      USING ERRCODE = '55000', DETAIL = 'PDV_RECEIVABLE_FINANCIAL_IMMUTABLE';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS tg_pdv_receivable_financial_immutable_v2
  ON public.financial_transactions;
CREATE TRIGGER tg_pdv_receivable_financial_immutable_v2
  BEFORE UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW EXECUTE FUNCTION public.pdv_guard_receivable_financial_v2();

CREATE OR REPLACE FUNCTION public.pdv_recalc_receivable_after_allocation_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  PERFORM public.recalc_amount_received(NEW.receivable_transaction_id);

  UPDATE public.pdv_order_payments payment
     SET settlement_status = CASE
           WHEN receivable.amount_received <= 0 THEN 'open'
           WHEN receivable.amount_received >= receivable.amount THEN 'settled'
           ELSE 'partial'
         END,
         settlement_transaction_id = CASE
           WHEN receivable.amount_received >= receivable.amount
             AND NOT EXISTS (
               SELECT 1
                 FROM public.pdv_receivable_settlement_allocations other
                WHERE other.receivable_transaction_id = receivable.id
                  AND other.settlement_transaction_id <> NEW.settlement_transaction_id
                  AND other.amount > 0
             )
           THEN NEW.settlement_transaction_id
           ELSE NULL
         END,
         settled_at = CASE
           WHEN receivable.amount_received >= receivable.amount THEN now()
           ELSE NULL
         END
    FROM public.financial_transactions receivable
   WHERE payment.company_id = NEW.company_id
     AND payment.contract_version = 2
     AND payment.receivable_transaction_id = NEW.receivable_transaction_id
     AND receivable.id = NEW.receivable_transaction_id;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS tg_pdv_recalc_receivable_after_allocation_v2
  ON public.pdv_receivable_settlement_allocations;
CREATE TRIGGER tg_pdv_recalc_receivable_after_allocation_v2
  AFTER INSERT ON public.pdv_receivable_settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION public.pdv_recalc_receivable_after_allocation_v2();

-- ---------------------------------------------------------------------------
-- 5. Primitiva interna: cria a liquidacao financeira e, em dinheiro, custodia.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_create_receivable_financial_v2(
  p_company_id uuid,
  p_user_id uuid,
  p_customer_id uuid,
  p_account_id uuid,
  p_session_id uuid,
  p_method text,
  p_amount numeric,
  p_received_on date,
  p_description text,
  p_outer_request_id uuid,
  p_is_reversal boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
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
    pdv_financial_role, pdv_settlement_group_id
  ) VALUES (
    p_company_id,
    CASE WHEN p_is_reversal
      THEN 'saida'::public.transaction_type
      ELSE 'entrada'::public.transaction_type
    END,
    p_description, round(p_amount, 2), 'Recebimento parcial',
    p_received_on, p_received_on, true, p_account_id, p_customer_id,
    'pdv', p_method, p_user_id,
    'Baixa v2 de recebível; request ' || p_outer_request_id::text,
    CASE WHEN p_is_reversal
      THEN 'pdv_receivable_reversal'
      ELSE 'pdv_receivable_settlement'
    END,
    p_outer_request_id
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
$fn$;

-- ---------------------------------------------------------------------------
-- 6. RPC publica de baixa 1..N.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_settle_receivables_v2(
  p_allocations jsonb,
  p_method text,
  p_account_id uuid,
  p_session_id uuid,
  p_received_on date,
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
  v_account public.financial_accounts%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE;
  v_customer_id uuid;
  v_receivable_ids uuid[];
  v_total numeric(14,2);
  v_item jsonb;
  v_receivable public.financial_transactions%ROWTYPE;
  v_requested numeric(14,2);
  v_allocated numeric(14,2);
  v_financial_id uuid;
  v_allocation_ids jsonb := '[]'::jsonb;
  v_allocation_id uuid;
  v_result jsonb;
  v_date date;
  v_normalized_allocations jsonb;
  v_normalized_notes text;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();

  IF NOT public.pdv_can_manage_receivables_v2(v_context.user_id, false) THEN
    RAISE EXCEPTION 'Você não tem permissão para baixar contas a receber.'
      USING ERRCODE = '42501', DETAIL = 'PDV_RECEIVABLE_SETTLEMENT_FORBIDDEN';
  END IF;

  p_method := lower(btrim(COALESCE(p_method, '')));
  v_normalized_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_date := COALESCE(p_received_on, public.company_today(v_context.company_id));
  IF v_date > public.company_today(v_context.company_id) THEN
    RAISE EXCEPTION 'A data do recebimento não pode estar no futuro.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_DATE_IN_FUTURE';
  END IF;

  IF p_method NOT IN ('dinheiro', 'pix', 'transferencia') THEN
    RAISE EXCEPTION 'Forma de recebimento inválida.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_METHOD_INVALID';
  END IF;
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta financeira não informada.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_ACCOUNT_REQUIRED';
  END IF;
  IF COALESCE(jsonb_typeof(p_allocations), '') <> 'array' THEN
    RAISE EXCEPTION 'Informe de uma a cem parcelas para receber.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_ALLOCATIONS_INVALID';
  END IF;
  IF jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Informe de uma a cem parcelas para receber.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_ALLOCATIONS_INVALID';
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'receivable_id', receivable_id,
             'amount', amount
           ) ORDER BY receivable_id
         ),
         array_agg(receivable_id ORDER BY receivable_id),
         round(sum(amount), 2)
    INTO v_normalized_allocations, v_receivable_ids, v_total
    FROM (
      SELECT
        (item->>'receivable_id')::uuid AS receivable_id,
        round((item->>'amount')::numeric, 2)::numeric(14,2) AS amount
      FROM jsonb_array_elements(p_allocations) item
    ) requested;
  IF cardinality(v_receivable_ids) IS NULL
     OR cardinality(v_receivable_ids) <> (
       SELECT count(DISTINCT value) FROM unnest(v_receivable_ids) ids(value)
     )
     OR v_total IS NULL
     OR v_total <= 0
     OR EXISTS (
       SELECT 1
         FROM jsonb_array_elements(v_normalized_allocations) item
        WHERE (item->>'receivable_id') IS NULL
           OR (item->>'amount') IS NULL
           OR (item->>'amount')::numeric <= 0
     )
  THEN
    RAISE EXCEPTION 'Cada parcela deve aparecer uma vez, com valor maior que zero.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_ALLOCATIONS_DUPLICATED';
  END IF;

  IF p_method <> 'dinheiro'
     AND NOT public.can_use_bank_accounts(v_context.user_id)
  THEN
    RAISE EXCEPTION 'Você não tem permissão para usar contas bancárias.'
      USING ERRCODE = '42501', DETAIL = 'PDV_RECEIVABLE_BANK_ACCOUNT_FORBIDDEN';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_account_id);

  SELECT account.* INTO v_account
    FROM public.financial_accounts account
   WHERE account.id = p_account_id
     AND account.company_id = v_context.company_id
     AND account.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta financeira não encontrada ou inativa.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_RECEIVABLE_ACCOUNT_NOT_FOUND';
  END IF;
  IF p_method = 'dinheiro' AND v_account.type <> 'caixa' THEN
    RAISE EXCEPTION 'Recebimento em dinheiro exige uma conta do tipo Caixa.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_CASH_ACCOUNT_INVALID';
  END IF;
  IF p_method <> 'dinheiro' AND v_account.type <> 'banco' THEN
    RAISE EXCEPTION 'Pix ou transferência exige uma conta bancária.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_BANK_ACCOUNT_INVALID';
  END IF;

  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id,
      'receivable.settle.v2',
      p_idempotency_key,
      jsonb_build_object(
        'allocations', v_normalized_allocations,
        'method', p_method,
        'account_id', p_account_id,
        'session_id', p_session_id,
        'received_on', v_date,
        'notes', v_normalized_notes
      )
    );
  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN RETURN v_claim.stored_result; END IF;
    RAISE EXCEPTION 'Esta baixa já está em processamento ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_RECEIVABLE_SETTLEMENT_IN_PROGRESS';
  END IF;

  IF p_method = 'dinheiro' THEN
    SELECT session.* INTO v_session
      FROM public.pdv_cash_sessions session
     WHERE session.id = p_session_id
       AND session.company_id = v_context.company_id
     FOR UPDATE;
    IF NOT FOUND
       OR v_session.status <> 'aberta'
       OR v_session.contract_version IS DISTINCT FROM 2
       OR v_session.cash_account_id <> p_account_id
    THEN
      RAISE EXCEPTION 'Selecione um caixa v2 aberto nesta conta para receber em dinheiro.'
        USING ERRCODE = '42501', DETAIL = 'PDV_RECEIVABLE_CASH_SESSION_INVALID';
    END IF;
    IF v_session.opened_by IS DISTINCT FROM v_context.user_id
       AND NOT public.is_admin_or_gestor(v_context.user_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.user_permissions permission
          WHERE permission.user_id = v_context.user_id
            AND permission.is_active
            AND (permission.permissions ? '*' OR permission.permissions ? 'fn:edit_pdv_sales')
       )
    THEN
      RAISE EXCEPTION 'Você não pode receber no caixa de outro operador.'
        USING ERRCODE = '42501', DETAIL = 'PDV_RECEIVABLE_CASH_SESSION_FORBIDDEN';
    END IF;
  ELSIF p_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pix e transferência não movimentam a gaveta do caixa.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_BANK_SESSION_NOT_ALLOWED';
  END IF;

  PERFORM 1
    FROM public.financial_transactions transaction
   WHERE transaction.id = ANY(v_receivable_ids)
   ORDER BY transaction.id
   FOR UPDATE;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_normalized_allocations)
  LOOP
    v_requested := round((v_item->>'amount')::numeric, 2);
    IF v_requested <= 0 THEN
      RAISE EXCEPTION 'O valor de cada parcela deve ser maior que zero.'
        USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_ALLOCATION_AMOUNT_INVALID';
    END IF;

    SELECT transaction.* INTO v_receivable
      FROM public.financial_transactions transaction
     WHERE transaction.id = (v_item->>'receivable_id')::uuid
       AND transaction.company_id = v_context.company_id
       AND transaction.transaction_type::text = 'entrada'
       AND transaction.parent_transaction_id IS NULL
       AND transaction.cancelled_at IS NULL;
    IF NOT FOUND OR v_receivable.customer_id IS NULL THEN
      RAISE EXCEPTION 'Uma das parcelas não foi encontrada para este cliente.'
        USING ERRCODE = 'P0002', DETAIL = 'PDV_RECEIVABLE_NOT_FOUND';
    END IF;

    IF v_customer_id IS NULL THEN
      v_customer_id := v_receivable.customer_id;
    ELSIF v_customer_id <> v_receivable.customer_id THEN
      RAISE EXCEPTION 'Todas as parcelas da baixa devem pertencer ao mesmo cliente.'
        USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_CUSTOMER_MISMATCH';
    END IF;

    v_allocated := public.pdv_receivable_received_total_v2(v_receivable.id);
    IF v_receivable.is_paid IS TRUE AND v_allocated <= 0 THEN
      RAISE EXCEPTION 'Esta parcela já está marcada como recebida.'
        USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_ALREADY_PAID';
    END IF;
    IF v_requested > round(v_receivable.amount - v_allocated, 2) THEN
      RAISE EXCEPTION 'O valor recebido ultrapassa o saldo de uma das parcelas.'
        USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_ALLOCATION_EXCEEDS_BALANCE';
    END IF;
  END LOOP;

  PERFORM 1 FROM public.customers customer
   WHERE customer.id = v_customer_id
     AND customer.company_id = v_context.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_RECEIVABLE_CUSTOMER_NOT_FOUND';
  END IF;

  v_financial_id := public.pdv_create_receivable_financial_v2(
    v_context.company_id, v_context.user_id, v_customer_id,
    p_account_id, p_session_id, p_method, v_total, v_date,
    'Recebimento de parcelas do cliente', v_claim.request_id, false
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_normalized_allocations)
  LOOP
    INSERT INTO public.pdv_receivable_settlement_allocations (
      company_id, customer_id, settlement_transaction_id,
      receivable_transaction_id, operation_request_id, allocation_kind,
      amount, settlement_method, cash_session_id, metadata, created_by
    ) VALUES (
      v_context.company_id, v_customer_id, v_financial_id,
      (v_item->>'receivable_id')::uuid, v_claim.request_id, 'settlement',
      round((v_item->>'amount')::numeric, 2), p_method,
      CASE WHEN p_method = 'dinheiro' THEN p_session_id ELSE NULL END,
      jsonb_build_object('notes', v_normalized_notes),
      v_context.user_id
    ) RETURNING id INTO v_allocation_id;
    v_allocation_ids := v_allocation_ids || jsonb_build_array(v_allocation_id);
  END LOOP;

  v_result := jsonb_build_object(
    'ok', true,
    'financial_transaction_id', v_financial_id,
    'customer_id', v_customer_id,
    'amount', round(v_total, 2),
    'method', p_method,
    'cash_session_id', CASE WHEN p_method = 'dinheiro' THEN p_session_id ELSE NULL END,
    'allocation_ids', v_allocation_ids,
    'idempotent', false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'financial_transaction', v_financial_id, v_result
  );
  RETURN v_result;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'A lista de parcelas contém identificador ou valor inválido.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_ALLOCATIONS_INVALID';
END
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Estorno compensatorio integral de uma liquidacao v2.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_reverse_receivable_settlement_v2(
  p_settlement_transaction_id uuid,
  p_account_id uuid,
  p_session_id uuid,
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
  v_original public.financial_transactions%ROWTYPE;
  v_session public.pdv_cash_sessions%ROWTYPE;
  v_method text;
  v_customer_id uuid;
  v_total numeric(14,2);
  v_reversal_id uuid;
  v_allocation record;
  v_new_allocation uuid;
  v_result jsonb;
  v_custody_position numeric(14,2);
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF NOT public.pdv_can_manage_receivables_v2(v_context.user_id, true) THEN
    RAISE EXCEPTION 'Você não tem permissão para estornar recebimentos.'
      USING ERRCODE = '42501', DETAIL = 'PDV_RECEIVABLE_REVERSAL_FORBIDDEN';
  END IF;
  IF p_account_id IS NULL OR NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a conta e o motivo do estorno.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_REVERSAL_INPUT_INVALID';
  END IF;

  PERFORM public.pdv_lock_treasury_account(v_context.company_id, p_account_id);
  SELECT * INTO v_claim
    FROM public.pdv_claim_operation_request(
      v_context.company_id, 'receivable.reverse.v2', p_idempotency_key,
      jsonb_build_object(
        'settlement_transaction_id', p_settlement_transaction_id,
        'account_id', p_account_id,
        'session_id', p_session_id,
        'reason', btrim(p_reason)
      )
    );
  IF v_claim.is_replay THEN
    IF v_claim.request_status = 'completed' THEN RETURN v_claim.stored_result; END IF;
    RAISE EXCEPTION 'Este estorno já está em processamento ou requer revisão.'
      USING ERRCODE = '55000', DETAIL = 'PDV_RECEIVABLE_REVERSAL_IN_PROGRESS';
  END IF;

  SELECT (array_agg(allocation.settlement_method ORDER BY allocation.id))[1],
         (array_agg(allocation.customer_id ORDER BY allocation.id))[1],
         round(sum(allocation.amount), 2)
    INTO v_method, v_customer_id, v_total
    FROM public.pdv_receivable_settlement_allocations allocation
   WHERE allocation.company_id = v_context.company_id
     AND allocation.settlement_transaction_id = p_settlement_transaction_id
     AND allocation.allocation_kind = 'settlement';
  IF v_total IS NULL OR v_total <= 0 OR EXISTS (
    SELECT 1
      FROM public.pdv_receivable_settlement_allocations reversal
      JOIN public.pdv_receivable_settlement_allocations original
        ON original.id = reversal.reversal_of_id
     WHERE original.settlement_transaction_id = p_settlement_transaction_id
  ) THEN
    RAISE EXCEPTION 'Esta liquidação já foi estornada ou não possui alocações válidas.'
      USING ERRCODE = '23505', DETAIL = 'PDV_RECEIVABLE_SETTLEMENT_ALREADY_REVERSED';
  END IF;

  IF v_method = 'dinheiro' THEN
    BEGIN
      SELECT session.* INTO STRICT v_session
        FROM public.pdv_cash_sessions session
       WHERE session.id = p_session_id
         AND session.company_id = v_context.company_id
         AND session.status = 'aberta'
         AND session.contract_version = 2
         AND session.cash_account_id = p_account_id
       FOR UPDATE;
    EXCEPTION WHEN no_data_found THEN
      RAISE EXCEPTION 'Abra um caixa v2 nesta conta para devolver o dinheiro.'
        USING ERRCODE = '42501', DETAIL = 'PDV_RECEIVABLE_REVERSAL_CASH_SESSION_INVALID';
    END;
    IF v_session.opened_by IS DISTINCT FROM v_context.user_id
       AND NOT public.is_admin_or_gestor(v_context.user_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.user_permissions permission
          WHERE permission.user_id = v_context.user_id
            AND permission.is_active
            AND (permission.permissions ? '*' OR permission.permissions ? 'fn:edit_pdv_sales')
       )
    THEN
      RAISE EXCEPTION 'Você não pode estornar no caixa de outro operador.'
        USING ERRCODE = '42501', DETAIL = 'PDV_RECEIVABLE_CASH_SESSION_FORBIDDEN';
    END IF;

    SELECT round(COALESCE(position.custody_amount, 0), 2)
      INTO v_custody_position
      FROM public.pdv_cash_custody_position(
        v_context.company_id, v_session.id
      ) position;
    IF round(COALESCE(v_custody_position, 0), 2) < round(v_total, 2) THEN
      RAISE EXCEPTION 'O caixa não possui dinheiro suficiente para este estorno.'
        USING ERRCODE = '23514', DETAIL = 'PDV_RECEIVABLE_REVERSAL_INSUFFICIENT_CUSTODY';
    END IF;
  END IF;
  IF v_method <> 'dinheiro' AND p_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Estorno bancário não movimenta a gaveta.'
      USING ERRCODE = '22023', DETAIL = 'PDV_RECEIVABLE_BANK_SESSION_NOT_ALLOWED';
  END IF;
  IF v_method <> 'dinheiro'
     AND NOT public.can_use_bank_accounts(v_context.user_id)
  THEN
    RAISE EXCEPTION 'Você não tem permissão para usar contas bancárias.'
      USING ERRCODE = '42501', DETAIL = 'PDV_RECEIVABLE_BANK_ACCOUNT_FORBIDDEN';
  END IF;

  SELECT transaction.* INTO v_original
    FROM public.financial_transactions transaction
   WHERE transaction.id = p_settlement_transaction_id
     AND transaction.company_id = v_context.company_id
     AND transaction.account_id = p_account_id
     AND transaction.pdv_financial_role = 'pdv_receivable_settlement'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidação não encontrada nesta empresa e conta.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_RECEIVABLE_SETTLEMENT_NOT_FOUND';
  END IF;

  PERFORM 1
    FROM public.pdv_receivable_settlement_allocations allocation
   WHERE allocation.settlement_transaction_id = p_settlement_transaction_id
   ORDER BY allocation.receivable_transaction_id
   FOR UPDATE;
  PERFORM 1 FROM public.customers customer
   WHERE customer.id = v_customer_id AND customer.company_id = v_context.company_id
   FOR UPDATE;

  v_reversal_id := public.pdv_create_receivable_financial_v2(
    v_context.company_id, v_context.user_id, v_customer_id,
    p_account_id, p_session_id, v_method, v_total,
    public.company_today(v_context.company_id),
    'Estorno de recebimento de parcelas', v_claim.request_id, true
  );

  FOR v_allocation IN
    SELECT allocation.*
      FROM public.pdv_receivable_settlement_allocations allocation
     WHERE allocation.settlement_transaction_id = p_settlement_transaction_id
       AND allocation.allocation_kind = 'settlement'
     ORDER BY allocation.receivable_transaction_id
  LOOP
    INSERT INTO public.pdv_receivable_settlement_allocations (
      company_id, customer_id, settlement_transaction_id,
      receivable_transaction_id, operation_request_id, allocation_kind,
      amount, settlement_method, cash_session_id, reversal_of_id,
      metadata, created_by
    ) VALUES (
      v_context.company_id, v_customer_id, v_reversal_id,
      v_allocation.receivable_transaction_id, v_claim.request_id, 'reversal',
      -v_allocation.amount, v_method,
      CASE WHEN v_method = 'dinheiro' THEN p_session_id ELSE NULL END,
      v_allocation.id, jsonb_build_object('reason', btrim(p_reason)),
      v_context.user_id
    ) RETURNING id INTO v_new_allocation;
  END LOOP;

  v_result := jsonb_build_object(
    'ok', true,
    'original_financial_transaction_id', p_settlement_transaction_id,
    'financial_transaction_id', v_reversal_id,
    'amount', -v_total,
    'method', v_method,
    'idempotent', false
  );
  PERFORM public.pdv_complete_operation_request(
    v_claim.request_id, 'financial_transaction', v_reversal_id, v_result
  );
  RETURN v_result;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 8. Extrato compativel: financeiro canonico + ajustes legados independentes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pdv_customer_credit_statement_v2(p_customer_id uuid)
RETURNS TABLE (
  entry_id uuid,
  source_type text,
  amount numeric,
  occurred_at timestamptz,
  description text,
  financial_transaction_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_context record;
BEGIN
  SELECT * INTO v_context FROM public.pdv_cash_v2_context();
  IF NOT EXISTS (
    SELECT 1 FROM public.customers customer
     WHERE customer.id = p_customer_id
       AND customer.company_id = v_context.company_id
  ) THEN
    RAISE EXCEPTION 'Cliente não encontrado nesta empresa.'
      USING ERRCODE = 'P0002', DETAIL = 'PDV_RECEIVABLE_CUSTOMER_NOT_FOUND';
  END IF;

  RETURN QUERY
  SELECT * FROM (
    SELECT transaction.id, 'receivable'::text, transaction.amount::numeric,
           (transaction.transaction_date::timestamp
             AT TIME ZONE COALESCE(settings.timezone, 'America/Sao_Paulo')),
           transaction.description, transaction.id
      FROM public.financial_transactions transaction
      LEFT JOIN public.company_settings settings
        ON settings.company_id = transaction.company_id
     WHERE transaction.company_id = v_context.company_id
       AND transaction.customer_id = p_customer_id
       AND transaction.transaction_type::text = 'entrada'
       AND transaction.parent_transaction_id IS NULL
       AND transaction.cancelled_at IS NULL
       AND transaction.category IS DISTINCT FROM 'Recebimento parcial'
       AND NOT EXISTS (
         SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
          WHERE allocation.settlement_transaction_id = transaction.id
       )

    UNION ALL

    SELECT child.id, 'legacy_settlement'::text, (-child.amount)::numeric,
           (COALESCE(child.paid_date, child.transaction_date)::timestamp
             AT TIME ZONE COALESCE(settings.timezone, 'America/Sao_Paulo')),
           child.description, child.id
      FROM public.financial_transactions child
      JOIN public.financial_transactions parent
        ON parent.id = child.parent_transaction_id
       AND parent.company_id = child.company_id
       AND (child.customer_id IS NULL OR parent.customer_id = child.customer_id)
      LEFT JOIN public.company_settings settings
        ON settings.company_id = child.company_id
     WHERE child.company_id = v_context.company_id
       AND parent.customer_id = p_customer_id
       AND child.category = 'Recebimento parcial'
       AND child.transaction_type::text = 'entrada'
       AND child.cancelled_at IS NULL
       AND child.pdv_financial_role IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
          WHERE allocation.settlement_transaction_id = child.id
            AND allocation.receivable_transaction_id = parent.id
       )

    UNION ALL

    SELECT md5('pdv-legacy-direct-settlement:' || parent.id::text)::uuid,
           'legacy_direct_settlement'::text, (-parent.amount)::numeric,
           (COALESCE(parent.paid_date, parent.transaction_date)::timestamp
             AT TIME ZONE COALESCE(settings.timezone, 'America/Sao_Paulo')),
           'Quitação direta: ' || parent.description, parent.id
      FROM public.financial_transactions parent
      LEFT JOIN public.company_settings settings
        ON settings.company_id = parent.company_id
     WHERE parent.company_id = v_context.company_id
       AND parent.customer_id = p_customer_id
       AND parent.transaction_type::text = 'entrada'
       AND parent.parent_transaction_id IS NULL
       AND parent.cancelled_at IS NULL
       AND parent.category IS DISTINCT FROM 'Recebimento parcial'
       AND parent.is_paid IS TRUE
       AND NOT EXISTS (
         SELECT 1 FROM public.financial_transactions child
          WHERE child.parent_transaction_id = parent.id
            AND child.category = 'Recebimento parcial'
            AND child.transaction_type::text = 'entrada'
            AND child.cancelled_at IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.pdv_receivable_settlement_allocations allocation
          WHERE allocation.receivable_transaction_id = parent.id
       )

    UNION ALL

    SELECT allocation.id, 'settlement'::text, (-allocation.amount)::numeric,
           (COALESCE(settlement.paid_date, settlement.transaction_date)::timestamp
             AT TIME ZONE COALESCE(settings.timezone, 'America/Sao_Paulo')),
           settlement.description,
           allocation.settlement_transaction_id
      FROM public.pdv_receivable_settlement_allocations allocation
      JOIN public.financial_transactions settlement
        ON settlement.id = allocation.settlement_transaction_id
      LEFT JOIN public.company_settings settings
        ON settings.company_id = settlement.company_id
     WHERE allocation.company_id = v_context.company_id
       AND allocation.customer_id = p_customer_id

    UNION ALL

    SELECT ledger.id, 'legacy_ledger'::text, ledger.amount::numeric,
           ledger.created_at, COALESCE(ledger.notes, 'Ajuste legado'),
           ledger.financial_transaction_id
      FROM public.customer_credit_ledger ledger
     WHERE ledger.company_id = v_context.company_id
       AND ledger.customer_id = p_customer_id
       AND (
         ledger.kind = 'ajuste'
         OR ledger.financial_transaction_id IS NULL
       )
  ) statement
  ORDER BY occurred_at, entry_id;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 9. Lifecycle autorizado: reset PDV e movimentos financeiros.
-- ---------------------------------------------------------------------------

DO $patch_reset_system_step$
DECLARE
  v_oid regprocedure;
  v_src text;
  v_anchor text;
  v_insert text;
BEGIN
  SELECT procedure.oid::regprocedure, pg_get_functiondef(procedure.oid)
    INTO v_oid, v_src
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'public'
     AND procedure.proname = 'reset_system_step'
     AND pg_get_function_identity_arguments(procedure.oid) =
         'p_company_id uuid, p_step text, p_audit_id uuid';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'reset_system_step não encontrada para integrar recebíveis v2.';
  END IF;

  IF position('app.pdv_receivable_reset_ids' in v_src) = 0 THEN
    v_anchor := 'PERFORM set_config(''app.pdv_purge_company'', p_company_id::text, true);';
    v_insert := v_anchor || chr(10) || chr(10) ||
      '    PERFORM set_config(''app.pdv_receivable_reset_ids'',' || chr(10) ||
      '      COALESCE((' || chr(10) ||
      '        SELECT jsonb_agg(candidate.id ORDER BY candidate.id)::text' || chr(10) ||
      '          FROM (' || chr(10) ||
      '            SELECT payment.receivable_transaction_id AS id' || chr(10) ||
      '              FROM public.pdv_order_payments payment' || chr(10) ||
      '             WHERE payment.company_id = p_company_id' || chr(10) ||
      '               AND payment.receivable_transaction_id IS NOT NULL' || chr(10) ||
      '            UNION' || chr(10) ||
      '            SELECT payment.settlement_transaction_id' || chr(10) ||
      '              FROM public.pdv_order_payments payment' || chr(10) ||
      '             WHERE payment.company_id = p_company_id' || chr(10) ||
      '               AND payment.settlement_transaction_id IS NOT NULL' || chr(10) ||
      '            UNION' || chr(10) ||
      '            SELECT allocation.settlement_transaction_id' || chr(10) ||
      '              FROM public.pdv_receivable_settlement_allocations allocation' || chr(10) ||
      '             WHERE allocation.company_id = p_company_id' || chr(10) ||
      '            UNION' || chr(10) ||
      '            SELECT child.id' || chr(10) ||
      '              FROM public.financial_transactions child' || chr(10) ||
      '              JOIN public.pdv_order_payments payment' || chr(10) ||
      '                ON payment.receivable_transaction_id = child.parent_transaction_id' || chr(10) ||
      '               AND payment.company_id = child.company_id' || chr(10) ||
      '             WHERE payment.company_id = p_company_id' || chr(10) ||
      '               AND child.company_id = p_company_id' || chr(10) ||
      '          ) candidate' || chr(10) ||
      '      ), ''[]''), true);' || chr(10) ||
      '    DELETE FROM public.pdv_receivable_settlement_allocations' || chr(10) ||
      '     WHERE company_id = p_company_id;';
    IF position(v_anchor in v_src) = 0 THEN
      RAISE EXCEPTION 'Âncora da válvula do reset PDV mudou.';
    END IF;
    v_src := replace(v_src, v_anchor, v_insert);

    v_anchor := 'v_counts := jsonb_set(v_counts, ''{pdv_cash_sessions}'', to_jsonb(v_n));';
    v_insert := v_anchor || chr(10) || chr(10) ||
      '    DELETE FROM public.financial_transactions child' || chr(10) ||
      '     WHERE child.company_id = p_company_id' || chr(10) ||
      '       AND child.parent_transaction_id IN (' || chr(10) ||
      '         SELECT value::uuid' || chr(10) ||
      '           FROM jsonb_array_elements_text(' || chr(10) ||
      '             COALESCE(NULLIF(current_setting(''app.pdv_receivable_reset_ids'', true), ''''), ''[]'')::jsonb' || chr(10) ||
      '           ) stored(value)' || chr(10) ||
      '       );' || chr(10) ||
      '    DELETE FROM public.financial_transactions transaction' || chr(10) ||
      '     WHERE transaction.company_id = p_company_id' || chr(10) ||
      '       AND transaction.id IN (' || chr(10) ||
      '         SELECT value::uuid' || chr(10) ||
      '           FROM jsonb_array_elements_text(' || chr(10) ||
      '             COALESCE(NULLIF(current_setting(''app.pdv_receivable_reset_ids'', true), ''''), ''[]'')::jsonb' || chr(10) ||
      '           ) stored(value)' || chr(10) ||
      '       );' || chr(10) ||
      '    DELETE FROM public.pdv_operation_requests request' || chr(10) ||
      '     WHERE request.company_id = p_company_id' || chr(10) ||
      '       AND request.operation_type IN (''receivable.settle.v2'', ''receivable.reverse.v2'', ''cash.event.v2'');' || chr(10) ||
      '    PERFORM set_config(''app.pdv_receivable_reset_ids'', '''', true);';
    IF position(v_anchor in v_src) = 0 THEN
      RAISE EXCEPTION 'Âncora de sessões do reset PDV mudou.';
    END IF;
    v_src := replace(v_src, v_anchor, v_insert);
  END IF;

  IF position('PDV_RECEIVABLE_FINANCIAL_RESET_V2' in v_src) = 0 THEN
    v_anchor := 'ELSIF p_step = ''financial_movements'' THEN';
    v_insert := v_anchor || chr(10) ||
      '    -- PDV_RECEIVABLE_FINANCIAL_RESET_V2' || chr(10) ||
      '    PERFORM set_config(''app.pdv_purge_company'', p_company_id::text, true);' || chr(10) ||
      '    DELETE FROM public.pdv_receivable_settlement_allocations' || chr(10) ||
      '     WHERE company_id = p_company_id;';
    IF position(v_anchor in v_src) = 0 THEN
      RAISE EXCEPTION 'Âncora do reset financeiro mudou.';
    END IF;
    v_src := replace(v_src, v_anchor, v_insert);

    v_anchor := 'ELSIF p_step = ''financial_categories'' THEN';
    v_insert := 'DELETE FROM public.pdv_operation_requests request' || chr(10) ||
      '   WHERE request.company_id = p_company_id' || chr(10) ||
      '     AND request.operation_type IN (''receivable.settle.v2'', ''receivable.reverse.v2'', ''cash.event.v2'');' || chr(10) ||
      '  PERFORM set_config(''app.pdv_purge_company'', '''', true);' || chr(10) || chr(10) ||
      '  ' || v_anchor;
    IF position(v_anchor in v_src) = 0 THEN
      RAISE EXCEPTION 'Âncora final do reset financeiro mudou.';
    END IF;
    v_src := replace(v_src, v_anchor, v_insert);
  END IF;

  EXECUTE v_src;
END
$patch_reset_system_step$;

-- ---------------------------------------------------------------------------
-- 10. ACL.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text)
  TO service_role;

REVOKE ALL ON FUNCTION public.pdv_reverse_receivable_settlement_v2(uuid,uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_reverse_receivable_settlement_v2(uuid,uuid,uuid,text,text)
  TO service_role;

REVOKE ALL ON FUNCTION public.pdv_customer_credit_statement_v2(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_customer_credit_statement_v2(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.pdv_assert_receivable_allocation_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_block_receivable_allocation_mutation_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_guard_receivable_financial_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_recalc_receivable_after_allocation_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_create_receivable_financial_v2(uuid,uuid,uuid,uuid,uuid,text,numeric,date,text,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_receivable_received_total_v2(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_can_manage_receivables_v2(uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.pdv_guard_legacy_receivable_writer_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recalc_amount_received(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.recalc_amount_received(uuid) TO service_role;

COMMENT ON FUNCTION public.pdv_settle_receivables_v2(jsonb,text,uuid,uuid,date,text,text) IS
  'W1A-03 fechado para authenticated: W1C deve adaptar DRE/DFC aos papeis pdv_receivable_* e somente depois criar migration separada de grant.';
COMMENT ON FUNCTION public.pdv_reverse_receivable_settlement_v2(uuid,uuid,uuid,text,text) IS
  'W1A-03 fechado para authenticated: estorno compensatorio so pode ser ativado depois da projecao DRE/DFC de W1C.';
COMMENT ON FUNCTION public.pdv_customer_credit_statement_v2(uuid) IS
  'W1A-03 fechado para authenticated: W4 deve criar capacidade nominal e projeção restrita do histórico de saldo antes do grant.';

COMMIT;
