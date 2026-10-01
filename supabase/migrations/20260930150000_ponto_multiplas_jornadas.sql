-- Ponto Eletrônico: múltiplas jornadas por dia + jornada que atravessa a meia-noite.
--
-- Chamado Imperium (HVAC com plantão noturno): funcionário bate 08:00→17:00,
-- volta pra uma emergência às 23:00 e sai 01:10 do dia seguinte SEM intervalo,
-- e no dia seguinte bate 08:00→17:00 normalmente sem nenhum bloqueio.
--
-- Hoje isso é impossível por TRÊS defeitos, todos corrigidos aqui:
--
--  D1. A máquina de estado (duplicada em TypeScript na edge `time-clock-portal`
--      e no hook `useTimeRecords`) decide pelo CONJUNTO dos tipos já batidos no
--      dia. Depois do primeiro `clock_out` o conjunto está "completo" e não
--      sobra ação nenhuma → segunda jornada impossível. E como o conjunto é
--      percorrido na ordem clock_in → break_start → break_end → clock_out,
--      também é impossível bater saída SEM intervalo.
--
--  D2. `date` é sempre "hoje no fuso da empresa" no instante da batida. A saída
--      de 01:10 cai no dia seguinte: o dia da entrada fica com `clock_in` sem
--      `clock_out` (o espelho cresce até now() pra sempre) e o dia seguinte
--      recebe um `clock_out` órfão.
--
--  D3. `recompute_time_sheet` marca o dia como `complete` se existir QUALQUER
--      `clock_out`. No dia do `clock_out` órfão isso produz
--      total_worked_min = 0 + status = 'complete' + balance_min = -480:
--      OITO HORAS NEGATIVAS FALSAS no banco de horas.
--
-- Decisão de arquitetura (plano 2026-09-30-multiplas-jornadas-ponto.md):
-- a JORNADA, não o calendário, define o dia do ponto — régua da Portaria
-- 671/2021. E a regra passa a existir UMA VEZ SÓ, no banco: toda batida entra
-- por RPC que resolve o dia, valida a ação, insere e recomputa atomicamente.
--
-- ESCOPO: só banco. Edge e front viram casca numa onda seguinte. NÃO há
-- backfill de jornadas históricas já partidas pela meia-noite (decisão do
-- plano: são raras e o gestor corrige pela edição de batida que já existe).

-- ---------------------------------------------------------------------------
-- A1. Corte de madrugada, por empresa
-- ---------------------------------------------------------------------------
-- Semântica: batida feita ANTES desta hora (relógio da empresa), HAVENDO
-- jornada aberta do dia anterior, pertence ao dia anterior. Default 05:00.

ALTER TABLE public.time_settings
  ADD COLUMN IF NOT EXISTS overnight_until time NOT NULL DEFAULT '05:00';

COMMENT ON COLUMN public.time_settings.overnight_until IS
  'Batidas feitas antes desta hora (fuso da empresa) pertencem ao dia anterior quando existe jornada aberta lá. Default 05:00.';


