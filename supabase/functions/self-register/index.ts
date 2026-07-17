import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { provisionAsaasCustomer } from '../_shared/asaas-customer.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const trim = (v: unknown, max = 255) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ── i18n das mensagens de erro voltadas ao usuário ────────────────────────────
// Idiomas suportados; o frontend manda `locale` no body do POST. Default 'pt-br'
// (backward-compat: cadastro antigo sem `locale` continua respondendo em pt-br).
// As traduções são GENERALIZADAS (sem menção a lei/Brasil). Não confundir com os
// dados semeados (categorias, contas "Caixa"/"Conta Principal"), que permanecem
// em pt-br de propósito. Só as STRINGS de erro passam por aqui.
type Locale = 'pt-br' | 'en' | 'es' | 'fr';
const SUPPORTED_LOCALES: Locale[] = ['pt-br', 'en', 'es', 'fr'];
const DEFAULT_LOCALE: Locale = 'pt-br';

// Mensagens que dependem de um detalhe dinâmico (mensagem do erro do Supabase)
// recebem o texto por parâmetro; as demais são estáticas.
const MESSAGES: Record<Locale, {
  methodNotAllowed: string;
  invalidJson: string;
  requiredFields: string;
  invalidEmail: string;
  invalidPassword: string;
  emailAlreadyRegistered: string;
  companyCreateError: (detail: string) => string;
  userCreateError: (detail: string) => string;
  internalError: string;
}> = {
  'pt-br': {
    methodNotAllowed: 'Método não permitido',
    invalidJson: 'JSON inválido',
    requiredFields: 'Campos obrigatórios: nome da empresa, contato, e-mail e senha',
    invalidEmail: 'E-mail inválido',
    invalidPassword: 'Senha deve ter entre 8 e 128 caracteres',
    emailAlreadyRegistered: 'Este email já está cadastrado. Faça login ou use outro email.',
    companyCreateError: (d) => `Erro ao criar empresa: ${d}`,
    userCreateError: (d) => `Erro ao criar usuário: ${d}`,
    internalError: 'Erro interno',
  },
  en: {
    methodNotAllowed: 'Method not allowed',
    invalidJson: 'Invalid JSON',
    requiredFields: 'Required fields: company name, contact, email and password',
    invalidEmail: 'Invalid email',
    invalidPassword: 'Password must be between 8 and 128 characters',
    emailAlreadyRegistered: 'This email is already registered. Log in or use another email.',
    companyCreateError: (d) => `Error creating company: ${d}`,
    userCreateError: (d) => `Error creating user: ${d}`,
    internalError: 'Internal error',
  },
  es: {
    methodNotAllowed: 'Método no permitido',
    invalidJson: 'JSON inválido',
    requiredFields: 'Campos obligatorios: nombre de la empresa, contacto, correo electrónico y contraseña',
    invalidEmail: 'Correo electrónico inválido',
    invalidPassword: 'La contraseña debe tener entre 8 y 128 caracteres',
    emailAlreadyRegistered: 'Este correo electrónico ya está registrado. Inicia sesión o usa otro correo.',
    companyCreateError: (d) => `Error al crear la empresa: ${d}`,
    userCreateError: (d) => `Error al crear el usuario: ${d}`,
    internalError: 'Error interno',
  },
  fr: {
    methodNotAllowed: 'Méthode non autorisée',
    invalidJson: 'JSON invalide',
    requiredFields: 'Champs obligatoires : nom de l\'entreprise, contact, e-mail et mot de passe',
    invalidEmail: 'E-mail invalide',
    invalidPassword: 'Le mot de passe doit contenir entre 8 et 128 caractères',
    emailAlreadyRegistered: 'Cet e-mail est déjà enregistré. Connectez-vous ou utilisez un autre e-mail.',
    companyCreateError: (d) => `Erreur lors de la création de l'entreprise : ${d}`,
    userCreateError: (d) => `Erreur lors de la création de l'utilisateur : ${d}`,
    internalError: 'Erreur interne',
  },
};

