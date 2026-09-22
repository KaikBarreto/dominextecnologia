-- ============================================================================
-- Vale de funcionario: vinculo explicito, criacao/exclusao atomica e retry
-- ============================================================================
--
-- Decisoes de integridade:
--   * linhas legadas continuam com os novos campos NULL; nao existe backfill
--     por valor/data, pois isso poderia casar fatos financeiros distintos;
--   * um vale novo aponta explicitamente para sua financial_transaction;
--   * ON DELETE CASCADE cobre a exclusao iniciada pelo Financeiro;
--   * o trigger AFTER DELETE cobre a exclusao iniciada pelo RH e recalcula os
--     balance_after restantes. Assim, nenhum dos dois caminhos deixa orfao;
--   * a chave UUID enviada pelo cliente e unica e a RPC serializa pelo UUID,
--     tornando retry concorrente deterministico.
--
-- A migration nao altera nem tenta inferir vinculo de nenhum dado legado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Elo explicito e chave de idempotencia
-- ----------------------------------------------------------------------------
ALTER TABLE public.employee_movements
  ADD COLUMN IF NOT EXISTS financial_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS movement_order bigint;

-- created_at usa now(), que e estavel durante a transacao, e UUID nao define
-- ordem de negocio. A sequencia vira o desempate canonico de todo o livro.
CREATE SEQUENCE IF NOT EXISTS public.employee_movements_order_seq;

WITH ordered AS (
  SELECT em.id,
         row_number() OVER (ORDER BY em.created_at, em.id) AS movement_order
    FROM public.employee_movements em
   WHERE em.movement_order IS NULL
)
UPDATE public.employee_movements em
   SET movement_order = ordered.movement_order
  FROM ordered
 WHERE em.id = ordered.id;

SELECT setval(
  'public.employee_movements_order_seq',
  COALESCE((SELECT max(em.movement_order) FROM public.employee_movements em), 1),
  EXISTS (SELECT 1 FROM public.employee_movements)
);

ALTER SEQUENCE public.employee_movements_order_seq
  OWNED BY public.employee_movements.movement_order;

ALTER TABLE public.employee_movements
  ALTER COLUMN movement_order SET DEFAULT nextval('public.employee_movements_order_seq'),
  ALTER COLUMN movement_order SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employee_movements_order_uidx
  ON public.employee_movements (movement_order);

COMMENT ON COLUMN public.employee_movements.financial_transaction_id IS
  'Lancamento financeiro criado atomicamente para este vale. NULL em movimentos legados. A exclusao do financeiro remove o movimento via CASCADE.';

COMMENT ON COLUMN public.employee_movements.idempotency_key IS
  'UUID gerado pelo cliente antes de criar um vale. Reenvios com a mesma chave retornam o mesmo par sem duplicar.';

ALTER TABLE public.employee_movements
  ADD CONSTRAINT employee_movements_financial_transaction_id_fkey
  FOREIGN KEY (financial_transaction_id)
  REFERENCES public.financial_transactions(id)
  ON DELETE CASCADE;

ALTER TABLE public.employee_movements
  ADD CONSTRAINT employee_movements_vale_link_check
  CHECK (
    (financial_transaction_id IS NULL AND idempotency_key IS NULL)
    OR
    (financial_transaction_id IS NOT NULL AND idempotency_key IS NOT NULL AND type = 'vale')
  );

CREATE UNIQUE INDEX employee_movements_financial_transaction_uidx
  ON public.employee_movements (financial_transaction_id)
  WHERE financial_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX employee_movements_idempotency_key_uidx
  ON public.employee_movements (idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 2) Guardas do elo
