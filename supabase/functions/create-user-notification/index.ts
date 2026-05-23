import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

/**
 * create-user-notification — Insere notificação in-app via service_role.
 *
 * Por que edge function (e não INSERT direto)?
 *  RLS de `user_notifications` NÃO tem policy de INSERT pra `authenticated`
 *  — toda criação passa por aqui pra centralizar validação:
 *
 *  - Caller só pode notificar a si mesmo (`caller.id === user_id`); OU
 *  - Caller tem role `admin` ou `super_admin` (notifica qualquer um).
 *
 *  Isso permite client-side dispatch quando faz sentido (técnico marcando OS
 *  como concluída → notifica a si próprio) sem expor INSERT geral.
 *
 *  Best-effort no caller — wrapper `insertUserNotification` log+swallow erros.
 */

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = caller.id;

    const body = await req.json();
    const { user_id, type, title, message, icon, action_url, expires_at } = body;

    if (!user_id || !type || !title) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, type, title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Caller só pode notificar a si mesmo OU se for admin/super_admin.
    if (callerId !== user_id) {
      const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
        _user_id: callerId,
        _role: 'admin',
      });
      const { data: isSuperAdmin } = await supabaseAdmin.rpc('has_role', {
        _user_id: callerId,
        _role: 'super_admin',
      });
      if (!isAdmin && !isSuperAdmin) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: caller can only notify themselves' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from('user_notifications')
      .insert({
        user_id,
        type,
        title,
        message: message ?? null,
        icon: icon ?? 'bell',
        action_url: action_url ?? null,
        expires_at: expires_at ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[create-user-notification] insert error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[create-user-notification] exception:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
