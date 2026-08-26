-- =========================================================================
-- Painel /admin "Banco de Dados" — FUNDAÇÃO do histórico de saúde
-- PORTADO do EcoSistema (20260822170000_db_health_history_foundation.sql).
--
-- Métrica GLOBAL de plataforma (SEM company_id). Um coletor (edge function,
-- ainda A CRIAR) grava a cada ~2min: CPU/RAM/disco reais + métricas internas
-- do Postgres. Aqui montamos só a fundação:
--   1) tabela public.db_health_history + RLS super_admin-only
--   2) RPCs de leitura (série temporal por bucket + picos do período)
--   3) função de retenção (30 dias)
--
-- ⚠️ DEPENDÊNCIA (sinalizada ao CEO): a aba "Histórico"/gráficos fica VAZIA
--    até existir um coletor (edge function + cron pg_net/pg_cron a cada 2min)
--    que faça INSERT em db_health_history via service_role. Não criamos o cron
--    aqui porque a edge function ainda não existe. Quando existir, agendar
--    net.http_post(url := '.../functions/v1/<name>', ...) em '*/2 * * * *' e
--    também o prune_db_health_history() diário.
--
-- ADAPTAÇÕES Eco -> Dominex:
--   * Guard nas RPCs de leitura: _assert_super_admin() (migration 20260826140000)
--     no lugar do _assert_platform_admin() do Eco.
--   * RLS SELECT: is_super_admin(auth.uid()) no lugar de is_platform_admin.
--   * REVOKE explícito de anon E authenticated (default privilege do Dominex).
--   * Sem timescaledb/time_bucket -> bucketização por floor de epoch (igual Eco).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) TABELA de histórico (append-only; coletor insere, retenção poda)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.db_health_history (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  captured_at          timestamptz NOT NULL DEFAULT now(),

  -- infra (vindas do endpoint privilegiado do Supabase via coletor)
  cpu_pct              numeric,
  mem_pct              numeric,
  disk_pct             numeric,

  -- internas do Postgres
  conn_used            int,
  conn_max             int,
  cache_hit            numeric,
  active_queries       int,
  slow_queries         int,
  blocked              int,

  -- brutos p/ o coletor calcular delta de CPU% entre coletas
  cpu_idle_seconds     numeric,
  cpu_total_seconds    numeric,

  -- opcionais p/ auditoria de RAM
  mem_available_bytes  bigint,
  mem_total_bytes      bigint,

  -- extensível p/ métricas futuras sem migration
  raw                  jsonb
);

COMMENT ON TABLE public.db_health_history IS
  'Histórico GLOBAL de saúde da plataforma (sem company_id). Alimentado a cada ~2min por coletor edge (service_role). CPU/RAM/disco reais + métricas internas do Postgres. Leitura só super_admin (RPCs get_db_health_history/get_usage_peaks). Retenção 30 dias via prune_db_health_history().';
COMMENT ON COLUMN public.db_health_history.cpu_idle_seconds  IS 'Bruto: segundos idle acumulados da CPU. O coletor calcula CPU% pelo delta idle/total entre duas coletas.';
COMMENT ON COLUMN public.db_health_history.cpu_total_seconds IS 'Bruto: segundos totais acumulados da CPU (par do cpu_idle_seconds).';
COMMENT ON COLUMN public.db_health_history.raw               IS 'JSONB livre p/ métricas extras futuras sem alterar schema.';

CREATE INDEX IF NOT EXISTS idx_db_health_history_captured_at
  ON public.db_health_history (captured_at DESC);

-- -------------------------------------------------------------------------
-- RLS: service_role escreve/lê tudo; super_admin só SELECT.
-- authenticated comum e anon: nada.
-- -------------------------------------------------------------------------
ALTER TABLE public.db_health_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_db_health_history" ON public.db_health_history;
CREATE POLICY "service_role_full_access_db_health_history"
  ON public.db_health_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Super admins can view db_health_history" ON public.db_health_history;
CREATE POLICY "Super admins can view db_health_history"
  ON public.db_health_history FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())));

