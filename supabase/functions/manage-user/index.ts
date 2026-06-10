import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is authorized
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerId = caller.id;

    // Check authorization using centralized function
    const { data: canManage } = await supabaseAdmin.rpc('can_manage_users', { _user_id: callerId });

    if (!canManage) {
      return new Response(JSON.stringify({ error: 'Forbidden: insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action, user_id, email } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Helper: confirma que o alvo pertence à MESMA empresa do solicitante.
    // Mesma fronteira de isolamento usada implicitamente pelo delete (que só é
    // exposto pra quem tem can_manage_users na própria empresa). Aqui tornamos
    // explícito server-side: ninguém mexe em usuário de outro tenant.
    const sameCompanyAsCaller = async (targetUserId: string): Promise<boolean> => {
      const { data: callerProfile } = await supabaseAdmin
        .from('profiles')
        .select('company_id')
        .eq('user_id', callerId)
        .maybeSingle();
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('company_id')
        .eq('user_id', targetUserId)
        .maybeSingle();
      // super_admin (sem company) pode tudo; senão exige mesma empresa não-nula.
      if (!callerProfile?.company_id) {
        const { data: isSuper } = await supabaseAdmin.rpc('has_role', {
          _user_id: callerId,
          _role: 'super_admin',
        });
        return !!isSuper;
      }
      return (
        !!targetProfile?.company_id &&
        targetProfile.company_id === callerProfile.company_id
      );
    };

    // GET user email
    if (action === 'get_email') {
      try {
        const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(user_id);
        if (getUserError || !userData?.user) {
          return new Response(JSON.stringify({ email: '' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ email: userData.user.email || '' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response(JSON.stringify({ email: '' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // UPDATE user email
    if (action === 'update_email') {
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return new Response(JSON.stringify({ error: 'Invalid email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        email,
        email_confirm: true,
      });

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DEACTIVATE user (reversível — libera slot sem destruir o usuário)
    if (action === 'deactivate_user') {
      // Não pode desativar a si mesmo (evita o admin se trancar pra fora).
      if (user_id === callerId) {
        return new Response(
          JSON.stringify({ error: 'Você não pode desativar a si mesmo.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (!(await sameCompanyAsCaller(user_id))) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: usuário de outra empresa' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { error: deactivateError } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: false })
        .eq('user_id', user_id);
      if (deactivateError) {
        return new Response(JSON.stringify({ error: deactivateError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Encerra a sessão ativa do usuário (mesmo mecanismo do delete: apaga
      // active_sessions → o realtime do useForcedLogout o desconecta na hora).
      await supabaseAdmin.from('active_sessions').delete().eq('user_id', user_id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // REACTIVATE user (só se houver slot livre no plano da empresa)
    if (action === 'reactivate_user') {
      if (!(await sameCompanyAsCaller(user_id))) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: usuário de outra empresa' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Empresa do alvo + limite efetivo de usuários.
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('company_id')
        .eq('user_id', user_id)
        .maybeSingle();
      const targetCompanyId = targetProfile?.company_id;

      if (targetCompanyId) {
        // Limite efetivo de usuários da empresa. Espelha EXATAMENTE o cálculo
        // de useCompanyModules: plano 'personalizado' usa companies.max_users
        // como total; demais somam max_users do plano + extra_users.
        let maxUsers = 0;
        const { data: company } = await supabaseAdmin
          .from('companies')
          .select('subscription_plan, max_users, extra_users')
          .eq('id', targetCompanyId)
          .maybeSingle();
        const plan = company?.subscription_plan || 'start';
        const extraUsers = company?.extra_users || 0;
        if (plan === 'personalizado') {
          maxUsers = company?.max_users || 0;
        } else {
          const { data: planDef } = await supabaseAdmin
            .from('subscription_plans')
            .select('max_users')
            .eq('code', plan)
            .maybeSingle();
          const planMax = planDef?.max_users ?? company?.max_users ?? 0;
          maxUsers = planMax + extraUsers;
        }

        // Usuários ATIVOS atuais da empresa.
        const { count: activeCount } = await supabaseAdmin
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', targetCompanyId)
          .eq('is_active', true);

        if ((activeCount || 0) >= maxUsers) {
          return new Response(
            JSON.stringify({
              error: 'Limite de usuários atingido; faça upgrade ou desative outro.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }

      const { error: reactivateError } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: true })
        .eq('user_id', user_id);
      if (reactivateError) {
        return new Response(JSON.stringify({ error: reactivateError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE user permanently
    if (action === 'delete_user') {
      if (user_id === callerId) {
        return new Response(
          JSON.stringify({ error: 'Você não pode excluir a si mesmo.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (!(await sameCompanyAsCaller(user_id))) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: usuário de outra empresa' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      // Delete user_permissions
      await supabaseAdmin.from('user_permissions').delete().eq('user_id', user_id);
      // Delete user_roles
      await supabaseAdmin.from('user_roles').delete().eq('user_id', user_id);
      // Unlink employees
      await supabaseAdmin.from('employees').update({ user_id: null }).eq('user_id', user_id);
      // Delete profile
      await supabaseAdmin.from('profiles').delete().eq('user_id', user_id);
      // Delete active sessions
      await supabaseAdmin.from('active_sessions').delete().eq('user_id', user_id);
      // Delete auth user
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
