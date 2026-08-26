-- =========================================================================
-- Painel /admin "Banco de Dados" (monitoramento de instância) — BACKEND
-- RPCs read-only, super_admin-only, SECURITY DEFINER.
-- PORTADO do EcoSistema (20260821160000_admin_db_monitoring_rpcs.sql).
--
-- ADAPTAÇÕES Eco -> Dominex:
--   * Guard: o Eco usa public.is_platform_admin(auth.uid()) (user_roles.role=admin).
--     O Dominex NÃO tem is_platform_admin. Aqui o gate é
--     public.is_super_admin(auth.uid()) -> has_role(uid,'super_admin'::app_role)
--     (def viva em 20260418163700). Criamos _assert_super_admin() equivalente,
--     que aborta com ERRCODE 42501 se o caller não for super_admin.
--   * profiles: nenhuma destas RPCs toca profiles (métricas globais de instância,
--     sem company_id / sem tenant). Nada a ajustar aqui.
--   * REVOKE (regra-lei nº6): no Dominex o default privilege do schema public
--     concede EXECUTE a anon E authenticated. REVOKE de PUBLIC não basta —
--     revogamos explicitamente de anon, authenticated e re-concedemos só onde
--     precisa. O guard interno já aborta não-super_admin (defesa em profundidade).
--
-- Fontes: pg_stat_activity, pg_statio_user_tables, pg_stat_statements,
-- pg_stat_database, pg_database_size. Aditivo, baixo risco, só leitura.
-- pg_stat_statements v1.11 JÁ habilitado neste projeto (byqldosixshhuiuarszp).
-- =========================================================================

-- -------------------------------------------------------------------------
-- Guard super_admin reutilizável (aborta se não-super_admin).
-- Encapsula o is_super_admin do Dominex pra RAISE consistente.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_super_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: função restrita ao super admin da plataforma.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public._assert_super_admin() IS
  'Guard super_admin-only pras RPCs de monitoramento de banco. Aborta (42501) se auth.uid() não for super_admin (has_role). NÃO bypassa service_role de propósito (RPCs são de tela /admin logada).';

-- =========================================================================
-- 1) get_db_health_snapshot() -> jsonb
--    Foto instantânea da saúde do banco.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_db_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_max_conn        int;
  v_conn_by_state   jsonb;
  v_client_total    int;
  v_cache_hit       numeric;
  v_db_bytes        bigint;
  v_slow_now        int;
  v_blocked         int;
  v_idle_in_tx      int;
BEGIN
  PERFORM public._assert_super_admin();

  SELECT setting::int INTO v_max_conn FROM pg_settings WHERE name = 'max_connections';

  SELECT
    coalesce(jsonb_object_agg(state, cnt), '{}'::jsonb),
    coalesce(sum(cnt), 0)
  INTO v_conn_by_state, v_client_total
  FROM (
    SELECT coalesce(state, 'unknown') AS state, count(*) AS cnt
    FROM pg_stat_activity
    WHERE backend_type = 'client backend'
    GROUP BY coalesce(state, 'unknown')
  ) s;

  SELECT count(*) INTO v_idle_in_tx
  FROM pg_stat_activity
  WHERE backend_type = 'client backend' AND state = 'idle in transaction';

  SELECT round(
    sum(heap_blks_hit)::numeric / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0),
    6)
  INTO v_cache_hit
  FROM pg_statio_user_tables;

  SELECT pg_database_size(current_database()) INTO v_db_bytes;

  SELECT count(*) INTO v_slow_now
  FROM pg_stat_activity
  WHERE state = 'active'
    AND backend_type = 'client backend'
    AND pid <> pg_backend_pid()
    AND now() - query_start > interval '2 seconds';

  SELECT count(*) INTO v_blocked
  FROM pg_stat_activity
  WHERE cardinality(pg_blocking_pids(pid)) > 0;

  RETURN jsonb_build_object(
    'captured_at',          now(),
    'connections', jsonb_build_object(
      'by_state',           v_conn_by_state,
      'client_total',       v_client_total,
      'max_connections',    v_max_conn,
      'used_pct',           round(v_client_total::numeric / nullif(v_max_conn, 0) * 100, 1),
      'idle_in_transaction', v_idle_in_tx
    ),
    'cache_hit_ratio',      coalesce(v_cache_hit, 1.0),
    'db_size', jsonb_build_object(
      'bytes',              v_db_bytes,
      'pretty',             pg_size_pretty(v_db_bytes)
    ),
    'active_queries_over_2s', v_slow_now,
    'blocked_queries',      v_blocked
  );
END;
$$;

COMMENT ON FUNCTION public.get_db_health_snapshot() IS
  'SUPER-ADMIN-ONLY. Foto instantânea da saúde do banco: conexões por estado + %uso vs max_connections, cache hit ratio (heap), tamanho do DB, queries ativas >2s, queries bloqueadas por lock. Read-only.';

