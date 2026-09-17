import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

// =============================================================================
// extend-recurring-tasks
//
// Estica a JANELA ROLANTE das tarefas com recorrência "Contínua"
// (service_orders.recurrence_indeterminate = true). Roda 1x/dia via pg_cron
// (job `extend-recurring-tasks-daily`, ver migration
// 20260916160000_tarefa_recorrencia_indeterminada.sql).
//
// TODA a matemática de datas (passo mensal/anual com clamp de fim de mês,
// varredura de dias da semana) mora em SQL — public.generate_recurrence_dates,
// espelho comprovado de src/lib/taskRecurrence.ts — e TODA a orquestração
// (achar séries elegíveis, decidir se o grupo ainda está "aberto", inserir
// as novas ocorrências + responsáveis) mora em
// public.extend_indeterminate_task_series(), rodando numa única transação
// por chamada da RPC. Esta função é DE PROPÓSITO um wrapper fino: só valida
// o CRON_SECRET e repassa pra RPC, pra não duplicar regra de negócio em
// Deno (que teria que ser mantida em sincronia manual com o SQL e com
// src/lib/taskRecurrence.ts — duplicata que deriva é o risco que este
// desenho evita).
//
// Idempotência e isolamento entre empresas são garantidos DENTRO da RPC
// (ver comentário da função na migration). Rodar esta função duas vezes no
// mesmo dia não duplica nada.
// =============================================================================

Deno.serve(async (req) => {
  const corsResp = handleCors(req)
  if (corsResp) return corsResp

  // Auth: apenas cron/scheduler com CRON_SECRET (mesmo padrão de
  // generate-pmoc-orders / activate-scheduled-orders).
  const cronSecret = Deno.env.get('CRON_SECRET')
  const authHeader = req.headers.get('Authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data, error } = await supabase.rpc('extend_indeterminate_task_series')

    if (error) throw error

    const series = (data || []) as Array<{ group_id: string; inserted_count: number }>
    const totalInserted = series.reduce((sum, row) => sum + (row.inserted_count || 0), 0)

    return new Response(
      JSON.stringify({
        message: 'Recurring task series extended',
        series_touched: series.length,
        total_inserted: totalInserted,
        details: series,
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Error in extend-recurring-tasks:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: error?.message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