-- ---------------------------------------------------------------------------
-- A2. Máquina de estado: decide pelo ÚLTIMO evento, nunca por conjunto
-- ---------------------------------------------------------------------------
--   (nenhum)     -> {clock_in}
--   clock_in     -> {break_start, clock_out}
--   break_start  -> {break_end}
--   break_end    -> {break_start, clock_out}
--   clock_out    -> {clock_in}                 <- é isto que destrava a 2ª jornada
--
-- A ORDEM DO ARRAY É CONTRATO: o primeiro elemento é a ação SUGERIDA, que o
-- front mostra como botão primário e que a edge continua devolvendo no campo
-- singular `next_action` (compatibilidade com bundle velho em cache de PWA).
-- Por isso `break_start` vem antes de `clock_out`: preserva o comportamento
-- atual pra quem tem intervalo, sem impedir a saída direta de quem não tem.
--
-- Empate de `recorded_at` (duas batidas no mesmo instante): desempate estável
-- por `created_at` e depois `id`, pra função nunca oscilar entre dois
-- resultados com o mesmo dado. O MESMO desempate é usado em
-- `resolve_punch_day` e em `recompute_time_sheet` — as três TÊM que concordar
-- sobre qual é "o último evento", senão o status do dia briga com o botão.
--
-- SECURITY INVOKER de propósito: função de leitura, quem chama vê só o que a
-- RLS de `time_records` já deixa ver. ATENÇÃO pra quem for consumir no front:
-- a policy de SELECT de `time_records` pra `authenticated` é
-- `user_id = auth.uid()`, e batida de quiosque/link público grava
-- `user_id = NULL`. Logo, chamada DIRETA pelo app não enxerga batida do
-- portal. O caminho confiável é o `allowed_actions` devolvido pela própria RPC
-- de registro (calculado dentro do SECURITY DEFINER, que vê tudo) ou a chamada
-- pela edge com service_role.

CREATE OR REPLACE FUNCTION public.allowed_punch_actions(
  p_company_id  uuid,
  p_employee_id uuid,
  p_date        date
)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE (
    SELECT tr.type
    FROM public.time_records tr
    WHERE tr.company_id  = p_company_id
      AND tr.employee_id = p_employee_id
      AND tr.date        = p_date
      AND tr.is_valid    = true
    ORDER BY tr.recorded_at DESC, tr.created_at DESC, tr.id DESC
    LIMIT 1
  )
    WHEN 'clock_in'    THEN ARRAY['break_start', 'clock_out']
    WHEN 'break_start' THEN ARRAY['break_end']
    WHEN 'break_end'   THEN ARRAY['break_start', 'clock_out']
    WHEN 'clock_out'   THEN ARRAY['clock_in']
    ELSE                    ARRAY['clock_in']
  END;
$$;

COMMENT ON FUNCTION public.allowed_punch_actions(uuid, uuid, date) IS
  'Ações de ponto permitidas agora, decididas pelo ULTIMO evento válido do dia. O primeiro item do array é a ação sugerida (vira next_action na edge).';

