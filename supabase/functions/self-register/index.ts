import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const trim = (v: unknown, max = 255) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Plan pricing fallback (synced with subscription_plans table)
const PLAN_DEFAULTS: Record<string, { price: number; max_users: number; name: string }> = {
  start: { price: 200, max_users: 5, name: 'Start' },
  starter: { price: 200, max_users: 5, name: 'Start' },
  avancado: { price: 350, max_users: 5, name: 'Avançado' },
  pro: { price: 350, max_users: 5, name: 'Avançado' },
  master: { price: 650, max_users: 15, name: 'Master' },
  enterprise: { price: 650, max_users: 15, name: 'Master' },
};

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let raw: any;
    try { raw = await req.json(); } catch {
      return new Response(JSON.stringify({ error: 'JSON inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const company_name = trim(raw.company_name, 200);
    const company_cnpj = trim(raw.company_cnpj, 20);
    const company_email = trim(raw.company_email, 255).toLowerCase();
    const company_phone = trim(raw.company_phone, 30);
    const contact_name = trim(raw.contact_name, 200);
    const password = typeof raw.password === 'string' ? raw.password : '';
    const origin = trim(raw.origin, 100);

    // Affiliate/sales link params
    const linkType = trim(raw.link_type, 20); // 'teste' | 'venda'
    const lockedPlanRaw = trim(raw.locked_plan, 30).toLowerCase();
    const lockedPlan = lockedPlanRaw && PLAN_DEFAULTS[lockedPlanRaw] ? lockedPlanRaw : null;
    const isLocked = !!raw.is_locked;
    const lockedPrice = typeof raw.locked_price === 'number' && raw.locked_price > 0 ? raw.locked_price : null;
    const billingCycle = (raw.billing_cycle === 'yearly' ? 'yearly' : 'monthly') as 'monthly' | 'yearly';
    const promoMonths = typeof raw.promo_months === 'number' && raw.promo_months > 0 ? raw.promo_months : null;
    const trialDaysOverride = typeof raw.trial_days === 'number' && raw.trial_days > 0 ? raw.trial_days : null;
    const referralCode = trim(raw.referral_code, 50);

    if (!company_name || !contact_name || !company_email || !password) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: nome da empresa, contato, e-mail e senha' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!EMAIL_RE.test(company_email)) {
      return new Response(JSON.stringify({ error: 'E-mail inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (password.length < 8 || password.length > 128) {
      return new Response(JSON.stringify({ error: 'Senha deve ter entre 8 e 128 caracteres' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    // Resolve plan/price/status from link params
    const planCode = lockedPlan || 'start';
    const planDefaults = PLAN_DEFAULTS[planCode] || PLAN_DEFAULTS.start;
    const isSale = linkType === 'venda';
    const subscription_status = isSale ? 'pending_payment' : 'testing';
    const planPrice = planDefaults.price;
    const finalPrice = lockedPrice ?? planPrice;

    // Trial expiration
    const expirationDate = new Date();
    if (isSale) {
      // Pending payment: short window (3 dias) until payment confirmation
      expirationDate.setDate(expirationDate.getDate() + 3);
    } else {
      const trialDays = trialDaysOverride || 14;
      expirationDate.setDate(expirationDate.getDate() + trialDays);
    }

    // Lookup salesperson via referral_code
    let salespersonId: string | null = null;
    if (referralCode) {
      const { data: sp } = await supabaseAdmin
        .from('salespeople')
        .select('id')
        .eq('referral_code', referralCode)
        .eq('is_active', true)
        .maybeSingle();
      if (sp?.id) salespersonId = sp.id;
    }

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
        subscription_status,
        subscription_plan: planCode,
        subscription_value: finalPrice,
        subscription_expires_at: expirationDate.toISOString(),
        billing_cycle: billingCycle,
        max_users: planDefaults.max_users,
        trial_days: isSale ? 0 : (trialDaysOverride || 14),
        salesperson_id: salespersonId,
        custom_price: lockedPrice && lockedPrice !== planPrice ? lockedPrice : null,
        custom_price_permanent: lockedPrice ? !promoMonths : true,
        custom_price_months: promoMonths || null,
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

    // Seed default financial accounts
    await supabaseAdmin
      .from('financial_accounts')
      .insert([
        { company_id: company.id, name: 'Caixa', type: 'caixa', color: '#10b981', icon: 'Wallet', initial_balance: 0, sort_order: 0 },
        { company_id: company.id, name: 'Conta Principal', type: 'banco', color: '#3b82f6', icon: 'Landmark', initial_balance: 0, sort_order: 1 },
      ]);

    return new Response(
      JSON.stringify({
        success: true,
        company: {
          id: company.id,
          name: company.name,
          subscription_status,
          requires_payment: isSale,
        },
        user: { id: newUser.user.id, email: newUser.user.email },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