-- =========================================================================
-- 2) get_top_cpu_queries(limit int default 20) -> setof
--    Top queries por tempo total (proxy de consumo de CPU/tempo).
--    query normalizada (pg_stat_statements já normaliza literais em $N).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_top_cpu_queries(p_limit int DEFAULT 20)
RETURNS TABLE (
  queryid           bigint,
  calls             bigint,
  mean_ms           numeric,
  total_ms          numeric,
  max_ms            numeric,
  pct_total_time    numeric,
  rows_returned     bigint,
  query_normalized  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
-- 'extensions' incluído: pg_stat_statements vive em extensions no Supabase.
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
DECLARE
  v_grand_total numeric;
BEGIN
  PERFORM public._assert_super_admin();

  SELECT nullif(sum(total_exec_time), 0) INTO v_grand_total FROM pg_stat_statements;

  RETURN QUERY
  SELECT
    s.queryid,
    s.calls,
    round(s.mean_exec_time::numeric, 2)                              AS mean_ms,
    round(s.total_exec_time::numeric, 2)                             AS total_ms,
    round(s.max_exec_time::numeric, 2)                              AS max_ms,
    round((s.total_exec_time / coalesce(v_grand_total, s.total_exec_time) * 100)::numeric, 2) AS pct_total_time,
    s.rows                                                          AS rows_returned,
    regexp_replace(left(s.query, 500), '\s+', ' ', 'g')            AS query_normalized
  FROM pg_stat_statements s
  ORDER BY s.total_exec_time DESC
  LIMIT greatest(coalesce(p_limit, 20), 1);
END;
$$;

COMMENT ON FUNCTION public.get_top_cpu_queries(int) IS
  'SUPER-ADMIN-ONLY. Top queries por tempo total acumulado (pg_stat_statements). Proxy de consumo de CPU/tempo. Retorna queryid, calls, mean_ms, total_ms, max_ms, %do tempo total do banco, linhas, texto normalizado (literais já viram $N no pg_stat_statements). Read-only.';

-- =========================================================================
-- 3) get_instance_health_verdict() -> jsonb
--    VEREDITO DE TIER (versão "instantânea", sem histórico). Cruza sinais
--    vivos do Postgres. Portado fiel do Eco; a recomendação rica (com preços
--    e histórico) fica em get_instance_recommendation() (migration 3).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_instance_health_verdict()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
DECLARE
  v_max_conn        int;
  v_client_total    int;
  v_conn_pct        numeric;
  v_cache_hit       numeric;
  v_slow_now        int;
  v_timeout_stmts   int;
  v_timeout_calls   bigint;
  v_stmt_timeout_ms numeric;
  v_blocked         int;
  v_verdict         text;
  v_confidence      text;
  v_baixar_obs      boolean := false;
  v_reasons         jsonb := '[]'::jsonb;
  v_window_days     numeric;
