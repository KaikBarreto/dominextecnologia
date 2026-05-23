import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

// =============================================================================
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

    const today = new Date().toISOString().split('T')[0]

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
      .lte('next_pmoc_generation_date', today)
      .not('next_pmoc_generation_date', 'is', null)

    if (contractsError) throw contractsError

    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ message: 'No PMOC contracts due', generated: 0 }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    let totalGenerated = 0
    const errors: Array<{ contract_id: string; error: string }> = []

    for (const contract of contracts) {
      const scheduledDate = contract.next_pmoc_generation_date!
      const items = (contract.contract_items || []) as Array<any>

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
        // (a tabela vai ser dropada na 1.9.3 ou substituída por contract_occurrences)
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

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}
