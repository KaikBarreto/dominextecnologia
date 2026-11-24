// deno-lint-ignore-file no-explicit-any no-import-prefix
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { timingSafeEqual } from '../_shared/timing-safe.ts'

type ClaimedDelivery = {
  delivery_id: string
  notification_id: string
  subscription_id: string
  endpoint: string
  p256dh: string
  auth: string
  notification_type: string
  title: string
  message: string | null
  action_url: string | null
  category: string | null
  priority: string | null
  attempts?: number
}

const APP_ORIGIN = 'https://www.dominex.app'

const SAFE_TITLES: Record<string, string> = {
  'schedule.daily_digest': 'Seus compromissos de hoje',
  'schedule.daily_digest.v1': 'Seus compromissos de hoje',
  'billing.charge_paid': 'Pagamento recebido',
  'billing.charge_paid.v1': 'Pagamento recebido',
  'account.trial_expiring': 'Seu período de teste está terminando',
  'account.subscription_expiring': 'Sua mensalidade está vencendo',
  'account.payment_required': 'Pagamento da mensalidade pendente',
  'portal.ticket_created': 'Novo chamado recebido',
  'portal.ticket_created.v1': 'Novo chamado recebido',
  'form.submission_received': 'Novo formulário recebido',
  'form.submission_received.v1': 'Novo formulário recebido',
}

function titleFor(type: string) {
  return SAFE_TITLES[type] ?? 'Nova notificação no Dominex'
}

function previewText(value: string | null | undefined, fallback: string, maxLength: number) {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return (normalized || fallback).slice(0, maxLength)
}

function notificationNavigateUrl(value: string | null | undefined): string {
  try {
    const base = new URL(APP_ORIGIN)
    const target = new URL(value || '/dashboard', base)
    return target.origin === base.origin ? target.href : new URL('/dashboard', base).href
  } catch {
    return `${APP_ORIGIN}/dashboard`
  }
}

function validProviderEndpoint(value: string): boolean {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (
      host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host === 'push.services.mozilla.com' ||
      host === 'web.push.apple.com' ||
      host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com')
    )
  } catch {
    return false
  }
}

function statusCode(error: unknown): number {
  const record = typeof error === 'object' && error !== null
    ? error as Record<string, unknown>
    : {}
  const value = Number(record.statusCode ?? record.status ?? 0)
  return Number.isFinite(value) ? value : 0
}

function retryDelaySeconds(status: number, attempts: number): number {
  const retryable = status === 0 || status === 408 || status === 425 || status === 429 || status >= 500
  if (!retryable) return 0
  return Math.min(3_600, 30 * (2 ** Math.max(0, attempts - 1)))
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers })
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  const presented = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!cronSecret || !presented || !timingSafeEqual(presented, cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@dominex.app'
  if (!url || !serviceKey || !publicKey || !privateKey) {
    console.error('[process-notification-deliveries] configuração VAPID ausente')
    return new Response(JSON.stringify({ error: 'Serviço de push não configurado.' }), { status: 503, headers })
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data, error: claimError } = await admin.rpc('claim_notification_deliveries', {
    p_limit: 50,
    p_orphan_minutes: 10,
  })
  if (claimError) {
    console.error('[process-notification-deliveries] claim failed', { error: claimError.message })
    return new Response(JSON.stringify({ error: 'Não foi possível reivindicar as entregas.' }), { status: 500, headers })
  }

  const deliveries = (data ?? []) as ClaimedDelivery[]
  let sent = 0
  let retried = 0
  let failed = 0

  for (let offset = 0; offset < deliveries.length; offset += 10) {
    const batch = deliveries.slice(offset, offset + 10)
    await Promise.all(batch.map(async (delivery) => {
      try {
        if (!validProviderEndpoint(delivery.endpoint)) {
          const { error } = await admin.rpc('complete_notification_delivery', {
            p_delivery_id: delivery.delivery_id,
            p_success: false,
            p_provider_status: 400,
            p_error: 'push_endpoint_not_allowed',
            p_retry_after_seconds: 0,
          })
          if (error) throw new Error(`complete_failed:${error.message}`)
          failed += 1
          return
        }
        const title = previewText(delivery.title, titleFor(delivery.notification_type), 120)
        const body = previewText(delivery.message, 'Abra o Dominex para ver os detalhes.', 240)
        const actionUrl = delivery.action_url || '/dashboard'
        const tag = delivery.notification_id

        await webpush.sendNotification(
          {
            endpoint: delivery.endpoint,
            keys: { p256dh: delivery.p256dh, auth: delivery.auth },
          },
          JSON.stringify({
            // Safari/iOS 18.4+ consegue exibir este bloco sem depender do SW.
            // `silent: false` solicita o som padrão do sistema, quando permitido.
            web_push: 8030,
            notification: {
              title,
              body,
              navigate: notificationNavigateUrl(actionUrl),
              tag,
              silent: false,
            },
            // Compatibilidade com navegadores que ainda usam Web Push clássico
            // e com versões anteriores do push-sw.js durante a atualização.
            version: 1,
            notification_id: delivery.notification_id,
            title,
            body,
            action_url: actionUrl,
            tag,
            priority: delivery.priority || 'normal',
          }),
          {
            TTL: delivery.priority === 'high' ? 3_600 : 86_400,
            urgency: delivery.priority === 'high' ? 'high' : 'normal',
            topic: delivery.notification_id.replace(/-/g, '').slice(0, 32),
          },
        )

        const { error } = await admin.rpc('complete_notification_delivery', {
          p_delivery_id: delivery.delivery_id,
          p_success: true,
          p_provider_status: 201,
          p_error: null,
          p_retry_after_seconds: 0,
        })
        if (error) throw new Error(`complete_failed:${error.message}`)
        sent += 1
      } catch (error: unknown) {
        const status = statusCode(error)
        const retryAfter = retryDelaySeconds(status, delivery.attempts ?? 1)
        const errorCode = status ? `push_http_${status}` : 'push_network_error'
        const { error: completeError } = await admin.rpc('complete_notification_delivery', {
          p_delivery_id: delivery.delivery_id,
          p_success: false,
          p_provider_status: status || null,
          p_error: errorCode,
          p_retry_after_seconds: retryAfter,
        })
        if (completeError) {
          console.error('[process-notification-deliveries] complete failure', {
            deliveryId: delivery.delivery_id,
            error: completeError.message,
          })
        }
        if (retryAfter > 0) retried += 1
        else failed += 1
      }
    }))
  }

  return new Response(
    JSON.stringify({ claimed: deliveries.length, sent, retried, failed }),
    { status: 200, headers },
  )
})
