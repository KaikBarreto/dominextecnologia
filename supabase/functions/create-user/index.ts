import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

interface SetupInput {
  userId: string;
  callerCompanyId: string | null;
  full_name: string;
  phone?: string | null;
  avatar_url?: string | null;
  permissions?: string[] | null;
  preset_id?: string | null;
  role?: string | null;
  employee_id?: string | null;
}

/**
 * Executa TODAS as etapas de setup pós-criação do auth user, checando o erro de
 * cada uma. As etapas críticas (profiles, user_permissions, user_roles) retornam
 * o erro real ao primeiro problema — quem chama decide o rollback. A etapa de
 * employees é opcional/menos crítica: falha vira log e segue.
 *
 * `company_id` vem SEMPRE do caller (callerCompanyId), nunca do body.
 */
async function completeUserSetup(
  supabaseAdmin: ReturnType<typeof createClient>,
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
    return { error: `Falha ao atualizar o perfil: ${updateErr.message}` };
  }

  // If update didn't find the row, insert it
  if (!updatedProfile) {
    const { error: insertErr } = await supabaseAdmin
      .from('profiles')
      .insert(profileData);
    if (insertErr) {
      return { error: `Falha ao criar o perfil: ${insertErr.message}` };
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
      return { error: `Falha ao definir as permissões: ${permErr.message}` };
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
        return { error: `Falha ao definir o papel do usuário: ${roleErr.message}` };
      }
    }
  }

  // ── employees (não-crítico) ──
  if (employee_id) {
    const { error: empErr } = await supabaseAdmin
      .from('employees')
      .update({ user_id: userId })
      .eq('id', employee_id);
    if (empErr) {
      console.error('create-user: falha (não-fatal) ao vincular funcionário:', empErr.message);
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

    // Check if caller can manage users using centralized function
    const { data: canManage } = await supabaseAdmin.rpc('can_manage_users', { _user_id: caller.id });

    if (!canManage) {
      return new Response(JSON.stringify({ error: 'Forbidden: requires admin, gestor role or manage_users permission' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get caller's company_id from profiles
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('user_id', caller.id)
      .single();

    const callerCompanyId = (callerProfile?.company_id as string | null) || null;

    const { email, password, full_name, phone, permissions, preset_id, role, avatar_url, employee_id } = await req.json();

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields: email, password, full_name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

      const friendlyMessage = isDuplicate ? 'Este e-mail já está cadastrado no sistema.' : createError.message;
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
    const message = error instanceof Error ? error.message : 'Erro interno';
    console.error('create-user error:', error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
