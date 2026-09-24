-- =============================================================================
-- Disk IO no veredito de instância — /admin/monitoramento
-- -----------------------------------------------------------------------------
-- POR QUÊ (2026-09-24): o Supabase mandou e-mail avisando que o projeto
-- `byqldosixshhuiuarszp` está ESGOTANDO O DISK IO BUDGET ("your instance may
-- become unresponsive"). O painel, porém, era CEGO pra IO: tanto
-- get_instance_recommendation() quanto get_instance_health_verdict() decidiam
-- só por CPU, RAM, conexões, cache hit e timeouts. Resultado possível: tela
-- toda verde dizendo "pode manter" enquanto o gargalo real é disco.
--
-- O QUE O ENDPOINT PRIVILEGIADO EXPÕE DE VERDADE (scrape conferido em
-- 2026-09-24 em https://<ref>.supabase.co/customer/v1/privileged/metrics —
-- 305 séries):
--   * NÃO existe métrica de "disk io budget" / burst balance / crédito de IO.
--     O budget do e-mail é um conceito de billing/EBS que só aparece no
--     dashboard do Supabase. Não inventamos série que não existe.
--   * O que existe é o conjunto padrão do node_exporter, por device
--     (nvme0n1 = raiz, nvme1n1 = /data):
--       node_disk_read_bytes_total, node_disk_written_bytes_total  (throughput)
--       node_disk_reads_completed_total, node_disk_writes_completed_total (IOPS)
--       node_disk_io_time_seconds_total            (%util — disco ocupado)
--       node_disk_io_time_weighted_seconds_total   (fila média)
--       node_disk_io_now                           (requisições em voo)
--     Todos são CONTADORES ACUMULADOS: só viram taxa com delta entre coletas
--     (mesma mecânica que o coletor já usa pra CPU).
--   * Também existem node_memory_Swap*_bytes, node_vmstat_pswpin/pswpout e
--     node_vmstat_pgmajfault. Em instância pequena o IO de disco É swap, não
--     query — sem isso o veredito culpa "query pesada" quando o problema é RAM.
--
-- MELHOR PROXY DO BUDGET: throughput em Mbps comparado ao
-- `baseline_disk_io_mbps` do tier. Sustentar acima do baseline é exatamente o
-- que drena o budget. Esses números vêm da própria API de billing do Supabase
-- (`GET /v1/projects/<ref>/billing/addons` → meta.baseline_disk_io_mbs /
-- meta.max_disk_io_mbs), conferidos em 2026-09-24 e semeados aqui.
--
-- O QUE ESTA MIGRATION FAZ
--   1) db_health_history: colunas de IO (contadores crus + taxas) e de swap.
--   2) db_compute_catalog: colunas baseline/max de IO e conexões diretas;
--      re-seed com os valores REAIS da API, incluindo o tier **Nano** (o
--      default do plano Pro, que não aparece como addon e faltava na régua).
--   3) upsert_compute_catalog: passa a gravar os campos novos.
--   4) get_instance_recommendation(): IO vira 3ª dimensão de capacidade, com
--      motivo próprio, alerta dedicado (io_alert) e bloco de swap.
--   5) get_instance_health_verdict(): deixa de ser cego a infra — lê o IO
--      recente do histórico e pode sozinho mandar subir.
--   6) get_db_health_history() / get_usage_peaks() / get_db_health_snapshot():
--      expõem IO e swap.
--   7) COMMENTs corrigidos (os antigos afirmavam que a função não enxerga infra).
--
-- SEGURANÇA: tudo segue super_admin-only via _assert_super_admin(); REVOKE
-- explícito de anon e authenticated antes de cada GRANT. Nenhuma credencial e
-- nenhuma URL de métricas entram no payload.
-- =============================================================================

-- =============================================================================
-- 1) db_health_history — colunas de IO e swap
-- =============================================================================
ALTER TABLE public.db_health_history
  -- contadores crus (base do delta da próxima coleta)
  ADD COLUMN IF NOT EXISTS disk_read_bytes_total       bigint,
  ADD COLUMN IF NOT EXISTS disk_written_bytes_total    bigint,
  ADD COLUMN IF NOT EXISTS disk_reads_completed_total  bigint,
  ADD COLUMN IF NOT EXISTS disk_writes_completed_total bigint,
  ADD COLUMN IF NOT EXISTS disk_io_time_seconds        numeric,
  ADD COLUMN IF NOT EXISTS disk_io_weighted_seconds    numeric,
  -- taxas já calculadas pelo coletor (delta / janela)
  ADD COLUMN IF NOT EXISTS sample_elapsed_seconds      numeric,
  ADD COLUMN IF NOT EXISTS disk_read_mbps              numeric,
  ADD COLUMN IF NOT EXISTS disk_write_mbps             numeric,
  ADD COLUMN IF NOT EXISTS disk_io_mbps                numeric,
  ADD COLUMN IF NOT EXISTS disk_io_util_pct            numeric,
  ADD COLUMN IF NOT EXISTS disk_iops                   numeric,
  ADD COLUMN IF NOT EXISTS disk_io_queue               numeric,
  -- swap e falhas de página maiores
  ADD COLUMN IF NOT EXISTS swap_total_bytes            bigint,
  ADD COLUMN IF NOT EXISTS swap_free_bytes             bigint,
  ADD COLUMN IF NOT EXISTS swap_used_pct               numeric,
  ADD COLUMN IF NOT EXISTS swap_in_pages_total         bigint,
  ADD COLUMN IF NOT EXISTS swap_out_pages_total        bigint,
  ADD COLUMN IF NOT EXISTS major_faults_total          bigint,
  ADD COLUMN IF NOT EXISTS swap_io_mbps                numeric,
  ADD COLUMN IF NOT EXISTS major_faults_per_sec        numeric;

