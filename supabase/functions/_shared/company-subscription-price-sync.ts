import { asaas } from './asaas-client.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface CompanySubscriptionPriceSyncResult {
  ok: boolean
  applicable: boolean
  targetMonthlyValue: number
  warning?: string
}

/**
 * Sincroniza o valor mensal efetivo calculado no servidor com a recorrência.
 * Aceita tanto sub_* quanto a autorização do Pix Automático (UUID), resolvendo
 * o subscriptionId antes do PUT. A falha fica persistida no outbox e nunca se
 * apresenta como sucesso limpo ao chamador.
 */
export async function syncCompanySubscriptionPrice(
  supabase: SupabaseClient,
  companyId: string,
  updatePendingPayments: boolean,
  retryDepth = 0,
): Promise<CompanySubscriptionPriceSyncResult> {
  const [{ data: company, error: companyError }, { data: queued, error: queueError }] = await Promise.all([
    supabase.from('companies').select('asaas_subscription_id, billing_cycle').eq('id', companyId).maybeSingle(),
    supabase.from('company_subscription_price_sync')
      .select('target_monthly_value, attempts, requested_at')
      .eq('company_id', companyId)
      .maybeSingle(),
  ])
  if (companyError || !company || queueError) {
    throw new Error('Não foi possível preparar a sincronização da mensalidade.')
  }

  let targetMonthlyValue = Number(queued?.target_monthly_value)
  let attempt = Number(queued?.attempts) || 0
  let requestedAt = typeof queued?.requested_at === 'string' ? queued.requested_at : null
  if (!(targetMonthlyValue > 0)) {
    const { data: enqueued, error: enqueueError } = await supabase.rpc(
      'enqueue_company_subscription_price_sync',
      { p_company_id: companyId },
    )
    if (enqueueError) throw new Error('Não foi possível calcular a mensalidade vigente.')
    targetMonthlyValue = Number(enqueued)
    if (!(targetMonthlyValue > 0)) {
      return { ok: true, applicable: false, targetMonthlyValue: 0 }
    }
    const { data: refreshedQueue, error: refreshedQueueError } = await supabase
      .from('company_subscription_price_sync')
      .select('attempts, requested_at')
      .eq('company_id', companyId)
      .maybeSingle()
    if (refreshedQueueError || !refreshedQueue) {
      throw new Error('Não foi possível preparar a geração da mensalidade para sincronização.')
    }
    attempt = Number(refreshedQueue.attempts) || 0
    requestedAt = refreshedQueue.requested_at
  }
  if (!(targetMonthlyValue > 0)) {
    throw new Error('A mensalidade efetiva calculada é inválida.')
  }
  if (company.billing_cycle !== 'monthly') {
    throw new Error('Condições promocionais por cobrança não são compatíveis com o ciclo anual.')
  }

  const recurrenceId = typeof company.asaas_subscription_id === 'string'
    ? company.asaas_subscription_id
    : null
  if (!recurrenceId) {
    const { data: notApplicable, error: notApplicableError } = await supabase.from('company_subscription_price_sync').update({
      status: 'not_applicable',
      attempts: attempt,
      last_error: null,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('company_id', companyId)
      .eq('requested_at', requestedAt)
      .select('company_id')
      .maybeSingle()
    if (notApplicableError) throw new Error('Não foi possível concluir a sincronização local da mensalidade.')
    if (!notApplicable && retryDepth < 2) {
      return syncCompanySubscriptionPrice(supabase, companyId, updatePendingPayments, retryDepth + 1)
    }
    return { ok: true, applicable: false, targetMonthlyValue }
  }

  try {
    // Claim otimista da geração. Um enqueue concorrente troca requested_at e
    // impede este worker de concluir/marcar como sincronizado o alvo novo.
    const { data: claimed, error: claimError } = await supabase
      .from('company_subscription_price_sync')
      .update({
        status: 'syncing',
        attempts: attempt + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('requested_at', requestedAt)
      .select('company_id')
      .maybeSingle()
    if (claimError) throw claimError
    if (!claimed) {
      if (retryDepth < 2) {
        return syncCompanySubscriptionPrice(supabase, companyId, updatePendingPayments, retryDepth + 1)
      }
      return {
        ok: false,
        applicable: true,
        targetMonthlyValue,
        warning: 'Uma atualização mais recente da mensalidade ainda precisa ser sincronizada.',
      }
    }

    let subscriptionId = recurrenceId.startsWith('sub_') ? recurrenceId : null
    if (!subscriptionId) {
      const authorization = await asaas.get(
        `/pix/automatic/authorizations/${encodeURIComponent(recurrenceId)}`,
      )
      subscriptionId = typeof authorization?.subscriptionId === 'string'
        ? authorization.subscriptionId
        : null
    }
    if (!subscriptionId?.startsWith('sub_')) {
      throw new Error('Recorrência sem assinatura vinculada na operadora.')
    }

    await asaas.put(`/subscriptions/${subscriptionId}`, {
      value: targetMonthlyValue,
      updatePendingPayments,
    })
    const { data: finalized, error: updateError } = await supabase.from('company_subscription_price_sync').update({
      status: 'synced',
      attempts: attempt + 1,
      last_error: null,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('company_id', companyId)
      .eq('requested_at', requestedAt)
      .eq('status', 'syncing')
      .select('company_id')
      .maybeSingle()
    if (updateError) throw updateError
    if (!finalized) {
      if (retryDepth < 2) {
        return syncCompanySubscriptionPrice(supabase, companyId, updatePendingPayments, retryDepth + 1)
      }
      return {
        ok: false,
        applicable: true,
        targetMonthlyValue,
        warning: 'Uma atualização mais recente da mensalidade ainda precisa ser sincronizada.',
      }
    }
    return { ok: true, applicable: true, targetMonthlyValue }
  } catch (error) {
    const internalMessage = error instanceof Error ? error.message : 'Falha desconhecida na operadora.'
    const { data: failed, error: failedUpdateError } = await supabase.from('company_subscription_price_sync').update({
      status: 'failed',
      attempts: attempt + 1,
      last_error: internalMessage.slice(0, 1000),
      updated_at: new Date().toISOString(),
    }).eq('company_id', companyId)
      .eq('requested_at', requestedAt)
      .select('company_id')
      .maybeSingle()
    if (failedUpdateError) {
      throw new Error('A operadora não foi sincronizada e a pendência não pôde ser registrada.')
    }
    if (!failed && retryDepth < 2) {
      return syncCompanySubscriptionPrice(supabase, companyId, updatePendingPayments, retryDepth + 1)
    }
    return {
      ok: false,
      applicable: true,
      targetMonthlyValue,
      warning: 'A condição promocional foi salva, mas a cobrança automática precisa de nova sincronização.',
    }
  }
}
