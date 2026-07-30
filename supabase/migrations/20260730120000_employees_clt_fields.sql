-- Campos CLT do funcionário: modo de pagamento default, dados de folha e de holerite.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employment_regime text NOT NULL DEFAULT 'informal',
  ADD COLUMN IF NOT EXISTS dependents_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vt_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vt_monthly_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbo text,
  ADD COLUMN IF NOT EXISTS matricula text;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_employment_regime_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_employment_regime_check
  CHECK (employment_regime IN ('informal', 'clt'));
