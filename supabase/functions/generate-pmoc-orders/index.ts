import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import {
  DEFAULT_TIME_ZONE,
  safeTimeZone,
  ymdInTimeZone,
} from '../_shared/pmoc-templates/context.ts'

// =============================================================================
// DEPRECATED (v1.9.12): contratos PMOC agora geram OSs na criação igual
// contrato comum (via useContracts.createContract). O scheduler que invocava
// esta função foi desativado em 23/05/2026 (ver migration
// 20260523230940_disable_pmoc_orders_cron.sql). Função mantida deployed por
// compat caso seja necessário reativar pra "auto-renew" de horizon vencido
// no futuro. Não chame manualmente.
// =============================================================================
//
// generate-pmoc-orders (PMOC v1.9.0+)
//
// ANTES (≤ v1.8.x):
//   - Lia pmoc_plans where status='ativo' and next_generation_date <= today
//   - Gerava OS por pmoc_items
//   - Atualizava pmoc_plans.next_generation_date
//
// DEPOIS (v1.9.0+):
//   - Lê contracts where is_pmoc=true and status='active' and next_pmoc_generation_date <= today
//   - Gera OS por contract_items
//   - Atualiza contracts.next_pmoc_generation_date (NÃO mais pmoc_plans — está read-only)
//   - service_orders ganha contract_id + origin='contract'
//   - Mantém pmoc_generated_os pra histórico (será dropada na Onda D / 1.9.3)
//
// Nome do endpoint mantido (cron já configurado). Renomear pra
// generate-contract-orders pode ser feito em release futura.
// =============================================================================

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  // Auth: apenas cron/scheduler com CRON_SECRET
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const now = new Date()

    // Limite SUPERIOR da busca: o maior "hoje" possível em qualquer fuso do
    // mundo é o dia UTC + 1 (o maior deslocamento em uso é UTC+14). Buscamos por
    // esse teto e depois filtramos contrato a contrato pelo fuso REAL da empresa
    // dona. Filtrar direto pelo dia UTC gerava OS um dia adiantado pra empresa
    // atrás de UTC: às 22h em São Paulo o instante já está no dia seguinte em
    // UTC. Aritmética pura de dia, sem Intl, pra o teto nunca encolher.
    const maxToday = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    // Buscar contratos PMOC ativos com data de geração vencida
    const { data: contracts, error: contractsError } = await supabase
      .from('contracts')
      .select(`
        id,
        company_id,
        name,
        customer_id,
        technician_id,
        service_type_id,
        form_template_id,
        frequency_value,
        frequency_type,
        next_pmoc_generation_date,
        contract_items (
          id,
          equipment_id,
          item_name,
          equipment:equipment(id, name, status)
        )
      `)
      .eq('is_pmoc', true)
      .eq('status', 'active')
      .lte('next_pmoc_generation_date', maxToday)
      .not('next_pmoc_generation_date', 'is', null)

    if (contractsError) throw contractsError

    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ message: 'No PMOC contracts due', generated: 0 }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    // Fuso por empresa (allowlist explícita, nunca select('*')). Se a leitura
    // falhar, NÃO aborta a geração: cai no padrão e registra no log, que é
    // exatamente o comportamento de hoje.
    const companyIds = [
      ...new Set(
        contracts
          .map((c: { company_id: string | null }) => c.company_id)
          .filter((id): id is string => !!id),
      ),
    ]
    const timeZoneByCompany = new Map<string, string>()
    if (companyIds.length > 0) {
      const { data: settings, error: settingsError } = await supabase
        .from('company_settings')
        .select('company_id, timezone')
        .in('company_id', companyIds)

      if (settingsError) {
        console.error(
          '[generate-pmoc-orders] Falha ao ler company_settings.timezone, usando o padrão:',
          settingsError,
        )
      } else {
        for (const row of settings ?? []) {
          if (row.company_id) timeZoneByCompany.set(row.company_id, safeTimeZone(row.timezone))
        }
      }
    }

    let totalGenerated = 0
    let skippedNotDue = 0
    const errors: Array<{ contract_id: string; error: string }> = []

    for (const contract of contracts) {
      const scheduledDate = contract.next_pmoc_generation_date!
      const items = (contract.contract_items || []) as Array<any>

      // "Hoje" no calendário da EMPRESA dona do contrato. Contrato que ainda
      // não venceu por lá fica pro próximo ciclo do cron, sem gerar OS adiantada.
      const companyTimeZone = contract.company_id
        ? timeZoneByCompany.get(contract.company_id) ?? DEFAULT_TIME_ZONE
        : DEFAULT_TIME_ZONE
      const companyToday = isoFromYmd(ymdInTimeZone(now, companyTimeZone))
      if (companyToday && scheduledDate > companyToday) {
        skippedNotDue++
        continue
      }

      // Só itens com equipamento ativo são considerados
      const activeItems = items.filter(
        (item) => item.equipment_id && item.equipment?.status === 'active'
      )

      // Calcular próxima data de geração (sempre avança, mesmo sem itens)
      const nextDate = addMonths(scheduledDate, contract.frequency_value || 1)

      if (activeItems.length === 0) {
        await supabase
          .from('contracts')
          .update({ next_pmoc_generation_date: nextDate } as any)
          .eq('id', contract.id)
        continue
      }

      for (const item of activeItems) {
        const { data: os, error: osError } = await supabase
          .from('service_orders')
          .insert({
            company_id: contract.company_id,
            customer_id: contract.customer_id,
            equipment_id: item.equipment_id,
            technician_id: contract.technician_id,
            os_type: 'manutencao_preventiva',
            service_type_id: contract.service_type_id,
            form_template_id: contract.form_template_id,
            scheduled_date: scheduledDate,
            description: `PMOC automático: ${contract.name} - ${item.equipment?.name || item.item_name || 'Equipamento'}`,
            require_tech_signature: true,
            status: 'pendente',
            contract_id: contract.id,
            origin: 'contract',
          } as any)
          .select('id')
          .single()

        if (osError) {
          console.error(
            `Error creating OS for contract ${contract.id}, equipment ${item.equipment_id}:`,
            osError
          )
          errors.push({ contract_id: contract.id, error: osError.message })
          continue
        }

        // Vincular técnico responsável (se houver)
        if (contract.technician_id) {
          await supabase.from('service_order_assignees').insert({
            service_order_id: os.id,
            user_id: contract.technician_id,
          })
        }

        // Histórico (pmoc_generated_os mantém compatibilidade até Onda D)
        // plan_id agora é NULL — coluna ainda existe mas não há plano de origem
        // (pmoc_generated_os é legada; o histórico vive em service_orders.contract_id)
        // Por enquanto, NÃO inserimos em pmoc_generated_os porque ela exige plan_id NOT NULL.
        // Quem quer histórico consulta service_orders.contract_id IS NOT NULL + origin='contract'.

        totalGenerated++
      }

      // Avança next_pmoc_generation_date
      await supabase
        .from('contracts')
        .update({ next_pmoc_generation_date: nextDate } as any)
        .eq('id', contract.id)
    }

    return new Response(
      JSON.stringify({
        message: 'PMOC orders generated',
        generated: totalGenerated,
        contracts_processed: contracts.length,
        // Contratos buscados pelo teto UTC+14 que ainda não venceram no fuso
        // da própria empresa. Ficam pro próximo ciclo.
        skipped_not_due: skippedNotDue,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  } catch (error: any) {
    console.error('Error in generate-pmoc-orders:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: error?.message }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  }
})

/** "YYYY-MM-DD" a partir do retorno de `ymdInTimeZone`. Vazio quando nulo. */
function isoFromYmd(ymd: { year: number; month: number; day: number } | null): string {
  if (!ymd) return ''
  return `${String(ymd.year).padStart(4, '0')}-${String(ymd.month).padStart(2, '0')}-${
    String(ymd.day).padStart(2, '0')
  }`
}

/**
 * Soma meses a uma data-only "YYYY-MM-DD" COM clamp de fim de mês.
 *
 * O `setMonth` nativo do JavaScript NÃO faz clamp: ele transborda. Com um
 * contrato ancorado em 31/01, `setMonth(mês + 1)` produzia 03/03 (fevereiro não
 * tem dia 31, o excedente vaza pro mês seguinte) e a OS nascia com data errada.
 * O comportamento correto é clampar pro último dia do mês destino:
 *
 *   31/01/2026 + 1 mês → 28/02/2026   (28/02 em ano comum)
 *   31/01/2028 + 1 mês → 29/02/2028   (29/02 em ano bissexto)
 *   15/03/2026 + 1 mês → 15/04/2026   (dia que existe nos dois meses não muda)
 *
 * `next_pmoc_generation_date` é data-only (dia de calendário, não instante):
 * lemos os números LITERAIS e fazemos aritmética de calendário. Nada de
 * `new Date(str)`, que interpretaria como meia-noite UTC e traria o off-by-one
 * de volta pelo outro lado.
 */
function addMonths(dateStr: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((dateStr ?? '').trim())
  if (!m) return dateStr

  const baseYear = Number(m[1])
  const baseMonthIdx = Number(m[2]) - 1
  const baseDay = Number(m[3])

  const safeMonths = Number.isFinite(months) && months > 0 ? Math.round(months) : 1
  const totalMonths = baseMonthIdx + safeMonths
  const targetYear = baseYear + Math.floor(totalMonths / 12)
  const targetMonthIdx = ((totalMonths % 12) + 12) % 12
  // Dia 0 do mês seguinte = último dia do mês destino (28/29/30/31).
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIdx + 1, 0)).getUTCDate()
  const day = Math.min(baseDay, lastDay)

  return `${String(targetYear).padStart(4, '0')}-${String(targetMonthIdx + 1).padStart(2, '0')}-${
    String(day).padStart(2, '0')
  }`
}