-- =========================================================================
-- 2a) get_db_health_history(from, to, bucket) -> série temporal agregada
--     Agrega por bucket de tempo. Sem time_bucket -> floor de epoch.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_db_health_history(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket interval DEFAULT interval '1 hour'
)
RETURNS TABLE (
  bucket_ts       timestamptz,
  avg_cpu_pct     numeric,
  max_cpu_pct     numeric,
  avg_mem_pct     numeric,
  max_mem_pct     numeric,
  avg_disk_pct    numeric,
  max_disk_pct    numeric,
  avg_conn_used   numeric,
  max_conn_used   int,
  max_slow_queries int,
  samples         bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
DECLARE
  v_bucket_seconds numeric;
BEGIN
  PERFORM public._assert_super_admin();

  v_bucket_seconds := greatest(extract(epoch FROM coalesce(p_bucket, interval '1 hour')), 1);

  RETURN QUERY
  SELECT
    to_timestamp(floor(extract(epoch FROM h.captured_at) / v_bucket_seconds) * v_bucket_seconds) AS bucket_ts,
    round(avg(h.cpu_pct), 2)   AS avg_cpu_pct,
    round(max(h.cpu_pct), 2)   AS max_cpu_pct,
    round(avg(h.mem_pct), 2)   AS avg_mem_pct,
    round(max(h.mem_pct), 2)   AS max_mem_pct,
    round(avg(h.disk_pct), 2)  AS avg_disk_pct,
    round(max(h.disk_pct), 2)  AS max_disk_pct,
    round(avg(h.conn_used), 1) AS avg_conn_used,
    max(h.conn_used)           AS max_conn_used,
    max(h.slow_queries)        AS max_slow_queries,
    count(*)                   AS samples
  FROM public.db_health_history h
  WHERE h.captured_at >= p_from
    AND h.captured_at <  p_to
  GROUP BY 1
  ORDER BY 1;
END;
$$;

COMMENT ON FUNCTION public.get_db_health_history(timestamptz, timestamptz, interval) IS
  'SUPER-ADMIN-ONLY. Série temporal de saúde do banco agregada por bucket (default 1h) no intervalo [p_from, p_to). Por bucket: avg/max de cpu/mem/disk %, avg/max conn_used, max slow_queries, samples. Bucket via floor de epoch (sem timescaledb). Ordenado por bucket_ts.';

-- =========================================================================
-- 2b) get_usage_peaks(from, to) -> picos do período (valor + quando)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_usage_peaks(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $$
DECLARE
  v_cpu   record;
  v_mem   record;
  v_conn  record;
  v_slow  record;
  v_total bigint;
BEGIN
  PERFORM public._assert_super_admin();

  SELECT count(*) INTO v_total
  FROM public.db_health_history
  WHERE captured_at >= p_from AND captured_at < p_to;

  SELECT h.cpu_pct AS val, h.captured_at AS at INTO v_cpu
  FROM public.db_health_history h
  WHERE h.captured_at >= p_from AND h.captured_at < p_to AND h.cpu_pct IS NOT NULL
  ORDER BY h.cpu_pct DESC, h.captured_at ASC LIMIT 1;

  SELECT h.mem_pct AS val, h.captured_at AS at INTO v_mem
  FROM public.db_health_history h
  WHERE h.captured_at >= p_from AND h.captured_at < p_to AND h.mem_pct IS NOT NULL
  ORDER BY h.mem_pct DESC, h.captured_at ASC LIMIT 1;

  SELECT h.conn_used AS val, h.captured_at AS at INTO v_conn
  FROM public.db_health_history h
  WHERE h.captured_at >= p_from AND h.captured_at < p_to AND h.conn_used IS NOT NULL
  ORDER BY h.conn_used DESC, h.captured_at ASC LIMIT 1;

  SELECT h.slow_queries AS val, h.captured_at AS at INTO v_slow
  FROM public.db_health_history h
  WHERE h.captured_at >= p_from AND h.captured_at < p_to AND h.slow_queries IS NOT NULL
  ORDER BY h.slow_queries DESC, h.captured_at ASC LIMIT 1;

  RETURN jsonb_build_object(
    'from',    p_from,
    'to',      p_to,
    'samples', coalesce(v_total, 0),
    'peak_cpu_pct',      jsonb_build_object('value', v_cpu.val,  'captured_at', v_cpu.at),
    'peak_mem_pct',      jsonb_build_object('value', v_mem.val,  'captured_at', v_mem.at),
    'peak_conn_used',    jsonb_build_object('value', v_conn.val, 'captured_at', v_conn.at),
    'peak_slow_queries', jsonb_build_object('value', v_slow.val, 'captured_at', v_slow.at)
  );
END;
$$;

COMMENT ON FUNCTION public.get_usage_peaks(timestamptz, timestamptz) IS
  'SUPER-ADMIN-ONLY. Picos do período [p_from, p_to): maior cpu_pct, mem_pct, conn_used e slow_queries, cada um com o captured_at em que ocorreu (empate -> mais antigo). Retorna jsonb com samples do período.';

-- =========================================================================
-- 3) RETENÇÃO: poda linhas com mais de 30 dias.
--    Agendamento (cron) fica p/ depois, junto do job do coletor.
--    GET DIAGNOSTICS ROW_COUNT no MESMO bloco PL/pgSQL do DELETE (ok).
-- =========================================================================
CREATE OR REPLACE FUNCTION public.prune_db_health_history()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.db_health_history
  WHERE captured_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.prune_db_health_history() IS
  'Retenção do histórico de saúde: apaga db_health_history com captured_at < now()-30d. Retorna nº de linhas apagadas. Rodar via cron (agendar junto do coletor).';

-- -------------------------------------------------------------------------
-- GRANTs: guard interno já barra não-super_admin; REVOKE explícito de anon E
-- authenticated (default privilege do Dominex concede a ambos). prune_* NÃO
-- tem GRANT p/ authenticated: só service_role/cron a executam.
-- -------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_db_health_history(timestamptz, timestamptz, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_usage_peaks(timestamptz, timestamptz)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_db_health_history()                                 FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_db_health_history(timestamptz, timestamptz, interval) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_usage_peaks(timestamptz, timestamptz)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prune_db_health_history()                                 TO service_role;
