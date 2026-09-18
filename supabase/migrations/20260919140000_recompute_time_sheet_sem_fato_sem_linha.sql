-- Corrige recompute_time_sheet: dia sem NENHUMA batida válida não pode
-- virar linha de time_sheets com horário de entrada inventado.
--
-- Contexto: a exclusão (soft) de batida de ponto, habilitada na UI hoje,
-- torna alcançável um estado que antes não existia — dia com 0 registros
-- is_valid=true. Nesse caso o loop nunca achava clock_in e o fallback
-- `v_first_clock_in := v_now` (espelhado do client) fazia a função UPSERTar
-- time_sheets com first_clock_in = hora em que o gestor clicou em excluir,
-- total_worked_min = 0, status = 'open'. Histórico e Relatório passavam a
-- mostrar uma entrada que nunca aconteceu, num dia sem batida nenhuma.
--
-- Fix (mesma ideia do EcoSistema em absences_recompute_v2): SEM FATO, SEM
-- LINHA. Se o dia não tem nenhum registro válido, time_sheets não tem por
-- que ter linha — apaga (idempotente) e retorna antes do UPSERT.
--
-- Nenhuma outra regra da função muda: cálculo de worked/break, expected_min
-- fixo em 480, o COALESCE que preserva expected_min customizado no UPSERT,
-- e balance_min só calculado quando há clock_out continuam iguais.

CREATE OR REPLACE FUNCTION public.recompute_time_sheet(
  p_company_id  uuid,
  p_employee_id uuid,
  p_date        date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r                record;
  v_worked         double precision := 0;
  v_break          double precision := 0;
  v_last_work_start timestamptz := NULL;
  v_last_break_start timestamptz := NULL;
  v_t              timestamptz;
  v_first_clock_in timestamptz := NULL;
  v_last_clock_out timestamptz := NULL;
  v_has_clock_out  boolean := false;
  v_now            timestamptz := now();
  v_worked_min     int;
  v_break_min      int;
  v_expected_min   int := 480;
  v_balance_min    int := NULL;
  v_status         text;
  v_record_count   int := 0;
BEGIN
  -- Itera os registros válidos ordenados por recorded_at (== calculateWorkedMinutes)
  FOR r IN
    SELECT type, recorded_at
    FROM public.time_records
    WHERE company_id = p_company_id
      AND employee_id = p_employee_id
      AND date = p_date
      AND is_valid = true
    ORDER BY recorded_at ASC
  LOOP
    v_record_count := v_record_count + 1;
    v_t := r.recorded_at;

    IF r.type = 'clock_in' THEN
      v_last_work_start := v_t;
      IF v_first_clock_in IS NULL THEN
        v_first_clock_in := v_t;
      END IF;

    ELSIF r.type = 'break_start' AND v_last_work_start IS NOT NULL THEN
      v_worked := v_worked + EXTRACT(EPOCH FROM (v_t - v_last_work_start)) / 60.0;
      v_last_work_start := NULL;
      v_last_break_start := v_t;

    ELSIF r.type = 'break_end' THEN
      IF v_last_break_start IS NOT NULL THEN
        v_break := v_break + EXTRACT(EPOCH FROM (v_t - v_last_break_start)) / 60.0;
      END IF;
      v_last_break_start := NULL;
      v_last_work_start := v_t;

    ELSIF r.type = 'clock_out' AND v_last_work_start IS NOT NULL THEN
      v_worked := v_worked + EXTRACT(EPOCH FROM (v_t - v_last_work_start)) / 60.0;
      v_last_work_start := NULL;
    END IF;

    IF r.type = 'clock_out' THEN
      v_has_clock_out := true;
      v_last_clock_out := v_t;
    END IF;
  END LOOP;

  -- SEM FATO, SEM LINHA: dia sem nenhuma batida válida não tem por que
  -- existir em time_sheets — gravar 'open' com first_clock_in = now()
  -- produziria uma entrada fantasma. Limpa (idempotente) a linha que ficou
  -- órfã quando a última batida do dia foi invalidada, e sai antes do UPSERT.
  IF v_record_count = 0 THEN
    DELETE FROM public.time_sheets
    WHERE company_id = p_company_id
      AND employee_id = p_employee_id
      AND date = p_date;
    RETURN;
  END IF;

  -- Ainda trabalhando / em intervalo: conta até agora (== bloco final do hook)
  IF v_last_work_start IS NOT NULL THEN
    v_worked := v_worked + EXTRACT(EPOCH FROM (v_now - v_last_work_start)) / 60.0;
  END IF;
  IF v_last_break_start IS NOT NULL THEN
    v_break := v_break + EXTRACT(EPOCH FROM (v_now - v_last_break_start)) / 60.0;
  END IF;

  v_worked_min := round(v_worked)::int;
  v_break_min  := round(v_break)::int;

  -- first_clock_in: no hook é `clockIn?.recorded_at || now` → fallback now()
  IF v_first_clock_in IS NULL THEN
    v_first_clock_in := v_now;
  END IF;

  -- status e balance espelhados do hook
  IF v_has_clock_out THEN
    v_status := 'complete';
    v_balance_min := v_worked_min - v_expected_min;
  ELSE
    v_status := 'open';
    v_balance_min := NULL; -- hook só seta balance dentro do `if (clockOut)`
  END IF;

  -- UPSERT pela tripla (company_id, employee_id, date) — UNIQUE já existe.
  INSERT INTO public.time_sheets (
    company_id, employee_id, date,
    first_clock_in, last_clock_out,
    total_worked_min, total_break_min,
    expected_min, balance_min, status
  ) VALUES (
    p_company_id, p_employee_id, p_date,
    v_first_clock_in, v_last_clock_out,
    v_worked_min, v_break_min,
    v_expected_min, v_balance_min, v_status
  )
  ON CONFLICT (company_id, employee_id, date) DO UPDATE SET
    first_clock_in   = EXCLUDED.first_clock_in,
    last_clock_out   = EXCLUDED.last_clock_out,
    total_worked_min = EXCLUDED.total_worked_min,
    total_break_min  = EXCLUDED.total_break_min,
    -- preserva expected_min já existente (jornada custom), default 480 se nulo
    expected_min     = COALESCE(public.time_sheets.expected_min, EXCLUDED.expected_min),
    balance_min      = EXCLUDED.balance_min,
    status           = EXCLUDED.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_time_sheet(uuid, uuid, date) TO authenticated, service_role;
