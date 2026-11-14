// deno-lint-ignore-file no-explicit-any no-import-prefix
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

type SubscriptionRequest = {
  endpoint?: unknown
  keys?: { p256dh?: unknown; auth?: unknown }
}

type RequestBody = {
  action?: string
  company_id?: string
  subscription_id?: string
  endpoint?: unknown
  current_endpoint?: unknown
  subscription?: SubscriptionRequest
  user_agent?: string
  device_label?: string | null
}

type DeviceRow = {
  id: string
  endpoint: string
  device_label: string | null
  user_agent: string | null
  active: boolean
  last_seen_at: string | null
  last_success_at: string | null
  last_failure_at: string | null
  created_at: string
}

const jsonHeaders = (req: Request) => ({
  ...getCorsHeaders(req),
  'Content-Type': 'application/json',
})

function response(req: Request, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders(req) })
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const allowed =
      host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host === 'push.services.mozilla.com' ||
      host === 'web.push.apple.com' ||
      host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com')
    return url.protocol === 'https:' && allowed
  } catch {
    return false
  }
}

function validPushKey(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value)
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  if (req.method !== 'POST') return response(req, 405, { error: 'Método não permitido.' })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return response(req, 401, { error: 'Sessão inválida.' })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return response(req, 503, { error: 'Serviço indisponível.' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const token = authHeader.slice(7)
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  const user = authData.user
  if (authError || !user) return response(req, 401, { error: 'Sessão inválida.' })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('company_id, is_active')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profileError || !profile?.company_id || profile.is_active !== true) {
    return response(req, 403, { error: 'Usuário sem empresa ativa.' })
  }

  let body: RequestBody
  try {
    const declaredLength = Number(req.headers.get('content-length') || 0)
    if (declaredLength > 16_384) return response(req, 413, { error: 'Dados muito grandes.' })
    const rawBody = await req.text()
    if (rawBody.length > 16_384) return response(req, 413, { error: 'Dados muito grandes.' })
    body = JSON.parse(rawBody) as RequestBody
  } catch {
    return response(req, 400, { error: 'Dados inválidos.' })
  }

  // company_id do client é apenas uma confirmação; a autoridade é o profile.
  if (body.company_id !== profile.company_id) {
    return response(req, 403, { error: 'Empresa inválida para este usuário.' })
  }

  if (body.action === 'public-key') {
    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    if (!validPushKey(publicKey)) {
      return response(req, 503, { error: 'Notificações push ainda não configuradas.' })
    }
    return response(req, 200, { public_key: publicKey })
  }

  if (body.action === 'list') {
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, device_label, user_agent, active, last_seen_at, last_success_at, last_failure_at, created_at')
      .eq('company_id', profile.company_id)
      .eq('user_id', user.id)
      .order('last_seen_at', { ascending: false })
    if (error) {
      console.error('[manage-push-subscription] list failed', { userId: user.id, error: error.message })
      return response(req, 500, { error: 'Não foi possível carregar os aparelhos.' })
    }
    const currentEndpoint = validEndpoint(body.current_endpoint) ? body.current_endpoint : null
    const devices = ((data ?? []) as DeviceRow[]).map(({ endpoint, ...device }) => ({
      ...device,
      is_current: currentEndpoint !== null && endpoint === currentEndpoint,
    }))
    return response(req, 200, { devices })
  }

  if (body.action === 'deactivate') {
    let query = admin
      .from('push_subscriptions')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('company_id', profile.company_id)
      .eq('user_id', user.id)
    if (typeof body.subscription_id === 'string') query = query.eq('id', body.subscription_id)
    else if (validEndpoint(body.endpoint)) query = query.eq('endpoint', body.endpoint)
    else return response(req, 400, { error: 'Aparelho inválido.' })

    const { data, error } = await query.select('id')
    if (error) {
      console.error('[manage-push-subscription] deactivate failed', { userId: user.id, error: error.message })
      return response(req, 500, { error: 'Não foi possível desativar este aparelho.' })
    }
    return response(req, 200, { deactivated: data?.length ?? 0 })
  }

  if (body.action !== 'upsert') return response(req, 400, { error: 'Ação inválida.' })

  const subscription = body.subscription
  if (
    !subscription ||
    !validEndpoint(subscription.endpoint) ||
    !validPushKey(subscription.keys?.p256dh) ||
    !validPushKey(subscription.keys?.auth)
  ) {
    return response(req, 400, { error: 'Assinatura push inválida.' })
  }

  const { data: previous } = await admin
    .from('push_subscriptions')
    .select('id, user_id, company_id')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle()

  // Um endpoint que mudou de conta não pode herdar entregas pendentes da conta
  // anterior. Cancelamos antes do reassignment para fechar o risco cross-user.
  if (previous && (previous.user_id !== user.id || previous.company_id !== profile.company_id)) {
    await admin
      .from('notification_deliveries')
      .update({ status: 'cancelled', last_error: 'subscription_reassigned', updated_at: new Date().toISOString() })
      .eq('subscription_id', previous.id)
      .in('status', ['pending', 'retry', 'processing'])
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('push_subscriptions')
    .upsert({
      company_id: profile.company_id,
      user_id: user.id,
      endpoint: subscription.endpoint as string,
      p256dh: subscription.keys!.p256dh as string,
      auth: subscription.keys!.auth as string,
      user_agent: typeof body.user_agent === 'string' ? body.user_agent.slice(0, 512) : null,
      device_label: typeof body.device_label === 'string' ? body.device_label.trim().slice(0, 100) || null : null,
      active: true,
      last_seen_at: now,
      failure_count: 0,
      updated_at: now,
    }, { onConflict: 'endpoint' })
    .select('id, active, last_seen_at')
    .single()

  if (error) {
    console.error('[manage-push-subscription] upsert failed', { userId: user.id, error: error.message })
    return response(req, 500, { error: 'Não foi possível ativar as notificações neste aparelho.' })
  }
  return response(req, 200, { subscription: data })
})