COMMENT ON COLUMN public.db_health_history.disk_read_bytes_total       IS 'Bruto acumulado: soma de node_disk_read_bytes_total de todos os devices reais. Serve só pro delta da próxima coleta — NUNCA exibir como "uso".';
COMMENT ON COLUMN public.db_health_history.disk_written_bytes_total    IS 'Bruto acumulado: soma de node_disk_written_bytes_total. Par do disk_read_bytes_total.';
COMMENT ON COLUMN public.db_health_history.disk_reads_completed_total  IS 'Bruto acumulado: soma de node_disk_reads_completed_total (base do IOPS por delta).';
COMMENT ON COLUMN public.db_health_history.disk_writes_completed_total IS 'Bruto acumulado: soma de node_disk_writes_completed_total (base do IOPS por delta).';
COMMENT ON COLUMN public.db_health_history.disk_io_time_seconds        IS 'Bruto acumulado: node_disk_io_time_seconds_total do PIOR device (o que mais tempo passou ocupado). Base do %util por delta.';
COMMENT ON COLUMN public.db_health_history.disk_io_weighted_seconds    IS 'Bruto acumulado: node_disk_io_time_weighted_seconds_total do mesmo device do disk_io_time_seconds. Base da fila média por delta.';
COMMENT ON COLUMN public.db_health_history.sample_elapsed_seconds      IS 'Janela real (s) entre esta coleta e a anterior, usada como denominador de TODAS as taxas. Derivada do contador de CPU (dTotal/nº de cores) e, na falta, do captured_at. NULL = janela inválida (coletor parado / contador resetado) e as taxas da linha ficam NULL.';
COMMENT ON COLUMN public.db_health_history.disk_read_mbps              IS 'TAXA de leitura de disco em megabit/s na janela (unidade do Supabase: baseline_disk_io_mbps é Mbps).';
COMMENT ON COLUMN public.db_health_history.disk_write_mbps             IS 'TAXA de escrita de disco em megabit/s na janela.';
COMMENT ON COLUMN public.db_health_history.disk_io_mbps                IS 'TAXA total (leitura+escrita) em megabit/s na janela. É ESTE valor que se compara ao baseline_disk_io_mbps do tier: sustentar acima do baseline é o que drena o Disk IO Budget do Supabase.';
COMMENT ON COLUMN public.db_health_history.disk_io_util_pct            IS '%util no sentido do iostat: fração do tempo da janela em que o pior device teve IO em voo. >80% = disco saturado.';
COMMENT ON COLUMN public.db_health_history.disk_iops                   IS 'Operações de IO por segundo (leituras+escritas concluídas) na janela.';
COMMENT ON COLUMN public.db_health_history.disk_io_queue               IS 'Fila média de IO (avgqu-sz do iostat) na janela. >1 = requisições esperando disco.';
COMMENT ON COLUMN public.db_health_history.swap_total_bytes            IS 'node_memory_SwapTotal_bytes.';
COMMENT ON COLUMN public.db_health_history.swap_free_bytes             IS 'node_memory_SwapFree_bytes.';
COMMENT ON COLUMN public.db_health_history.swap_used_pct               IS '% do swap ocupado. Swap ocupado em instância pequena é a causa mais comum de IO alto: cada página lida de volta é leitura de disco.';
COMMENT ON COLUMN public.db_health_history.swap_in_pages_total         IS 'Bruto acumulado: node_vmstat_pswpin (páginas trazidas do swap).';
COMMENT ON COLUMN public.db_health_history.swap_out_pages_total        IS 'Bruto acumulado: node_vmstat_pswpout (páginas empurradas pro swap).';
COMMENT ON COLUMN public.db_health_history.major_faults_total          IS 'Bruto acumulado: node_vmstat_pgmajfault. Cada major fault é uma leitura de disco pra satisfazer acesso a memória.';
COMMENT ON COLUMN public.db_health_history.swap_io_mbps                IS 'TAXA de IO causada por swap (pswpin+pswpout x 4 KiB) em megabit/s. Parcela do disk_io_mbps que some ao dar mais RAM à instância.';
COMMENT ON COLUMN public.db_health_history.major_faults_per_sec        IS 'TAXA de major page faults por segundo na janela. Centenas/s = a instância está trocando memória com o disco o tempo todo.';

COMMENT ON TABLE public.db_health_history IS
  'Histórico GLOBAL de saúde da plataforma (sem company_id). Alimentado a cada ~2min por coletor edge (service_role). CPU/RAM/disco/IO/swap reais do endpoint privilegiado + métricas internas do Postgres. Métricas de IO e swap são TAXAS calculadas por delta entre coletas (colunas *_total são contadores crus, não uso). Leitura só super_admin (RPCs get_db_health_history/get_usage_peaks). Retenção 30 dias via prune_db_health_history().';

-- =============================================================================
-- 2) db_compute_catalog — specs de IO por tier + re-seed com valores REAIS
-- =============================================================================
ALTER TABLE public.db_compute_catalog
  ADD COLUMN IF NOT EXISTS baseline_disk_io_mbps numeric,
  ADD COLUMN IF NOT EXISTS max_disk_io_mbps      numeric,
  ADD COLUMN IF NOT EXISTS connections_direct    int;

COMMENT ON COLUMN public.db_compute_catalog.baseline_disk_io_mbps IS 'Banda de disco SUSTENTÁVEL do tier, em megabit/s (meta.baseline_disk_io_mbs da API de billing do Supabase). Passar disso de forma sustentada consome o Disk IO Budget e gera o e-mail de alerta.';
COMMENT ON COLUMN public.db_compute_catalog.max_disk_io_mbps      IS 'Banda de disco de PICO (burst) do tier, em megabit/s (meta.max_disk_io_mbs). Só é sustentável enquanto houver budget.';
COMMENT ON COLUMN public.db_compute_catalog.connections_direct    IS 'Conexões diretas (não-pooler) suportadas pelo tier (meta.connections_direct).';

-- Re-seed completo. Valores de 2026-09-24 conferidos em
-- GET /v1/projects/<ref>/billing/addons (available_addons > compute_instance).
-- ⚠️ NANO não aparece nessa API por ser o compute DEFAULT (não é addon): os
--    números dele vêm da tabela pública de compute do Supabase (0,5 GB RAM,
--    2 cores compartilhados, 43 Mbps baseline / 2.085 Mbps burst, 60 conexões
--    diretas) e batem com o que a instância reporta hoje (MemTotal ~409 MiB,
--    max_connections = 60). Preço 0 porque o Nano está incluso no plano Pro.
-- A régua para em XL de propósito: é o que a tela mostra lado a lado.
TRUNCATE TABLE public.db_compute_catalog RESTART IDENTITY;

INSERT INTO public.db_compute_catalog
  (captured_at, identifier, name, cpu_cores, cpu_dedicated, memory_gb,
   price_hourly, price_monthly, baseline_disk_io_mbps, max_disk_io_mbps, connections_direct)
SELECT now(), v.identifier, v.name, v.cpu_cores, v.cpu_dedicated, v.memory_gb,
       v.price_hourly, v.price_monthly, v.baseline_io, v.max_io, v.conn
FROM (VALUES
  ('nano',   'Nano',   2::numeric, false, 0.5::numeric, 0::numeric,       0::numeric,   43::numeric,   2085::numeric, 60),
  ('micro',  'Micro',  2::numeric, false, 1::numeric,   0.01344::numeric, 10::numeric,  87::numeric,   2085::numeric, 60),
  ('small',  'Small',  2::numeric, false, 2::numeric,   0.0206::numeric,  15::numeric,  174::numeric,  2085::numeric, 90),
  ('medium', 'Medium', 2::numeric, false, 4::numeric,   0.0822::numeric,  60::numeric,  347::numeric,  2085::numeric, 120),
  ('large',  'Large',  2::numeric, true,  8::numeric,   0.1517::numeric,  111::numeric, 630::numeric,  4750::numeric, 160),
  ('xl',     'XL',     4::numeric, true,  16::numeric,  0.2877::numeric,  210::numeric, 1048::numeric, 4750::numeric, 240)
) AS v(identifier, name, cpu_cores, cpu_dedicated, memory_gb, price_hourly, price_monthly, baseline_io, max_io, conn);

