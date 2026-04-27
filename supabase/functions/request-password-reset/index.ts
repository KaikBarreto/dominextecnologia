import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import { renderPasswordResetEmail, renderPasswordResetText } from '../_shared/passwordResetEmail.ts'

const CODE_EXPIRES_MINUTES = 60;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_REQUESTS = 3;

function generateCode(): string {
  // 8 dígitos numéricos (10^7 a 10^8 - 1) — ~10x mais entropia que 6 dígitos
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const num = (buf[0] << 24 | buf[1] << 16 | buf[2] << 8 | buf[3]) >>> 0;
  return String((num % 90_000_000) + 10_000_000);
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email obrigatório' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    // Default bate com o Custom SMTP configurado: Dominex <nao-responda@dominex.app>
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Dominex <nao-responda@dominex.app>';

    if (!resendApiKey) {
      console.error('RESEND_API_KEY não configurado');
      return new Response(JSON.stringify({ error: 'Serviço de email indisponível' }), {
        status: 503,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Rate limit por email: máx N solicitações na janela
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
    const { count: recentCount } = await supabase
      .from('password_reset_codes')
      .select('id', { count: 'exact', head: true })
      .eq('email', normalizedEmail)
      .gte('created_at', windowStart);

    if ((recentCount ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
      // Mesma resposta de sucesso para não vazar enumeração de email
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Verifica se o email existe em auth.users (RPC SECURITY DEFINER)
    const { data: userExists, error: lookupError } = await supabase.rpc(
      'auth_user_exists_by_email',
      { p_email: normalizedEmail }
    );
    if (lookupError) console.error('Erro auth_user_exists_by_email:', lookupError);

    if (!userExists) {
      // Resposta neutra — não vaza se o email existe ou não
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Gera código + persiste
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_EXPIRES_MINUTES * 60_000).toISOString();
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = req.headers.get('user-agent') ?? null;

    const { error: insertError } = await supabase
      .from('password_reset_codes')
      .insert({
        email: normalizedEmail,
        code,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent,
      } as any);

    if (insertError) {
      console.error('Erro ao persistir código:', insertError);
      throw insertError;
    }

    // Envia email via Resend
    const html = renderPasswordResetEmail({ code, expiresMinutes: CODE_EXPIRES_MINUTES });
    const text = renderPasswordResetText({ code, expiresMinutes: CODE_EXPIRES_MINUTES });

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [normalizedEmail],
        subject: 'Código de Recuperação de Senha — Dominex',
        html,
        text,
      }),
    });

    if (!resendResp.ok) {
      const body = await resendResp.text();
      console.error('Resend error:', resendResp.status, body);
      // Resposta neutra — não expõe falha ao usuário (logado nos servidores)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro em request-password-reset:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
