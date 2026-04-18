import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const trim = (v: unknown, max = 255) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Comissão padrão (igual ao hook useSalespersonData.calculateCommission)
function calculateCommission(amount: number, billingCycle: 'monthly' | 'annual'): number {
  if (!amount || amount <= 0) return 0;
  return billingCycle === 'annual' ? amount * 0.2 : amount * 0.5;
}

const PLAN_VALUES: Record<string, { monthly: number; annual: number }> = {
  essencial: { monthly: 200, annual: 160 },
  starter:   { monthly: 200, annual: 160 },
  avancado:  { monthly: 350, annual: 280 },
  pro:       { monthly: 350, annual: 280 },
  master:    { monthly: 650, annual: 520 },
  enterprise:{ monthly: 650, annual: 520 },
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
    const salesperson_referral_code = trim(raw.salesperson_referral_code, 50).toLowerCase() || null;
    const tipo = trim(raw.tipo, 20) || null; // 'teste' | 'venda'
    const plano = trim(raw.plano, 30) || null;
    const ciclo = trim(raw.ciclo, 10) || 'monthly';

    // Sanitização cuidadosa de números (vindos de URL pública — não confiar)
    const customPriceRaw = raw.custom_price;
    let custom_price: number | null = null;
    if (customPriceRaw != null && customPriceRaw !== '') {
      const n = Number(customPriceRaw);
      if (Number.isFinite(n) && n >= 0 && n < 1_000_000) custom_price = n;
    }
    const customMonthsRaw = raw.custom_price_months;
    let custom_price_months: number | null = null;
    if (customMonthsRaw != null && customMonthsRaw !== '') {
      const n = parseInt(String(customMonthsRaw), 10);
      if (Number.isFinite(n) && n >= 0 && n <= 120) custom_price_months = n;
    }
    const custom_price_permanent = !!raw.custom_price_permanent;

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

    // Verifica email duplicado
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

    // Resolve vendedor (se houver)
    let salespersonId: string | null = null;
    let salespersonRow: any = null;
    if (salesperson_referral_code) {
      const { data: sp } = await supabaseAdmin
        .from('salespeople')
        .select('id, name, no_commission, is_active')
        .eq('referral_code', salesperson_referral_code)
        .maybeSingle();
      if (sp && sp.is_active !== false) {
        salespersonId = sp.id;
        salespersonRow = sp;
      }
      // se referral_code não corresponder => silenciosamente sem vendedor (não falhar cadastro)
    }

    // Resolve plano e valor inicial
    const planKey = plano && PLAN_VALUES[plano] ? plano : 'starter';
    const billingCycle: 'monthly' | 'annual' = ciclo === 'annual' || ciclo === 'yearly' ? 'annual' : 'monthly';
    const subscription_plan_normalized = ['essencial', 'starter'].includes(planKey) ? 'starter'
      : ['avancado', 'pro'].includes(planKey) ? 'pro'
      : 'enterprise';

    // Trial padrão se 'teste' ou se não for 'venda'
    const isVenda = tipo === 'venda';
    const subscription_status = isVenda ? 'active' : 'testing';

    // Valor cobrado: prioridade => custom_price > tabela do plano
    const planBase = PLAN_VALUES[planKey] || PLAN_VALUES.starter;
    const subscription_value = custom_price ?? planBase[billingCycle];

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + (isVenda ? 30 : 14));

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
        subscription_plan: subscription_plan_normalized,
        subscription_value,
        billing_cycle: billingCycle === 'annual' ? 'yearly' : 'monthly',
        subscription_expires_at: expirationDate.toISOString(),
        max_users: 5,
        trial_days: isVenda ? 0 : 14,
        salesperson_id: salespersonId,
        custom_price,
        custom_price_months,
        custom_price_permanent,
      })
      .select()
      .single();

    if (companyError) {
      return new Response(
        JSON.stringify({ error: `Erro ao criar empresa: ${companyError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      await supabaseAdmin.from('companies').delete().eq('id', company.id);
      return new Response(
        JSON.stringify({ error: `Erro ao criar usuário: ${createUserError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    await supabaseAdmin.from('profiles').update({
      company_id: company.id,
      full_name: contact_name,
    }).eq('user_id', newUser.user.id);

    await supabaseAdmin.from('user_roles').insert({ user_id: newUser.user.id, role: 'admin' });

    // Seed categorias e contas
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
    await supabaseAdmin.from('financial_categories').insert(defaultCategories.map(c => ({ ...c, company_id: company.id })));

    await supabaseAdmin.from('financial_accounts').insert([
      { company_id: company.id, name: 'Caixa', type: 'caixa', color: '#10b981', icon: 'Wallet', initial_balance: 0, sort_order: 0 },
      { company_id: company.id, name: 'Conta Principal', type: 'banco', color: '#3b82f6', icon: 'Landmark', initial_balance: 0, sort_order: 1 },
    ]);

    // Cria registro de venda automática se for venda direta E houver vendedor com comissão
    if (isVenda && salespersonId && salespersonRow && !salespersonRow.no_commission) {
      const commission = calculateCommission(subscription_value, billingCycle);
      await supabaseAdmin.from('salesperson_sales').insert({
        salesperson_id: salespersonId,
        company_id: company.id,
        customer_name: contact_name,
        customer_company: company_name,
        customer_origin: origin || null,
        amount: subscription_value,
        paid_amount: 0,
        commission_amount: commission,
        billing_cycle: billingCycle,
        notes: `Venda gerada automaticamente via link de afiliado (${salesperson_referral_code})`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        company: { id: company.id, name: company.name },
        user: { id: newUser.user.id, email: newUser.user.email },
        salesperson_linked: !!salespersonId,
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
