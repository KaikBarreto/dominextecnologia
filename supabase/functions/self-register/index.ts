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

    // Seed default financial categories
    const defaultCategories = [
      { name: 'Serviços Prestados', type: 'entrada', color: '#10b981', icon: 'Wrench', dre_group: 'opex', is_system: false },
      { name: 'Vendas de Peças/Materiais', type: 'entrada', color: '#3b82f6', icon: 'Package', dre_group: 'opex', is_system: false },
      { name: 'Contratos PMOC', type: 'entrada', color: '#8b5cf6', icon: 'FileText', dre_group: 'opex', is_system: false },
      { name: 'Impostos e Taxas', type: 'saida', color: '#ef4444', icon: 'Receipt', dre_group: 'impostos', is_system: true },
      { name: 'Custo de Materiais', type: 'saida', color: '#f59e0b', icon: 'ShoppingCart', dre_group: 'cmv', is_system: false },
      { name: 'Fornecedores e Insumos', type: 'saida', color: '#6366f1', icon: 'Truck', dre_group: 'cmv', is_system: false },
      { name: 'Alimentação', type: 'saida', color: '#ec4899', icon: 'Coffee', dre_group: 'opex', is_system: false },
      { name: 'Luz/Energia', type: 'saida', color: '#eab308', icon: 'Zap', dre_group: 'opex', is_system: false },
      { name: 'Aluguel', type: 'saida', color: '#14b8a6', icon: 'Home', dre_group: 'opex', is_system: false },
      { name: 'Combustível/Transporte', type: 'saida', color: '#f97316', icon: 'Car', dre_group: 'opex', is_system: false },
      { name: 'Salários e Encargos', type: 'saida', color: '#0ea5e9', icon: 'Users', dre_group: 'opex', is_system: false },
      { name: 'Marketing e Publicidade', type: 'saida', color: '#a855f7', icon: 'Megaphone', dre_group: 'opex', is_system: false },
      { name: 'Ferramentas e Equipamentos', type: 'saida', color: '#64748b', icon: 'Hammer', dre_group: 'opex', is_system: false },
      { name: 'Outros', type: 'ambos', color: '#6b7280', icon: 'Tag', dre_group: 'opex', is_system: false },
    ];
    await supabaseAdmin
      .from('financial_categories')
      .insert(defaultCategories.map(c => ({ ...c, company_id: company.id })));

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
