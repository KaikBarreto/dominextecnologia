-- =============================================================================
-- FOLHA DE PAGAMENTO INTEGRADA COM CONTAS A PAGAR
-- =============================================================================
-- Plano: /Users/kaikbarreto/.claude/plans/e-o-funcion-rio-deve-breezy-liskov.md
--
-- Objetivos:
-- 1) Folha pendente aparece automaticamente em Contas a Pagar (cron diário).
-- 2) Pagar pelo modal financeiro = pagar funcionário (mesma transação).
-- 3) Vales geram saída de caixa imediata.
-- 4) Frequência configurável: mensal / quinzenal / semanal por funcionário.
-- 5) Feriados nacionais BR para cálculo de "n-ésimo dia útil".
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabela de feriados + funções de dia útil
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL,
  is_recurring boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holidays_lookup ON public.holidays(date, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_unique
  ON public.holidays(date, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read holidays" ON public.holidays;
CREATE POLICY "Anyone authenticated can read holidays"
  ON public.holidays FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Manage own company holidays" ON public.holidays;
CREATE POLICY "Manage own company holidays"
  ON public.holidays FOR ALL TO authenticated
  USING (company_id IS NULL OR company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- Seed: feriados nacionais fixos (recorrentes ano a ano via is_recurring=true)
INSERT INTO public.holidays (company_id, date, name, is_recurring) VALUES
  (NULL, '2026-01-01', 'Confraternização Universal', true),
  (NULL, '2026-04-21', 'Tiradentes', true),
  (NULL, '2026-05-01', 'Dia do Trabalho', true),
  (NULL, '2026-09-07', 'Independência do Brasil', true),
  (NULL, '2026-10-12', 'Nossa Senhora Aparecida', true),
  (NULL, '2026-11-02', 'Finados', true),
  (NULL, '2026-11-15', 'Proclamação da República', true),
  (NULL, '2026-12-25', 'Natal', true)
ON CONFLICT DO NOTHING;

-- Seed móveis 2026-2030 (Carnaval, Sexta Santa, Corpus Christi calculados manualmente)
INSERT INTO public.holidays (company_id, date, name, is_recurring) VALUES
  (NULL, '2026-02-17', 'Carnaval', false),
  (NULL, '2026-04-03', 'Sexta-feira Santa', false),
  (NULL, '2026-06-04', 'Corpus Christi', false),
  (NULL, '2027-02-09', 'Carnaval', false),
  (NULL, '2027-03-26', 'Sexta-feira Santa', false),
  (NULL, '2027-05-27', 'Corpus Christi', false),
  (NULL, '2028-02-29', 'Carnaval', false),
  (NULL, '2028-04-14', 'Sexta-feira Santa', false),
  (NULL, '2028-06-15', 'Corpus Christi', false),
  (NULL, '2029-02-13', 'Carnaval', false),
  (NULL, '2029-03-30', 'Sexta-feira Santa', false),
  (NULL, '2029-05-31', 'Corpus Christi', false),
  (NULL, '2030-03-05', 'Carnaval', false),
  (NULL, '2030-04-19', 'Sexta-feira Santa', false),
  (NULL, '2030-06-20', 'Corpus Christi', false)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_business_day(d date, p_company_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXTRACT(DOW FROM d) NOT IN (0, 6)
    AND NOT EXISTS (
      SELECT 1 FROM public.holidays h
      WHERE (h.company_id IS NULL OR h.company_id = p_company_id)
        AND (
          h.date = d
          OR (h.is_recurring AND to_char(h.date, 'MM-DD') = to_char(d, 'MM-DD'))
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.nth_business_day(p_year int, p_month int, p_n int, p_company_id uuid DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  d date := make_date(p_year, p_month, 1);
  count_bd int := 0;
BEGIN
  WHILE EXTRACT(MONTH FROM d) = p_month LOOP
    IF public.is_business_day(d, p_company_id) THEN
      count_bd := count_bd + 1;
      IF count_bd = p_n THEN
        RETURN d;
      END IF;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 2) Colunas de pagamento em employees
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS payment_frequency text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS payment_day_type text NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS payment_day smallint DEFAULT 5,
  ADD COLUMN IF NOT EXISTS payment_day_2 smallint,
  ADD COLUMN IF NOT EXISTS payment_weekday smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_payment_frequency_check') THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_payment_frequency_check
      CHECK (payment_frequency IN ('monthly', 'biweekly', 'weekly'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_payment_day_type_check') THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_payment_day_type_check
      CHECK (payment_day_type IN ('business', 'calendar'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_payment_day_check') THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_payment_day_check
      CHECK (payment_day IS NULL OR payment_day BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_payment_day_2_check') THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_payment_day_2_check
      CHECK (payment_day_2 IS NULL OR payment_day_2 BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_payment_weekday_check') THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_payment_weekday_check
      CHECK (payment_weekday IS NULL OR payment_weekday BETWEEN 0 AND 6);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Colunas de folha em financial_transactions
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payroll_period text,
  ADD COLUMN IF NOT EXISTS payroll_kind text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_transactions_payroll_kind_check') THEN
    ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_payroll_kind_check
      CHECK (payroll_kind IS NULL OR payroll_kind IN ('salary', 'vale', 'bonus', 'rescission'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_financial_transactions_employee
  ON public.financial_transactions(employee_id, payroll_period)
  WHERE employee_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_transactions_payroll_unique
  ON public.financial_transactions(employee_id, payroll_period, payroll_kind)
  WHERE employee_id IS NOT NULL
    AND payroll_kind = 'salary'
    AND cancelled_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4) Função utilitária: calcula due_date da próxima(s) folha(s) num intervalo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_payroll_periods(
  p_employee_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (period text, due_date date, amount_factor numeric)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  emp record;
  d date;
  cursor_date date;
  yr int;
  mo int;
  due_d date;
BEGIN
  SELECT id, company_id, salary, payment_frequency, payment_day_type,
         payment_day, payment_day_2, payment_weekday
    INTO emp
    FROM public.employees
   WHERE id = p_employee_id AND is_active = true;

  IF NOT FOUND THEN RETURN; END IF;

  IF emp.payment_frequency = 'monthly' THEN
    cursor_date := date_trunc('month', p_from)::date;
    WHILE cursor_date <= p_to LOOP
      yr := EXTRACT(YEAR FROM cursor_date)::int;
      mo := EXTRACT(MONTH FROM cursor_date)::int;
      IF emp.payment_day_type = 'business' THEN
        due_d := public.nth_business_day(yr, mo, COALESCE(emp.payment_day, 5), emp.company_id);
      ELSE
        due_d := make_date(yr, mo, LEAST(COALESCE(emp.payment_day, 5),
          EXTRACT(DAY FROM (date_trunc('month', cursor_date) + interval '1 month - 1 day'))::int));
      END IF;
      IF due_d IS NOT NULL AND due_d >= p_from AND due_d <= p_to THEN
        period := to_char(cursor_date, 'YYYY-MM');
        due_date := due_d;
        amount_factor := 1.0;
        RETURN NEXT;
      END IF;
      cursor_date := (cursor_date + interval '1 month')::date;
    END LOOP;

  ELSIF emp.payment_frequency = 'biweekly' THEN
    cursor_date := date_trunc('month', p_from)::date;
    WHILE cursor_date <= p_to LOOP
      yr := EXTRACT(YEAR FROM cursor_date)::int;
      mo := EXTRACT(MONTH FROM cursor_date)::int;
      -- Primeiro pagamento
      IF emp.payment_day_type = 'business' THEN
        due_d := public.nth_business_day(yr, mo, COALESCE(emp.payment_day, 5), emp.company_id);
      ELSE
        due_d := make_date(yr, mo, COALESCE(emp.payment_day, 5));
      END IF;
      IF due_d IS NOT NULL AND due_d >= p_from AND due_d <= p_to THEN
        period := to_char(cursor_date, 'YYYY-MM') || '-Q1';
        due_date := due_d;
        amount_factor := 0.5;
        RETURN NEXT;
      END IF;
      -- Segundo pagamento
      IF emp.payment_day_type = 'business' THEN
        due_d := public.nth_business_day(yr, mo, COALESCE(emp.payment_day_2, 20), emp.company_id);
      ELSE
        due_d := make_date(yr, mo, LEAST(COALESCE(emp.payment_day_2, 20),
          EXTRACT(DAY FROM (date_trunc('month', cursor_date) + interval '1 month - 1 day'))::int));
      END IF;
      IF due_d IS NOT NULL AND due_d >= p_from AND due_d <= p_to THEN
        period := to_char(cursor_date, 'YYYY-MM') || '-Q2';
        due_date := due_d;
        amount_factor := 0.5;
        RETURN NEXT;
      END IF;
      cursor_date := (cursor_date + interval '1 month')::date;
    END LOOP;

  ELSIF emp.payment_frequency = 'weekly' THEN
    -- Próxima ocorrência do payment_weekday a partir de p_from
    d := p_from;
    WHILE d <= p_to LOOP
      IF EXTRACT(DOW FROM d)::int = COALESCE(emp.payment_weekday, 5) THEN
        period := to_char(d, 'IYYY-"W"IW');
        due_date := d;
        amount_factor := 1.0 / 4.33;
        RETURN NEXT;
      END IF;
      d := d + 1;
    END LOOP;
  END IF;

  RETURN;
END
$$;

-- ---------------------------------------------------------------------------
-- 5) RPC: gerar folhas em massa (usado pela edge function e pelo backfill)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_payroll_for_employee(
  p_employee_id uuid,
  p_lookahead_days int DEFAULT 35
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp record;
  p record;
  inserted_count int := 0;
  category_id uuid;
BEGIN
  SELECT id, company_id, name, salary, is_active
    INTO emp
    FROM public.employees
   WHERE id = p_employee_id;

  IF NOT FOUND OR emp.is_active = false OR emp.salary IS NULL OR emp.salary <= 0 THEN
    RETURN 0;
  END IF;

  -- Garante categoria "Folha de Pagamento" para a empresa
  SELECT id INTO category_id
    FROM public.financial_categories
   WHERE company_id = emp.company_id AND name = 'Folha de Pagamento'
   LIMIT 1;

  IF category_id IS NULL THEN
    INSERT INTO public.financial_categories (company_id, name, type, color, icon, dre_group, is_system)
    VALUES (emp.company_id, 'Folha de Pagamento', 'saida', '#f59e0b', 'Users', 'opex', true)
    RETURNING id INTO category_id;
  END IF;

  FOR p IN
    SELECT * FROM public.compute_payroll_periods(emp.id, CURRENT_DATE, CURRENT_DATE + p_lookahead_days)
  LOOP
    BEGIN
      INSERT INTO public.financial_transactions (
        company_id, transaction_type, description, amount,
        transaction_date, due_date, is_paid, category,
        employee_id, payroll_period, payroll_kind
      ) VALUES (
        emp.company_id, 'saida',
        'Folha ' || emp.name || ' — ' || p.period,
        ROUND((emp.salary * p.amount_factor)::numeric, 2),
        p.due_date, p.due_date, false,
        'Folha de Pagamento',
        emp.id, p.period, 'salary'
      );
      inserted_count := inserted_count + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Já existe folha não-cancelada para esse período: ignora (idempotente)
      NULL;
    END;
  END LOOP;

  RETURN inserted_count;
END
$$;

GRANT EXECUTE ON FUNCTION public.generate_payroll_for_employee(uuid, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) RPC: pagar uma transação financeira de folha
--    (usada quando o usuário clica em "Pagar" numa linha de folha)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_payroll_transaction(
  p_transaction_id uuid,
  p_account_id uuid,
  p_paid_date date DEFAULT NULL,
  p_vale_discount numeric DEFAULT 0,
  p_net_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_method text DEFAULT 'pix'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  txn record;
  emp_company_id uuid;
  paid_d date := COALESCE(p_paid_date, CURRENT_DATE);
  effective_amount numeric;
BEGIN
  SELECT id, company_id, employee_id, amount, payroll_kind, is_paid
    INTO txn
    FROM public.financial_transactions
   WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação não encontrada';
  END IF;

  IF txn.is_paid THEN
    RAISE EXCEPTION 'Transação já está paga';
  END IF;

  IF txn.employee_id IS NULL OR txn.payroll_kind IS NULL THEN
    RAISE EXCEPTION 'Transação não é de folha de pagamento';
  END IF;

  -- Garante que o usuário pertence à mesma empresa (service_role bypassa)
  IF auth.uid() IS NOT NULL
     AND public.get_user_company_id(auth.uid()) IS DISTINCT FROM txn.company_id THEN
    RAISE EXCEPTION 'Sem permissão para pagar esta transação';
  END IF;

  effective_amount := COALESCE(p_net_amount, txn.amount);

  UPDATE public.financial_transactions
     SET is_paid = true,
         paid_date = paid_d,
         account_id = p_account_id,
         payment_method = COALESCE(p_payment_method, payment_method),
         amount = effective_amount,
         notes = COALESCE(p_notes, notes),
         updated_at = now()
   WHERE id = p_transaction_id;

  -- Registra movement de pagamento no extrato do funcionário
  INSERT INTO public.employee_movements (
    employee_id, type, amount, balance_after, description, payment_method, created_by
  ) VALUES (
    txn.employee_id, 'pagamento', effective_amount, 0,
    'Folha quitada via Contas a Pagar',
    p_account_id::text, auth.uid()
  );

  -- Reset cycle (mesmo padrão do handlePayment existente)
  INSERT INTO public.employee_movements (
    employee_id, type, amount, balance_after, description, created_by
  ) SELECT
    txn.employee_id, 'ajuste', e.salary, e.salary, 'Reset para salário base', auth.uid()
    FROM public.employees e WHERE e.id = txn.employee_id;

  RETURN jsonb_build_object(
    'transaction_id', txn.id,
    'employee_id', txn.employee_id,
    'amount', effective_amount,
    'paid_date', paid_d
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.pay_payroll_transaction(uuid, uuid, date, numeric, numeric, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Trigger: cancelar folha pendente quando funcionário é desativado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_employee_deactivated()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (OLD.is_active = true OR OLD.is_active IS NULL) AND NEW.is_active = false THEN
    UPDATE public.financial_transactions
       SET cancelled_at = now(),
           cancelled_reason = 'Funcionário desativado',
           updated_at = now()
     WHERE employee_id = NEW.id
       AND payroll_kind = 'salary'
       AND is_paid = false
       AND cancelled_at IS NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_employee_deactivated ON public.employees;
CREATE TRIGGER trg_employee_deactivated
  AFTER UPDATE OF is_active ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.on_employee_deactivated();

-- ---------------------------------------------------------------------------
-- 8) Backfill: gerar folhas do período corrente para todos funcionários ativos
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  emp_id uuid;
BEGIN
  FOR emp_id IN SELECT id FROM public.employees WHERE is_active = true LOOP
    PERFORM public.generate_payroll_for_employee(emp_id, 35);
  END LOOP;
END $$;
