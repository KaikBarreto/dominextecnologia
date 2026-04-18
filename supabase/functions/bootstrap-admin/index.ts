import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  // Exigir segredo one-time de bootstrap — sem ele, recusar
  const bootstrapSecret = Deno.env.get('BOOTSTRAP_SECRET');
  if (!bootstrapSecret) {
    return new Response(JSON.stringify({ error: 'Bootstrap não disponível neste ambiente' }), {
      status: 503,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const providedSecret = req.headers.get('x-bootstrap-secret');
  if (providedSecret !== bootstrapSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { email, password, full_name } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'email and password required' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Check if super_admin role already exists
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('role', 'super_admin')
      .maybeSingle();

    if (existingRole) {
      return new Response(JSON.stringify({ error: 'Super admin already exists' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || 'Super Admin' },
    });

    if (authError) throw authError;

    const userId = authData.user.id;

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId, role: 'super_admin' });

    if (roleError) throw roleError;

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