REVOKE ALL ON FUNCTION public.allowed_punch_actions(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allowed_punch_actions(uuid, uuid, date) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- A3. A que DIA uma batida pertence
-- ---------------------------------------------------------------------------
-- Devolve o dia ANTERIOR se, E SÓ SE, as TRÊS condições valerem juntas:
--
--   (1) há jornada ABERTA no dia anterior — o último `time_record` válido
--       daquele dia é `clock_in` ou `break_end` (não houve `clock_out` depois);
--   (2) é madrugada — hora no fuso da empresa < `time_settings.overnight_until`;
--   (3) a jornada aberta tem menos de 16h — teto legal absoluto.
--
-- POR QUE AS TRÊS (a razão de cada uma existir, pra ninguém "simplificar"
-- depois e reintroduzir o bug):
--
--   * (1) sozinha seria um desastre silencioso: quem esqueceu de bater saída
--     ontem chegaria hoje às 08:00 e a entrada viraria continuação de ontem —
--     o dia de hoje nasceria vazio e o de ontem acumularia 24h.
--   * (2) restringe a herança à madrugada, que é o ÚNICO caso em que ela faz
--     sentido. Quem começa a trabalhar às 00:30 SEM jornada aberta não herda
--     nada: a jornada começou no dia novo e é lá que ela pertence.
--   * (3) é o teto legal absoluto de jornada. Passou de 16h não é plantão, é
--     esquecimento — e esquecimento vira jornada aberta que o gestor corrige
--     na edição de batida, que já existe na UI.
--
-- Fuso: `company_settings.timezone` (exatamente a fonte que a edge
-- `time-clock-portal` já usa em `loadBranding`), com fallback
-- 'America/Sao_Paulo' quando nulo, vazio ou inválido — um fuso digitado
-- errado no cadastro não pode derrubar a batida do funcionário.

CREATE OR REPLACE FUNCTION public.resolve_punch_day(
  p_company_id  uuid,
  p_employee_id uuid,
  p_at          timestamptz
)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tz         text;
  v_at         timestamptz := COALESCE(p_at, now());
  v_today      date;
  v_clock      time;
  v_cutoff     time;
  v_prev       date;
  v_last_type  text;
  v_last_in    timestamptz;
BEGIN
  IF p_company_id IS NULL OR p_employee_id IS NULL THEN
    RETURN (v_at AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;

  SELECT COALESCE(NULLIF(btrim(cs.timezone), ''), 'America/Sao_Paulo')
    INTO v_tz
  FROM public.company_settings cs
  WHERE cs.company_id = p_company_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');

  -- Fuso inválido em company_settings não pode abortar a batida.
  BEGIN
    v_today := (v_at AT TIME ZONE v_tz)::date;
    v_clock := (v_at AT TIME ZONE v_tz)::time;
  EXCEPTION WHEN OTHERS THEN
    v_today := (v_at AT TIME ZONE 'America/Sao_Paulo')::date;
    v_clock := (v_at AT TIME ZONE 'America/Sao_Paulo')::time;
  END;

  SELECT COALESCE(ts.overnight_until, '05:00'::time)
    INTO v_cutoff
  FROM public.time_settings ts
  WHERE ts.company_id = p_company_id
  LIMIT 1;

  v_cutoff := COALESCE(v_cutoff, '05:00'::time);

  -- (2) fora da madrugada: o dia é sempre o do relógio.
  IF v_clock >= v_cutoff THEN
    RETURN v_today;
  END IF;

  v_prev := v_today - 1;

  -- (1) jornada aberta no dia anterior?
  SELECT tr.type
    INTO v_last_type
  FROM public.time_records tr
  WHERE tr.company_id  = p_company_id
    AND tr.employee_id = p_employee_id
    AND tr.date        = v_prev
    AND tr.is_valid    = true
  ORDER BY tr.recorded_at DESC, tr.created_at DESC, tr.id DESC
  LIMIT 1;

  IF v_last_type IS NULL OR v_last_type NOT IN ('clock_in', 'break_end') THEN
    RETURN v_today;
  END IF;

  -- (3) teto de 16h desde o último clock_in daquele dia.
  SELECT tr.recorded_at
    INTO v_last_in
  FROM public.time_records tr
  WHERE tr.company_id  = p_company_id
    AND tr.employee_id = p_employee_id
    AND tr.date        = v_prev
    AND tr.is_valid    = true
    AND tr.type        = 'clock_in'
  ORDER BY tr.recorded_at DESC, tr.created_at DESC, tr.id DESC
  LIMIT 1;

  IF v_last_in IS NULL OR (v_at - v_last_in) >= interval '16 hours' THEN
    RETURN v_today;
  END IF;

  RETURN v_prev;
END;
$$;

COMMENT ON FUNCTION public.resolve_punch_day(uuid, uuid, timestamptz) IS
  'Dia (date) a que uma batida pertence. Herda o dia anterior só com jornada aberta la + madrugada (time_settings.overnight_until) + jornada com menos de 16h.';

REVOKE ALL ON FUNCTION public.resolve_punch_day(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_punch_day(uuid, uuid, timestamptz) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- A4a. Miolo interno do registro de batida (NÃO exposto a nenhum papel)
-- ---------------------------------------------------------------------------
-- Resolve o dia, valida a ação, insere e recomputa o espelho — atômico, numa
-- transação só. As duas entradas públicas (`register_time_punch` e
-- `register_time_punch_service`) fazem APENAS controle de acesso e delegam
-- aqui, pra que a regra exista uma vez só e não volte a divergir como
-- divergiu entre a edge e o hook.

CREATE OR REPLACE FUNCTION public._register_time_punch_core(
  p_company_id         uuid,
  p_employee_id        uuid,
  p_user_id            uuid,
  p_type               text,
  p_recorded_at        timestamptz,
  p_latitude           numeric,
  p_longitude          numeric,
  p_address            text,
  p_photo_url          text,
  p_device_info        jsonb,
  p_source             text,
  p_notes              text,
  p_face_match         boolean,
  p_face_score         numeric,
  p_face_model_version text,
  p_force_date         date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at        timestamptz := COALESCE(p_recorded_at, now());
  v_tz        text;
  v_clock_day date;
  v_date      date;
  v_allowed   text[];
  v_after     text[];
BEGIN
  IF p_company_id IS NULL OR p_employee_id IS NULL THEN
    RAISE EXCEPTION 'punch_missing_identity' USING ERRCODE = 'P0001';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('clock_in', 'break_start', 'break_end', 'clock_out') THEN
    RAISE EXCEPTION 'punch_invalid_type' USING ERRCODE = 'P0001';
  END IF;

  -- Dia do RELÓGIO (o que a regra antiga usava). Precisamos dele mesmo quando
  -- a batida é herdada pelo dia anterior: é justamente o dia que hoje fica com
  -- o clock_out órfão e os -480 min falsos, e ele tem que ser recomputado
  -- (== apagado pelo guard "SEM FATO, SEM LINHA") junto.
  SELECT COALESCE(NULLIF(btrim(cs.timezone), ''), 'America/Sao_Paulo')
    INTO v_tz
  FROM public.company_settings cs
  WHERE cs.company_id = p_company_id
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');

  BEGIN
    v_clock_day := (v_at AT TIME ZONE v_tz)::date;
  EXCEPTION WHEN OTHERS THEN
    v_clock_day := (v_at AT TIME ZONE 'America/Sao_Paulo')::date;
  END;

  -- 1) dia da batida
  v_date := COALESCE(
    p_force_date,
    public.resolve_punch_day(p_company_id, p_employee_id, v_at)
  );

  -- 2/3) ordem das ações. Com p_force_date a validação NÃO se aplica: é o
  -- lançamento manual do gestor, que corrige batida faltante fora de ordem de
  -- propósito (ex.: gravar a saída que o funcionário esqueceu).
  v_allowed := public.allowed_punch_actions(p_company_id, p_employee_id, v_date);

  IF p_force_date IS NULL AND NOT (p_type = ANY (v_allowed)) THEN
    -- A edge traduz este erro pra HTTP 409 com a mensagem PT-BR que já existe.
    RAISE EXCEPTION 'punch_out_of_order' USING ERRCODE = 'P0001';
  END IF;

  -- 4) grava
  INSERT INTO public.time_records (
    company_id, user_id, employee_id, date, type, recorded_at,
    latitude, longitude, address, photo_url, device_info, source, notes,
    is_valid, face_match, face_score, face_model_version
  ) VALUES (
    p_company_id, p_user_id, p_employee_id, v_date, p_type, v_at,
    p_latitude, p_longitude, p_address, p_photo_url, p_device_info,
    COALESCE(p_source, 'app'), p_notes,
    true, p_face_match, p_face_score, p_face_model_version
  );

  -- 5) espelho do dia da batida + do dia do relógio quando são diferentes.
  PERFORM public.recompute_time_sheet(p_company_id, p_employee_id, v_date);

  IF v_clock_day IS DISTINCT FROM v_date THEN
    PERFORM public.recompute_time_sheet(p_company_id, p_employee_id, v_clock_day);
  END IF;

  -- 6) estado JÁ ATUALIZADO, pro chamador pintar a tela sem uma segunda ida
  -- ao banco.
  v_after := public.allowed_punch_actions(p_company_id, p_employee_id, v_date);

  RETURN jsonb_build_object(
    'date',            v_date,
    'type',            p_type,
    'recorded_at',     v_at,
    'allowed_actions', to_jsonb(v_after)
  );
