-- ============================================================================
-- Ponto eletrônico via LINK PÚBLICO anônimo (/ponto/:slug)
-- ----------------------------------------------------------------------------
-- Fase BANCO apenas. A edge function (que insere o time_record via service_role
-- e chama recompute_time_sheet) e o front vêm em outra fase.
--
-- Migration ADITIVA e backward-compat: a tela logada de ponto (employees.user_id
-- + source='app') continua no ar. Nada da estrutura antiga é dropado.
--
-- Por quê do slug GLOBAL: o slug é resolvido por ACESSO ANÔNIMO (sem company_id
-- no contexto), igual aos public_short_code de contrato/OS/cliente. Por isso a
-- UNIQUE é global (não por company_id) — colisão é evitada na geração.
-- ============================================================================

-- ─── 1. Colunas em employees ────────────────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS ponto_slug text;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS ponto_enabled boolean NOT NULL DEFAULT false;

-- UNIQUE GLOBAL parcial (ignora múltiplos NULL).
CREATE UNIQUE INDEX IF NOT EXISTS employees_ponto_slug_key
  ON public.employees (ponto_slug)
  WHERE ponto_slug IS NOT NULL;

-- ─── 2. Ampliar CHECK de time_records.source ────────────────────────────────
-- Schema atual aceita 'app','admin','manual'. Preservamos os três e adicionamos
-- 'link_publico' (origem da batida anônima via edge).
ALTER TABLE public.time_records
  DROP CONSTRAINT IF EXISTS time_records_source_check;

ALTER TABLE public.time_records
  ADD CONSTRAINT time_records_source_check
  CHECK (source = ANY (ARRAY['app'::text, 'admin'::text, 'manual'::text, 'link_publico'::text]));

-- ─── 3. RPC generate_ponto_slug ─────────────────────────────────────────────
-- Gera (ou retorna existente — idempotente) o slug público do funcionário.
-- Formato: slugify(name) + '-' + código base32 de 8 chars MAIÚSCULO.
-- gen_random_bytes vive em `extensions` → SET search_path = public, extensions.
CREATE OR REPLACE FUNCTION public.generate_ponto_slug(p_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_name        text;
  v_existing    text;
  v_base        text;
  v_alphabet    text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars, sem 0/O/1/I/L
  v_code        text;
  v_candidate   text;
  v_bytes       bytea;
  v_attempt     int;
  i             int;
  v_taken       boolean;
BEGIN
  -- Lê nome e slug atual
  SELECT name, ponto_slug INTO v_name, v_existing
  FROM public.employees
  WHERE id = p_employee_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Funcionário não encontrado.';
  END IF;

  -- Idempotente: já tem slug → retorna o existente, não regenera.
  IF v_existing IS NOT NULL AND v_existing <> '' THEN
    RETURN v_existing;
  END IF;

  -- slugify do nome:
  --   1) minúsculas
  --   2) remove acentos (translate — unaccent não está instalado)
  --   3) troca não-alfanumérico por '-'
  --   4) colapsa hífens repetidos
  --   5) trim de hífens nas pontas
  --   6) trunca em ~40 chars
  v_base := lower(v_name);
  v_base := translate(
    v_base,
    'áàâãäåçéèêëíìîïñóòôõöúùûüýÿ',
    'aaaaaaceeeeiiiinooooouuuuyy'
  );
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '-+', '-', 'g');
  v_base := trim(both '-' from v_base);
  v_base := left(v_base, 40);
  v_base := trim(both '-' from v_base); -- caso o corte tenha deixado hífen na ponta
  IF v_base = '' THEN
    v_base := 'funcionario';
  END IF;

  -- Loop até achar slug único (máx. 50 tentativas)
  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;

    -- Código base32 de 8 chars usando gen_random_bytes
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    FOR i IN 0..7 LOOP
      -- 1 byte (0..255) mapeado pra índice 1..31 do alfabeto
      v_code := v_code || substr(
        v_alphabet,
        (get_byte(v_bytes, i) % 31) + 1,
        1
      );
    END LOOP;

    v_candidate := v_base || '-' || v_code;

    SELECT EXISTS (
      SELECT 1 FROM public.employees WHERE ponto_slug = v_candidate
    ) INTO v_taken;

    EXIT WHEN NOT v_taken;

    IF v_attempt >= 50 THEN
      RAISE EXCEPTION 'Não foi possível gerar um link de ponto único após 50 tentativas. Tente novamente.';
    END IF;
  END LOOP;

  UPDATE public.employees
  SET ponto_slug = v_candidate
  WHERE id = p_employee_id;

  RETURN v_candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_ponto_slug(uuid) TO authenticated, service_role;

-- ─── 4. RPC recompute_time_sheet ────────────────────────────────────────────
-- Espelha 1:1 o cálculo do espelho diário que vive no client
-- (src/hooks/useTimeRecords.ts → calculateWorkedMinutes + upsert em time_sheets).
--
-- Regras espelhadas do hook:
--   • Só considera time_records com is_valid = true, ordenados por recorded_at.
--   • worked = soma dos pares clock_in→(break_start|clock_out) e break_end→(...).
--     break = soma dos pares break_start→break_end.
--   • Se ainda aberto (sem clock_out final), conta worked/break até now().
--   • Arredonda worked/break (round).
--   • first_clock_in = 1º clock_in (fallback: now() — no hook é `|| now`).
--   • last_clock_out = recorded_at do clock_out, se houver.
--   • status = 'complete' se existe clock_out; senão 'open'.
--   • expected_min = 480 fixo (o hook NÃO consulta time_schedules pro espelho).
--   • balance_min = worked - expected_min, calculado SÓ quando há clock_out
--     (igual ao hook, que só seta balance_min dentro do `if (clockOut)`).
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