-- =============================================================================
-- 3) upsert_compute_catalog — grava os campos novos
-- =============================================================================
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
  IF NOT (v_is_service OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acesso negado: upsert_compute_catalog requer service_role ou super admin';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'array' THEN
    RAISE EXCEPTION 'p_payload deve ser um array JSON de tiers';
  END IF;

  TRUNCATE TABLE public.db_compute_catalog RESTART IDENTITY;

  INSERT INTO public.db_compute_catalog
    (captured_at, identifier, name, cpu_cores, cpu_dedicated, memory_gb,
     price_hourly, price_monthly, baseline_disk_io_mbps, max_disk_io_mbps, connections_direct)
  SELECT
    v_now,
    e->>'identifier',
    e->>'name',
    NULLIF(e->>'cpu_cores','')::numeric,
    NULLIF(e->>'cpu_dedicated','')::boolean,
    NULLIF(e->>'memory_gb','')::numeric,
    NULLIF(e->>'price_hourly','')::numeric,
    NULLIF(e->>'price_monthly','')::numeric,
    -- aceita tanto o nome da API (baseline_disk_io_mbs) quanto o nosso
    COALESCE(NULLIF(e->>'baseline_disk_io_mbps','')::numeric, NULLIF(e->>'baseline_disk_io_mbs','')::numeric),
    COALESCE(NULLIF(e->>'max_disk_io_mbps','')::numeric,      NULLIF(e->>'max_disk_io_mbs','')::numeric),
    NULLIF(e->>'connections_direct','')::int
  FROM jsonb_array_elements(p_payload) AS e
  WHERE COALESCE(e->>'name','') <> '';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.upsert_compute_catalog(jsonb) IS
  'service_role/super_admin. Substitui a captura inteira do catálogo de tiers (TRUNCATE + INSERT). Aceita baseline_disk_io_mbps/max_disk_io_mbps (ou os nomes da API do Supabase, baseline_disk_io_mbs/max_disk_io_mbs) e connections_direct.';

REVOKE ALL ON FUNCTION public.upsert_compute_catalog(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_compute_catalog(jsonb) TO service_role;

-- =============================================================================
-- 4) get_instance_recommendation() — IO vira 3ª dimensão de capacidade
-- -----------------------------------------------------------------------------
-- Modelo de IO (conservador e explícito):
--   * A demanda de IO é do WORKLOAD, não do tier — subir de tier não reduz o
--     IO, aumenta a franquia. Então um tier só "serve" se
--     p95(disk_io_mbps) <= baseline_disk_io_mbps * 0,60 (mesma folga de 40%
--     já usada em CPU e RAM).
--   * Além do p95, medimos a FRAÇÃO DE TEMPO acima do baseline — é isso que
--     drena o budget. Acima de ~2% do tempo já é sinal; acima de 10% é o
--     cenário do e-mail do Supabase.
--   * Sem amostras de IO (coletor recém-atualizado) o IO NÃO bloqueia nenhum
--     tier e o motivo diz explicitamente que ainda não há dado.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_instance_recommendation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_from   timestamptz := now() - interval '7 days';
  v_sample_count  int := 0;
  v_data_note     text := NULL;

  v_peak_cpu      numeric;
  v_peak_ram_gb   numeric;
  v_peak_cpu_max  numeric;
  v_peak_ram_max  numeric;
  v_peak_conn     integer;
  v_peak_conn_max integer;
  v_cur_mem_gb    numeric;

  -- IO
  v_io_samples    int := 0;
  v_peak_io       numeric;   -- p95 de disk_io_mbps
  v_peak_io_max   numeric;   -- max cru
  v_peak_io_util  numeric;   -- p95 de %util
  v_io_util_max   numeric;
  v_peak_iops     numeric;
  v_peak_queue    numeric;
  v_io_over_pct   numeric;   -- % do tempo acima do baseline do tier ATUAL
  v_io_pct_base   numeric;   -- p95 como % do baseline do tier atual
  v_io_status     text;
  v_io_alert      jsonb := NULL;

  -- Swap
  v_swap_pct      numeric;
  v_swap_io       numeric;
  v_majflt        numeric;
  v_swap_status   text;

  v_cap_ts        timestamptz;
  v_cur           record;
  v_ideal         record;

  v_verdict       text;
  v_verdict_label text;
  v_economia      numeric;

  v_reason_cpu    jsonb;
  v_reason_ram    jsonb;
  v_reason_conn   jsonb;
  v_reason_io     jsonb;
  v_reason_swap   jsonb := NULL;
  v_reasons       jsonb;

  v_cur_shared    numeric;
  v_est_ram_ideal numeric;
  v_est_cpu_ideal numeric;
  v_ram_pct       numeric;
  v_cpu_pct_ideal numeric;
  v_conn_pct      numeric;

  v_catalog       jsonb;
BEGIN
  PERFORM public._assert_super_admin();

  SELECT max(captured_at) INTO v_cap_ts FROM public.db_compute_catalog;

  SELECT round((mem_total_bytes / (1024^3))::numeric, 2)
  INTO v_cur_mem_gb
  FROM public.db_health_history
  ORDER BY captured_at DESC
  LIMIT 1;

  -- ---- Picos na janela rolling 7d (p95 = pico típico; max só p/ transparência)
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

  -- ---- Picos de IO e swap (podem ter MENOS amostras que o resto: as colunas
  --      nasceram em 2026-09-24 e a taxa exige 2 coletas seguidas).
  SELECT
    count(*) FILTER (WHERE disk_io_mbps IS NOT NULL),
    round((percentile_cont(0.95) within group (order by disk_io_mbps))::numeric, 1),
    round((max(disk_io_mbps))::numeric, 1),
    round((percentile_cont(0.95) within group (order by disk_io_util_pct))::numeric, 1),
    round((max(disk_io_util_pct))::numeric, 1),
    round((percentile_cont(0.95) within group (order by disk_iops))::numeric, 0),
    round((percentile_cont(0.95) within group (order by disk_io_queue))::numeric, 2),
    round((percentile_cont(0.95) within group (order by swap_used_pct))::numeric, 1),
    round((percentile_cont(0.95) within group (order by swap_io_mbps))::numeric, 1),
    round((percentile_cont(0.95) within group (order by major_faults_per_sec))::numeric, 0)
  INTO v_io_samples, v_peak_io, v_peak_io_max, v_peak_io_util, v_io_util_max,
       v_peak_iops, v_peak_queue, v_swap_pct, v_swap_io, v_majflt
  FROM public.db_health_history
  WHERE captured_at >= v_window_from;

  -- ---- Sem amostras nenhuma: não quebrar, retornar "manter" ------------------
  IF v_sample_count = 0 OR v_peak_cpu IS NULL THEN
    IF v_cur_mem_gb IS NULL THEN
      RAISE EXCEPTION 'Sem dados de db_health_history para gerar recomendação';
    END IF;

    SELECT c.identifier, c.name, c.cpu_cores, c.cpu_dedicated, c.memory_gb,
           c.price_monthly, c.baseline_disk_io_mbps, c.max_disk_io_mbps
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
               'identifier', c.identifier, 'name', c.name,
               'cpu_cores', c.cpu_cores, 'cpu_dedicated', c.cpu_dedicated,
               'memory_gb', c.memory_gb, 'price_monthly', c.price_monthly,
               'baseline_disk_io_mbps', c.baseline_disk_io_mbps,
               'max_disk_io_mbps', c.max_disk_io_mbps
             ) AS t, c.memory_gb
      FROM public.db_compute_catalog c
      WHERE c.captured_at = v_cap_ts
    ) sub;

    RETURN jsonb_build_object(
      'current', jsonb_build_object(
        'identifier', v_cur.identifier, 'name', v_cur.name,
        'cpu_cores', v_cur.cpu_cores, 'cpu_dedicated', v_cur.cpu_dedicated,
        'memory_gb', v_cur.memory_gb, 'price_monthly', v_cur.price_monthly,
        'baseline_disk_io_mbps', v_cur.baseline_disk_io_mbps,
        'max_disk_io_mbps', v_cur.max_disk_io_mbps
      ),
      'ideal', jsonb_build_object(
        'identifier', v_cur.identifier, 'name', v_cur.name,
        'cpu_cores', v_cur.cpu_cores, 'cpu_dedicated', v_cur.cpu_dedicated,
        'memory_gb', v_cur.memory_gb, 'price_monthly', v_cur.price_monthly,
        'baseline_disk_io_mbps', v_cur.baseline_disk_io_mbps,
        'max_disk_io_mbps', v_cur.max_disk_io_mbps
      ),
      'verdict', 'manter',
      'verdict_label', 'Manter na ' || v_cur.name,
      'reasons', '[]'::jsonb,
      'peaks', jsonb_build_object(
        'cpu_pct', NULL, 'ram_gb', NULL, 'cpu_pct_max', NULL, 'ram_gb_max', NULL,
        'connections', NULL, 'connections_max', NULL,
        'disk_io_mbps', NULL, 'disk_io_mbps_max', NULL, 'disk_io_util_pct', NULL,
        'window_days', 7, 'window_from', v_window_from, 'sample_count', 0,
        'io_sample_count', 0
      ),
      'io', NULL,
      'io_alert', NULL,
      'economia_mensal', 0,
      'catalog', COALESCE(v_catalog, '[]'::jsonb),
      'catalog_captured_at', v_cap_ts,
      'data_note', 'Ainda não há amostras de histórico suficientes para recomendar mudança de tier. Mantendo o tier atual até o coletor acumular coleta.'
    );
  END IF;

  IF v_cur_mem_gb IS NULL THEN
    RAISE EXCEPTION 'Sem dados de db_health_history para gerar recomendação';
  END IF;

  IF v_sample_count < 120 THEN
    v_data_note := 'Veredito preliminar — ainda acumulando dados ('
                   || v_sample_count || ' amostras na janela de 7 dias). '
                   || 'Ganha confiança nos próximos dias.';
  END IF;

  -- O I/O passou a ser dimensão DECISÓRIA, e as colunas de I/O nasceram em
  -- 2026-09-24: com poucas amostras o p95 de I/O é praticamente o máximo e
  -- pode superdimensionar o tier. Avisamos em vez de fingir confiança.
  IF v_io_samples > 0 AND v_io_samples < 120 THEN
    v_data_note := COALESCE(v_data_note || ' ', '')
                   || 'O histórico de I/O tem só ' || v_io_samples
                   || ' amostras — com essa quantidade o pico típico (p95) fica '
                   || 'colado no pico máximo e pode puxar o tier para cima. '
                   || 'Confirme o tier depois de ~4h de coleta; o alerta de I/O, '
                   || 'esse sim, já é válido.';
  END IF;

  -- ---- Instância atual --------------------------------------------------------
  SELECT c.identifier, c.name, c.cpu_cores, c.cpu_dedicated, c.memory_gb,
         c.price_monthly, c.baseline_disk_io_mbps, c.max_disk_io_mbps
  INTO v_cur
  FROM public.db_compute_catalog c
  WHERE c.captured_at = v_cap_ts
  ORDER BY abs(c.memory_gb - v_cur_mem_gb) ASC, c.memory_gb DESC
  LIMIT 1;

  IF v_cur.name IS NULL THEN
    RAISE EXCEPTION 'Catálogo de compute vazio — rode upsert_compute_catalog';
  END IF;

  v_cur_shared := v_cur.memory_gb * 0.25;

  -- ---- Fração do tempo acima do baseline do tier ATUAL (proxy do budget) ------
  IF v_io_samples > 0 AND v_cur.baseline_disk_io_mbps IS NOT NULL THEN
    SELECT round(
      100.0 * count(*) FILTER (WHERE disk_io_mbps > v_cur.baseline_disk_io_mbps)
      / nullif(count(*) FILTER (WHERE disk_io_mbps IS NOT NULL), 0), 1)
    INTO v_io_over_pct
    FROM public.db_health_history
    WHERE captured_at >= v_window_from;

    v_io_pct_base := round(v_peak_io / nullif(v_cur.baseline_disk_io_mbps, 0) * 100, 0);
  END IF;

  -- ---- Avalia cada tier: RAM, CPU e agora IO ---------------------------------
  WITH evald AS (
    SELECT
      c.*,
      (v_peak_ram_gb - (v_cur_shared - c.memory_gb * 0.25))            AS est_ram_on_t,
      (v_peak_cpu * (v_cur.cpu_cores / c.cpu_cores))                   AS est_cpu_on_t,
      ((v_peak_ram_gb - (v_cur_shared - c.memory_gb * 0.25)) <= c.memory_gb * 0.60) AS ram_ok,
      ((v_peak_cpu * (v_cur.cpu_cores / c.cpu_cores)) <= 60)           AS cpu_ok,
      -- IO: a demanda não muda com o tier; o que muda é a franquia.
      -- Sem amostra de IO ou sem baseline no catálogo, IO não bloqueia nada.
      (v_peak_io IS NULL OR c.baseline_disk_io_mbps IS NULL
        OR v_peak_io <= c.baseline_disk_io_mbps * 0.60)                AS io_ok
    FROM public.db_compute_catalog c
    WHERE c.captured_at = v_cap_ts
  ),
  serve AS (
    SELECT * FROM evald WHERE ram_ok AND cpu_ok AND io_ok
  )
  SELECT identifier, name, cpu_cores, cpu_dedicated, memory_gb, price_monthly,
         baseline_disk_io_mbps, max_disk_io_mbps
  INTO v_ideal
  FROM (
    SELECT s.*, 1 AS pri FROM serve s WHERE s.price_monthly <= v_cur.price_monthly
    UNION ALL
    SELECT s.*, 2 AS pri FROM serve s WHERE s.price_monthly > v_cur.price_monthly
  ) ranked
  ORDER BY pri ASC, price_monthly ASC, memory_gb ASC
  LIMIT 1;

  IF v_ideal.name IS NULL THEN
    -- Nenhum tier da régua atende: fica no maior disponível (e o motivo diz).
    SELECT c.identifier, c.name, c.cpu_cores, c.cpu_dedicated, c.memory_gb,
           c.price_monthly, c.baseline_disk_io_mbps, c.max_disk_io_mbps
    INTO v_ideal
    FROM public.db_compute_catalog c
    WHERE c.captured_at = v_cap_ts
    ORDER BY c.memory_gb DESC
    LIMIT 1;
  END IF;

  -- ---- Veredito ---------------------------------------------------------------
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

  v_est_ram_ideal := round((v_peak_ram_gb - (v_cur_shared - v_ideal.memory_gb * 0.25))::numeric, 2);
  v_est_cpu_ideal := round((v_peak_cpu * (v_cur.cpu_cores / v_ideal.cpu_cores))::numeric, 1);

  v_ram_pct       := round((v_est_ram_ideal / v_ideal.memory_gb * 100)::numeric, 0);
  v_cpu_pct_ideal := round(v_est_cpu_ideal, 0);
  v_conn_pct      := CASE WHEN v_peak_conn_max > 0
                          THEN round((v_peak_conn::numeric / v_peak_conn_max * 100), 0)
                          ELSE NULL END;

  IF v_verdict = 'subir' THEN
    v_cpu_pct_ideal := round((v_peak_cpu)::numeric, 0);
    v_ram_pct       := round((v_peak_ram_gb / v_cur.memory_gb * 100)::numeric, 0);
  END IF;

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
          || '; na ' || v_ideal.name || ' cairia para ~' || round(v_est_cpu_ideal,1)::text || '%.'
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
          || v_ideal.name || ' (' || round(v_ideal.memory_gb,1)::text || ' GB) usaria ~'
          || round(v_est_ram_ideal,1)::text || ' GB — cabe com folga.'
      WHEN v_verdict = 'subir' THEN
        'No pico típico (p95) a RAM usa ' || round(v_peak_ram_gb,1)::text || ' GB de '
          || round(v_cur.memory_gb,1)::text || ' GB; a ' || v_ideal.name || ' ('
          || round(v_ideal.memory_gb,1)::text || ' GB) dá a folga necessária.'
      ELSE
        'No pico típico (p95) a RAM usa ' || round(v_peak_ram_gb,1)::text || ' GB de '
          || round(v_cur.memory_gb,1)::text || ' GB — descer não caberia com folga.'
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

  -- ---- Motivo de IO (a dimensão que o painel era cego) ------------------------
  IF v_io_samples = 0 OR v_peak_io IS NULL THEN
    v_io_status := 'ok';
    v_reason_io := jsonb_build_object(
      'dim', 'Disco (I/O)',
      'status', 'ok',
      'texto', 'Ainda sem amostras de IO nesta janela — o coletor precisa de duas '
               || 'coletas seguidas para calcular a taxa. Enquanto isso, o IO não '
               || 'influencia a escolha de tier.'
    );
  ELSE
    v_io_status := CASE
      WHEN v_io_pct_base IS NULL THEN 'ok'
      WHEN v_io_pct_base > 100 OR COALESCE(v_io_over_pct,0) >= 10 THEN 'estoura'
      WHEN v_io_pct_base > 60  OR COALESCE(v_io_over_pct,0) >= 2  THEN 'apertado'
      ELSE 'ok' END;

    v_reason_io := jsonb_build_object(
      'dim', 'Disco (I/O)',
      'status', v_io_status,
      'texto',
        'No pico típico (p95) o disco move ' || round(v_peak_io,1)::text
        || ' Mbps (máx ' || round(COALESCE(v_peak_io_max, v_peak_io),1)::text || ' Mbps), '
        || 'contra ' || COALESCE(round(v_cur.baseline_disk_io_mbps,0)::text,'?')
        || ' Mbps de franquia sustentada da ' || v_cur.name
        || COALESCE(' (' || v_io_pct_base::text || '% da franquia)', '')
        || '. ' ||
        CASE
          WHEN v_io_status = 'estoura' THEN
            'A instância passa ' || COALESCE(v_io_over_pct,0)::text
            || '% do tempo acima da franquia — é exatamente isso que consome o '
            || 'Disk IO Budget e gera o alerta do Supabase. A ' || v_ideal.name
            || ' tem ' || COALESCE(round(v_ideal.baseline_disk_io_mbps,0)::text,'?')
            || ' Mbps de franquia.'
          WHEN v_io_status = 'apertado' THEN
            'Já passa ' || COALESCE(v_io_over_pct,0)::text
            || '% do tempo acima da franquia: sem folga para crescer.'
          ELSE
            'Dentro da franquia, com folga.'
        END
        || ' Disco ocupado ' || COALESCE(round(v_peak_io_util,0)::text,'?')
        || '% do tempo, fila média ' || COALESCE(v_peak_queue::text,'?') || '.'
    );
  END IF;

  -- ---- Motivo de swap (só quando existe, pra não poluir) ----------------------
  IF v_swap_pct IS NOT NULL AND v_swap_pct > 5 THEN
    v_swap_status := CASE WHEN v_swap_pct >= 50 THEN 'estoura'
                          WHEN v_swap_pct >= 20 THEN 'apertado'
                          ELSE 'ok' END;
    v_reason_swap := jsonb_build_object(
      'dim', 'Swap',
      'status', v_swap_status,
      'texto',
        'A instância está com ' || round(v_swap_pct,0)::text
        || '% do swap ocupado, trocando ' || COALESCE(round(v_swap_io,1)::text,'?')
        || ' Mbps com o disco e sofrendo ~' || COALESCE(v_majflt::text,'?')
        || ' falhas de página por segundo. Isso é falta de memória virando I/O: '
        || 'boa parte do consumo de disco some ao dar mais RAM à instância.'
    );
  END IF;

  v_reasons := jsonb_build_array(v_reason_cpu, v_reason_ram, v_reason_io, v_reason_conn);
  IF v_reason_swap IS NOT NULL THEN
    v_reasons := v_reasons || jsonb_build_array(v_reason_swap);
  END IF;

  -- ---- Alerta dedicado de IO (pro painel gritar antes do e-mail chegar) -------
  IF v_io_status = 'estoura' THEN
    v_io_alert := jsonb_build_object(
      'level', 'critico',
      'titulo', 'Disk IO Budget em risco',
      'mensagem',
        'O banco está movendo ' || round(v_peak_io,1)::text || ' Mbps no pico típico, '
        || COALESCE(v_io_pct_base::text,'?') || '% da franquia sustentada da ' || v_cur.name
        || ' (' || COALESCE(round(v_cur.baseline_disk_io_mbps,0)::text,'?') || ' Mbps), e fica '
        || COALESCE(v_io_over_pct,0)::text || '% do tempo acima dela. Quando o budget zera, '
        || 'o disco é limitado à franquia e o banco fica lento ou não responde. '
        || 'Recomendação: subir para a ' || v_ideal.name || '.'
    );
  ELSIF v_io_status = 'apertado' THEN
    v_io_alert := jsonb_build_object(
      'level', 'atencao',
      'titulo', 'Disco perto da franquia',
      'mensagem',
        'O pico típico de disco já está em ' || COALESCE(v_io_pct_base::text,'?')
        || '% da franquia sustentada da ' || v_cur.name
        || '. Ainda não é crítico, mas não há folga para crescer.'
    );
  END IF;

  -- ---- Régua ------------------------------------------------------------------
  SELECT jsonb_agg(sub.t ORDER BY sub.memory_gb ASC)
  INTO v_catalog
  FROM (
    SELECT jsonb_build_object(
             'identifier', c.identifier, 'name', c.name,
             'cpu_cores', c.cpu_cores, 'cpu_dedicated', c.cpu_dedicated,
             'memory_gb', c.memory_gb, 'price_monthly', c.price_monthly,
             'baseline_disk_io_mbps', c.baseline_disk_io_mbps,
             'max_disk_io_mbps', c.max_disk_io_mbps
           ) AS t, c.memory_gb
    FROM public.db_compute_catalog c
    WHERE c.captured_at = v_cap_ts
  ) sub;

  RETURN jsonb_build_object(
    'current', jsonb_build_object(
      'identifier', v_cur.identifier, 'name', v_cur.name,
      'cpu_cores', v_cur.cpu_cores, 'cpu_dedicated', v_cur.cpu_dedicated,
      'memory_gb', v_cur.memory_gb, 'price_monthly', v_cur.price_monthly,
      'baseline_disk_io_mbps', v_cur.baseline_disk_io_mbps,
      'max_disk_io_mbps', v_cur.max_disk_io_mbps
    ),
    'ideal', jsonb_build_object(
      'identifier', v_ideal.identifier, 'name', v_ideal.name,
      'cpu_cores', v_ideal.cpu_cores, 'cpu_dedicated', v_ideal.cpu_dedicated,
      'memory_gb', v_ideal.memory_gb, 'price_monthly', v_ideal.price_monthly,
      'baseline_disk_io_mbps', v_ideal.baseline_disk_io_mbps,
      'max_disk_io_mbps', v_ideal.max_disk_io_mbps
    ),
    'verdict', v_verdict,
    'verdict_label', v_verdict_label,
    'reasons', v_reasons,
    'peaks', jsonb_build_object(
      'cpu_pct', v_peak_cpu,
      'ram_gb', round(v_peak_ram_gb, 1),
      'cpu_pct_max', v_peak_cpu_max,
      'ram_gb_max', round(v_peak_ram_max, 1),
      'connections', v_peak_conn,
      'connections_max', v_peak_conn_max,
      'disk_io_mbps', v_peak_io,
      'disk_io_mbps_max', v_peak_io_max,
      'disk_io_util_pct', v_peak_io_util,
      'disk_io_util_pct_max', v_io_util_max,
      'disk_iops', v_peak_iops,
      'disk_io_queue', v_peak_queue,
      'swap_used_pct', v_swap_pct,
      'swap_io_mbps', v_swap_io,
      'major_faults_per_sec', v_majflt,
      'window_days', 7,
      'window_from', v_window_from,
      'sample_count', v_sample_count,
      'io_sample_count', v_io_samples
    ),
    'io', jsonb_build_object(
      'status', v_io_status,
      'p95_mbps', v_peak_io,
      'max_mbps', v_peak_io_max,
      'baseline_mbps', v_cur.baseline_disk_io_mbps,
      'burst_mbps', v_cur.max_disk_io_mbps,
      'pct_da_franquia', v_io_pct_base,
      'pct_do_tempo_acima_da_franquia', v_io_over_pct,
      'util_pct', v_peak_io_util,
      'iops', v_peak_iops,
      'fila', v_peak_queue,
      'sample_count', v_io_samples
    ),
    'io_alert', v_io_alert,
    'economia_mensal', v_economia,
    'catalog', COALESCE(v_catalog, '[]'::jsonb),
    'catalog_captured_at', v_cap_ts,
    'data_note', v_data_note
  );