BEGIN
  PERFORM public._assert_super_admin();

  SELECT setting::int INTO v_max_conn FROM pg_settings WHERE name = 'max_connections';

  SELECT count(*) INTO v_client_total
  FROM pg_stat_activity WHERE backend_type = 'client backend';

  v_conn_pct := round(v_client_total::numeric / nullif(v_max_conn, 0) * 100, 1);

  SELECT round(
    sum(heap_blks_hit)::numeric / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0),
    6)
  INTO v_cache_hit
  FROM pg_statio_user_tables;
  v_cache_hit := coalesce(v_cache_hit, 1.0);

  SELECT count(*) INTO v_slow_now
  FROM pg_stat_activity
  WHERE state = 'active' AND backend_type = 'client backend'
    AND pid <> pg_backend_pid()
    AND now() - query_start > interval '2 seconds';

  SELECT count(*) INTO v_blocked
  FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) > 0;

  SELECT (setting::numeric *
          CASE (SELECT unit FROM pg_settings WHERE name='statement_timeout')
            WHEN 's'  THEN 1000 WHEN 'min' THEN 60000 ELSE 1 END)
  INTO v_stmt_timeout_ms
  FROM pg_settings WHERE name = 'statement_timeout';
  IF v_stmt_timeout_ms IS NULL OR v_stmt_timeout_ms = 0 THEN
    v_stmt_timeout_ms := 120000;
  END IF;

  SELECT count(*), coalesce(sum(calls), 0)
  INTO v_timeout_stmts, v_timeout_calls
  FROM pg_stat_statements
  WHERE max_exec_time >= v_stmt_timeout_ms * 0.85;

  SELECT round(extract(epoch FROM (now() - stats_reset)) / 86400, 1)
  INTO v_window_days FROM pg_stat_statements_info;

  -- ---------------- MOTOR DE VEREDITO ----------------
  IF v_conn_pct > 85 AND v_timeout_stmts > 0 AND v_cache_hit < 0.99 THEN
    v_verdict := 'subir';
    v_confidence := 'alta';
    v_reasons := v_reasons
      || to_jsonb(format('Conexões em %s%% do teto (%s/%s): perto de saturar.', v_conn_pct, v_client_total, v_max_conn))
      || to_jsonb(format('Cache hit em %s (<0.99): banco lendo do disco, sinal de pressão de RAM.', v_cache_hit))
      || to_jsonb(format('%s tipos de query chegaram perto do statement_timeout (%s ms): fila de execução.', v_timeout_stmts, v_stmt_timeout_ms))
      || to_jsonb('Recomendação: subir o tier. CPU/RAM genuinamente insuficientes.'::text);

  ELSIF v_conn_pct < 40 AND v_cache_hit >= 0.999 AND v_timeout_stmts = 0 THEN
    v_verdict := 'baixar';
    v_confidence := CASE WHEN v_conn_pct < 25 THEN 'alta' ELSE 'media' END;
    v_baixar_obs := true;
    v_reasons := v_reasons
      || to_jsonb(format('Conexões em só %s%% do teto (%s/%s): muita folga.', v_conn_pct, v_client_total, v_max_conn))
      || to_jsonb(format('Cache hit em %s (~1.0): tudo servido da RAM, zero pressão de I/O.', v_cache_hit))
      || to_jsonb('Nenhuma query chegou perto do statement_timeout: sem saturação de CPU.'::text)
      || to_jsonb('ATENÇÃO: "baixar" só é seguro DEPOIS de aplicar as otimizações de query pendentes e observar alguns dias no tier atual. Não baixe direto.'::text)
      || to_jsonb('CPU% real de infra deve ser confirmada no dashboard do Supabase antes de baixar (o Postgres não expõe CPU% da instância).'::text);

  ELSE
    v_verdict := 'manter';
    v_confidence := 'media';
    v_reasons := v_reasons
      || to_jsonb(format('Conexões em %s%% do teto (%s/%s).', v_conn_pct, v_client_total, v_max_conn))
      || to_jsonb(format('Cache hit em %s.', v_cache_hit));
    IF v_timeout_stmts > 0 THEN
      v_reasons := v_reasons
        || to_jsonb(format('%s tipos de query já chegaram perto do statement_timeout — otimizar antes de pensar em tier.', v_timeout_stmts));
    ELSE
      v_reasons := v_reasons
        || to_jsonb('Sem timeouts sustentados. Uso dentro do esperado — manter tier atual.'::text);
    END IF;
    IF v_conn_pct >= 40 AND v_conn_pct <= 85 THEN
      v_reasons := v_reasons
        || to_jsonb('Uso alto porém sem saturação de conexão nem timeout: não justifica subir agora.'::text);
    END IF;
  END IF;

  v_reasons := v_reasons
    || to_jsonb(format('Janela do pg_stat_statements: %s dias (means são vitalícios, não "agora"). CPU%% de infra: cruzar com o dashboard do Supabase.', v_window_days));

  RETURN jsonb_build_object(
    'captured_at',            now(),
    'verdict',                v_verdict,
    'confidence',             v_confidence,
    'baixar_requer_observacao', v_baixar_obs,
    'reasons',                v_reasons,
    'sinais', jsonb_build_object(
      'cache_hit_ratio',      v_cache_hit,
      'conn_usadas',          v_client_total,
      'conn_max',             v_max_conn,
      'conn_pct',             v_conn_pct,
      'queries_lentas_count', v_slow_now,
      'queries_bloqueadas',   v_blocked,
      'timeouts_recentes',    v_timeout_stmts,
      'timeout_calls_acumulado', v_timeout_calls,
      'statement_timeout_ms', v_stmt_timeout_ms,
      'janela_stats_dias',    v_window_days
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_instance_health_verdict() IS
  'SUPER-ADMIN-ONLY. Veredito de tier instantâneo (subir/manter/baixar) cruzando conexões vs max_connections, cache hit ratio, timeouts (proxy via max_exec_time vs statement_timeout) e queries lentas. Postgres não expõe CPU% de infra: cruzar com dashboard Supabase. A recomendação rica com preços vive em get_instance_recommendation().';

-- -------------------------------------------------------------------------
-- GRANTs: só authenticated (o guard interno já barra não-super_admin) +
-- service_role. REVOKE explícito de anon E authenticated (default privilege
-- do Dominex concede a ambos) e re-GRANT só onde precisa.
-- -------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._assert_super_admin()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_db_health_snapshot()          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_top_cpu_queries(int)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_instance_health_verdict()     FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_db_health_snapshot()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_cpu_queries(int)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_instance_health_verdict()  TO authenticated, service_role;
