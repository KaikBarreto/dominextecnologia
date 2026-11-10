import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

interface SetupInput {
  userId: string;
  callerCompanyId: string;
  full_name: string;
  phone?: string | null;
  avatar_url?: string | null;
  permissions?: string[] | null;
  preset_id?: string | null;
  role?: string | null;
  employee_id?: string | null;
}

type AdminClient = ReturnType<typeof createClient<any>>;

/**
 * Executa TODAS as etapas de setup pós-criação do auth user, checando o erro de
 * cada uma. As etapas críticas (profiles, user_permissions, user_roles) retornam
 * o erro real ao primeiro problema — quem chama decide o rollback. A etapa de
 * O vínculo com employees também é crítico: o cliente só pode anunciar acesso
 * criado depois que o usuário estiver efetivamente ligado ao funcionário.
 *
 * `company_id` vem SEMPRE do caller (callerCompanyId), nunca do body.
 */
async function completeUserSetup(
  supabaseAdmin: AdminClient,
  input: SetupInput,
): Promise<{ error: string | null }> {
  const { userId, callerCompanyId, full_name, phone, avatar_url, permissions, preset_id, role, employee_id } = input;

  // ── profiles (crítico) ──
  const profileData: Record<string, unknown> = {
    user_id: userId,
    full_name,
  };
  if (callerCompanyId) profileData.company_id = callerCompanyId;
  if (phone) profileData.phone = phone;
  if (avatar_url) profileData.avatar_url = avatar_url;

  // Try update first (trigger handle_new_user should have created the profile)
  const { data: updatedProfile, error: updateErr } = await supabaseAdmin
    .from('profiles')
    .update(profileData)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (updateErr) {
    console.error('create-user: falha ao atualizar perfil:', updateErr.message);
    return { error: 'Não foi possível configurar o perfil do usuário.' };
  }

  // If update didn't find the row, insert it
  if (!updatedProfile) {
    const { error: insertErr } = await supabaseAdmin
      .from('profiles')
      .insert(profileData);
    if (insertErr) {
      console.error('create-user: falha ao criar perfil:', insertErr.message);
      return { error: 'Não foi possível configurar o perfil do usuário.' };
    }
  }

  // ── user_permissions (crítico quando enviadas) ──
  if (permissions && permissions.length > 0) {
    // upsert para tolerar linha pré-existente de órfão sendo completado
    const { error: permErr } = await supabaseAdmin
      .from('user_permissions')
      .upsert(
        {
          user_id: userId,
          permissions,
          preset_id: preset_id || null,
          is_active: true,
        },
        { onConflict: 'user_id' },
      );
    if (permErr) {
      console.error('create-user: falha ao definir permissões:', permErr.message);
      return { error: 'Não foi possível aplicar as permissões do usuário.' };
    }
  }

  // ── user_roles (crítico quando enviado) ──
  if (role) {
    // Evita duplicar role já existente (autocura de órfão pode reexecutar)
    const { data: existingRole } = await supabaseAdmin
      .from('user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('role', role)
      .maybeSingle();

    if (!existingRole) {
      const { error: roleErr } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role });
      if (roleErr) {
        console.error('create-user: falha ao definir papel:', roleErr.message);
        return { error: 'Não foi possível aplicar o papel do usuário.' };
      }
    }
  }

  // ── employees (crítico e restrito ao tenant do caller) ──
  if (employee_id) {
    const { data: linkedEmployee, error: empErr } = await supabaseAdmin
      .from('employees')
      .update({ user_id: userId })
      .eq('id', employee_id)
      .eq('company_id', callerCompanyId)
      .select('id')
      .maybeSingle();
    if (empErr || !linkedEmployee) {
      console.error('create-user: falha ao vincular funcionário:', empErr?.message || 'registro não encontrado no tenant');
      return { error: 'Não foi possível vincular o acesso ao funcionário da sua empresa.' };
    }
  }

  return { error: null };
}

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify caller is admin/gestor
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Sessão inválida ou expirada.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Sessão inválida ou expirada.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if caller can manage users using centralized function
    const { data: canManage } = await supabaseAdmin.rpc('can_manage_users', { _user_id: caller.id });

    if (!canManage) {
      return new Response(JSON.stringify({ error: 'Você não tem permissão para gerenciar usuários.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get caller's company_id from profiles
    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('user_id', caller.id)
      .single();

    const callerCompanyId = (callerProfile?.company_id as string | null) || null;
    if (callerProfileError || !callerCompanyId) {
      return new Response(JSON.stringify({ error: 'Não foi possível identificar a empresa da sua sessão.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, password, full_name, phone, permissions, preset_id, role, avatar_url, employee_id } = await req.json();

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: 'Informe nome, e-mail e senha para criar o acesso.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allowedRoles = new Set(['admin', 'gestor', 'tecnico', 'comercial', 'financeiro']);
    if (role != null && !allowedRoles.has(String(role))) {
      return new Response(JSON.stringify({ error: 'Selecione um papel válido para o usuário.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (permissions != null && (!Array.isArray(permissions) || permissions.some((item) => typeof item !== 'string'))) {
      return new Response(JSON.stringify({ error: 'A lista de permissões enviada é inválida.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve o alvo antes de criar o auth user. O service role nunca pode usar
    // um employee_id de outra empresa, ainda que o UUID seja conhecido.
    if (employee_id) {
      const { data: targetEmployee, error: employeeLookupError } = await supabaseAdmin
        .from('employees')
        .select('id, user_id')
        .eq('id', employee_id)
        .eq('company_id', callerCompanyId)
        .maybeSingle();
      if (employeeLookupError || !targetEmployee) {
        return new Response(JSON.stringify({ error: 'O funcionário não pertence à sua empresa ou não está disponível.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (targetEmployee.user_id) {
        // Retry idempotente: a operação pode ter terminado no servidor e a
        // resposta ter se perdido. Só confirma quando o auth já vinculado tem
        // exatamente o mesmo e-mail solicitado.
        const { data: linkedAuth } = await supabaseAdmin.auth.admin.getUserById(targetEmployee.user_id);
        const linkedAuthEmail = linkedAuth?.user?.email || '';
        if (linkedAuthEmail.toLowerCase() === String(email).trim().toLowerCase()) {
          return new Response(JSON.stringify({
            user: { id: targetEmployee.user_id, email: linkedAuthEmail },
            already_linked: true,
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: 'Este funcionário já possui um usuário vinculado.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Create user via admin API (no confirmation email)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      const isDuplicate = createError.message.toLowerCase().includes('already') || createError.message.toLowerCase().includes('duplicate');

      // ── Autocura de órfão: cadastro anterior que falhou pela metade ──
      if (isDuplicate) {
        // Localiza o usuário existente por e-mail
        let existingUserId: string | null = null;
        try {
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const match = listData?.users?.find(
            (u) => (u.email || '').toLowerCase() === String(email).toLowerCase(),
          );
          existingUserId = match?.id || null;
        } catch (_e) {
          existingUserId = null;
        }

        if (existingUserId) {
          // Checa se é órfão: profiles.company_id IS NULL E sem roles
          const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('company_id')
            .eq('user_id', existingUserId)
            .maybeSingle();

          const { data: existingRoles } = await supabaseAdmin
            .from('user_roles')
            .select('id')
            .eq('user_id', existingUserId);

          const hasCompany = !!(existingProfile?.company_id);
          const hasRoles = !!(existingRoles && existingRoles.length > 0);
          const isOrphan = !hasCompany && !hasRoles;

          if (isOrphan) {
            // Atualiza a senha do órfão para a informada nesta chamada
            await supabaseAdmin.auth.admin.updateUserById(existingUserId, {
              password,
              user_metadata: { full_name },
            });

            // Completa o cadastro usando as MESMAS etapas checadas.
            // Aqui NÃO fazemos rollback (não apagar conta existente): se falhar,
            // devolvemos o erro real 500.
            const { error: setupError } = await completeUserSetup(supabaseAdmin, {
              userId: existingUserId,
              callerCompanyId,
              full_name,
              phone,
              avatar_url,
              permissions,
              preset_id,
              role,
              employee_id,
            });

            if (setupError) {
              return new Response(JSON.stringify({ error: setupError }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            return new Response(JSON.stringify({ user: { id: existingUserId, email } }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }

      const friendlyMessage = isDuplicate ? 'Este e-mail já está cadastrado no sistema.' : 'Não foi possível criar o usuário com os dados informados.';
      return new Response(JSON.stringify({ error: friendlyMessage }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = newUser.user.id;

    // Wait for the handle_new_user trigger to create the profile, then update it
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Etapas pós-criação com checagem de erro. Se qualquer crítica falhar,
    // fazemos ROLLBACK apagando o auth user recém-criado (nunca deixar órfão).
    const { error: setupError } = await completeUserSetup(supabaseAdmin, {
      userId,
      callerCompanyId,
      full_name,
      phone,
      avatar_url,
      permissions,
      preset_id,
      role,
      employee_id,
    });

    if (setupError) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (delErr) {
        console.error('create-user: falha ao reverter (deleteUser) após erro de setup:', delErr);
      }
      return new Response(JSON.stringify({ error: setupError }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ user: { id: userId, email } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('create-user error:', error);
    return new Response(JSON.stringify({ error: 'Não foi possível criar o acesso. Tente novamente.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