END;
$$;

COMMENT ON FUNCTION public.get_instance_recommendation() IS
  'SUPER-ADMIN-ONLY. Veredito rico de tier (descer/manter/subir) com preços, sobre janela rolling de 7 dias do db_health_history. Decide por TRÊS dimensões de capacidade — CPU, RAM e DISK I/O — usando p95 (pico típico) e folga de 40%: um tier só serve se p95 couber em 60% da capacidade. O I/O é medido em Mbps (delta dos contadores node_disk_* do endpoint privilegiado) e comparado ao baseline_disk_io_mbps do tier; também reporta a fração do tempo acima da franquia, que é o que drena o Disk IO Budget do Supabase. Devolve ainda bloco `io`, `io_alert` (critico/atencao) e motivo de swap quando a instância está trocando memória com o disco. Sem amostras de I/O, o I/O não bloqueia tier e o motivo diz isso explicitamente.';

REVOKE ALL ON FUNCTION public.get_instance_recommendation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_instance_recommendation() TO authenticated, service_role;

-- =============================================================================
-- 5) get_instance_health_verdict() — deixa de ser cego a infra
-- -----------------------------------------------------------------------------
-- Antes cruzava só sinais vivos do Postgres (conexões, cache hit, timeouts) e o
-- COMMENT dizia "Postgres não expõe CPU% de infra: cruzar com dashboard". Isso
-- continua verdade PARA O POSTGRES, mas o coletor já grava CPU e I/O reais em
-- db_health_history — então lemos de lá (últimos 30 min) e o I/O pode, sozinho,
-- mandar subir de tier.
-- =============================================================================
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

  -- infra recente (db_health_history, últimos 30 min)
  v_io_samples      int := 0;
  v_io_avg          numeric;
  v_io_max          numeric;
  v_io_util         numeric;
  v_cpu_avg         numeric;
  v_mem_avg         numeric;
  v_swap_pct        numeric;
  v_swap_io         numeric;
  v_mem_gb          numeric;
  v_baseline        numeric;
  v_burst           numeric;
  v_tier_name       text;
  v_io_pct_base     numeric;
  v_io_over_pct     numeric;
  v_io_status       text := 'sem_dados';
  v_io_forca_subir  boolean := false;
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

  -- ---------------- INFRA REAL (últimos 30 min do coletor) ----------------
  SELECT
    count(*) FILTER (WHERE disk_io_mbps IS NOT NULL),
    round(avg(disk_io_mbps)::numeric, 1),
    round(max(disk_io_mbps)::numeric, 1),
    round(avg(disk_io_util_pct)::numeric, 1),
    round(avg(cpu_pct)::numeric, 1),
    round(avg(mem_pct)::numeric, 1),
    round(avg(swap_used_pct)::numeric, 1),
    round(avg(swap_io_mbps)::numeric, 1),
    round((max(mem_total_bytes) / (1024^3))::numeric, 2)
  INTO v_io_samples, v_io_avg, v_io_max, v_io_util, v_cpu_avg, v_mem_avg,
       v_swap_pct, v_swap_io, v_mem_gb
  FROM public.db_health_history
  WHERE captured_at >= now() - interval '30 minutes';

  IF v_mem_gb IS NOT NULL THEN
    SELECT c.name, c.baseline_disk_io_mbps, c.max_disk_io_mbps
    INTO v_tier_name, v_baseline, v_burst
    FROM public.db_compute_catalog c
    WHERE c.captured_at = (SELECT max(captured_at) FROM public.db_compute_catalog)
    ORDER BY abs(c.memory_gb - v_mem_gb) ASC, c.memory_gb DESC
    LIMIT 1;
  END IF;

  IF v_io_samples > 0 AND v_baseline IS NOT NULL AND v_baseline > 0 THEN
    v_io_pct_base := round(v_io_avg / v_baseline * 100, 0);

    SELECT round(100.0 * count(*) FILTER (WHERE disk_io_mbps > v_baseline)
                 / nullif(count(*) FILTER (WHERE disk_io_mbps IS NOT NULL), 0), 1)
    INTO v_io_over_pct
    FROM public.db_health_history
    WHERE captured_at >= now() - interval '30 minutes';

    v_io_status := CASE
      WHEN v_io_pct_base > 100 OR COALESCE(v_io_over_pct,0) >= 10 THEN 'estoura'
      WHEN v_io_pct_base > 60  OR COALESCE(v_io_over_pct,0) >= 2  THEN 'apertado'
      ELSE 'ok' END;

    v_io_forca_subir := (v_io_status = 'estoura');
  END IF;

  -- ---------------- MOTOR DE VEREDITO ----------------
  -- I/O acima da franquia manda subir SOZINHO: um tier pode estar folgado em
  -- CPU/RAM e insuficiente em disco, e é esse o caso que o painel não via.
  IF v_io_forca_subir THEN
    v_verdict := 'subir';
    v_confidence := 'alta';
    v_reasons := v_reasons
      || to_jsonb(format('Disco em %s Mbps de média (pico %s Mbps) contra %s Mbps de franquia sustentada da %s: %s%% da franquia.',
                         v_io_avg, v_io_max, v_baseline, COALESCE(v_tier_name,'instância atual'), v_io_pct_base))
      || to_jsonb(format('A instância passou %s%% dos últimos 30 minutos acima da franquia de disco — é isso que consome o Disk IO Budget e derruba a performance quando ele zera.', COALESCE(v_io_over_pct,0)))
      || to_jsonb(format('Disco ocupado %s%% do tempo.', COALESCE(v_io_util, 0)))
      || to_jsonb('Recomendação: subir o tier. O gargalo é DISCO, não conexão nem cache — os sinais do Postgres sozinhos não pegariam isso.'::text);
    IF COALESCE(v_swap_pct, 0) > 5 THEN
      v_reasons := v_reasons
        || to_jsonb(format('Agravante: %s%% do swap ocupado, trocando %s Mbps com o disco. Falta de RAM virando I/O — mais memória derruba boa parte desse consumo.', v_swap_pct, COALESCE(v_swap_io,0)));
    END IF;

  ELSIF v_conn_pct > 85 AND v_timeout_stmts > 0 AND v_cache_hit < 0.99 THEN
    v_verdict := 'subir';
    v_confidence := 'alta';
    v_reasons := v_reasons
      || to_jsonb(format('Conexões em %s%% do teto (%s/%s): perto de saturar.', v_conn_pct, v_client_total, v_max_conn))
      || to_jsonb(format('Cache hit em %s (<0.99): banco lendo do disco, sinal de pressão de RAM.', v_cache_hit))
      || to_jsonb(format('%s tipos de query chegaram perto do statement_timeout (%s ms): fila de execução.', v_timeout_stmts, v_stmt_timeout_ms))
      || to_jsonb('Recomendação: subir o tier. CPU/RAM genuinamente insuficientes.'::text);

  ELSIF v_conn_pct < 40 AND v_cache_hit >= 0.999 AND v_timeout_stmts = 0
        AND v_io_status IN ('ok', 'sem_dados') THEN
    v_verdict := 'baixar';
    v_confidence := CASE WHEN v_io_status = 'sem_dados' THEN 'baixa'
                         WHEN v_conn_pct < 25 THEN 'alta' ELSE 'media' END;
    v_baixar_obs := true;
    v_reasons := v_reasons
      || to_jsonb(format('Conexões em só %s%% do teto (%s/%s): muita folga.', v_conn_pct, v_client_total, v_max_conn))
      || to_jsonb(format('Cache hit em %s (~1.0): páginas do Postgres servidas da memória.', v_cache_hit))
      || to_jsonb('Nenhuma query chegou perto do statement_timeout: sem saturação de CPU.'::text)
      || to_jsonb(CASE WHEN v_io_status = 'ok'
                       THEN format('Disco em %s Mbps de %s Mbps de franquia (%s%%): dentro do orçamento de I/O.', v_io_avg, v_baseline, v_io_pct_base)
                       ELSE 'ATENÇÃO: ainda sem amostras de I/O de disco no histórico — NÃO baixe antes de o coletor acumular pelo menos algumas horas de I/O.' END)
      || to_jsonb('ATENÇÃO: "baixar" só é seguro DEPOIS de aplicar as otimizações de query pendentes e observar alguns dias no tier atual. Não baixe direto.'::text);

  ELSE
    v_verdict := 'manter';
    v_confidence := 'media';
    v_reasons := v_reasons
      || to_jsonb(format('Conexões em %s%% do teto (%s/%s).', v_conn_pct, v_client_total, v_max_conn))
      || to_jsonb(format('Cache hit em %s.', v_cache_hit));
    IF v_io_status = 'apertado' THEN
      v_reasons := v_reasons
        || to_jsonb(format('ATENÇÃO no disco: %s Mbps de média, %s%% da franquia da %s. Ainda não estoura, mas não há folga para crescer.',
                           v_io_avg, v_io_pct_base, COALESCE(v_tier_name,'instância atual')));
    ELSIF v_io_status = 'ok' THEN
      v_reasons := v_reasons
        || to_jsonb(format('Disco em %s Mbps (%s%% da franquia da %s): dentro do orçamento de I/O.',
                           v_io_avg, v_io_pct_base, COALESCE(v_tier_name,'instância atual')));
    ELSE
      v_reasons := v_reasons
        || to_jsonb('Sem amostras de I/O de disco nos últimos 30 minutos — o veredito NÃO enxerga disco agora. Verifique o coletor collect-db-health.'::text);
    END IF;
    IF v_timeout_stmts > 0 THEN
      v_reasons := v_reasons
        || to_jsonb(format('%s tipos de query já chegaram perto do statement_timeout — otimizar antes de pensar em tier.', v_timeout_stmts));
    ELSE
      v_reasons := v_reasons
        || to_jsonb('Sem timeouts sustentados.'::text);
    END IF;
    IF v_conn_pct >= 40 AND v_conn_pct <= 85 THEN
      v_reasons := v_reasons
        || to_jsonb('Uso alto porém sem saturação de conexão nem timeout.'::text);
    END IF;
  END IF;

  v_reasons := v_reasons
    || to_jsonb(format('Janela do pg_stat_statements: %s dias (means são vitalícios, não "agora"). CPU%%/RAM/I-O de infra vêm do coletor collect-db-health (endpoint privilegiado), média dos últimos 30 min.', v_window_days));

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
    ),
    'infra_30min', jsonb_build_object(
      'tier',                 v_tier_name,
      'cpu_pct',              v_cpu_avg,
      'mem_pct',              v_mem_avg,
      'disk_io_mbps',         v_io_avg,
      'disk_io_mbps_max',     v_io_max,
      'disk_io_util_pct',     v_io_util,
      'baseline_mbps',        v_baseline,
      'burst_mbps',           v_burst,
      'pct_da_franquia',      v_io_pct_base,
      'pct_do_tempo_acima_da_franquia', v_io_over_pct,
      'io_status',            v_io_status,
      'swap_used_pct',        v_swap_pct,
      'swap_io_mbps',         v_swap_io,
      'amostras',             v_io_samples
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_instance_health_verdict() IS
  'SUPER-ADMIN-ONLY. Veredito de tier "agora" (subir/manter/baixar) cruzando sinais vivos do Postgres (conexões vs max_connections, cache hit, timeouts via max_exec_time, queries lentas) COM a infra real dos últimos 30 min do db_health_history (CPU%, RAM%, Disk I/O em Mbps, %util, swap). O I/O de disco pode mandar subir SOZINHO: um tier pode estar folgado em CPU/RAM e insuficiente em disco — passar do baseline_disk_io_mbps do tier é o que consome o Disk IO Budget do Supabase. "baixar" agora exige também I/O ok; sem amostras de I/O o veredito avisa que está cego a disco. A recomendação rica com preços vive em get_instance_recommendation().';

REVOKE ALL ON FUNCTION public.get_instance_health_verdict() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_instance_health_verdict() TO authenticated, service_role;

-- =============================================================================
-- 6a) get_db_health_snapshot() — bloco disk_io na foto instantânea
-- =============================================================================
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
  v_io              record;
  v_baseline        numeric;
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

  -- Última leitura de I/O do coletor (pg_stat_* NÃO expõe I/O de infra).
  SELECT h.captured_at, h.disk_io_mbps, h.disk_read_mbps, h.disk_write_mbps,
         h.disk_io_util_pct, h.disk_iops, h.disk_io_queue,
         h.swap_used_pct, h.swap_io_mbps, h.major_faults_per_sec,
         h.mem_total_bytes
  INTO v_io
  FROM public.db_health_history h
  WHERE h.disk_io_mbps IS NOT NULL
  ORDER BY h.captured_at DESC
  LIMIT 1;

  IF v_io.mem_total_bytes IS NOT NULL THEN
    SELECT c.baseline_disk_io_mbps INTO v_baseline
    FROM public.db_compute_catalog c
    WHERE c.captured_at = (SELECT max(captured_at) FROM public.db_compute_catalog)
    ORDER BY abs(c.memory_gb - (v_io.mem_total_bytes / (1024^3))::numeric) ASC, c.memory_gb DESC
    LIMIT 1;
  END IF;

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
    'blocked_queries',      v_blocked,
    'disk_io', CASE WHEN v_io.disk_io_mbps IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
      'measured_at',        v_io.captured_at,
      'mbps',               v_io.disk_io_mbps,
      'read_mbps',          v_io.disk_read_mbps,
      'write_mbps',         v_io.disk_write_mbps,
      'util_pct',           v_io.disk_io_util_pct,
      'iops',               v_io.disk_iops,
      'queue',              v_io.disk_io_queue,
      'baseline_mbps',      v_baseline,
      'pct_da_franquia',    CASE WHEN COALESCE(v_baseline,0) > 0
                                 THEN round(v_io.disk_io_mbps / v_baseline * 100, 0) END,
      'swap_used_pct',      v_io.swap_used_pct,
      'swap_io_mbps',       v_io.swap_io_mbps,
      'major_faults_per_sec', v_io.major_faults_per_sec
    ) END
  );