-- ----------------------------------------------------------------------------
-- Impede vinculo cross-tenant, vinculo com outra especie de financeiro e
-- remocao/troca silenciosa do elo depois de criado.
CREATE OR REPLACE FUNCTION public._validate_employee_vale_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_company_id uuid;
  v_transaction          public.financial_transactions%ROWTYPE;
  v_user_id              uuid := auth.uid();
  v_can_manage_finance   boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Nunca aceita ordem enviada pelo cliente. O DEFAULT mantem os tipos
    -- gerados corretos; o trigger sobrescreve qualquer valor explicitamente
    -- fornecido (lacunas na sequence sao aceitaveis e nao mudam a ordenacao).
    NEW.movement_order := nextval('public.employee_movements_order_seq');
    IF NEW.type = 'vale' AND NEW.financial_transaction_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Vale financeiro deve ser criado pelo fluxo atômico';
    END IF;
  ELSIF NEW.movement_order IS DISTINCT FROM OLD.movement_order THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'A ordem do extrato do funcionário é imutável';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.type IS DISTINCT FROM 'vale'
     AND NEW.type = 'vale'
     AND NEW.financial_transaction_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Vale financeiro deve ser criado pelo fluxo atômico';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.financial_transaction_id IS NOT NULL
     AND (
       NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.financial_transaction_id IS DISTINCT FROM OLD.financial_transaction_id
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Vale vinculado deve ser alterado pelo fluxo atômico';
  END IF;

  -- A partir desta migration, `vale` sempre significa fato financeiro e so
  -- pode nascer pela RPC. Saldos carregados da folha usam `vale_residual`.
  -- UPDATE/DELETE de legado continua possivel sem inventar vinculos retroativos.
  IF NEW.financial_transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.company_id
    INTO v_employee_company_id
    FROM public.employees e
   WHERE e.id = NEW.employee_id;

  SELECT ft.*
    INTO v_transaction
    FROM public.financial_transactions ft
   WHERE ft.id = NEW.financial_transaction_id;

  IF v_employee_company_id IS NULL OR v_transaction.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'Funcionário ou lançamento financeiro do vale não encontrado';
  END IF;

  -- A policy historica permite INSERT de movimentos a qualquer usuario do
  -- tenant. O trigger reaplica o gate financeiro para impedir que INSERT
  -- direto contorne a RPC.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    SELECT (
      public.is_admin_or_gestor(v_user_id)
      OR public.has_full_permissions(v_user_id)
      OR EXISTS (
        SELECT 1
          FROM public.user_permissions up
         WHERE up.user_id = v_user_id
           AND up.is_active = true
           AND (
             up.permissions ? '*'
             OR up.permissions @> '"fn:manage_finance"'::jsonb
           )
      )
    ) INTO v_can_manage_finance;

    IF public.get_user_company_id(v_user_id) IS DISTINCT FROM v_employee_company_id
       OR NOT COALESCE(v_can_manage_finance, false) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Sem permissão para vincular vale ao Financeiro';
    END IF;
  END IF;

  IF NEW.type <> 'vale'
     OR NEW.idempotency_key IS NULL
     OR v_transaction.company_id <> v_employee_company_id
     OR v_transaction.employee_id IS DISTINCT FROM NEW.employee_id
     OR v_transaction.payroll_kind IS DISTINCT FROM 'vale'
     OR v_transaction.transaction_type IS DISTINCT FROM 'saida'
     OR v_transaction.amount IS DISTINCT FROM NEW.amount
     OR NEW.payment_method IS DISTINCT FROM v_transaction.account_id::text
     OR v_transaction.is_paid IS DISTINCT FROM true
     OR v_transaction.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Vínculo de vale inconsistente entre RH e Financeiro';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public._validate_employee_vale_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_employee_vale_link ON public.employee_movements;
CREATE TRIGGER validate_employee_vale_link
  BEFORE INSERT OR UPDATE OF employee_id, type, amount, payment_method, financial_transaction_id, idempotency_key, movement_order
  ON public.employee_movements
  FOR EACH ROW
  EXECUTE FUNCTION public._validate_employee_vale_link();

-- O lado financeiro tambem nao pode ser transformado em outro fato enquanto
-- houver um vale apontando para ele. DELETE continua permitido e remove o par.
CREATE OR REPLACE FUNCTION public._guard_linked_employee_vale_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.employee_movements em
     WHERE em.financial_transaction_id = OLD.id
  ) AND (
    NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.payroll_kind IS DISTINCT FROM OLD.payroll_kind
    OR NEW.transaction_type IS DISTINCT FROM OLD.transaction_type
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
    OR NEW.paid_date IS DISTINCT FROM OLD.paid_date
    OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id
    OR NEW.is_paid IS DISTINCT FROM OLD.is_paid
    OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Lançamento vinculado a vale deve ser alterado pelo fluxo atômico';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public._guard_linked_employee_vale_transaction() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_linked_employee_vale_transaction ON public.financial_transactions;
CREATE TRIGGER guard_linked_employee_vale_transaction
  BEFORE UPDATE OF company_id, employee_id, payroll_kind, transaction_type, amount, account_id, transaction_date, paid_date, cost_center_id, is_paid, cancelled_at
  ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public._guard_linked_employee_vale_transaction();

-- Garante a outra direcao da atomicidade. O check e adiado ate o COMMIT para
-- a RPC poder inserir primeiro o financeiro e depois o movimento na mesma
-- transacao; uma chamada REST isolada de financeiro nao consegue deixar orfao.
CREATE OR REPLACE FUNCTION public._assert_employee_vale_financial_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payroll_kind = 'vale'
     AND EXISTS (
       SELECT 1
         FROM public.financial_transactions ft
        WHERE ft.id = NEW.id
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.employee_movements em
        WHERE em.financial_transaction_id = NEW.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Saída financeira de vale deve ser criada pelo fluxo atômico';
  END IF;

  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public._assert_employee_vale_financial_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assert_employee_vale_financial_link_insert ON public.financial_transactions;
CREATE CONSTRAINT TRIGGER assert_employee_vale_financial_link_insert
  AFTER INSERT ON public.financial_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.payroll_kind = 'vale')
  EXECUTE FUNCTION public._assert_employee_vale_financial_link();

DROP TRIGGER IF EXISTS assert_employee_vale_financial_link_update ON public.financial_transactions;
CREATE CONSTRAINT TRIGGER assert_employee_vale_financial_link_update
  AFTER UPDATE OF payroll_kind, employee_id, transaction_type, amount, account_id,
    transaction_date, paid_date, cost_center_id, is_paid, cancelled_at
  ON public.financial_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.payroll_kind = 'vale')
  EXECUTE FUNCTION public._assert_employee_vale_financial_link();


