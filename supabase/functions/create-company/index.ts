import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify caller is super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: hasRole } = await supabaseAdmin.rpc('has_role', {
      _user_id: caller.id,
      _role: 'super_admin',
    })

    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Forbidden: requires super_admin role' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const {
      company_name,
      company_cnpj,
      company_email,
      company_phone,
      company_address,
      contact_name,
      notes,
      admin_email,
      admin_password,
      subscription_status,
      subscription_plan,
      subscription_value,
      subscription_expires_at,
      billing_cycle,
      max_users,
      origin,
      salesperson_id,
      custom_price,
      custom_price_permanent,
      custom_price_months,
    } = body

    if (!company_name || !admin_email || !admin_password) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Create the company
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name: company_name,
        cnpj: company_cnpj || null,
        email: company_email || admin_email,
        phone: company_phone || null,
        address: company_address || null,
        contact_name: contact_name || null,
        notes: notes || null,
        subscription_status: subscription_status || 'testing',
        subscription_plan: subscription_plan || 'starter',
        subscription_value: subscription_value || 0,
        subscription_expires_at: subscription_expires_at || null,
        billing_cycle: billing_cycle || 'monthly',
        max_users: max_users || 5,
        origin: origin || null,
        salesperson_id: salesperson_id || null,
        custom_price: custom_price ?? null,
        custom_price_permanent: custom_price_permanent ?? true,
        custom_price_months: custom_price_months ?? null,
      })
      .select('id')
      .single()

    if (companyError) {
      console.error('Error creating company:', companyError)
      throw new Error(`Erro ao criar empresa: ${companyError.message}`)
    }

    // 2. Create the master user
    const { data: newUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: true,
      user_metadata: { full_name: contact_name || company_name },
    })

    if (userError) {
      // Rollback: delete the company
      await supabaseAdmin.from('companies').delete().eq('id', company.id)
      const isDuplicate = userError.message.toLowerCase().includes('already') || userError.message.toLowerCase().includes('duplicate')
      const msg = isDuplicate ? 'Este e-mail já está cadastrado no sistema.' : userError.message
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = newUser.user.id

    // Wait for trigger to create profile
    await new Promise(resolve => setTimeout(resolve, 500))

    // 3. Link profile to company
    await supabaseAdmin
      .from('profiles')
      .update({ company_id: company.id, phone: company_phone || null })
      .eq('user_id', userId)

    // 4. Assign admin role
    await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' })

    // 5. Give full permissions
    const allPermissions = [
      'fn:manage_users', 'fn:manage_settings', 'fn:view_financial', 'fn:manage_financial',
      'fn:view_customers', 'fn:manage_customers', 'fn:view_equipment', 'fn:manage_equipment',
      'fn:view_os', 'fn:create_os', 'fn:edit_os', 'fn:delete_os', 'fn:execute_os',
      'fn:view_schedule', 'fn:manage_schedule', 'fn:view_inventory', 'fn:manage_inventory',
      'fn:view_contracts', 'fn:manage_contracts', 'fn:view_crm', 'fn:manage_crm',
      'fn:view_quotes', 'fn:manage_quotes', 'fn:view_teams', 'fn:manage_teams',
      'fn:view_employees', 'fn:manage_employees', 'fn:view_reports',
    ]

    await supabaseAdmin
      .from('user_permissions')
      .insert({
        user_id: userId,
        permissions: allPermissions,
        is_active: true,
      })

    // 6. Create company_settings row for this company
    await supabaseAdmin
      .from('company_settings')
      .insert({
        company_id: company.id,
        name: company_name,
        document: company_cnpj || null,
        phone: company_phone || null,
        email: company_email || admin_email,
      })

    // 7. Seed default financial categories
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
    ]
    await supabaseAdmin
      .from('financial_categories')
      .insert(defaultCategories.map(c => ({ ...c, company_id: company.id })))

    // 8. Seed default financial accounts
    await supabaseAdmin
      .from('financial_accounts')
      .insert([
        { company_id: company.id, name: 'Caixa', type: 'caixa', color: '#10b981', icon: 'Wallet', initial_balance: 0, sort_order: 0 },
        { company_id: company.id, name: 'Conta Principal', type: 'banco', color: '#3b82f6', icon: 'Landmark', initial_balance: 0, sort_order: 1 },
      ])

    return new Response(JSON.stringify({ 
      success: true, 
      company_id: company.id, 
      user_id: userId 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    console.error('create-company error:', error)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
