-- =============================================================================
-- Régua de instâncias + veredito de tier (descer/manter/subir) — /admin "Banco de Dados"
-- PORTADO do EcoSistema (20260825010000_db_compute_catalog_and_instance_recommendation.sql).
-- -----------------------------------------------------------------------------
-- Por quê: o painel precisa recomendar, em linguagem de leigo, se o tier de
-- compute do Supabase está sobredimensionado, ok, ou apertado, com preços reais
-- e uma régua de tiers (Micro→XL). Camada de banco:
--   1) catálogo de tiers (db_compute_catalog) alimentável por edge function
--   2) seed inicial dos tiers (⚠️ PREÇOS PRECISAM DE CONFERÊNCIA DO CEO)
--   3) upsert_compute_catalog (service_role substitui o catálogo)
--   4) get_instance_recommendation (veredito conservador com folga de 40%)
--
-- ADAPTAÇÕES Eco -> Dominex:
--   * Guard: is_super_admin(auth.uid()) no lugar de is_platform_admin.
--   * RLS SELECT do catálogo: is_super_admin(auth.uid()).
--   * REVOKE explícito de anon E authenticated (default privilege do Dominex).
--   * Marco pós-otimização (v_baseline) do Eco NÃO se aplica ao Dominex —
--     substituído por now()-7d puro (rolling 7d). Ver nota no corpo.
--
-- ⚠️ DEPENDÊNCIA: get_instance_recommendation() lê db_health_history. Enquanto
--    o coletor não rodar, a tabela fica vazia e a RPC RAISE 'Sem dados de
--    db_health_history...'. O frontend deve tolerar esse erro (estado vazio).
-- =============================================================================

-- 1) TABELA catálogo de tiers -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.db_compute_catalog (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at   timestamptz NOT NULL DEFAULT now(),
  identifier    text,
  name          text NOT NULL,
  cpu_cores     numeric,
  cpu_dedicated boolean,
  memory_gb     numeric NOT NULL,
  price_monthly numeric,
  price_hourly  numeric
);

ALTER TABLE public.db_compute_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_db_compute_catalog" ON public.db_compute_catalog;
CREATE POLICY "service_role_full_access_db_compute_catalog"
  ON public.db_compute_catalog FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Leitura só super_admin. (SELECT is_super_admin(...)) p/ o planner avaliar 1x
-- por query, não por linha. Sem política de write p/ authenticated.
DROP POLICY IF EXISTS "super_admin_select_db_compute_catalog" ON public.db_compute_catalog;
CREATE POLICY "super_admin_select_db_compute_catalog"
  ON public.db_compute_catalog FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())));

-- 2) SEED inicial dos tiers ---------------------------------------------------
-- Valores copiados do seed do Eco (planos de compute do Supabase, captura de
-- 2026-08). ⚠️ PREÇOS/SPECS PRECISAM DE CONFERÊNCIA DO CEO antes de exibir:
-- o Supabase reajusta preços e o tier real da instância do Dominex pode diferir.
-- Só semeia se a tabela estiver vazia (idempotente em reaplicação).
INSERT INTO public.db_compute_catalog
  (captured_at, identifier, name, cpu_cores, cpu_dedicated, memory_gb, price_hourly, price_monthly)
SELECT now(), v.identifier, v.name, v.cpu_cores, v.cpu_dedicated, v.memory_gb, v.price_hourly, v.price_monthly
FROM (VALUES
  ('micro',  'Micro',  2::numeric, false, 1::numeric,  0.01344::numeric, 10::numeric),
  ('small',  'Small',  2::numeric, false, 2::numeric,  0.0206::numeric,  15::numeric),
  ('medium', 'Medium', 2::numeric, false, 4::numeric,  0.0822::numeric,  60::numeric),
  ('large',  'Large',  2::numeric, true,  8::numeric,  0.1517::numeric,  111::numeric),
  ('xl',     'XL',     4::numeric, true,  16::numeric, 0.2877::numeric,  210::numeric)
) AS v(identifier, name, cpu_cores, cpu_dedicated, memory_gb, price_hourly, price_monthly)
WHERE NOT EXISTS (SELECT 1 FROM public.db_compute_catalog);

