// =========================================================================
// collect-db-health — COLETOR do histórico de saúde da plataforma
//
// GLOBAL (sem company_id). Roda via cron (pg_cron + pg_net) a cada ~2min.
// Faz:
//   1) Scrape do endpoint Prometheus privilegiado do projeto (CPU/mem/disco reais)
//   2) SQL local em pg_stat_activity (active/slow/blocked, conn_used/max, cache_hit)
//   3) Calcula CPU% pelo delta idle/total vs. a última coleta
//   4) INSERT em public.db_health_history (policy service_role_full_access)
//
// Auth: exige `Authorization: Bearer <CRON_SECRET>` (deploy com --no-verify-jwt).
// NUNCA loga/retorna a service key nem o CRON_SECRET.
// =========================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

const METRICS_URL =
  'https://byqldosixshhuiuarszp.supabase.co/customer/v1/privileged/metrics'

// -------------------------------------------------------------------------
// Parser Prometheus DEFENSIVO.
// Linha: `metric_name{label="a",label2="b"} 123.45`  ou  `metric_name 123.45`
// Ignora `# HELP` / `# TYPE` / linhas vazias. Tolerante a formato inesperado.
// Retorna array de { name, labels: Record<string,string>, value: number }.
// -------------------------------------------------------------------------
interface PromSample {
  name: string
  labels: Record<string, string>
  value: number
}

function parseProm(text: string): PromSample[] {
  const out: PromSample[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    // Separa a parte "nome{labels}" do valor (último token numérico).
    // Prometheus: "<metric>{...} <value> [<timestamp>]"
    const braceEnd = line.lastIndexOf('}')
    let head: string
    let rest: string
    if (line.includes('{') && braceEnd !== -1) {
      head = line.slice(0, braceEnd + 1)
      rest = line.slice(braceEnd + 1).trim()
    } else {
      const sp = line.indexOf(' ')
      if (sp === -1) continue
      head = line.slice(0, sp)
      rest = line.slice(sp + 1).trim()
    }

    const valueStr = rest.split(/\s+/)[0]
    const value = Number(valueStr)
    if (!isFinite(value)) continue

    let name = head
    const labels: Record<string, string> = {}
    const braceStart = head.indexOf('{')
    if (braceStart !== -1) {
      name = head.slice(0, braceStart)
      const labelStr = head.slice(braceStart + 1, head.lastIndexOf('}'))
      // label="value" pares; tolerante a vírgulas/escapes simples
      const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(labelStr)) !== null) {
        labels[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      }
    }
    out.push({ name: name.trim(), labels, value })
  }
  return out
}

function sumBy(samples: PromSample[], name: string): number | null {
  const rows = samples.filter((s) => s.name === name)
  if (rows.length === 0) return null
  return rows.reduce((acc, s) => acc + s.value, 0)
}

