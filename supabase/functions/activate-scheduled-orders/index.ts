// deno-lint-ignore-file no-explicit-any no-import-prefix
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { timingSafeEqual } from '../_shared/timing-safe.ts'
import { companyClock } from './timezone.ts'

const PAGE_SIZE = 1000
// A edge usa o client com service role e sem os tipos gerados do app. Manter o
// tipo aberto aqui evita que o Deno infira o schema como `never`, sem reduzir as
// validacoes de tenant/status feitas nas consultas abaixo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EdgeClient = any

async function fetchScheduledCompanyIds(supabase: EdgeClient) {
  const companyIds = new Set<string>()
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('service_orders')
      .select('company_id')
      .eq('status', 'agendada')
      .not('scheduled_date', 'is', null)
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    for (const row of data ?? []) companyIds.add(row.company_id)
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return [...companyIds]
}

async function fetchCompanyTimezones(
  supabase: EdgeClient,
  companyIds: string[],
) {
  const timezones = new Map<string, string>()
  const chunkSize = 200

  for (let index = 0; index < companyIds.length; index += chunkSize) {
    const chunk = companyIds.slice(index, index + chunkSize)
    const { data, error } = await supabase
      .from('company_settings')
      .select('company_id, timezone')
      .in('company_id', chunk)

    if (error) throw error
    for (const row of data ?? []) {
      if (row.company_id && row.timezone) timezones.set(row.company_id, row.timezone)
    }
  }

  return timezones
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  // Exigir token secreto de autorização (apenas cron/scheduler pode chamar)
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  const presentedSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!cronSecret || !presentedSecret || !timingSafeEqual(presentedSecret, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const companyIds = await fetchScheduledCompanyIds(supabase)
    const timezones = await fetchCompanyTimezones(supabase, companyIds)
    const now = new Date()
    let count = 0
    let skippedTenants = 0

    for (const companyId of companyIds) {
      const clock = companyClock(now, timezones.get(companyId))
      if (!clock) {
        skippedTenants += 1
        console.warn('[activate-scheduled-orders] tenant_timezone_invalid', { companyId })
        continue
      }

      // Datas anteriores ja venceram independentemente do horario.
      const { data: pastOrders, error: pastError } = await supabase
        .from('service_orders')
        .update({ status: 'pendente' })
        .eq('company_id', companyId)
        .eq('status', 'agendada')
        .lt('scheduled_date', clock.date)
        .select('id')
      if (pastError) throw pastError

      // No dia local da empresa, ativa somente quando o horario chegou. Horario
      // nulo preserva o comportamento de compromisso "do dia" e ativa no inicio.
      const { data: todayOrders, error: todayError } = await supabase
        .from('service_orders')
        .update({ status: 'pendente' })
        .eq('company_id', companyId)
        .eq('status', 'agendada')
        .eq('scheduled_date', clock.date)
        .or(`scheduled_time.is.null,scheduled_time.lte.${clock.time}`)
        .select('id')
      if (todayError) throw todayError

      count += (pastOrders?.length ?? 0) + (todayOrders?.length ?? 0)
    }

    console.log(`Activated ${count} scheduled orders across ${companyIds.length} tenants`)

    return new Response(
      JSON.stringify({ message: `${count} orders activated`, processed_tenants: companyIds.length - skippedTenants, skipped_tenants: skippedTenants }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error activating scheduled orders:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
