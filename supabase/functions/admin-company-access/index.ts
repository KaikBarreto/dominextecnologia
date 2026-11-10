import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

const RESET_CODE_EXPIRES_MINUTES = 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Action = 'list_users' | 'generate_reset_link';

interface RequestBody {
  action?: Action;
  company_id?: string;
  user_id?: string;
}

function generateCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String((value % 90_000_000) + 10_000_000);
}

function getResetBaseUrl(req: Request): string {
  const origin = req.headers.get('Origin') ?? '';
  const allowedOrigin =
    /^https:\/\/(?:[a-z0-9-]+\.)?dominex\.app$/i.test(origin)
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)
    || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);

  if (allowedOrigin) return origin;
  return (Deno.env.get('APP_BASE_URL') || 'https://www.dominex.app').replace(/\/+$/, '');
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json' };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });

  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Sessão de administrador não encontrada.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[admin-company-access] configuração obrigatória ausente');
      return json({ error: 'Serviço temporariamente indisponível.' }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const token = authHeader.slice('Bearer '.length);
    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData.user) {
      return json({ error: 'Sessão inválida ou expirada.' }, 401);
    }

    const callerId = callerData.user.id;
    const [{ data: isSuperAdmin, error: roleError }, { data: hasPermission, error: permissionError }] =
      await Promise.all([
        admin.rpc('has_role', { _user_id: callerId, _role: 'super_admin' }),
        admin.rpc('has_admin_permission', {
          _user_id: callerId,
          _permission: 'admin_empresas_acesso',
        }),
      ]);

    if (roleError || permissionError) {
      console.error('[admin-company-access] falha ao validar autorização', {
        callerId,
        roleError: roleError?.message,
        permissionError: permissionError?.message,
      });
      return json({ error: 'Não foi possível validar sua autorização.' }, 503);
    }
    if (!isSuperAdmin && !hasPermission) {
      return json({ error: 'Você não tem permissão para gerenciar o acesso desta empresa.' }, 403);
    }

    const body = (await req.json()) as RequestBody;
    if (!body.company_id || !UUID_PATTERN.test(body.company_id)) {
      return json({ error: 'Empresa inválida.' }, 400);
    }

    if (body.action === 'list_users') {
      const { data: profiles, error } = await admin
        .from('profiles')
        .select('user_id, full_name, email, avatar_url')
        .eq('company_id', body.company_id)
        .eq('is_active', true)
        .not('user_id', 'is', null)
        .not('email', 'is', null)
        .order('full_name');

      if (error) throw error;

      return json({
        users: (profiles ?? []).flatMap((profile) => {
          const email = String(profile.email ?? '').trim();
          if (!profile.user_id || !email) return [];
          return [{
            id: profile.user_id,
            full_name: profile.full_name,
            email,
            avatar_url: profile.avatar_url,
          }];
        }),
      });
    }

    if (body.action === 'generate_reset_link') {
      if (!body.user_id || !UUID_PATTERN.test(body.user_id)) {
        return json({ error: 'Selecione um usuário válido.' }, 400);
      }

      // A posse é validada no servidor: o user_id livre enviado pelo client não
      // pode apontar para uma conta de outra empresa.
      const { data: targetProfile, error: profileError } = await admin
        .from('profiles')
        .select('user_id')
        .eq('company_id', body.company_id)
        .eq('user_id', body.user_id)
        .eq('is_active', true)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!targetProfile) {
        return json({ error: 'Usuário não encontrado nesta empresa.' }, 404);
      }

      const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(body.user_id);
      if (targetAuthError || !targetAuth.user) {
        console.error('[admin-company-access] identidade de acesso não encontrada', {
          companyId: body.company_id,
          userId: body.user_id,
          error: targetAuthError?.message,
        });
        return json({ error: 'Este usuário ainda não possui uma conta de acesso válida.' }, 404);
      }

      const email = String(targetAuth.user.email ?? '').trim().toLowerCase();
      if (!email) {
        return json({ error: 'Este usuário não possui e-mail de acesso cadastrado.' }, 400);
      }

      const code = generateCode();
      const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRES_MINUTES * 60_000).toISOString();
      const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const { data: createdCode, error: insertError } = await admin
        .from('password_reset_codes')
        .insert({
          email,
          code,
          expires_at: expiresAt,
          ip_address: ipAddress,
          user_agent: req.headers.get('user-agent') ?? null,
        })
        .select('id')
        .single();

      if (insertError || !createdCode) throw insertError ?? new Error('Código não persistido');

      // O código recém-criado vira o único pendente do e-mail. Se o cleanup
      // falhar, a consulta por created_at ainda prioriza o novo código.
      const { error: cleanupError } = await admin
        .from('password_reset_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('email', email)
        .is('used_at', null)
        .neq('id', createdCode.id);
      if (cleanupError) {
        console.warn('[admin-company-access] não foi possível invalidar códigos anteriores', {
          companyId: body.company_id,
          userId: body.user_id,
          error: cleanupError.message,
        });
      }

      const resetUrl = new URL('/reset-password', getResetBaseUrl(req));
      resetUrl.searchParams.set('email', email);
      resetUrl.searchParams.set('code', code);

      console.log('[admin-company-access] link de redefinição gerado', {
        companyId: body.company_id,
        userId: body.user_id,
        callerId,
      });
      return json({ link: resetUrl.toString() });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    console.error('[admin-company-access] erro interno', error instanceof Error ? error.message : String(error));
    return json({ error: 'Não foi possível concluir a operação. Tente novamente.' }, 500);
  }
});
