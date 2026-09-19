import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

// =============================================================================
// extend-contract-billing
//
// Estica a JANELA ROLANTE da COBRANÇA de contratos marcados como "contínuos"
// (contracts.finance_indeterminate = true). Roda 1x/dia via pg_cron (job
// `extend-contract-billing-daily`, ver migration
// 20260919250000_cobranca_de_contrato_continua_janela_rolante.sql).
//
// Irmã da `extend-recurring-tasks`, de propósito: mesmo desenho, mesma forma
// de auth, mesmo papel. A diferença é o que está em jogo — lá a ocorrência é
// uma visita na agenda; aqui é LINHA DE DINHEIRO em financial_transactions.
// Por isso TODA a regra (grade de datas com clamp de mês de calendário, tetos
// de horizonte/lote/guarda física, idempotência, molde da parcela) mora em
// public.extend_indeterminate_contract_billing(), numa transação só por
// chamada. Esta função é DE PROPÓSITO um wrapper fino: valida o CRON_SECRET e
// repassa. Duplicar a regra em Deno criaria uma segunda verdade sobre quanto o
// cliente deve — exatamente o que este desenho evita.
//
// Idempotência e isolamento entre empresas são garantidos DENTRO da RPC (duas
// travas: grade determinística ancorada em MAX(due_date) e NOT EXISTS por
// (contract_id, due_date)). Rodar esta função duas vezes no mesmo dia não
// insere nada na segunda vez.
// =============================================================================

interface ExtendRow {
  contract_id: string
  contract_name: string | null
  inserted_count: number
  reason: string
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req)
  if (corsResp) return corsResp

  // Auth: apenas cron/scheduler com CRON_SECRET (mesmo padrão de
  // extend-recurring-tasks / generate-pmoc-orders / activate-scheduled-orders).
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

    const { data, error } = await supabase.rpc('extend_indeterminate_contract_billing')

    if (error) throw error

    const rows = (data || []) as ExtendRow[]
    const totalInserted = rows.reduce((sum, r) => sum + (r.inserted_count || 0), 0)

    // Só o que NÃO foi trivial vai pro corpo da resposta: contrato que ganhou
    // parcela e contrato que a RPC recusou por algum motivo. `window_covered`
    // é o caso normal do dia a dia (a janela já cobre 24 meses) e não precisa
    // virar ruído no log do cron.
    const notable = rows.filter((r) => r.inserted_count > 0 || (r.reason !== 'window_covered' && r.reason !== 'nothing_due'))

    return new Response(
      JSON.stringify({
        message: 'Contract billing window extended',
        contracts_evaluated: rows.length,
        contracts_extended: rows.filter((r) => r.inserted_count > 0).length,
        total_inserted: totalInserted,
        details: notable,
      }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Error in extend-contract-billing:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: error?.message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } },
    )
  }
})