END;
$$;

COMMENT ON FUNCTION public.get_db_health_snapshot() IS
  'SUPER-ADMIN-ONLY. Foto instantânea da saúde do banco: conexões por estado + %uso vs max_connections, cache hit ratio (heap), tamanho do DB, queries ativas >2s, queries bloqueadas por lock, e bloco disk_io com a última medição de I/O do coletor (Mbps lido/escrito, %util, IOPS, fila, swap) comparada ao baseline_disk_io_mbps do tier. Read-only.';

REVOKE ALL ON FUNCTION public.get_db_health_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_health_snapshot() TO authenticated, service_role;

-- =============================================================================
-- 6b) get_db_health_history() — série temporal ganha I/O e swap
-- DROP + CREATE porque RETURNS TABLE muda (CREATE OR REPLACE não permite).
-- DROP leva junto os GRANTs: re-aplicamos logo abaixo.
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_db_health_history(timestamptz, timestamptz, interval);

CREATE FUNCTION public.get_db_health_history(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket interval DEFAULT interval '1 hour'
)
RETURNS TABLE (
  bucket_ts            timestamptz,
  avg_cpu_pct          numeric,
  max_cpu_pct          numeric,
  avg_mem_pct          numeric,
  max_mem_pct          numeric,
  avg_disk_pct         numeric,
  max_disk_pct         numeric,
  avg_conn_used        numeric,
  max_conn_used        int,
  max_slow_queries     int,
  samples              bigint,
  avg_disk_io_mbps     numeric,
  max_disk_io_mbps     numeric,
  avg_disk_io_util_pct numeric,
  max_disk_io_util_pct numeric,
  avg_disk_iops        numeric,
  avg_swap_used_pct    numeric,
  max_swap_used_pct    numeric,
  avg_swap_io_mbps     numeric
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
    round(avg(h.cpu_pct), 2)            AS avg_cpu_pct,
    round(max(h.cpu_pct), 2)            AS max_cpu_pct,
    round(avg(h.mem_pct), 2)            AS avg_mem_pct,
    round(max(h.mem_pct), 2)            AS max_mem_pct,
    round(avg(h.disk_pct), 2)           AS avg_disk_pct,
    round(max(h.disk_pct), 2)           AS max_disk_pct,
    round(avg(h.conn_used), 1)          AS avg_conn_used,
    max(h.conn_used)                    AS max_conn_used,
    max(h.slow_queries)                 AS max_slow_queries,
    count(*)                            AS samples,
    round(avg(h.disk_io_mbps), 1)       AS avg_disk_io_mbps,
    round(max(h.disk_io_mbps), 1)       AS max_disk_io_mbps,
    round(avg(h.disk_io_util_pct), 1)   AS avg_disk_io_util_pct,
    round(max(h.disk_io_util_pct), 1)   AS max_disk_io_util_pct,
    round(avg(h.disk_iops), 0)          AS avg_disk_iops,
    round(avg(h.swap_used_pct), 1)      AS avg_swap_used_pct,
    round(max(h.swap_used_pct), 1)      AS max_swap_used_pct,
    round(avg(h.swap_io_mbps), 1)       AS avg_swap_io_mbps
  FROM public.db_health_history h
  WHERE h.captured_at >= p_from
    AND h.captured_at <  p_to
  GROUP BY 1
  ORDER BY 1;
END;
$$;

COMMENT ON FUNCTION public.get_db_health_history(timestamptz, timestamptz, interval) IS
  'SUPER-ADMIN-ONLY. Série temporal de saúde do banco agregada por bucket (default 1h) no intervalo [p_from, p_to). Por bucket: avg/max de cpu/mem/disk %, avg/max conn_used, max slow_queries, samples e — desde 2026-09-24 — avg/max de disk_io_mbps (taxa real de I/O, comparável ao baseline do tier), %util do disco, IOPS médio e swap. Bucket via floor de epoch (sem timescaledb). Ordenado por bucket_ts.';

REVOKE ALL ON FUNCTION public.get_db_health_history(timestamptz, timestamptz, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_health_history(timestamptz, timestamptz, interval) TO authenticated, service_role;

-- =============================================================================
-- 6c) get_usage_peaks() — picos de I/O e swap no período
-- =============================================================================
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
  v_io    record;
  v_util  record;
  v_swap  record;
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

  SELECT h.disk_io_mbps AS val, h.captured_at AS at INTO v_io
  FROM public.db_health_history h
  WHERE h.captured_at >= p_from AND h.captured_at < p_to AND h.disk_io_mbps IS NOT NULL
  ORDER BY h.disk_io_mbps DESC, h.captured_at ASC LIMIT 1;

  SELECT h.disk_io_util_pct AS val, h.captured_at AS at INTO v_util
  FROM public.db_health_history h
  WHERE h.captured_at >= p_from AND h.captured_at < p_to AND h.disk_io_util_pct IS NOT NULL
  ORDER BY h.disk_io_util_pct DESC, h.captured_at ASC LIMIT 1;

  SELECT h.swap_used_pct AS val, h.captured_at AS at INTO v_swap
  FROM public.db_health_history h
  WHERE h.captured_at >= p_from AND h.captured_at < p_to AND h.swap_used_pct IS NOT NULL
  ORDER BY h.swap_used_pct DESC, h.captured_at ASC LIMIT 1;

  RETURN jsonb_build_object(
    'from',    p_from,
    'to',      p_to,
    'samples', coalesce(v_total, 0),
    'peak_cpu_pct',          jsonb_build_object('value', v_cpu.val,  'captured_at', v_cpu.at),
    'peak_mem_pct',          jsonb_build_object('value', v_mem.val,  'captured_at', v_mem.at),
    'peak_conn_used',        jsonb_build_object('value', v_conn.val, 'captured_at', v_conn.at),
    'peak_slow_queries',     jsonb_build_object('value', v_slow.val, 'captured_at', v_slow.at),
    'peak_disk_io_mbps',     jsonb_build_object('value', v_io.val,   'captured_at', v_io.at),
    'peak_disk_io_util_pct', jsonb_build_object('value', v_util.val, 'captured_at', v_util.at),
    'peak_swap_used_pct',    jsonb_build_object('value', v_swap.val, 'captured_at', v_swap.at)
  );
END;
$$;

COMMENT ON FUNCTION public.get_usage_peaks(timestamptz, timestamptz) IS
  'SUPER-ADMIN-ONLY. Picos do período [p_from, p_to): maior cpu_pct, mem_pct, conn_used, slow_queries e — desde 2026-09-24 — disk_io_mbps (taxa de I/O), disk_io_util_pct e swap_used_pct, cada um com o captured_at em que ocorreu (empate -> mais antigo). Retorna jsonb com samples do período.';

REVOKE ALL ON FUNCTION public.get_usage_peaks(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_usage_peaks(timestamptz, timestamptz) TO authenticated, service_role;