-- ----------------------------------------------------------------------------
-- 3) Recalculo canonico do extrato depois de DELETE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._recalculate_employee_movement_balances(p_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance  numeric;
  v_movement record;
BEGIN
  SELECT COALESCE(e.salary, 0)
    INTO v_balance
    FROM public.employees e
   WHERE e.id = p_employee_id
   FOR UPDATE;

  -- Em cascades de exclusao do funcionario, ele ja pode nao estar visivel.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_movement IN
    SELECT em.id, em.type, em.amount, em.description
      FROM public.employee_movements em
     WHERE em.employee_id = p_employee_id
     ORDER BY em.movement_order
  LOOP
    IF v_movement.type = 'pagamento' THEN
      v_balance := 0;
    ELSIF v_movement.type = 'ajuste'
          AND COALESCE(v_movement.description, '') LIKE 'Reset para salário base%' THEN
      v_balance := v_movement.amount;
    ELSIF v_movement.type IN ('bonus', 'ajuste', 'recebimento') THEN
      v_balance := v_balance + v_movement.amount;
    ELSE
      v_balance := v_balance - abs(v_movement.amount);
    END IF;

    UPDATE public.employee_movements
       SET balance_after = v_balance
     WHERE id = v_movement.id
       AND balance_after IS DISTINCT FROM v_balance;
  END LOOP;
END
$function$;

REVOKE ALL ON FUNCTION public._recalculate_employee_movement_balances(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._employee_movement_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Cascades de employee (que nao passam pela policy da tabela filha) tambem
  -- chegam aqui. Com JWT de usuario, exige o mesmo gate financeiro da RPC;
  -- chamadas internas/maintenance sem auth.uid continuam possiveis.
  IF OLD.financial_transaction_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NOT (
       public.is_super_admin(auth.uid())
       OR public.can_delete_finance(auth.uid())
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Sem permissão para excluir lançamento financeiro vinculado ao vale';
  END IF;

  PERFORM public._recalculate_employee_movement_balances(OLD.employee_id);

  -- Se o DELETE comecou no Financeiro, a linha pai ja nao esta visivel e este
  -- DELETE e no-op. Se comecou no RH, remove a outra perna do par.
  IF OLD.financial_transaction_id IS NOT NULL THEN
    DELETE FROM public.financial_transactions ft
     WHERE ft.id = OLD.financial_transaction_id;
  END IF;

  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION public._employee_movement_after_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employee_movement_after_delete ON public.employee_movements;
CREATE TRIGGER employee_movement_after_delete
  AFTER DELETE ON public.employee_movements
  FOR EACH ROW
  WHEN (OLD.financial_transaction_id IS NOT NULL)
  EXECUTE FUNCTION public._employee_movement_after_delete();


-- ----------------------------------------------------------------------------
-- 4) RLS: um movimento vinculado nao pode contornar o gate do Financeiro
-- ----------------------------------------------------------------------------
ALTER TABLE public.employee_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own employee_movements" ON public.employee_movements;
DROP POLICY IF EXISTS "Users can view own employee_movements" ON public.employee_movements;
DROP POLICY IF EXISTS "Users can insert own employee_movements" ON public.employee_movements;
DROP POLICY IF EXISTS "Users can update own employee_movements" ON public.employee_movements;
DROP POLICY IF EXISTS "Users can delete own employee_movements" ON public.employee_movements;

CREATE POLICY "Users can view own employee_movements"
  ON public.employee_movements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = employee_id
         AND (
           e.company_id = (SELECT public.get_user_company_id(auth.uid()))
           OR (SELECT public.is_super_admin(auth.uid()))
         )
    )
  );