END;
$$;

COMMENT ON FUNCTION public._register_time_punch_core(uuid, uuid, uuid, text, timestamptz, numeric, numeric, text, text, jsonb, text, text, boolean, numeric, text, date) IS
  'INTERNA. Miolo do registro de batida (resolve dia, valida ordem, insere, recomputa). Sem GRANT: só as entradas register_time_punch* chamam.';

-- Sem GRANT pra ninguém. O ACL default do banco concede EXECUTE a anon,
-- authenticated e service_role em TODA função nova — revogar de PUBLIC não
-- basta, tem que revogar nominalmente.
REVOKE ALL ON FUNCTION public._register_time_punch_core(uuid, uuid, uuid, text, timestamptz, numeric, numeric, text, text, jsonb, text, text, boolean, numeric, text, date)
  FROM PUBLIC, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- A4b. Entrada do APP AUTENTICADO (e do ManualPunchModal do gestor)
-- ---------------------------------------------------------------------------
-- FAIL-CLOSED em tudo:
--   * `company_id` NÃO vem do cliente — é derivado de get_user_company_id();
--   * sem auth.uid() → exceção, nunca "passa";
--   * bater por OUTRO funcionário exige is_admin_or_gestor;
--   * `p_force_date` (lançar em dia fechado) exige is_admin_or_gestor;
--   * o employee tem que pertencer à company derivada (anti cross-tenant).
--
-- Os campos de biometria (face_match/face_score/face_model_version) NÃO são
-- expostos aqui de propósito: quem valida rosto é a edge do portal, contra uma
-- prova consumível. Cliente autenticado não pode carimbar face_match = true.

