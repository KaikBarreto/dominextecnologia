import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  // Exigir token secreto de autorização (apenas cron/scheduler pode chamar)
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

    const { data: plans, error: plansError } = await supabase
      .from('pmoc_plans')
      .select(`
        *,
        pmoc_items (equipment_id, equipment:equipment(id, name, status))
      `)
      .eq('status', 'ativo')
      .lte('next_generation_date', today)

    if (plansError) throw plansError
    if (!plans || plans.length === 0) {
      return new Response(JSON.stringify({ message: 'No plans due', generated: 0 }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      })
    }

    let totalGenerated = 0

    for (const plan of plans) {
      const activeItems = (plan.pmoc_items || []).filter(
        (item: any) => item.equipment?.status === 'active'
      )

      if (activeItems.length === 0) {
        const nextDate = addMonths(plan.next_generation_date, plan.frequency_months)
        await supabase.from('pmoc_plans').update({ next_generation_date: nextDate } as any).eq('id', plan.id)
        continue
      }

      for (const item of activeItems) {
        const { data: os, error: osError } = await supabase
          .from('service_orders')
          .insert({
            customer_id: plan.customer_id,
            equipment_id: item.equipment_id,
            technician_id: plan.technician_id,
            os_type: 'manutencao_preventiva',
            service_type_id: plan.service_type_id,
            form_template_id: plan.form_template_id,
            scheduled_date: plan.next_generation_date,
            description: `PMOC automático: ${plan.name} - ${item.equipment?.name || 'Equipamento'}`,
            require_tech_signature: true,
            status: 'agendada',
          } as any)
          .select('id')
          .single()

        if (osError) {
          console.error(`Error creating OS for plan ${plan.id}, equipment ${item.equipment_id}:`, osError)
          continue
        }

        if (plan.technician_id) {
          await supabase.from('service_order_assignees').insert({
            service_order_id: os.id,
            user_id: plan.technician_id,
          })
        }

        await supabase.from('pmoc_generated_os').insert({
          plan_id: plan.id,
          service_order_id: os.id,
          scheduled_for: plan.next_generation_date,
        } as any)

        totalGenerated++
      }

      const nextDate = addMonths(plan.next_generation_date, plan.frequency_months)
      await supabase.from('pmoc_plans').update({ next_generation_date: nextDate } as any).eq('id', plan.id)
    }

    return new Response(JSON.stringify({ message: 'PMOC orders generated', generated: totalGenerated }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in generate-pmoc-orders:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }
})

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}
