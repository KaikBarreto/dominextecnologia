-- Adiciona ao diario comercial a quantidade de testes iniciados
-- pelo vendedor em cada periodo (manha/tarde).

ALTER TABLE public.salesperson_daily_activity
  ADD COLUMN IF NOT EXISTS trials_started integer NOT NULL DEFAULT 0;

ALTER TABLE public.salesperson_daily_activity
  DROP CONSTRAINT IF EXISTS salesperson_daily_activity_trials_started_non_negative;

ALTER TABLE public.salesperson_daily_activity
  ADD CONSTRAINT salesperson_daily_activity_trials_started_non_negative
  CHECK (trials_started >= 0);

COMMENT ON COLUMN public.salesperson_daily_activity.trials_started IS
  'Quantidade de testes iniciados pelo vendedor no periodo.';