CREATE OR REPLACE FUNCTION public.register_time_punch(
  p_type        text,
  p_recorded_at timestamptz DEFAULT NULL,
  p_employee_id uuid        DEFAULT NULL,
  p_latitude    numeric     DEFAULT NULL,
  p_longitude   numeric     DEFAULT NULL,
  p_address     text        DEFAULT NULL,
  p_photo_url   text        DEFAULT NULL,
  p_device_info jsonb       DEFAULT NULL,
  p_source      text        DEFAULT 'app',
  p_notes       text        DEFAULT NULL,
  p_force_date  date        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_company     uuid;
  v_self_emp    uuid;
  v_emp         uuid;
  v_emp_company uuid;
  v_emp_user    uuid;
  v_is_admin    boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_company := public.get_user_company_id(v_uid);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'company_not_found' USING ERRCODE = 'P0001';
  END IF;

  v_is_admin := public.is_admin_or_gestor(v_uid);

  SELECT e.id INTO v_self_emp
  FROM public.employees e
  WHERE e.user_id = v_uid AND e.company_id = v_company
  LIMIT 1;

  IF p_employee_id IS NULL THEN
    v_emp := v_self_emp;
    IF v_emp IS NULL THEN
      RAISE EXCEPTION 'employee_not_linked' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_emp := p_employee_id;
    IF v_emp IS DISTINCT FROM v_self_emp AND NOT v_is_admin THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_force_date IS NOT NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden_force_date' USING ERRCODE = '42501';
  END IF;

  SELECT e.company_id, e.user_id INTO v_emp_company, v_emp_user
  FROM public.employees e
  WHERE e.id = v_emp;

  IF v_emp_company IS NULL OR v_emp_company IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'employee_not_in_company' USING ERRCODE = '42501';
  END IF;

  RETURN public._register_time_punch_core(
    p_company_id         => v_company,
    p_employee_id        => v_emp,
    -- user_id = o dono da batida (não quem clicou), pra que a policy
    -- `user_id = auth.uid()` de time_records continue deixando o funcionário
    -- ver a própria batida quando o gestor lança por ele.
    p_user_id            => v_emp_user,
    p_type               => p_type,
    p_recorded_at        => p_recorded_at,
    p_latitude           => p_latitude,
    p_longitude          => p_longitude,
    p_address            => p_address,
    p_photo_url          => p_photo_url,
    p_device_info        => p_device_info,
    p_source             => COALESCE(p_source, 'app'),
    p_notes              => p_notes,
    p_face_match         => NULL,
    p_face_score         => NULL,
    p_face_model_version => NULL,
    p_force_date         => p_force_date
  );
END;
$$;

COMMENT ON FUNCTION public.register_time_punch(text, timestamptz, uuid, numeric, numeric, text, text, jsonb, text, text, date) IS
  'Registra batida de ponto pelo app autenticado. company_id derivado de auth.uid(); bater por outro funcionário ou usar p_force_date exige admin/gestor.';

REVOKE ALL ON FUNCTION public.register_time_punch(text, timestamptz, uuid, numeric, numeric, text, text, jsonb, text, text, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_time_punch(text, timestamptz, uuid, numeric, numeric, text, text, jsonb, text, text, date)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- A4c. Entrada da EDGE `time-clock-portal` (link pessoal e quiosque)
-- ---------------------------------------------------------------------------
-- Aqui a pessoa é anônima do ponto de vista do Postgres: quem a autenticou foi
-- a própria edge, por slug + PIN + biometria. Por isso company_id e
-- employee_id vêm explícitos — mas o vínculo entre os dois é REVALIDADO aqui,
-- pra que um employee_id de outro tenant não entre.
--
-- Só service_role. `anon` e `authenticated` são revogados nominalmente porque
-- o ACL default do banco os concede em toda função nova.

CREATE OR REPLACE FUNCTION public.register_time_punch_service(
  p_company_id         uuid,
  p_employee_id        uuid,
  p_type               text,
  p_recorded_at        timestamptz DEFAULT NULL,
  p_user_id            uuid        DEFAULT NULL,
  p_latitude           numeric     DEFAULT NULL,
  p_longitude          numeric     DEFAULT NULL,
  p_address            text        DEFAULT NULL,
  p_photo_url          text        DEFAULT NULL,
  p_device_info        jsonb       DEFAULT NULL,
  p_source             text        DEFAULT 'link_publico',
  p_notes              text        DEFAULT NULL,
  p_face_match         boolean     DEFAULT NULL,
  p_face_score         numeric     DEFAULT NULL,
  p_face_model_version text        DEFAULT NULL,
  p_force_date         date        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_company uuid;
BEGIN
  IF p_company_id IS NULL OR p_employee_id IS NULL THEN
    RAISE EXCEPTION 'punch_missing_identity' USING ERRCODE = 'P0001';
  END IF;

  SELECT e.company_id INTO v_emp_company
  FROM public.employees e
  WHERE e.id = p_employee_id;

  IF v_emp_company IS NULL OR v_emp_company IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'employee_not_in_company' USING ERRCODE = '42501';
  END IF;

  RETURN public._register_time_punch_core(
    p_company_id         => p_company_id,
    p_employee_id        => p_employee_id,
    p_user_id            => p_user_id,
    p_type               => p_type,
    p_recorded_at        => p_recorded_at,
    p_latitude           => p_latitude,
    p_longitude          => p_longitude,
    p_address            => p_address,
    p_photo_url          => p_photo_url,
    p_device_info        => p_device_info,
    p_source             => COALESCE(p_source, 'link_publico'),
    p_notes              => p_notes,
    p_face_match         => p_face_match,
    p_face_score         => p_face_score,
    p_face_model_version => p_face_model_version,
    p_force_date         => p_force_date
  );
END;
$$;

COMMENT ON FUNCTION public.register_time_punch_service(uuid, uuid, text, timestamptz, uuid, numeric, numeric, text, text, jsonb, text, text, boolean, numeric, text, date) IS
  'Registra batida vinda da edge time-clock-portal (link pessoal/quiosque). Só service_role. Revalida que o employee pertence à company.';

REVOKE ALL ON FUNCTION public.register_time_punch_service(uuid, uuid, text, timestamptz, uuid, numeric, numeric, text, text, jsonb, text, text, boolean, numeric, text, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_time_punch_service(uuid, uuid, text, timestamptz, uuid, numeric, numeric, text, text, jsonb, text, text, boolean, numeric, text, date)
  TO service_role;


-- ---------------------------------------------------------------------------
-- A5. recompute_time_sheet: o dia só fecha quando o ÚLTIMO evento é clock_out
-- ---------------------------------------------------------------------------
-- Base: definição VIVA no banco (pg_get_functiondef), não o arquivo da
-- migration. TRÊS mudanças cirúrgicas, o resto byte a byte igual:
--
--   (a) o loop passa a guardar `v_last_type` (o tipo do ÚLTIMO evento) no lugar
--       de só um booleano "existe algum clock_out". Com duas jornadas e a 2ª
--       ainda aberta, o dia tem que ficar `open` — hoje ele fica `complete`
--       porque a 1ª jornada já teve saída.
--   (b) `balance_min` idem: só sai preenchido quando o dia fecha de fato;
--       NULL enquanto houver jornada aberta. É isto que mata os -480 min
--       falsos do dia que recebia o clock_out órfão da madrugada.
--   (c) o ORDER BY ganha o mesmo desempate estável (created_at, id) de
--       `allowed_punch_actions` e `resolve_punch_day` — as três precisam
--       concordar sobre qual é "o último evento" quando dois `recorded_at`
--       empatam, senão o status do dia briga com o botão que a tela mostra.
--
-- NÃO muda: o guard "SEM FATO, SEM LINHA", o acúmulo de worked/break (que já
-- soma múltiplos pares clock_in…clock_out corretamente — cada `clock_in`
-- reabre `v_last_work_start` e cada `clock_out` fecha o par), o COALESCE que
-- preserva `expected_min` customizado no UPSERT, e o bloco "ainda trabalhando
-- conta até now()".

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
  v_last_type      text := NULL;
  v_now            timestamptz := now();
  v_worked_min     int;
  v_break_min      int;
  v_expected_min   int := 480;
  v_balance_min    int := NULL;
  v_status         text;
  v_record_count   int := 0;
BEGIN
  -- Itera os registros válidos ordenados por recorded_at (== calculateWorkedMinutes).
  -- Desempate (created_at, id) igual ao de allowed_punch_actions: as duas TÊM
  -- que concordar sobre qual é o último evento do dia.
  FOR r IN
    SELECT type, recorded_at
    FROM public.time_records
    WHERE company_id = p_company_id
      AND employee_id = p_employee_id
      AND date = p_date
      AND is_valid = true
    ORDER BY recorded_at ASC, created_at ASC, id ASC
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
      v_last_clock_out := v_t;
    END IF;

    v_last_type := r.type;
  END LOOP;

  -- SEM FATO, SEM LINHA: dia sem nenhuma batida válida não tem por que
  -- existir em time_sheets — gravar 'open' com first_clock_in = now()
  -- produziria uma entrada fantasma. Limpa (idempotente) a linha que ficou
  -- órfã quando a última batida do dia foi invalidada, e sai antes do UPSERT.
  -- (É também o que apaga o dia do relógio quando a saída da madrugada é
  -- reatribuída ao dia da entrada.)
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

  -- O dia só fecha quando o ÚLTIMO evento é clock_out. Enquanto houver jornada
  -- aberta (inclusive a 2ª do dia), status = 'open' e balance_min = NULL — dia
  -- em aberto não gera saldo, nem positivo nem negativo.
  IF v_last_type = 'clock_out' THEN
    v_status := 'complete';
    v_balance_min := v_worked_min - v_expected_min;
  ELSE
    v_status := 'open';
    v_balance_min := NULL;
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

-- Recriar função leva os GRANTs junto: reemite os que já existiam.
GRANT EXECUTE ON FUNCTION public.recompute_time_sheet(uuid, uuid, date) TO authenticated, service_role;
