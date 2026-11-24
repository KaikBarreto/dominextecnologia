import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

/**
 * create-user-notification — Insere notificação in-app via service_role.
 *
 * Por que edge function (e não INSERT direto)?
 *  RLS de `user_notifications` NÃO tem policy de INSERT pra `authenticated`
 *  — toda criação passa por aqui pra centralizar validação:
 *
 *  - Caller só pode notificar a si mesmo (`caller.id === user_id`).
 *  - `company_id` é sempre derivado do perfil ativo do token.
 *
 *  Notificações de domínio para outras pessoas passam exclusivamente pelo
 *  roteador server-side/outbox. Isso evita que uma role global seja confundida
 *  com autorização cross-tenant.
 *
 *  Best-effort no caller — wrapper `insertUserNotification` log+swallow erros.
 */

const TYPE_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const ICON_RE = /^[a-z0-9-]{1,40}$/;
const MAX_EXPIRATION_MS = 90 * 24 * 60 * 60 * 1000;

function isSafeInternalPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.startsWith('/')
    && !value.startsWith('//')
    && !value.includes('\\')
    && value.length <= 500;
}

function jsonResponse(
  req: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse(req, 401, { error: 'Não foi possível autenticar a solicitação.' });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) {
      return jsonResponse(req, 401, { error: 'Não foi possível autenticar a solicitação.' });
    }
    const callerId = caller.id;

    if (req.method !== 'POST') {
      return jsonResponse(req, 405, { error: 'Método não permitido.' });
    }

    const body = await req.json();
    const { user_id, type, title, message, icon, action_url, expires_at } = body;

    if (
      typeof user_id !== 'string'
      || typeof type !== 'string'
      || !TYPE_RE.test(type)
      || typeof title !== 'string'
      || title.trim().length < 1
      || title.length > 120
      || (message != null && (typeof message !== 'string' || message.length > 500))
      || (icon != null && (typeof icon !== 'string' || !ICON_RE.test(icon)))
      || (action_url != null && !isSafeInternalPath(action_url))
    ) {
      return jsonResponse(req, 400, { error: 'Os dados da notificação são inválidos.' });
    }

    // Esta edge é deliberadamente self-only. Fan-out para outros usuários
    // pertence ao roteador server-side, que valida tenant e preferências.
    if (callerId !== user_id) {
      return jsonResponse(req, 403, { error: 'Você não pode criar notificações para outra pessoa.' });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('company_id, is_active')
      .eq('user_id', callerId)
      .maybeSingle();

    if (profileError || !profile?.company_id || profile.is_active !== true) {
      return jsonResponse(req, 403, { error: 'Seu acesso à empresa não está ativo.' });
    }

    let parsedExpiresAt: string | null = null;
    if (expires_at != null) {
      if (typeof expires_at !== 'string') {
        return jsonResponse(req, 400, { error: 'A validade da notificação é inválida.' });
      }
      const expirationMs = Date.parse(expires_at);
      const now = Date.now();
      if (!Number.isFinite(expirationMs) || expirationMs <= now || expirationMs > now + MAX_EXPIRATION_MS) {
        return jsonResponse(req, 400, { error: 'A validade da notificação é inválida.' });
      }
      parsedExpiresAt = new Date(expirationMs).toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('user_notifications')
      .insert({
        company_id: profile.company_id,
        user_id,
        type: type.trim(),
        title: title.trim(),
        message: typeof message === 'string' ? message.trim() || null : null,
        icon: icon ?? 'bell',
        action_url: action_url ?? null,
        expires_at: parsedExpiresAt,
      })
      .select()
      .single();

    if (error) {
      console.error('[create-user-notification] insert error:', error);
      return jsonResponse(req, 500, { error: 'Não foi possível criar a notificação.' });
    }

    return jsonResponse(req, 200, { data });
  } catch (err) {
    console.error('[create-user-notification] exception:', err);
    return jsonResponse(req, 500, { error: 'Não foi possível criar a notificação.' });
  }
});
