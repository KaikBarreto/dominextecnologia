import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Payload {
  action: 'list' | 'create' | 'update_permissions' | 'reset_password' | 'delete';
  email?: string;
  full_name?: string;
  password?: string;
  user_id?: string;
  permissions?: string[];
  link_salesperson_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const callerId = claims.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is super_admin
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .eq('role', 'super_admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = (await req.json()) as Payload;

    if (body.action === 'list') {
      // List admin users: super_admins + users with admin_permissions
      const { data: roles } = await admin
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['super_admin']);
      const { data: perms } = await admin.from('admin_permissions').select('user_id, permission');
      const { data: salespeople } = await admin.from('salespeople').select('id, name, user_id').not('user_id', 'is', null);

      const userIds = new Set<string>();
      (roles ?? []).forEach((r: any) => userIds.add(r.user_id));
      (perms ?? []).forEach((p: any) => userIds.add(p.user_id));

      const list = await Promise.all(
        Array.from(userIds).map(async (uid) => {
          const { data: u } = await admin.auth.admin.getUserById(uid);
          const userPerms = (perms ?? []).filter((p: any) => p.user_id === uid).map((p: any) => p.permission);
          const isMaster = (roles ?? []).some((r: any) => r.user_id === uid && r.role === 'super_admin');
          const sp = (salespeople ?? []).find((s: any) => s.user_id === uid);
          return {
            id: uid,
            email: u.user?.email ?? null,
            full_name: u.user?.user_metadata?.full_name ?? null,
            is_master: isMaster,
            permissions: userPerms,
            salesperson: sp ? { id: sp.id, name: sp.name } : null,
          };
        })
      );
      return new Response(JSON.stringify({ users: list }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (body.action === 'create') {
      if (!body.email || !body.password) {
        return new Response(JSON.stringify({ error: 'Email e senha obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name ?? null },
      });
      if (createErr) throw createErr;
      const newUserId = created.user!.id;

      if (body.permissions?.length) {
        await admin.from('admin_permissions').insert(body.permissions.map((p) => ({ user_id: newUserId, permission: p })));
      }
      if (body.link_salesperson_id) {
        await admin.from('salespeople').update({ user_id: newUserId } as any).eq('id', body.link_salesperson_id);
      }
      return new Response(JSON.stringify({ user_id: newUserId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (body.action === 'update_permissions') {
      if (!body.user_id) return new Response(JSON.stringify({ error: 'user_id obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      await admin.from('admin_permissions').delete().eq('user_id', body.user_id);
      if (body.permissions?.length) {
        await admin.from('admin_permissions').insert(body.permissions.map((p) => ({ user_id: body.user_id!, permission: p })));
      }
      // Manage salesperson link
      if (body.link_salesperson_id !== undefined) {
        // Clear existing link for this user
        await admin.from('salespeople').update({ user_id: null } as any).eq('user_id', body.user_id);
        if (body.link_salesperson_id) {
          await admin.from('salespeople').update({ user_id: body.user_id } as any).eq('id', body.link_salesperson_id);
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (body.action === 'reset_password') {
      if (!body.user_id || !body.password) return new Response(JSON.stringify({ error: 'Dados obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (body.action === 'delete') {
      if (!body.user_id) return new Response(JSON.stringify({ error: 'user_id obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      // Prevent deleting masters
      const { data: r } = await admin.from('user_roles').select('role').eq('user_id', body.user_id).eq('role', 'super_admin').maybeSingle();
      if (r) return new Response(JSON.stringify({ error: 'Não é possível excluir um Master' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      await admin.from('admin_permissions').delete().eq('user_id', body.user_id);
      await admin.from('salespeople').update({ user_id: null } as any).eq('user_id', body.user_id);
      const { error } = await admin.auth.admin.deleteUser(body.user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('manage-admin-users error', e);
    return new Response(JSON.stringify({ error: e.message ?? 'Erro inesperado' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
