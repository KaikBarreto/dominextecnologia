import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

const MAX_ATTEMPTS = 5;

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
    const { email, code, newPassword, mode } = await req.json();
    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email e código são obrigatórios' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const isVerifyOnly = mode === 'verify';
    if (!isVerifyOnly && (!newPassword || newPassword.length < 6)) {
      return new Response(JSON.stringify({ error: 'Senha deve ter no mínimo 6 caracteres' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedCode = String(code).replace(/\D/g, '');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Busca o código mais recente não-usado para esse email
    const { data: row, error: fetchError } = await supabase
      .from('password_reset_codes')
      .select('id, code, expires_at, used_at, attempts')
      .eq('email', normalizedEmail)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('Erro ao buscar código:', fetchError);
      throw fetchError;
    }

    if (!row) {
      return new Response(JSON.stringify({ error: 'Código inválido ou expirado' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Expirado?
    if (new Date(row.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Código expirado. Solicite um novo.' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Tentativas excedidas?
    if (row.attempts >= MAX_ATTEMPTS) {
      // Invalida explicitamente
      await supabase
        .from('password_reset_codes')
        .update({ used_at: new Date().toISOString() } as any)
        .eq('id', row.id);
      return new Response(JSON.stringify({ error: 'Tentativas excedidas. Solicite um novo código.' }), {
        status: 429,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Código não confere? Incrementa attempts.
    if (row.code !== normalizedCode) {
      await supabase
        .from('password_reset_codes')
        .update({ attempts: row.attempts + 1 } as any)
        .eq('id', row.id);
      return new Response(JSON.stringify({ error: 'Código inválido' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Modo "verificar apenas" — não consome o código, só confirma
    if (isVerifyOnly) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Pega user_id pelo email
    const { data: userId, error: userIdError } = await supabase.rpc(
      'auth_user_id_by_email',
      { p_email: normalizedEmail }
    );

    if (userIdError || !userId) {
      console.error('Erro ao localizar usuário:', userIdError);
      return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), {
        status: 404,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Atualiza senha via Admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: String(newPassword),
    });

    if (updateError) {
      console.error('Erro ao atualizar senha:', updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Marca código como usado
    await supabase
      .from('password_reset_codes')
      .update({ used_at: new Date().toISOString() } as any)
      .eq('id', row.id);

    // Invalida outros códigos pendentes do mesmo email (cleanup defensivo)
    await supabase
      .from('password_reset_codes')
      .update({ used_at: new Date().toISOString() } as any)
      .eq('email', normalizedEmail)
      .is('used_at', null);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro em reset-password-with-code:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
