import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Check if caller is admin/gestor OR has manage_users permission
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .in('role', ['admin', 'gestor'])
      .maybeSingle();

    let authorized = !!callerRole;

    if (!authorized) {
      const { data: permsData } = await supabaseAdmin
        .from('user_permissions')
        .select('permissions')
        .eq('user_id', caller.id)
        .eq('is_active', true)
        .maybeSingle();

      const perms = Array.isArray(permsData?.permissions) ? permsData.permissions as string[] : [];
      authorized = perms.includes('fn:manage_users') || perms.length >= 27;
    }

    if (!authorized) {
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

    const callerCompanyId = callerProfile?.company_id || null;

    const { email, password, full_name, phone, permissions, preset_id, role, avatar_url } = await req.json();

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
      const friendlyMessage = isDuplicate ? 'Este e-mail já está cadastrado no sistema.' : createError.message;
      return new Response(JSON.stringify({ error: friendlyMessage }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = newUser.user.id;

    // Wait briefly for the trigger to create the profile, then update it
    // The handle_new_user trigger creates the profile but without company_id or phone
    await new Promise(resolve => setTimeout(resolve, 500));

    const profileUpdate: Record<string, unknown> = {};
    if (callerCompanyId) profileUpdate.company_id = callerCompanyId;
    if (phone) profileUpdate.phone = phone;
    if (avatar_url) profileUpdate.avatar_url = avatar_url;

    if (Object.keys(profileUpdate).length > 0) {
      await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('user_id', userId);
    }

    // Create user_permissions record
    if (permissions && permissions.length > 0) {
      await supabaseAdmin
        .from('user_permissions')
        .insert({
          user_id: userId,
          permissions,
          preset_id: preset_id || null,
          is_active: true,
        });
    }

    // Create user_roles record if role provided
    if (role) {
      await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role });
    }

    return new Response(JSON.stringify({ user: { id: userId, email } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('create-user error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