// Normaliza qualquer entrada pra um Locale suportado; cai no default se ausente,
// não-string ou desconhecido. Aceita variações comuns (case-insensitive, 'pt'/'pt_BR').
const resolveLocale = (v: unknown): Locale => {
  if (typeof v !== 'string') return DEFAULT_LOCALE;
  const norm = v.trim().toLowerCase().replace('_', '-');
  if (SUPPORTED_LOCALES.includes(norm as Locale)) return norm as Locale;
  if (norm === 'pt' || norm.startsWith('pt-')) return 'pt-br';
  const base = norm.split('-')[0];
  if (SUPPORTED_LOCALES.includes(base as Locale)) return base as Locale;
  return DEFAULT_LOCALE;
};

// ÚLTIMO fallback de specs de plano — a fonte da verdade é subscription_plans
// (lida via service role logo abaixo). Só usado se a query ao catálogo falhar.
// PREÇOS SINCRONIZADOS com o catálogo real (migration 20260613180000, decisão CEO
// 2026-06-13): Essencial(start) R$197 / Pro(avancado) R$447 / Business(master) R$697.
// Usuários: Start 5 / Avançado 10 / Master 15 (decisão CEO 2026-06-12).
// IMPORTANTE: fallback defasado subcobrava (incidente: avancado cobrado como R$197).
// Mantê-lo em dia é obrigatório; num link de VENDA a query ao catálogo é EXIGIDA
// (fail-closed abaixo) pra nunca subcobrar silenciosamente com um default velho.
const PLAN_DEFAULTS: Record<string, { price: number; max_users: number; name: string }> = {
  start: { price: 197, max_users: 5, name: 'Essencial' },
  starter: { price: 197, max_users: 5, name: 'Essencial' },
  avancado: { price: 447, max_users: 10, name: 'Pro' },
  pro: { price: 447, max_users: 10, name: 'Pro' },
  master: { price: 697, max_users: 15, name: 'Business' },
  enterprise: { price: 697, max_users: 15, name: 'Business' },
};

