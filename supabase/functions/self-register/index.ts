import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const {
      company_name,
      company_cnpj,
      company_email,
      company_phone,
      contact_name,
      password,
      origin,
    } = await req.json();

    if (!company_name || !contact_name || !company_email || !password) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: company_name, contact_name, company_email, password' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u: any) => u.email?.toLowerCase() === company_email.toLowerCase()
    );

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: 'Este email já está cadastrado. Faça login ou use outro email.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate trial expiration (14 days)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 14);

    // Create company
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name: company_name,
        cnpj: company_cnpj || null,
        email: company_email,
        phone: company_phone || null,
        contact_name,
        origin: origin || null,
        subscription_status: 'testing',
        subscription_plan: 'starter',
        subscription_value: 0,
        subscription_expires_at: expirationDate.toISOString(),
        max_users: 5,
        trial_days: 14,
      })
      .select()
      .single();

    if (companyError) {
      return new Response(
        JSON.stringify({ error: `Erro ao criar empresa: ${companyError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create auth user with email auto-confirmed
    const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: company_email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: contact_name,
        company_id: company.id,
        origin: origin || 'Cadastro Direto',
      },
    });

    if (createUserError) {
      // Rollback company
      await supabaseAdmin.from('companies').delete().eq('id', company.id);
      return new Response(
        JSON.stringify({ error: `Erro ao criar usuário: ${createUserError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Wait for profile trigger
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update profile with company_id
    await supabaseAdmin
      .from('profiles')
      .update({
        company_id: company.id,
        full_name: contact_name,
      })
      .eq('user_id', newUser.user.id);

    // Create admin role
    await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: newUser.user.id, role: 'admin' });

    return new Response(
      JSON.stringify({
        success: true,
        company: { id: company.id, name: company.name },
        user: { id: newUser.user.id, email: newUser.user.email },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