-- 3) RPC upsert_compute_catalog(jsonb) — edge function (service_role) substitui -
CREATE OR REPLACE FUNCTION public.upsert_compute_catalog(p_payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_service boolean := (auth.role() = 'service_role');
  v_now        timestamptz := now();
  v_count      integer;
BEGIN
  -- Guard: só service_role (edge/cron) ou super_admin.
  IF NOT (v_is_service OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: upsert_compute_catalog requer service_role ou super admin';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'array' THEN
    RAISE EXCEPTION 'p_payload deve ser um array JSON de tiers';
  END IF;

  -- Substitui a captura inteira (TRUNCATE + INSERT = nova captura).
  TRUNCATE TABLE public.db_compute_catalog RESTART IDENTITY;

  INSERT INTO public.db_compute_catalog
    (captured_at, identifier, name, cpu_cores, cpu_dedicated, memory_gb, price_hourly, price_monthly)
  SELECT
    v_now,
    e->>'identifier',
    e->>'name',
    NULLIF(e->>'cpu_cores','')::numeric,
    NULLIF(e->>'cpu_dedicated','')::boolean,
    NULLIF(e->>'memory_gb','')::numeric,
    NULLIF(e->>'price_hourly','')::numeric,
    NULLIF(e->>'price_monthly','')::numeric
  FROM jsonb_array_elements(p_payload) AS e
  WHERE COALESCE(e->>'name','') <> '';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Default privilege do Dominex concede EXECUTE a anon/authenticated — revogamos
-- explicitamente (só service_role/edge escreve o catálogo).
REVOKE ALL ON FUNCTION public.upsert_compute_catalog(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_compute_catalog(jsonb) TO service_role;

-- 4) RPC get_instance_recommendation() — veredito conservador (folga 40%) ------
CREATE OR REPLACE FUNCTION public.get_instance_recommendation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Dominex: sem marco pós-otimização específico (o v_baseline do Eco era
  -- ancorado num incidente do Eco). Aqui usamos janela rolling 7d pura.
  v_window_from   timestamptz := now() - interval '7 days';
  v_sample_count  int := 0;
  v_data_note     text := NULL;

  v_peak_cpu      numeric;   -- p95 (base da decisão)
  v_peak_ram_gb   numeric;   -- p95 (base da decisão)
  v_peak_cpu_max  numeric;   -- max() cru da janela (transparência)
  v_peak_ram_max  numeric;   -- max() cru da janela (transparência)
  v_peak_conn     integer;
  v_peak_conn_max integer;
  v_cur_mem_gb    numeric;

  v_cap_ts        timestamptz;
  v_cur           record;   -- instância atual (linha do catálogo mais próxima em RAM)
  v_ideal         record;   -- tier recomendado

  v_verdict       text;
  v_verdict_label text;
  v_economia      numeric;

  v_reason_cpu    jsonb;
  v_reason_ram    jsonb;
  v_reason_conn   jsonb;

  v_cur_shared    numeric;  -- shared_buffers do atual (GB)
  v_est_ram_ideal numeric;
  v_est_cpu_ideal numeric;
  v_ram_pct       numeric;  -- % da capacidade RAM do tier ideal usada no pico
  v_cpu_pct_ideal numeric;
  v_conn_pct      numeric;

  v_catalog       jsonb;
BEGIN
  -- Guard: só super_admin (chamada como authenticated).
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: get_instance_recommendation requer super admin';
  END IF;

  -- Captura mais recente do catálogo.
  SELECT max(captured_at) INTO v_cap_ts FROM public.db_compute_catalog;

  -- RAM total atual (do registro mais recente, independente da janela).
  SELECT round((mem_total_bytes / (1024^3))::numeric, 2)
  INTO v_cur_mem_gb
  FROM public.db_health_history
  ORDER BY captured_at DESC
  LIMIT 1;

  -- ---- Picos na janela rolling 7d -------------------------------------------
  -- Decisão de capacidade usa p95 (pico TÍPICO), não max() cru. Guardamos o
  -- max() cru só p/ transparência no JSON.
  SELECT
    count(*),
    round((percentile_cont(0.95) within group (order by cpu_pct))::numeric, 1),
    round((percentile_cont(0.95) within group (order by (mem_pct/100.0) * mem_total_bytes) / (1024^3))::numeric, 2),
    round((max(cpu_pct))::numeric, 1),
    round((max((mem_pct/100.0) * mem_total_bytes) / (1024^3))::numeric, 2),
    max(conn_used),
    max(conn_max)
  INTO v_sample_count, v_peak_cpu, v_peak_ram_gb, v_peak_cpu_max, v_peak_ram_max, v_peak_conn, v_peak_conn_max
  FROM public.db_health_history
  WHERE captured_at >= v_window_from;

  -- ---- Sem amostras: não quebrar, retornar "manter" -------------------------
  IF v_sample_count = 0 OR v_peak_cpu IS NULL THEN
    IF v_cur_mem_gb IS NULL THEN
      RAISE EXCEPTION 'Sem dados de db_health_history para gerar recomendação';
    END IF;

    SELECT c.identifier, c.name, c.cpu_cores, c.cpu_dedicated, c.memory_gb, c.price_monthly
    INTO v_cur
    FROM public.db_compute_catalog c
    WHERE c.captured_at = v_cap_ts
    ORDER BY abs(c.memory_gb - v_cur_mem_gb) ASC, c.memory_gb DESC
    LIMIT 1;

    IF v_cur.name IS NULL THEN
      RAISE EXCEPTION 'Catálogo de compute vazio — rode upsert_compute_catalog';
    END IF;

    SELECT jsonb_agg(sub.t ORDER BY sub.memory_gb ASC)
    INTO v_catalog
    FROM (
      SELECT jsonb_build_object(
               'identifier', c.identifier,
               'name', c.name,
               'cpu_cores', c.cpu_cores,
               'cpu_dedicated', c.cpu_dedicated,
               'memory_gb', c.memory_gb,
               'price_monthly', c.price_monthly
             ) AS t, c.memory_gb
      FROM public.db_compute_catalog c
      WHERE c.captured_at = v_cap_ts
    ) sub;

    RETURN jsonb_build_object(
      'current', jsonb_build_object(
        'identifier', v_cur.identifier, 'name', v_cur.name,
        'cpu_cores', v_cur.cpu_cores, 'cpu_dedicated', v_cur.cpu_dedicated,
        'memory_gb', v_cur.memory_gb, 'price_monthly', v_cur.price_monthly
      ),
      'ideal', jsonb_build_object(
        'identifier', v_cur.identifier, 'name', v_cur.name,
        'cpu_cores', v_cur.cpu_cores, 'cpu_dedicated', v_cur.cpu_dedicated,
        'memory_gb', v_cur.memory_gb, 'price_monthly', v_cur.price_monthly
      ),
      'verdict', 'manter',
      'verdict_label', 'Manter na ' || v_cur.name,
      'reasons', '[]'::jsonb,
      'peaks', jsonb_build_object(
        'cpu_pct', NULL,
        'ram_gb', NULL,
        'cpu_pct_max', NULL,
        'ram_gb_max', NULL,
        'connections', NULL,
        'connections_max', NULL,
        'window_days', 7,
        'window_from', v_window_from,
        'sample_count', 0
      ),
      'economia_mensal', 0,
      'catalog', COALESCE(v_catalog, '[]'::jsonb),
      'catalog_captured_at', v_cap_ts,
      'data_note', 'Ainda não há amostras de histórico suficientes para recomendar mudança de tier. Mantendo o tier atual até o coletor acumular coleta.'
    );
  END IF;

  IF v_cur_mem_gb IS NULL THEN
    RAISE EXCEPTION 'Sem dados de db_health_history para gerar recomendação';
  END IF;

  -- Veredito preliminar enquanto acumula amostras (< ~4h a cada 2min).
  IF v_sample_count < 120 THEN
    v_data_note := 'Veredito preliminar — ainda acumulando dados ('
                   || v_sample_count || ' amostras na janela de 7 dias). '
                   || 'Ganha confiança nos próximos dias.';
  END IF;

  -- ---- Instância atual: tier cujo memory_gb é o mais próximo do mem total ---
  SELECT c.identifier, c.name, c.cpu_cores, c.cpu_dedicated, c.memory_gb, c.price_monthly
  INTO v_cur
  FROM public.db_compute_catalog c
  WHERE c.captured_at = v_cap_ts
  ORDER BY abs(c.memory_gb - v_cur_mem_gb) ASC, c.memory_gb DESC
  LIMIT 1;

  IF v_cur.name IS NULL THEN
    RAISE EXCEPTION 'Catálogo de compute vazio — rode upsert_compute_catalog';
  END IF;

  v_cur_shared := v_cur.memory_gb * 0.25;  -- shared_buffers default Supabase (~25% da RAM)

  -- ---- Avalia cada tier sob modelo conservador (usar no máx 60%) -----------
  WITH evald AS (
    SELECT
      c.*,
      (v_peak_ram_gb - (v_cur_shared - c.memory_gb * 0.25))            AS est_ram_on_t,
      (v_peak_cpu * (v_cur.cpu_cores / c.cpu_cores))                   AS est_cpu_on_t,
      c.memory_gb * 0.60                                               AS ram_cap,
      ((v_peak_ram_gb - (v_cur_shared - c.memory_gb * 0.25)) <= c.memory_gb * 0.60) AS ram_ok,
      ((v_peak_cpu * (v_cur.cpu_cores / c.cpu_cores)) <= 60)           AS cpu_ok
    FROM public.db_compute_catalog c
    WHERE c.captured_at = v_cap_ts
  ),
  serve AS (
    SELECT * FROM evald WHERE ram_ok AND cpu_ok
  )
  SELECT identifier, name, cpu_cores, cpu_dedicated, memory_gb, price_monthly
  INTO v_ideal
  FROM (
    SELECT s.*, 1 AS pri
    FROM serve s
    WHERE s.price_monthly <= v_cur.price_monthly
    UNION ALL
    SELECT s.*, 2 AS pri
    FROM serve s
    WHERE s.price_monthly > v_cur.price_monthly
  ) ranked
  ORDER BY pri ASC, price_monthly ASC, memory_gb ASC
  LIMIT 1;

  IF v_ideal.name IS NULL THEN
    v_ideal := v_cur;
  END IF;

  -- ---- Veredito -------------------------------------------------------------
  IF v_ideal.price_monthly < v_cur.price_monthly THEN
    v_verdict := 'descer';
  ELSIF v_ideal.price_monthly > v_cur.price_monthly THEN
    v_verdict := 'subir';
  ELSE
    v_verdict := 'manter';
  END IF;

  v_verdict_label := CASE v_verdict
    WHEN 'descer' THEN 'Descer para a ' || v_ideal.name
    WHEN 'subir'  THEN 'Subir para a '  || v_ideal.name
    ELSE 'Manter na ' || v_cur.name
  END;

  v_economia := round((v_cur.price_monthly - v_ideal.price_monthly)::numeric, 2);

  -- ---- Estimativas no tier IDEAL (base dos textos e status) -----------------
  v_est_ram_ideal := round((v_peak_ram_gb - (v_cur_shared - v_ideal.memory_gb * 0.25))::numeric, 2);
  v_est_cpu_ideal := round((v_peak_cpu * (v_cur.cpu_cores / v_ideal.cpu_cores))::numeric, 1);

  v_ram_pct       := round((v_est_ram_ideal / v_ideal.memory_gb * 100)::numeric, 0);
  v_cpu_pct_ideal := round(v_est_cpu_ideal, 0);
  v_conn_pct      := CASE WHEN v_peak_conn_max > 0
                          THEN round((v_peak_conn::numeric / v_peak_conn_max * 100), 0)
                          ELSE NULL END;

  IF v_verdict = 'subir' THEN
    v_cpu_pct_ideal := round((v_peak_cpu)::numeric, 0);                      -- % no tier atual
    v_ram_pct       := round((v_peak_ram_gb / v_cur.memory_gb * 100)::numeric, 0);
  END IF;

  -- Helper de status por %: <=60 ok, 60-85 apertado, >85 estoura.
  v_reason_cpu := jsonb_build_object(
    'dim', 'CPU',
    'status', CASE WHEN v_cpu_pct_ideal <= 60 THEN 'ok'
                   WHEN v_cpu_pct_ideal <= 85 THEN 'apertado'
                   ELSE 'estoura' END,
    'texto', CASE
      WHEN v_verdict = 'descer' THEN
        'No pico típico (p95) a CPU usa ' || round(v_peak_cpu,1)::text || '% na ' || v_cur.name
          || '; na ' || v_ideal.name || ' equivaleria a ~' || round(v_est_cpu_ideal,1)::text
          || '% — ainda com folga.'
      WHEN v_verdict = 'subir' THEN
        'No pico típico (p95) a CPU usa ' || round(v_peak_cpu,1)::text || '% na ' || v_cur.name
          || ' (acima do limite seguro de 60%); na ' || v_ideal.name || ' cairia para ~'
          || round(v_est_cpu_ideal,1)::text || '%.'
      ELSE
        'No pico típico (p95) a CPU usa ' || round(v_peak_cpu,1)::text || '% na ' || v_cur.name
          || ' — dentro do esperado para manter o tier atual.'
    END
  );

  v_reason_ram := jsonb_build_object(
    'dim', 'RAM',
    'status', CASE WHEN v_ram_pct <= 60 THEN 'ok'
                   WHEN v_ram_pct <= 85 THEN 'apertado'
                   ELSE 'estoura' END,
    'texto', CASE
      WHEN v_verdict = 'descer' THEN
        'No pico típico (p95) a RAM usa ' || round(v_peak_ram_gb,1)::text || ' GB; na '
          || v_ideal.name || ' (' || round(v_ideal.memory_gb,0)::text || ' GB) usaria ~'
          || round(v_est_ram_ideal,1)::text || ' GB — cabe com folga.'
      WHEN v_verdict = 'subir' THEN
        'No pico típico (p95) a RAM usa ' || round(v_peak_ram_gb,1)::text || ' GB; na '
          || v_cur.name || ' fica apertada, e a ' || v_ideal.name || ' ('
          || round(v_ideal.memory_gb,0)::text || ' GB) dá a folga necessária.'
      ELSE
        'No pico típico (p95) a RAM usa ' || round(v_peak_ram_gb,1)::text || ' GB de '
          || round(v_cur.memory_gb,0)::text || ' GB — descer não caberia com folga.'
    END
  );

  v_reason_conn := jsonb_build_object(
    'dim', 'Conexões',
    'status', CASE WHEN v_conn_pct IS NULL THEN 'ok'
                   WHEN v_conn_pct <= 60 THEN 'ok'
                   WHEN v_conn_pct <= 85 THEN 'apertado'
                   ELSE 'estoura' END,
    'texto', v_peak_conn || ' de ' || COALESCE(v_peak_conn_max::text,'?')
             || ' conexões no pico'
             || CASE WHEN v_conn_pct IS NOT NULL AND v_conn_pct <= 60 THEN ' — tranquilo.'
                     WHEN v_conn_pct IS NOT NULL AND v_conn_pct <= 85 THEN ' — atenção.'
                     WHEN v_conn_pct IS NOT NULL THEN ' — perto do limite.'
                     ELSE '.' END
  );

  -- ---- Régua (catálogo ordenado por RAM asc) --------------------------------
  SELECT jsonb_agg(sub.t ORDER BY sub.memory_gb ASC)
  INTO v_catalog
  FROM (
    SELECT jsonb_build_object(
             'identifier', c.identifier,
             'name', c.name,
             'cpu_cores', c.cpu_cores,
             'cpu_dedicated', c.cpu_dedicated,
             'memory_gb', c.memory_gb,
             'price_monthly', c.price_monthly
           ) AS t, c.memory_gb
    FROM public.db_compute_catalog c
    WHERE c.captured_at = v_cap_ts
  ) sub;

  RETURN jsonb_build_object(
    'current', jsonb_build_object(
      'identifier', v_cur.identifier, 'name', v_cur.name,
      'cpu_cores', v_cur.cpu_cores, 'cpu_dedicated', v_cur.cpu_dedicated,
      'memory_gb', v_cur.memory_gb, 'price_monthly', v_cur.price_monthly
    ),
    'ideal', jsonb_build_object(
      'identifier', v_ideal.identifier, 'name', v_ideal.name,
      'cpu_cores', v_ideal.cpu_cores, 'cpu_dedicated', v_ideal.cpu_dedicated,
      'memory_gb', v_ideal.memory_gb, 'price_monthly', v_ideal.price_monthly
    ),
    'verdict', v_verdict,
    'verdict_label', v_verdict_label,
    'reasons', jsonb_build_array(v_reason_cpu, v_reason_ram, v_reason_conn),
    'peaks', jsonb_build_object(
      'cpu_pct', v_peak_cpu,
      'ram_gb', round(v_peak_ram_gb, 1),
      'cpu_pct_max', v_peak_cpu_max,
      'ram_gb_max', round(v_peak_ram_max, 1),
      'connections', v_peak_conn,
      'connections_max', v_peak_conn_max,
      'window_days', 7,
      'window_from', v_window_from,
      'sample_count', v_sample_count
    ),
    'economia_mensal', v_economia,
    'catalog', COALESCE(v_catalog, '[]'::jsonb),
    'catalog_captured_at', v_cap_ts,
    'data_note', v_data_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_instance_recommendation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_instance_recommendation() TO authenticated, service_role;
