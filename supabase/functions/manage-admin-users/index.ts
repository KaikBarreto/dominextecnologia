import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Payload {
  action:
    | 'list'
    | 'create'
    | 'update_permissions'
    | 'reset_password'
    | 'delete'
    // Acesso do AFILIADO (parceiro externo). Mora aqui, e não numa edge nova,
    // porque é exatamente o mesmo trabalho (criar/mexer em conta de auth com
    // service role) atrás do MESMO gate de super_admin já validado acima.
    | 'create_affiliate_access'
    | 'reset_affiliate_password'
    | 'revoke_affiliate_access';
  email?: string;
  full_name?: string;
  password?: string;
  user_id?: string;
  permissions?: string[];
  link_salesperson_id?: string | null;
  /**
   * Afiliado-alvo das 3 actions de afiliado. É SEMPRE por `affiliate_id`, nunca
   * por `user_id` cru do client: `reset_affiliate_password` com `user_id` livre
   * viraria "trocar a senha de qualquer usuário do sistema".
   */
  affiliate_id?: string;
}

const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' };

/** Mesma forma de resposta das actions antigas (`{ error }` / payload cru). */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerData?.user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const callerId = callerData.user.id;

    // Verify caller is super_admin via has_role
    const { data: hasRole } = await admin.rpc('has_role', { _user_id: callerId, _role: 'super_admin' });
    if (!hasRole) {
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

    // ========================================================================
    // ACESSO DO AFILIADO — parceiro EXTERNO, NUNCA admin do painel
    // ========================================================================
    // 🚨 REGRA-LEI: a conta do afiliado NÃO recebe linha em `admin_permissions`,
    // NÃO recebe role em `user_roles` e NÃO recebe `profiles.company_id`.
    //   * `public.is_admin_user(uid)` = `is_super_admin(uid) OR EXISTS (qualquer
    //     linha em admin_permissions)`. Uma linha lá tornaria o afiliado "admin"
    //     no SQL e abriria TODAS as policies amplas do painel master (companies,
    //     company_payments, admin_financial_transactions, salespeople) pra um
    //     parceiro externo.
    //   * `public.can_manage_affiliates()` = `is_super_admin OR (is_admin_user
    //     AND NOT é afiliado)`. Vincular um admin COMUM a um afiliado o faria
    //     PERDER a gestão de afiliados — por isso nunca se vincula conta que já
    //     existe; sempre nasce uma conta nova, só pro afiliado.
    // O acesso dele vem SÓ do vínculo `affiliates.user_id = auth.uid()`, lido
    // por `current_affiliate_id()` nas 5 policies de SELECT de self-scope.
    // A `profiles` nasce sozinha pelo trigger `on_auth_user_created`
    // (handle_new_user), com `company_id` NULL — é justamente isso que faz o
    // AuthContext resolver `linkedAffiliateId` em vez de tratar como tenant.

    if (body.action === 'create_affiliate_access') {
      const affiliateId = body.affiliate_id;
      if (!affiliateId || !body.email || !body.password) {
        return json({ error: 'Afiliado, e-mail e senha são obrigatórios' }, 400);
      }
      const email = body.email.trim().toLowerCase();

      const { data: affiliate, error: affErr } = await admin
        .from('affiliates')
        .select('id, name, email, user_id')
        .eq('id', affiliateId)
        .maybeSingle();
      if (affErr) throw affErr;
      if (!affiliate) return json({ error: 'Afiliado não encontrado' }, 404);

      // Idempotência: nunca sobrescrever calado. Sobrescrever órfãaria a conta
      // anterior (loga e não é nada) — mesmo problema do create-user antigo.
      if (affiliate.user_id) {
        return json({ error: 'Este afiliado já tem acesso' }, 409);
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name ?? affiliate.name },
      });

      if (createErr || !created?.user) {
        const rawMsg = String((createErr as { message?: string } | null)?.message ?? '');
        console.error('[affiliate-access] createUser falhou', { affiliateId, email, rawMsg });
        // E-mail já tem conta: NÃO vinculamos a conta existente. Ela pode ser de
        // um cliente (tenant) ou de um admin — vincular daria acesso de afiliado
        // a quem não é, e no caso do admin comum tiraria a gestão de afiliados
        // dele (can_manage_affiliates).
        if (/already\s*(been)?\s*registered|already\s*exists|email_exists|duplicate/i.test(rawMsg)) {
          return json(
            {
              error:
                'Este e-mail já tem conta no sistema. Use um e-mail exclusivo para o afiliado.',
            },
            409,
          );
        }
        return json({ error: rawMsg || 'Não foi possível criar a conta de acesso' }, 400);
      }

      const newUserId = created.user.id;

      // Vincula E alinha `affiliates.email` ao e-mail de login: `auth.users` não
      // é legível por RLS no client, então `affiliates.email` é o único lugar de
      // onde a UI consegue mostrar "com qual e-mail ele entra". O `.is('user_id',
      // null)` fecha a corrida de dois cliques simultâneos.
      const { data: linked, error: linkErr } = await admin
        .from('affiliates')
        .update({ user_id: newUserId, email })
        .eq('id', affiliateId)
        .is('user_id', null)
        .select('id');

      if (linkErr || !linked?.length) {
        // Vínculo falhou → a conta recém-criada NÃO pode sobrar: seria um
        // usuário que loga e não é nada (nem tenant, nem admin, nem afiliado).
        console.error('[affiliate-access] vínculo falhou, apagando usuário órfão', {
          affiliateId,
          newUserId,
          error: linkErr?.message ?? 'nenhuma linha atualizada',
        });
        const { error: cleanupErr } = await admin.auth.admin.deleteUser(newUserId);
        if (cleanupErr) {
          console.error('[affiliate-access] CLEANUP FALHOU — usuário órfão em auth', {
            newUserId,
            error: cleanupErr.message,
          });
        }
        const msg = String(linkErr?.message ?? '');
        if (msg.includes('affiliates_email_key') || msg.includes('duplicate key')) {
          return json({ error: 'Já existe outro afiliado com esse e-mail' }, 409);
        }
        return json(
          { error: 'Não foi possível vincular a conta ao afiliado. Nada foi alterado.' },
          400,
        );
      }

      console.log('[affiliate-access] acesso criado', {
        affiliateId,
        newUserId,
        email,
        by: callerId,
      });
      return json({ user_id: newUserId, email });
    }

    if (body.action === 'reset_affiliate_password') {
      if (!body.affiliate_id || !body.password) {
        return json({ error: 'Afiliado e senha são obrigatórios' }, 400);
      }
      // `user_id` é RESOLVIDO pelo afiliado, nunca aceito do client.
      const { data: affiliate, error: affErr } = await admin
        .from('affiliates')
        .select('id, user_id')
        .eq('id', body.affiliate_id)
        .maybeSingle();
      if (affErr) throw affErr;
      if (!affiliate) return json({ error: 'Afiliado não encontrado' }, 404);
      if (!affiliate.user_id) return json({ error: 'Este afiliado ainda não tem acesso' }, 400);

      const { error } = await admin.auth.admin.updateUserById(affiliate.user_id, {
        password: body.password,
      });
      if (error) throw error;

      console.log('[affiliate-access] senha redefinida', {
        affiliateId: affiliate.id,
        userId: affiliate.user_id,
        by: callerId,
      });
      return json({ ok: true });
    }

    if (body.action === 'revoke_affiliate_access') {
      if (!body.affiliate_id) return json({ error: 'Afiliado obrigatório' }, 400);

      const { data: affiliate, error: affErr } = await admin
        .from('affiliates')
        .select('id, user_id')
        .eq('id', body.affiliate_id)
        .maybeSingle();
      if (affErr) throw affErr;
      if (!affiliate) return json({ error: 'Afiliado não encontrado' }, 404);
      if (!affiliate.user_id) return json({ error: 'Este afiliado não tem acesso' }, 400);

      const uid = affiliate.user_id;

      // Só apagamos a conta de auth se ela existir UNICAMENTE pro afiliado.
      // As 3 checagens batem com colunas reais conferidas no banco:
      // admin_permissions(user_id), user_roles(user_id), profiles(user_id,
      // company_id) — `profiles.user_id` é o FK pra auth.users (o `id` é PK
      // própria). Checamos ANTES de desvincular: se a leitura falhar, nada muda.
      const { data: perms, error: permsErr } = await admin
        .from('admin_permissions')
        .select('id')
        .eq('user_id', uid)
        .limit(1);
      if (permsErr) throw permsErr;

      const { data: roles, error: rolesErr } = await admin
        .from('user_roles')
        .select('id')
        .eq('user_id', uid)
        .limit(1);
      if (rolesErr) throw rolesErr;

      const { data: profs, error: profsErr } = await admin
        .from('profiles')
        .select('company_id')
        .eq('user_id', uid);
      if (profsErr) throw profsErr;

      const hasAdminPerm = (perms ?? []).length > 0;
      const hasRole = (roles ?? []).length > 0;
      const hasCompany = (profs ?? []).some((p) => !!p.company_id);
      const isSomeoneElseToo = hasAdminPerm || hasRole || hasCompany;

      const { error: unlinkErr } = await admin
        .from('affiliates')
        .update({ user_id: null })
        .eq('id', affiliate.id);
      if (unlinkErr) throw unlinkErr;

      if (isSomeoneElseToo) {
        // Conta de gente de verdade (admin do painel, usuário de tenant, ou com
        // role atribuída). Apagar destruiria acesso alheio — só desvinculamos.
        console.log('[affiliate-access] acesso revogado SEM apagar a conta', {
          affiliateId: affiliate.id,
          userId: uid,
          hasAdminPerm,
          hasRole,
          hasCompany,
          by: callerId,
        });
        return json({ ok: true, deleted: false });
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(uid);
      if (delErr) {
        // Já desvinculado: o afiliado perdeu o login (que é o pedido). A conta
        // sobra em auth sem company/role/permissão — não acessa nada.
        console.error('[affiliate-access] desvinculado, mas deleteUser falhou', {
          affiliateId: affiliate.id,
          userId: uid,
          error: delErr.message,
        });
        return json({ ok: true, deleted: false });
      }

      console.log('[affiliate-access] acesso revogado e conta apagada', {
        affiliateId: affiliate.id,
        userId: uid,
        by: callerId,
      });
      return json({ ok: true, deleted: true });
    }

    return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('manage-admin-users error', e);
    return new Response(JSON.stringify({ error: e.message ?? 'Erro inesperado' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