CREATE POLICY "Users can insert own employee_movements"
  ON public.employee_movements FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = employee_id
         AND (
           e.company_id = (SELECT public.get_user_company_id(auth.uid()))
           OR (SELECT public.is_super_admin(auth.uid()))
         )
    )
  );

CREATE POLICY "Users can update own employee_movements"
  ON public.employee_movements FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = employee_id
         AND (
           e.company_id = (SELECT public.get_user_company_id(auth.uid()))
           OR (SELECT public.is_super_admin(auth.uid()))
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
       WHERE e.id = employee_id
         AND (
           e.company_id = (SELECT public.get_user_company_id(auth.uid()))
           OR (SELECT public.is_super_admin(auth.uid()))
         )
    )
  );

CREATE POLICY "Users can delete own employee_movements"
  ON public.employee_movements FOR DELETE TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.employees e
         WHERE e.id = employee_id
           AND e.company_id = (SELECT public.get_user_company_id(auth.uid()))
      )
      AND (
        financial_transaction_id IS NULL
        OR (SELECT public.can_delete_finance(auth.uid()))
      )
    )
    OR (SELECT public.is_super_admin(auth.uid()))
  );


-- ----------------------------------------------------------------------------
-- 5) Criacao atomica e idempotente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_employee_vale(
  p_employee_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_idempotency_key uuid,
  p_transaction_date date,
  p_description text DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL
)
RETURNS TABLE (
  employee_movement_id uuid,
  financial_transaction_id uuid,
  created boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id             uuid := auth.uid();
  v_company_id          uuid;
  v_employee            public.employees%ROWTYPE;
  v_account             public.financial_accounts%ROWTYPE;
  v_existing            record;
  v_previous_balance    numeric;
  v_movement_id         uuid := gen_random_uuid();
  v_financial_id        uuid := gen_random_uuid();
  v_can_manage_finance  boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário não autenticado';
  END IF;

  IF p_idempotency_key IS NULL
     OR p_employee_id IS NULL
     OR p_account_id IS NULL
     OR p_transaction_date IS NULL
     OR p_amount IS NULL
     OR p_amount <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Funcionário, conta, data, chave idempotente e valor positivo são obrigatórios';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário sem empresa vinculada';
  END IF;

  SELECT (
    public.is_admin_or_gestor(v_user_id)
    OR public.has_full_permissions(v_user_id)
    OR EXISTS (
      SELECT 1
        FROM public.user_permissions up
       WHERE up.user_id = v_user_id
         AND up.is_active = true
         AND (
           up.permissions ? '*'
           OR up.permissions @> '"fn:manage_finance"'::jsonb
         )
    )
  ) INTO v_can_manage_finance;

  IF NOT COALESCE(v_can_manage_finance, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Sem permissão para gerenciar o Financeiro';
  END IF;

  -- Serializa inclusive chaves iguais usadas por engano em funcionarios
  -- diferentes. O hash apenas escolhe o lock; a igualdade real segue no UUID.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  SELECT em.id AS movement_id,
         em.employee_id,
         em.amount AS movement_amount,
         em.description AS movement_description,
         em.financial_transaction_id AS transaction_id,
         e.company_id,
         ft.account_id,
         ft.amount AS transaction_amount,
         ft.transaction_date,
         ft.notes,
         ft.cost_center_id
    INTO v_existing
    FROM public.employee_movements em
    JOIN public.employees e ON e.id = em.employee_id
    JOIN public.financial_transactions ft ON ft.id = em.financial_transaction_id
   WHERE em.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.company_id <> v_company_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Chave idempotente pertence a outra empresa';
    END IF;

    IF v_existing.employee_id IS DISTINCT FROM p_employee_id
       OR v_existing.movement_amount IS DISTINCT FROM p_amount
       OR v_existing.movement_description IS DISTINCT FROM p_description
       OR v_existing.account_id IS DISTINCT FROM p_account_id
       OR v_existing.transaction_amount IS DISTINCT FROM p_amount
       OR v_existing.transaction_date IS DISTINCT FROM p_transaction_date
       OR v_existing.notes IS DISTINCT FROM p_description
       OR v_existing.cost_center_id IS DISTINCT FROM p_cost_center_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Chave idempotente já usada com outros dados';
    END IF;

    RETURN QUERY SELECT v_existing.movement_id, v_existing.transaction_id, false;
    RETURN;
  END IF;

  SELECT e.*
    INTO v_employee
    FROM public.employees e
   WHERE e.id = p_employee_id
   FOR UPDATE;

  IF v_employee.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Funcionário não encontrado';
  END IF;
  IF v_employee.company_id <> v_company_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Funcionário pertence a outra empresa';
  END IF;
  IF v_employee.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Funcionário inativo não pode receber vale';
  END IF;

  SELECT fa.*
    INTO v_account
    FROM public.financial_accounts fa
   WHERE fa.id = p_account_id;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Conta financeira não encontrada';
  END IF;
  IF v_account.company_id <> v_company_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Conta financeira pertence a outra empresa';
  END IF;
  IF v_account.is_active IS DISTINCT FROM true OR v_account.type = 'cartao' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Vale exige conta caixa ou banco ativa';
  END IF;

  IF p_cost_center_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.cost_centers cc
     WHERE cc.id = p_cost_center_id
       AND cc.company_id = v_company_id
       AND cc.is_active = true
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Centro de custo inválido ou pertencente a outra empresa';
  END IF;

  SELECT em.balance_after
    INTO v_previous_balance
    FROM public.employee_movements em
   WHERE em.employee_id = p_employee_id
   ORDER BY em.movement_order DESC
   LIMIT 1;

  v_previous_balance := COALESCE(v_previous_balance, v_employee.salary, 0);

  INSERT INTO public.financial_transactions (
    id,
    transaction_type,
    category,
    description,
    amount,
    transaction_date,
    paid_date,
    is_paid,
    notes,
    account_id,
    created_by,
    company_id,
    employee_id,
    payroll_kind,
    cost_center_id
  ) VALUES (
    v_financial_id,
    'saida',
    'Funcionários',
    'Vale - ' || v_employee.name,
    p_amount,
    p_transaction_date,
    p_transaction_date,
    true,
    p_description,
    p_account_id,
    v_user_id,
    v_company_id,
    p_employee_id,
    'vale',
    p_cost_center_id
  );

  INSERT INTO public.employee_movements (
    id,
    employee_id,
    type,
    amount,
    balance_after,
    description,
    payment_method,
    created_by,
    financial_transaction_id,
    idempotency_key
  ) VALUES (
    v_movement_id,
    p_employee_id,
    'vale',
    p_amount,
    v_previous_balance - abs(p_amount),
    p_description,
    p_account_id::text,
    v_user_id,
    v_financial_id,
    p_idempotency_key
  );

  RETURN QUERY SELECT v_movement_id, v_financial_id, true;
END
$function$;

COMMENT ON FUNCTION public.create_employee_vale(uuid, uuid, numeric, uuid, date, text, uuid) IS
  'Cria atomicamente vale no extrato RH e saida paga no Financeiro. Tenant, funcionario, conta, centro de custo e fn:manage_finance sao validados no banco. Retry usa idempotency_key UUID e retorna o mesmo par.';

REVOKE ALL ON FUNCTION public.create_employee_vale(uuid, uuid, numeric, uuid, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_employee_vale(uuid, uuid, numeric, uuid, date, text, uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6) Exclusao atomica e idempotente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_employee_vale(p_movement_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id    uuid := auth.uid();
  v_company_id uuid;
  v_movement   record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário não autenticado';
  END IF;

  IF p_movement_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Movimento do vale é obrigatório';
  END IF;

  v_company_id := public.get_user_company_id(v_user_id);
  IF v_company_id IS NULL OR NOT public.can_delete_finance(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sem permissão para excluir lançamento financeiro';
  END IF;

  SELECT em.id,
         em.type,
         em.employee_id,
         em.financial_transaction_id,
         e.company_id
    INTO v_movement
    FROM public.employee_movements em
    JOIN public.employees e ON e.id = em.employee_id
   WHERE em.id = p_movement_id
   FOR UPDATE OF em, e;

  -- Retry depois do primeiro sucesso: o par ja nao existe.
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF v_movement.company_id <> v_company_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Vale pertence a outra empresa';
  END IF;
  IF v_movement.type <> 'vale' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Movimento informado não é um vale';
  END IF;
  IF v_movement.financial_transaction_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Vale antigo sem vínculo financeiro. Faça a conciliação antes de excluir.';
  END IF;

  -- Legado sem elo e bloqueado acima: nunca apaga so o lado RH nem tenta
  -- adivinhar uma transacao por valor/data. Para linhas novas, o AFTER DELETE
  -- remove a financial_transaction vinculada e recalcula o saldo remanescente.
  DELETE FROM public.employee_movements em
   WHERE em.id = p_movement_id;

  RETURN true;
END
$function$;

COMMENT ON FUNCTION public.delete_employee_vale(uuid) IS
  'Exclui atomicamente o vale RH e seu lancamento financeiro explicitamente vinculado, recalculando balance_after. Retry de ID ja removido retorna true. Legado sem elo e bloqueado e nunca e casado por valor/data.';

REVOKE ALL ON FUNCTION public.delete_employee_vale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_employee_vale(uuid) TO authenticated;