// Aliases legados aceitos em links antigos → código real em subscription_plans.
const PLAN_CODE_ALIASES: Record<string, string> = {
  starter: 'start',
  pro: 'avancado',
  enterprise: 'master',
};

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    // Sem POST não há body confiável; tenta o locale da query string (?locale=),
    // senão cai no default pt-br.
    let queryLocale: Locale = DEFAULT_LOCALE;
    try { queryLocale = resolveLocale(new URL(req.url).searchParams.get('locale')); } catch { /* url inválida → default */ }
    return new Response(JSON.stringify({ error: MESSAGES[queryLocale].methodNotAllowed }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Dicionário ativo desta requisição. Nasce em pt-br (default/backward-compat)
  // e é reatribuído pro locale do body assim que o JSON é lido. Fica no escopo do
  // handler pra que o catch final (500) também responda no idioma do usuário.
  let t = MESSAGES[DEFAULT_LOCALE];

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let raw: any;
    try { raw = await req.json(); } catch {
      // Body ilegível → não dá pra ler locale do body; tenta a query string.
      let queryLocale: Locale = DEFAULT_LOCALE;
      try { queryLocale = resolveLocale(new URL(req.url).searchParams.get('locale')); } catch { /* url inválida → default */ }
      return new Response(JSON.stringify({ error: MESSAGES[queryLocale].invalidJson }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Locale do body (fonte de verdade a partir daqui); default pt-br garante
    // backward-compat com o frontend antigo que não manda `locale`.
    const locale = resolveLocale(raw.locale);
    t = MESSAGES[locale];

    const company_name = trim(raw.company_name, 200);
    const company_cnpj = trim(raw.company_cnpj, 20);
    const company_email = trim(raw.company_email, 255).toLowerCase();
    const company_phone = trim(raw.company_phone, 30);
    const contact_name = trim(raw.contact_name, 200);
    const password = typeof raw.password === 'string' ? raw.password : '';
    const origin = trim(raw.origin, 100);
    // Segmento de atuação — OPCIONAL na edge (backward-compat). Persistido em
    // companies.segment; o trigger espelha pro company_settings.segment (que o
    // app de campo lê pra gatear ferramentas). A obrigatoriedade fica no
    // FRONTEND novo (formulário de cadastro); a edge NÃO pode barrar quem não
    // manda o campo, senão quebra o frontend antigo que ainda está em produção
    // (incidente: edge nova rejeitava 400 cadastros do site sem segment).
    const segment = trim(raw.segment, 50);
    // Endereço da empresa — OPCIONAL (string já formatada pelo frontend).
    // Backward-compat: ausente/vazio grava null, não barra ninguém.
    const company_address = trim(raw.company_address, 500);

    // Affiliate/sales link params
    const linkType = trim(raw.link_type, 20); // 'teste' | 'venda'
    const lockedPlanRaw = trim(raw.locked_plan, 30).toLowerCase();
    const isPersonalizado = lockedPlanRaw === 'personalizado';
    const lockedPlan = isPersonalizado
      ? 'personalizado'
      : (lockedPlanRaw && PLAN_DEFAULTS[lockedPlanRaw] ? lockedPlanRaw : null);
    const isLocked = !!raw.is_locked;
    // Plano personalizado: módulos à la carte + máx. usuários vindos do link
    const requestedModules: string[] = Array.isArray(raw.modules)
      ? raw.modules.filter((m: unknown) => typeof m === 'string').map((m: string) => m.trim().slice(0, 50)).filter(Boolean)
      : [];
    const maxUsersOverride = typeof raw.max_users === 'number' && raw.max_users > 0 && raw.max_users <= 999
      ? Math.floor(raw.max_users)
      : null;
    const lockedPrice = typeof raw.locked_price === 'number' && raw.locked_price > 0 ? raw.locked_price : null;
    const billingCycle = (raw.billing_cycle === 'yearly' ? 'yearly' : 'monthly') as 'monthly' | 'yearly';
    const promoMonths = typeof raw.promo_months === 'number' && raw.promo_months > 0 ? raw.promo_months : null;
    const trialDaysOverride = typeof raw.trial_days === 'number' && raw.trial_days > 0 ? raw.trial_days : null;
    const referralCode = trim(raw.referral_code, 50); // closer (vendedor que fechou)
    const sdrReferralCode = trim(raw.sdr_referral_code, 50); // SDR que agendou (opcional)

    if (!company_name || !contact_name || !company_email || !password) {
      return new Response(
        JSON.stringify({ error: t.requiredFields }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // segment é opcional na edge (ver nota acima): se vier vazio/ausente,
    // grava null (linha do insert: `segment: segment || null`) e segue normal.
    if (!EMAIL_RE.test(company_email)) {
      return new Response(JSON.stringify({ error: t.invalidEmail }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (password.length < 8 || password.length > 128) {
      return new Response(JSON.stringify({ error: t.invalidPassword }), {
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
        JSON.stringify({ error: t.emailAlreadyRegistered }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve plan/price/status from link params
    const planCode = lockedPlan || 'start';

    const isSale = linkType === 'venda';

    // Specs do plano (price/max_users/name): fonte da verdade é subscription_plans.
    // PLAN_DEFAULTS hardcoded só entra se a query ao catálogo falhar/retornar vazio.
    // planFromCatalog=true quando o preço veio de fato do catálogo (não do fallback).
    let planDefaults = PLAN_DEFAULTS[planCode] || PLAN_DEFAULTS.start;
    let planFromCatalog = false;
    if (!isPersonalizado) {
      try {
        const canonicalCode = PLAN_CODE_ALIASES[planCode] || planCode;
        const { data: planRow, error: planRowError } = await supabaseAdmin
          .from('subscription_plans')
          .select('price, max_users, name')
          .eq('code', canonicalCode)
          .eq('is_active', true)
          .maybeSingle();
        if (planRowError) {
          console.error('[self-register] Falha ao ler subscription_plans (usando fallback hardcoded):', planRowError);
        } else if (planRow && Number(planRow.price) > 0 && Number(planRow.max_users) > 0) {
          planDefaults = {
            price: Number(planRow.price),
            max_users: Number(planRow.max_users),
            name: planRow.name || planDefaults.name,
          };
          planFromCatalog = true;
        } else {
          console.error(`[self-register] Plano '${canonicalCode}' não encontrado/inválido em subscription_plans (usando fallback hardcoded)`);
        }
      } catch (planLookupErr) {
        console.error('[self-register] Exceção ao ler subscription_plans (usando fallback hardcoded):', planLookupErr);
      }
    }

    // FAIL-CLOSED (venda paga): num link de VENDA sem preço explícito no link
    // (lockedPrice), o valor gravado vira o que a Asaas vai cobrar. Se NÃO
    // conseguimos ler o preço do catálogo, NÃO caímos num default hardcoded
    // possivelmente defasado (isso subcobrava). Rejeitamos e pedimos retry — melhor
    // falhar o cadastro do que criar uma assinatura com valor errado. Teste (trial)
    // e personalizado não entram aqui (não há cobrança/valor de catálogo em jogo).
    const lockedPriceEarly = typeof raw.locked_price === 'number' && raw.locked_price > 0 ? raw.locked_price : null;
    if (isSale && !isPersonalizado && !planFromCatalog && lockedPriceEarly === null) {
      console.error(`[self-register] VENDA sem preço confiável (catálogo indisponível, sem lockedPrice) p/ plano '${planCode}'. Rejeitando (fail-closed).`);
      return new Response(
        JSON.stringify({ error: t.internalError }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const subscription_status = isSale ? 'pending_payment' : 'testing';

    // Plano personalizado: preço = soma dos módulos do catálogo (sempre inclui
    // o módulo base). Sanitiza os códigos contra subscription_modules ativos.
    // 'basic' é o módulo raiz de todos os planos (catálogo não tem flag base).
    const BASE_MODULE_CODES = ['basic'];
    let personalizadoModules: { code: string; price: number | null }[] = [];
    if (isPersonalizado) {
      const requested = Array.from(new Set([...BASE_MODULE_CODES, ...requestedModules]));
      const { data: catalog } = await supabaseAdmin
        .from('subscription_modules')
        .select('code, price')
        .eq('is_active', true)
        .in('code', requested);
      personalizadoModules = catalog || [];
    }
    const personalizadoSum = personalizadoModules.reduce((acc, m) => acc + (Number(m.price) || 0), 0);

    const planPrice = isPersonalizado ? personalizadoSum : planDefaults.price;
    const finalPrice = lockedPrice ?? planPrice;
    const finalMaxUsers = isPersonalizado ? (maxUsersOverride || 5) : planDefaults.max_users;

    // Vencimento inicial (subscription_expires_at).
    //
    // VENDA: a ÂNCORA de renovação é HOJE (data do cadastro/fechamento). NÃO somamos
    // dias aqui. Na confirmação do pagamento o webhook faz
    // compute_next_expiration(subscription_expires_at, ciclo), então HOJE + 1 mês
    // (mensal) ou HOJE + 1 ano (anual) — exato. ANTES somávamos +3 dias como "janela
    // de pagamento", mas esses 3 dias contaminavam a âncora e o webhook virava
    // HOJE+3+1mês (incidente: 17/07 → 20/08 em vez de 17/08). A janela de pagamento
    // do PIX NÃO precisa morar aqui: o create-asaas-payment já empurra o dueDate pra
    // amanhã quando subscription_expires_at está no passado/hoje (janela de 1 dia),
    // sem tocar na âncora de renovação.
    //
    // TESTE: expira em HOJE + trialDays (janela real do teste grátis).
    const expirationDate = new Date();
    if (!isSale) {
      const trialDays = trialDaysOverride || 14;
      expirationDate.setDate(expirationDate.getDate() + trialDays);
    }

    // Lookup do CLOSER (salesperson_id) via referral_code
    let salespersonId: string | null = null;
    let salespersonName = '';
    if (referralCode) {
      const { data: sp } = await supabaseAdmin
        .from('salespeople')
        .select('id, name')
        .eq('referral_code', referralCode)
        .eq('is_active', true)
        .maybeSingle();
      if (sp?.id) {
        salespersonId = sp.id;
        salespersonName = sp.name || '';
      }
    }

    // Observação automática de valor personalizado: quando o link trouxe um
    // preço diferente do preço do plano, registra quem deu a promoção.
    // Quem deu = vendedor do link (referral) > 'Link de cadastro'.
    let promoNote: string | null = null;
    if (lockedPrice !== null && lockedPrice !== planPrice) {
      const formattedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lockedPrice);
      let endDateText = '';
      if (promoMonths) {
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + promoMonths);
        const dateStr = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
        }).format(endDate);
        endDateText = ` até ${dateStr}`;
      }
      const promoterName = salespersonName || 'Link de cadastro';
      promoNote = `Este cliente pagará ${formattedPrice}${endDateText} por conta de uma promoção dada por: ${promoterName}`;
    }

    // Lookup do SDR (sdr_id) via referral_code — opcional. Aceita qualquer vendedor
    // ativo cujo referral_code bata (a regra de "ser SDR" é aplicada na origem do link;
    // aqui só resolvemos o id). Se não vier ou não bater → sdr_id permanece null.
    let sdrId: string | null = null;
    if (sdrReferralCode) {
      const { data: sdr } = await supabaseAdmin
        .from('salespeople')
        .select('id')
        .eq('referral_code', sdrReferralCode)
        .eq('is_active', true)
        .maybeSingle();
      if (sdr?.id) sdrId = sdr.id;
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
        segment: segment || null,
        address: company_address || null,
        subscription_status,
        subscription_plan: planCode,
        subscription_value: finalPrice,
        subscription_expires_at: expirationDate.toISOString(),
        billing_cycle: billingCycle,
        max_users: finalMaxUsers,
        trial_days: isSale ? 0 : (trialDaysOverride || 14),
        salesperson_id: salespersonId,
        sdr_id: sdrId,
        custom_price: lockedPrice && lockedPrice !== planPrice ? lockedPrice : null,
        custom_price_permanent: lockedPrice ? !promoMonths : true,
        custom_price_months: promoMonths || null,
        notes: promoNote,
      })
      .select()
      .single();

    if (companyError) {
      return new Response(
        JSON.stringify({ error: t.companyCreateError(companyError.message) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Plano personalizado: grava os módulos contratados (à la carte).
    // NÃO-FATAL: status testing já libera tudo via trial; se falhar, o admin
    // Auctus pode reativar pelo painel.
    if (isPersonalizado && personalizadoModules.length > 0) {
      const { error: modulesError } = await supabaseAdmin
        .from('company_modules')
        .insert(personalizadoModules.map(m => ({ company_id: company.id, module_code: m.code })));
      if (modulesError) {
        console.error('Aviso: falha ao gravar módulos do plano personalizado (não-fatal):', modulesError);
      }
    }

    // Provisiona o customer Asaas (find-or-create) e grava companies.asaas_customer_id.
    // BEST-EFFORT: nunca bloqueia o cadastro — se falhar (chave ausente, sem CNPJ, erro
    // Asaas), apenas registra o aviso. Checkout e backfill recuperam depois. Sem CNPJ a
    // criação falha de propósito (Asaas exige documento); cobramos no checkout.
    try {
      const provision = await provisionAsaasCustomer(supabaseAdmin, {
        id: company.id,
        name: company.name,
        email: company.email,
        cnpj: company.cnpj,
        asaas_customer_id: company.asaas_customer_id,
      });
      if (provision.outcome === 'failed') {
        console.error('[self-register] Asaas customer não provisionado (não-fatal):', provision.error);
      }
    } catch (asaasErr) {
      console.error('[self-register] Exceção ao provisionar customer Asaas (não-fatal):', asaasErr);
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
        JSON.stringify({ error: t.userCreateError(createUserError.message) }),
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

    // Seed catálogo de serviço default (tipos de serviço, status de OS, tipos de tarefa).
    // NÃO-FATAL: se falhar, a empresa já foi criada — apenas registra o erro e segue.
    try {
      const { error: seedCatalogError } = await supabaseAdmin.rpc('seed_company_catalog', {
        p_company_id: company.id,
      });
      if (seedCatalogError) {
        console.error('Aviso: falha ao semear catálogo de serviço (não-fatal):', seedCatalogError);
      }
    } catch (seedErr) {
      console.error('Aviso: exceção ao semear catálogo de serviço (não-fatal):', seedErr);
    }

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
    // Detalhe técnico só no log; ao usuário vai a mensagem genérica no locale dele
    // (não vaza stack/erro cru e respeita o idioma). `t` já é o dicionário do body
    // quando a exceção ocorre depois do parse; senão permanece o default pt-br.
    console.error('[self-register] Erro interno:', error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: t.internalError }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