// Pega o valor "de dados" pra métricas de filesystem: preferimos o maior size
// (partição de dados costuma ser a maior). Retorna { avail, size, mount } ou null.
function pickDataFilesystem(
  samples: PromSample[]
): { avail: number; size: number; mount: string } | null {
  const sizes = samples.filter((s) => s.name === 'node_filesystem_size_bytes')
  const avails = samples.filter((s) => s.name === 'node_filesystem_avail_bytes')
  if (sizes.length === 0 || avails.length === 0) return null

  // Ignora pseudo-fs (tmpfs/overlay/…) quando o label existir; escolhe a maior real.
  const isReal = (s: PromSample) => {
    const fs = (s.labels.fstype || '').toLowerCase()
    if (!fs) return true
    return !['tmpfs', 'overlay', 'devtmpfs', 'squashfs', 'ramfs', 'proc', 'sysfs'].includes(fs)
  }

  const candidates = sizes.filter(isReal)
  const pool = candidates.length > 0 ? candidates : sizes
  let best: PromSample | null = null
  for (const s of pool) {
    if (!best || s.value > best.value) best = s
  }
  if (!best) return null

  const mount = best.labels.mountpoint || ''
  // avail do mesmo mountpoint (ou o menor avail se não casar por label)
  let availSample = avails.find(
    (a) => a.labels.mountpoint === mount && a.labels.device === best!.labels.device
  )
  if (!availSample) availSample = avails.find((a) => a.labels.mountpoint === mount)
  const avail = availSample ? availSample.value : null
  if (avail === null) return null

  return { avail, size: best.value, mount }
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req)
  if (corsResp) return corsResp

  // --- Gate: só cron/scheduler com o CRON_SECRET ---
  const cronSecret = Deno.env.get('CRON_SECRET')
  const authHeader = req.headers.get('Authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    // ==========================================================
    // 1) SCRAPE do endpoint Prometheus privilegiado (Basic auth)
    // ==========================================================
    const basic = btoa(`service_role:${serviceRoleKey}`)
    let metricsText: string | null = null
    let scrapeStatus = 0
    try {
      const ctrl = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), 15000)
      const resp = await fetch(METRICS_URL, {
        method: 'GET',
        headers: { Authorization: `Basic ${basic}` },
        signal: ctrl.signal,
      })
      clearTimeout(timeout)
      scrapeStatus = resp.status
      if (resp.status === 401 || resp.status === 403) {
        // Pode ser feature de plano — reporta pra decisão, NÃO insere lixo.
        console.error(
          `metrics scrape denied: HTTP ${resp.status} (verifique plano/Basic auth)`
        )
        return new Response(
          JSON.stringify({
            skipped: true,
            reason: 'metrics_scrape_denied',
            status: resp.status,
          }),
          {
            status: 200,
            headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          }
        )
      }
      if (resp.status === 200) {
        metricsText = await resp.text()
      } else {
        // 429 / 5xx / outros → pula esta coleta (não crash, não lixo)
        console.warn(`metrics scrape non-200: HTTP ${resp.status} — skipping`)
      }
    } catch (e) {
      console.warn(`metrics scrape failed (timeout/rede): ${(e as Error).name} — skipping`)
    }

    // Se não conseguimos as métricas de infra, pulamos a coleta inteira
    // (as internas do pg sozinhas não justificam uma linha meia-boca).
    if (metricsText === null) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no_metrics', status: scrapeStatus }),
        {
          status: 200,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }
      )
    }

    const samples = parseProm(metricsText)

    // -------- CPU (brutos p/ delta) --------
    // node_cpu_seconds_total{mode="idle"} somado por CPU = idle total.
    // Somamos todos os modes = total. Ambos acumulados desde o boot.
    const cpuAll = samples.filter((s) => s.name === 'node_cpu_seconds_total')
    let cpuIdle: number | null = null
    let cpuTotal: number | null = null
    if (cpuAll.length > 0) {
      cpuIdle = 0
      cpuTotal = 0
      for (const s of cpuAll) {
        cpuTotal += s.value
        if ((s.labels.mode || '').toLowerCase() === 'idle') cpuIdle += s.value
      }
    }

    // -------- Memória --------
    const memAvail = sumBy(samples, 'node_memory_MemAvailable_bytes')
    const memTotal = sumBy(samples, 'node_memory_MemTotal_bytes')
    let memPct: number | null = null
    if (memAvail !== null && memTotal !== null && memTotal > 0) {
      memPct = Number((((memTotal - memAvail) / memTotal) * 100).toFixed(2))
    }

    // -------- Disco --------
    const fs = pickDataFilesystem(samples)
    let diskPct: number | null = null
    if (fs && fs.size > 0) {
      diskPct = Number((((fs.size - fs.avail) / fs.size) * 100).toFixed(2))
    }

    // ==========================================================
    // 2) CPU% via DELTA vs. última coleta
    // ==========================================================
    let cpuPct: number | null = null
    const { data: prev } = await supabase
      .from('db_health_history')
      .select('cpu_idle_seconds, cpu_total_seconds')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (
      prev &&
      cpuIdle !== null &&
      cpuTotal !== null &&
      prev.cpu_idle_seconds !== null &&
      prev.cpu_total_seconds !== null
    ) {
      const dIdle = cpuIdle - Number(prev.cpu_idle_seconds)
      const dTotal = cpuTotal - Number(prev.cpu_total_seconds)
      if (dTotal > 0 && dIdle >= 0) {
        const busy = 1 - dIdle / dTotal
        cpuPct = Number((Math.min(Math.max(busy, 0), 1) * 100).toFixed(2))
      }
      // dTotal<=0 (reset/contador zerado) → cpu_pct NULL nesta coleta
    }

    // ==========================================================
    // 3) SQL local: pg_stat_activity + conexões + cache hit
    // ==========================================================
    let activeQueries: number | null = null
    let slowQueries: number | null = null
    let blocked: number | null = null
    let connUsed: number | null = null
    let connMax: number | null = null
    let cacheHit: number | null = null

    // pg_stat_activity NÃO é exposto pelo PostgREST → conexão pg direta
    // via SUPABASE_DB_URL (secret nativo). Se falhar, seguimos só com infra.
    try {
      const stats = await collectPgStats()
      activeQueries = stats.activeQueries
      slowQueries = stats.slowQueries
      blocked = stats.blocked
      connUsed = stats.connUsed
      connMax = stats.connMax
      cacheHit = stats.cacheHit
    } catch (e) {
      console.warn(`pg_stat coleta falhou (segue só com infra): ${(e as Error).message}`)
    }

    // ==========================================================
    // 4) INSERT
    // ==========================================================
    const raw = {
      scrape_status: scrapeStatus,
      series_found: {
        cpu: cpuAll.length > 0 ? 'node_cpu_seconds_total' : null,
        cpu_modes: Array.from(new Set(cpuAll.map((s) => s.labels.mode))).filter(Boolean),
        mem_available:
          memAvail !== null ? 'node_memory_MemAvailable_bytes' : null,
        mem_total: memTotal !== null ? 'node_memory_MemTotal_bytes' : null,
        disk: fs
          ? {
              mount: fs.mount,
              size_metric: 'node_filesystem_size_bytes',
              avail_metric: 'node_filesystem_avail_bytes',
            }
          : null,
      },
      disk_bytes: fs ? { avail: fs.avail, size: fs.size } : null,
    }

    const row = {
      cpu_pct: cpuPct,
      mem_pct: memPct,
      disk_pct: diskPct,
      conn_used: connUsed,
      conn_max: connMax,
      cache_hit: cacheHit,
      active_queries: activeQueries,
      slow_queries: slowQueries,
      blocked: blocked,
      cpu_idle_seconds: cpuIdle,
      cpu_total_seconds: cpuTotal,
      mem_available_bytes: memAvail !== null ? Math.round(memAvail) : null,
      mem_total_bytes: memTotal !== null ? Math.round(memTotal) : null,
      raw,
    }

    const { error: insErr } = await supabase.from('db_health_history').insert(row)
    if (insErr) throw insErr

    return new Response(
      JSON.stringify({
        inserted: true,
        cpu_pct: cpuPct,
        mem_pct: memPct,
        disk_pct: diskPct,
        conn_used: connUsed,
        conn_max: connMax,
        cache_hit: cacheHit,
        active_queries: activeQueries,
        slow_queries: slowQueries,
        blocked: blocked,
        series_found: raw.series_found,
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('collect-db-health error:', (error as Error).message)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})

// -------------------------------------------------------------------------
// Coleta métricas internas via conexão Postgres direta (deno-postgres).
// pg_stat_activity NÃO é exposto pelo PostgREST, então abrimos uma conexão
// curta com a service role (via connection string derivada do projeto).
// -------------------------------------------------------------------------
async function collectPgStats(): Promise<{
  activeQueries: number | null
  slowQueries: number | null
  blocked: number | null
  connUsed: number | null
  connMax: number | null
  cacheHit: number | null
}> {
  const { Client } = await import('https://deno.land/x/postgres@v0.19.3/mod.ts')

  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) throw new Error('SUPABASE_DB_URL ausente')

  // Conexão curta via connection string nativa do projeto.
  const client = new Client(dbUrl)

  try {
    await client.connect()

    const q = await client.queryObject<{
      active_queries: number
      slow_queries: number
      blocked: number
      conn_used: number
    }>(`
      SELECT
        count(*) FILTER (WHERE state = 'active' AND backend_type = 'client backend') AS active_queries,
        count(*) FILTER (WHERE state = 'active' AND backend_type = 'client backend'
                         AND query_start < now() - interval '2 seconds')            AS slow_queries,
        count(*) FILTER (WHERE wait_event_type = 'Lock')                            AS blocked,
        count(*)                                                                     AS conn_used
      FROM pg_stat_activity
    `)

    const maxc = await client.queryObject<{ max_conn: number }>(
      `SELECT setting::int AS max_conn FROM pg_settings WHERE name = 'max_connections'`
    )

    const cache = await client.queryObject<{ ratio: number | null }>(`
      SELECT CASE WHEN sum(blks_hit) + sum(blks_read) > 0
        THEN round(100.0 * sum(blks_hit) / (sum(blks_hit) + sum(blks_read)), 2)
        ELSE NULL END AS ratio
      FROM pg_stat_database
    `)

    const r = q.rows[0]
    return {
      activeQueries: Number(r.active_queries),
      slowQueries: Number(r.slow_queries),
      blocked: Number(r.blocked),
      connUsed: Number(r.conn_used),
      connMax: maxc.rows[0] ? Number(maxc.rows[0].max_conn) : null,
      cacheHit: cache.rows[0]?.ratio != null ? Number(cache.rows[0].ratio) : null,
    }
  } finally {
    try {
      await client.end()
    } catch (_) {
      // ignore
    }
  }
}
