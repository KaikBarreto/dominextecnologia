import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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

    // Verify caller is authorized
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    const callerId = claimsData?.claims?.sub;

    if (claimsError || !callerId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin/gestor role OR fn:manage_users permission
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerId)
      .in('role', ['admin', 'gestor'])
      .maybeSingle();

    let hasAccess = !!callerRole;

    if (!hasAccess) {
      // Check user_permissions for fn:manage_users or full access
      const { data: permsData } = await supabaseAdmin
        .from('user_permissions')
        .select('permissions')
        .eq('user_id', callerId)
        .eq('is_active', true)
        .maybeSingle();
      
      const perms = (permsData?.permissions as string[]) || [];
      hasAccess = perms.includes('fn:manage_users') || perms.length >= 27;
    }

    if (!hasAccess) {
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

    // DELETE user permanently
    if (action === 'delete_user') {
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
