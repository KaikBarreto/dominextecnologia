import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { provisionAsaasCustomer } from '../_shared/asaas-customer.ts'
import { isValidBrazilianPhone } from '../_shared/phone-validation.ts'
import { canonicalizeCompanyOrigin } from '../_shared/company-origin.ts'
import { resolveFirstPaidWhatsappTier } from '../_shared/whatsapp-pricing.ts'
import { ensureDefaultFinancialAccounts } from '../_shared/default-financial-accounts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

function normalizeSegments(value: unknown, fallback: unknown): string[] {
  const raw = Array.isArray(value) ? value : []
  const normalized = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)

  if (normalized.length === 0 && typeof fallback === 'string' && fallback.trim()) {
    normalized.push(fallback.trim())
  }

  return [...new Set(normalized)]
}

const REQUIRED_PERSONALIZED_MODULE_CODES = [
  'basic',
  'customer_portal',
  'finance_advanced',
  'pricing_advanced',
  'video_questions',
] as const
const EXTRA_USER_MODULE_CODE = 'extra_user'
const CUSTOM_PLAN_INCLUDED_USERS = 5

const COUNTRY_REGIONAL_DEFAULTS: Record<string, { language: string; currency: string; timezone: string }> = {
  BR: { language: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' },
  CV: { language: 'pt-br', currency: 'CVE', timezone: 'Atlantic/Cape_Verde' },
  PT: { language: 'pt-br', currency: 'EUR', timezone: 'Europe/Lisbon' },
  AO: { language: 'pt-br', currency: 'AOA', timezone: 'Africa/Luanda' },
  MZ: { language: 'pt-br', currency: 'MZN', timezone: 'Africa/Maputo' },
  ST: { language: 'pt-br', currency: 'STN', timezone: 'Africa/Sao_Tome' },
  GW: { language: 'pt-br', currency: 'XOF', timezone: 'Africa/Bissau' },
  TL: { language: 'pt-br', currency: 'USD', timezone: 'Asia/Dili' },
  US: { language: 'en', currency: 'USD', timezone: 'America/New_York' },
  GB: { language: 'en', currency: 'GBP', timezone: 'Europe/London' },
  CA: { language: 'en', currency: 'CAD', timezone: 'America/Toronto' },
  AU: { language: 'en', currency: 'AUD', timezone: 'Australia/Sydney' },
  ES: { language: 'es', currency: 'EUR', timezone: 'Europe/Madrid' },
  MX: { language: 'es', currency: 'MXN', timezone: 'America/Mexico_City' },
  AR: { language: 'es', currency: 'ARS', timezone: 'America/Argentina/Buenos_Aires' },
  CL: { language: 'es', currency: 'CLP', timezone: 'America/Santiago' },
  CO: { language: 'es', currency: 'COP', timezone: 'America/Bogota' },
  PE: { language: 'es', currency: 'PEN', timezone: 'America/Lima' },
  UY: { language: 'es', currency: 'UYU', timezone: 'America/Montevideo' },
  PY: { language: 'es', currency: 'PYG', timezone: 'America/Asuncion' },
  BO: { language: 'es', currency: 'BOB', timezone: 'America/La_Paz' },
  FR: { language: 'fr', currency: 'EUR', timezone: 'Europe/Paris' },
  BE: { language: 'fr', currency: 'EUR', timezone: 'Europe/Brussels' },
  CH: { language: 'fr', currency: 'CHF', timezone: 'Europe/Zurich' },
  DE: { language: 'en', currency: 'EUR', timezone: 'Europe/Berlin' },
  IT: { language: 'en', currency: 'EUR', timezone: 'Europe/Rome' },
  JP: { language: 'en', currency: 'JPY', timezone: 'Asia/Tokyo' },
}

const resolveCountryCode = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return COUNTRY_REGIONAL_DEFAULTS[normalized] ? normalized : 'BR'
}

const isValidInternationalPhone = (phone: string): boolean => {
  if (!/^[+\d\s().-]+$/.test(phone)) return false
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type AdminClient = SupabaseClient

async function rollbackCreationUserOnly(supabaseAdmin: AdminClient, userId: string | null) {
  if (!userId) return
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error && !error.message.toLowerCase().includes('not found')) {
    console.error('[create-company] Falha ao desfazer usuário:', error.message)
  }
}

async function rollbackCreation(
  supabaseAdmin: AdminClient,
  companyId: string | null,
  userId: string | null,
  idempotencyKey: string | null,
) {
  // O usuario pode existir sem profile vinculado quando a falha acontece no
  // meio do fluxo; por isso a Auth API e chamada mesmo que a RPC tambem saiba
  // apagar usuarios ja ligados ao tenant.
  await rollbackCreationUserOnly(supabaseAdmin, userId)

  if (companyId && idempotencyKey) {
    const { error } = await supabaseAdmin.rpc('rollback_admin_company_creation', {
      p_company_id: companyId,
      p_idempotency_key: idempotencyKey,
    })
    if (error) {
      console.error('[create-company] Falha no rollback atômico da empresa:', error.message)
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  let supabaseAdmin: AdminClient | null = null
  let createdCompanyId: string | null = null
  let createdUserId: string | null = null
  let creationIdempotencyKey: string | null = null

  try {
    supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Esta edge usa service role e cria tenant + usuario. A autorizacao precisa
    // acontecer antes de ler/processar o payload e falhar fechada se qualquer
    // uma das verificacoes nao puder ser concluida.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autenticado.' }, 401)

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
    if (authError || !caller) return json({ error: 'Não autenticado.' }, 401)

    const [superAdminResult, companyPermissionResult] = await Promise.all([
      supabaseAdmin.rpc('has_role', {
        _user_id: caller.id,
        _role: 'super_admin',
      }),
      supabaseAdmin.rpc('has_admin_permission', {
        _user_id: caller.id,
        _permission: 'admin_empresas',
      }),
    ])
    if (superAdminResult.error || companyPermissionResult.error) {
      console.error('[create-company] Falha ao validar permissao do solicitante', {
        role: superAdminResult.error?.message,
        permission: companyPermissionResult.error?.message,
      })
      return json({ error: 'Não foi possível validar sua permissão para criar empresas. Tente novamente.' }, 503)
    }
    if (!superAdminResult.data && !companyPermissionResult.data) {
      return json({ error: 'Você não tem permissão para criar empresas.' }, 403)
    }

    const body = await req.json()
    const {
      company_name,
      company_cnpj,
      company_email,
      company_phone,
      country_code,
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
      sdr_id,
      affiliate_id,
      segment,
      segments,
      custom_price,
      custom_price_permanent,
      custom_price_months,
      modules,
      custom_price_note,
      nfse_tier,
      plan_locked,
      idempotency_key,
    } = body

    if (idempotency_key !== undefined && (typeof idempotency_key !== 'string' || !UUID_PATTERN.test(idempotency_key))) {
      return json({ error: 'Não foi possível validar esta tentativa de criação. Feche o formulário e tente novamente.' }, 400)
    }
    creationIdempotencyKey = typeof idempotency_key === 'string'
      ? idempotency_key
      : crypto.randomUUID()

    const countryCode = resolveCountryCode(country_code)
    const regionalDefaults = COUNTRY_REGIONAL_DEFAULTS[countryCode]
    if (
      (segments !== undefined && !Array.isArray(segments))
      || (Array.isArray(segments) && segments.some((item: unknown) => typeof item !== 'string'))
    ) {
      return new Response(JSON.stringify({ error: 'Os segmentos informados são inválidos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const normalizedSegments = normalizeSegments(segments, segment)

    if (!company_name || !admin_email || !admin_password) {
      return new Response(JSON.stringify({ error: 'Nome da empresa, e-mail e senha do administrador são obrigatórios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Retry depois de timeout/resposta perdida: devolve a empresa concluida.
    // Se a primeira requisicao ainda esta trabalhando, nao inicia outra cadeia
    // de efeitos colaterais em paralelo.
    if (typeof idempotency_key === 'string') {
      const { data: existingCreation, error: existingCreationError } = await supabaseAdmin
        .from('companies')
        .select('id, creation_requested_by, creation_completed_at')
        .eq('creation_idempotency_key', creationIdempotencyKey)
        .maybeSingle()

      if (existingCreationError) {
        console.error('[create-company] Falha ao consultar chave idempotente:', existingCreationError.message)
        return json({ error: 'Não foi possível validar esta tentativa de criação. Tente novamente.' }, 503)
      }
      if (existingCreation) {
        if (existingCreation.creation_requested_by !== caller.id) {
          return json({ error: 'Esta tentativa de criação não é válida para o usuário atual.' }, 409)
        }
        if (existingCreation.creation_completed_at) {
          return json({ success: true, company_id: existingCreation.id, idempotent: true })
        }
        return json({ error: 'A empresa já está sendo criada. Aguarde alguns instantes.' }, 409)
      }
    }

    const phoneIsValid = !company_phone || (countryCode === 'BR'
      ? isValidBrazilianPhone(company_phone)
      : isValidInternationalPhone(company_phone))
    if (!phoneIsValid) {
      return new Response(JSON.stringify({ error: 'Informe um telefone válido, com código do país quando necessário' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Sanitiza os módulos antes de criar o tenant. O Personalizado sempre inclui
    // Basic, Portal do Cliente, Precificação Avançada e Perguntas em Vídeo,
    // mesmo quando o painel ou um payload antigo omite.
    // Planos prontos preservam o comportamento anterior e não recebem extras.
    const isPersonalizado = typeof subscription_plan === 'string'
      && subscription_plan.trim().toLowerCase() === 'personalizado'
    const requestedModuleCodes = Array.isArray(modules)
      ? [...new Set(
        modules
          .filter((module: unknown): module is string => typeof module === 'string')
          .map((module: string) => module.trim().slice(0, 50))
          .filter(Boolean),
      )]
      : []
    const moduleCodesToValidate = isPersonalizado
      ? [...new Set([...REQUIRED_PERSONALIZED_MODULE_CODES, ...requestedModuleCodes])]
      : requestedModuleCodes
    let validModuleCodes: string[] = []
    let resolvedWhatsappTier = 1
    let resolvedWhatsappPrice = 0
    let moduleCatalog: Array<{ code: string; price: number | null }> = []

    if (moduleCodesToValidate.length > 0) {
      const { data: catalog, error: catalogError } = await supabaseAdmin
        .from('subscription_modules')
        .select('code, price')
        .eq('is_active', true)
        .in('code', [...new Set([...moduleCodesToValidate, EXTRA_USER_MODULE_CODE])])

      if (catalogError) {
        console.error('[create-company] Falha ao validar módulos:', catalogError.message)
        if (isPersonalizado) {
          return new Response(JSON.stringify({ error: 'Não foi possível validar os módulos obrigatórios do plano personalizado.' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } else {
        moduleCatalog = (catalog || []) as Array<{ code: string; price: number | null }>
        validModuleCodes = moduleCatalog
          .filter((item) => item.code !== EXTRA_USER_MODULE_CODE)
          .map((item) => item.code)
      }

      if (isPersonalizado) {
        const validCodes = new Set(validModuleCodes)
        const missingRequired = REQUIRED_PERSONALIZED_MODULE_CODES.filter((code) => !validCodes.has(code))
        if (missingRequired.length > 0) {
          console.error(`[create-company] Catálogo incompleto para plano personalizado: ${missingRequired.join(', ')}`)
          return new Response(JSON.stringify({ error: 'Os módulos obrigatórios do plano personalizado não estão disponíveis.' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        if (validModuleCodes.includes('whatsapp')) {
          try {
            const whatsappOffer = await resolveFirstPaidWhatsappTier(supabaseAdmin)
            if (!whatsappOffer) throw new Error('nível pago ausente')
            resolvedWhatsappTier = whatsappOffer.tier
            resolvedWhatsappPrice = whatsappOffer.price
          } catch (whatsappError) {
            console.error('[create-company] Falha ao resolver preço do WhatsApp:', whatsappError)
            return new Response(JSON.stringify({ error: 'O preço do módulo de WhatsApp não está configurado corretamente.' }), {
              status: 503,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        }
      }
    }

    // Preço-base sempre nasce do catálogo no servidor. O client só pode
    // sobrescrever o que será cobrado quando manda `custom_price` explícito.
    let catalogSubscriptionValue = 0
    let catalogMaxUsers = Number(max_users) || CUSTOM_PLAN_INCLUDED_USERS
    if (isPersonalizado) {
      const requestedSet = new Set(validModuleCodes)
      catalogSubscriptionValue = moduleCatalog
        .filter((item) => item.code !== EXTRA_USER_MODULE_CODE && requestedSet.has(item.code))
        .reduce((sum, item) => {
          if (item.code === 'whatsapp') return sum + resolvedWhatsappPrice
          return sum + (Number(item.price) || 0)
        }, 0)

      if (validModuleCodes.includes('nfe')) {
        const requestedTier = Math.max(1, Number(nfse_tier) || 1)
        const { data: tierRow, error: tierError } = await supabaseAdmin
          .from('nfse_tiers')
          .select('price')
          .eq('tier', requestedTier)
          .maybeSingle()
        if (tierError || !tierRow) {
          return new Response(JSON.stringify({ error: 'O nível de Notas Fiscais não está configurado corretamente.' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const baseNfsePrice = Number(moduleCatalog.find((item) => item.code === 'nfe')?.price) || 0
        catalogSubscriptionValue += (Number(tierRow.price) || 0) - baseNfsePrice
      }

      catalogMaxUsers = Math.max(CUSTOM_PLAN_INCLUDED_USERS, Number(max_users) || CUSTOM_PLAN_INCLUDED_USERS)
      const extraUserPrice = Number(moduleCatalog.find((item) => item.code === EXTRA_USER_MODULE_CODE)?.price) || 0
      if (!(extraUserPrice > 0)) {
        return new Response(JSON.stringify({ error: 'O preço de usuário adicional não está configurado corretamente.' }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      catalogSubscriptionValue += Math.max(0, catalogMaxUsers - CUSTOM_PLAN_INCLUDED_USERS) * extraUserPrice
    } else {
      const { data: planRow, error: planError } = await supabaseAdmin
        .from('subscription_plans')
        .select('price, max_users')
        .eq('code', subscription_plan || 'start')
        .eq('is_active', true)
        .maybeSingle()
      if (planError || !planRow || !(Number(planRow.price) > 0)) {
        return new Response(JSON.stringify({ error: 'O plano selecionado não está disponível no catálogo.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      catalogSubscriptionValue = Number(planRow.price)
      catalogMaxUsers = Number(planRow.max_users) || CUSTOM_PLAN_INCLUDED_USERS
    }

    // Observação automática de valor personalizado: o frontend manda a nota
    // pronta (valor, "até quando", quem deu) e a edge anexa às observações.
    let finalNotes: string | null = notes || null
    if (custom_price_note && typeof custom_price_note === 'string') {
      const noteText = custom_price_note.slice(0, 500)
      finalNotes = finalNotes ? `${finalNotes}\n\n${noteText}` : noteText
    }

    // Origem de captação: mesma canonização do cadastro público (catálogo
    // `company_origins`). Aqui o risco é menor, porque quem chama é o painel
    // master e a origem vem de um Select alimentado pela própria tabela, mas é o
    // mesmo campo e o mesmo relatório: deixar um dos dois caminhos sem trava é
    // garantir que daqui a seis meses alguém precise redescobrir qual era qual.
    const canonicalOrigin = await canonicalizeCompanyOrigin(
      supabaseAdmin,
      typeof origin === 'string' ? origin : '',
      '[create-company]',
    )

    // Afiliado vinculado (Programa de Afiliados): o painel master só lista
    // afiliados ATIVOS no select (useAffiliates()), mas nunca confiamos no
    // client puro — valida aqui que o id existe e segue ativo antes de gravar.
    // Resolve só por uuid: quem chama esta edge é o painel, que sempre manda o
    // id real (slug é só pro link público / self-register).
    let validAffiliateId: string | null = null
    if (typeof affiliate_id === 'string' && affiliate_id.trim()) {
      const { data: affiliateRow, error: affiliateError } = await supabaseAdmin
        .from('affiliates')
        .select('id, is_active')
        .eq('id', affiliate_id.trim())
        .maybeSingle()
      if (affiliateError) {
        console.error('[create-company] Falha ao validar affiliate_id; gravando null (não-fatal):', affiliateError.message)
      } else if (affiliateRow?.is_active === true) {
        validAffiliateId = affiliateRow.id
      } else {
        console.log(`[create-company] affiliate_id "${affiliate_id}" não encontrado ou inativo — gravando null.`)
      }
    }

    // Cria o usuario ANTES do tenant. O e-mail de Auth ja e unico e funciona
    // como primeira barreira contra cliques/retries concorrentes: chamadas
    // perdedoras falham sem deixar uma empresa parcial no banco.
    const { data: newUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: admin_email,
      password: admin_password,
      email_confirm: true,
      user_metadata: { full_name: contact_name || company_name },
    })

    if (userError) {
      const isDuplicate = userError.message.toLowerCase().includes('already')
        || userError.message.toLowerCase().includes('duplicate')
      console.error('[create-company] Falha ao criar usuário administrador:', userError.message)
      return json({
        error: isDuplicate
          ? 'Este e-mail já está cadastrado no sistema.'
          : 'Não foi possível criar o acesso do administrador. Tente novamente.',
      }, 400)
    }

    createdUserId = newUser.user.id
    const userId = createdUserId

    // 1. Create the company. A chave unica e a barreira definitiva quando
    // duas chamadas usam administradores diferentes ou o retry chega depois
    // da criacao do usuario, mas antes da resposta HTTP anterior.
    const isPureTrial = (subscription_status || 'testing') === 'testing'
      && plan_locked !== true
      && !(Number(custom_price) > 0)
      && !(Number(subscription_value) > 0)
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name: company_name,
        cnpj: company_cnpj || null,
        email: company_email || admin_email,
        phone: company_phone || null,
        address: company_address || null,
        contact_name: contact_name || null,
        notes: finalNotes,
        subscription_status: subscription_status || 'testing',
        subscription_plan: subscription_plan || 'start',
        subscription_value: isPureTrial ? 0 : catalogSubscriptionValue,
        subscription_expires_at: subscription_expires_at || null,
        billing_cycle: billing_cycle || 'monthly',
        max_users: catalogMaxUsers,
        origin: canonicalOrigin,
        salesperson_id: salesperson_id || null,
        sdr_id: sdr_id || null,
        affiliate_id: validAffiliateId,
        segments: normalizedSegments,
        segment: normalizedSegments[0] || null,
        custom_price: custom_price ?? null,
        custom_price_permanent: custom_price_permanent ?? true,
        custom_price_months: custom_price_months ?? null,
        nfse_tier: nfse_tier ?? 1,
        whatsapp_tier: resolvedWhatsappTier,
        plan_locked: !isPureTrial && (plan_locked === true || (subscription_status === 'testing' && Number(subscription_value) > 0)),
        creation_idempotency_key: creationIdempotencyKey,
        creation_requested_by: caller.id,
      })
      .select('id')
      .single()

    if (companyError) {
      console.error('Error creating company:', companyError)
      await rollbackCreationUserOnly(supabaseAdmin, createdUserId)
      createdUserId = null

      if (companyError.code === '23505' && creationIdempotencyKey) {
        const { data: existing } = await supabaseAdmin
          .from('companies')
          .select('id, creation_completed_at, creation_requested_by')
          .eq('creation_idempotency_key', creationIdempotencyKey)
          .maybeSingle()
        if (existing?.creation_requested_by === caller.id && existing.creation_completed_at) {
          return json({ success: true, company_id: existing.id, idempotent: true })
        }
        return json({ error: 'A empresa já está sendo criada. Aguarde alguns instantes.' }, 409)
      }

      throw new Error('Não foi possível criar a empresa.')
    }
    createdCompanyId = company.id

    // 1a. Grava apenas códigos ativos e previamente validados. No Personalizado,
    //     falha e desfaz o tenant se o contrato de módulos não puder ser salvo.
    if (validModuleCodes.length > 0) {
      const { error: modulesError } = await supabaseAdmin
        .from('company_modules')
        .insert(validModuleCodes.map((code: string) => ({ company_id: company.id, module_code: code })))
      if (modulesError) {
        console.error('[create-company] Falha ao gravar company_modules:', modulesError.message)
        if (isPersonalizado) {
          await rollbackCreation(supabaseAdmin, createdCompanyId, createdUserId, creationIdempotencyKey)
          createdCompanyId = null
          createdUserId = null
          return new Response(JSON.stringify({ error: 'Não foi possível configurar os módulos obrigatórios da empresa.' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // Wait for trigger to create profile
    await new Promise(resolve => setTimeout(resolve, 500))

    // 3. Link profile to company. O select prova que o trigger de Auth criou o
    // profile; update sem linha afetada nao pode ser tratado como sucesso.
    const { data: linkedProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ company_id: company.id, phone: company_phone || null })
      .eq('user_id', userId)
      .select('user_id')
      .maybeSingle()
    if (profileError || !linkedProfile) {
      throw new Error('Não foi possível vincular o administrador à empresa.')
    }

    // 4. Assign admin role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' })
    if (roleError) throw new Error('Não foi possível configurar o perfil administrador.')

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

    const { error: permissionsError } = await supabaseAdmin
      .from('user_permissions')
      .insert({
        user_id: userId,
        permissions: allPermissions,
        is_active: true,
      })
    if (permissionsError) throw new Error('Não foi possível configurar as permissões do administrador.')

    // 6. O trigger de companies normalmente já cria esta linha. Upsert evita a
    // inserção redundante/erro UNIQUE e aplica os defaults regionais do país.
    const { error: settingsError } = await supabaseAdmin
      .from('company_settings')
      .upsert({
        company_id: company.id,
        name: company_name,
        document: company_cnpj || null,
        phone: company_phone || null,
        email: company_email || admin_email,
        country_code: countryCode,
        language: regionalDefaults.language,
        currency: regionalDefaults.currency,
        timezone: regionalDefaults.timezone,
        segments: normalizedSegments,
        segment: normalizedSegments[0] || null,
      }, { onConflict: 'company_id' })
    if (settingsError) {
      console.error('[create-company] Falha ao configurar regional:', settingsError.message)
      await rollbackCreation(supabaseAdmin, createdCompanyId, createdUserId, creationIdempotencyKey)
      createdCompanyId = null
      createdUserId = null
      return new Response(JSON.stringify({ error: 'Não foi possível configurar os padrões regionais da empresa.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // O primeiro usuário herda o idioma do país até escolher outro no app.
    const { error: preferenceError } = await supabaseAdmin
      .from('user_preferences')
      .upsert(
        { user_id: userId, language: regionalDefaults.language },
        { onConflict: 'user_id' },
      )
    if (preferenceError) {
      console.error('[create-company] Aviso: falha ao semear idioma do administrador:', preferenceError.message)
    }

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
    // ⚠️ ORDEM DE DEPLOY: este trecho só pode ir pro ar DEPOIS da migration
    //    20260919190000 (que cria o UNIQUE (company_id, name)). Sem o índice,
    //    ON CONFLICT (company_id, name) estoura 42P10 e derruba o cadastro.
    // upsert + ignoreDuplicates (nao insert cego): `financial_categories` tem
    // UNIQUE (company_id, name). O gatilho trg_seed_system_financial_categories
    // ja semeou as categorias de sistema no INSERT da empresa, e esta funcao
    // pode ser reexecutada (retry do cliente, timeout, reenvio do formulario).
    // Com .insert() puro, a segunda passada estouraria 23505 e derrubaria o
    // cadastro de empresa nova — caminho critico. ignoreDuplicates = ON CONFLICT
    // DO NOTHING: nao sobrescreve o que ja existe, nao duplica, nao quebra.
    const { error: categoriesError } = await supabaseAdmin
      .from('financial_categories')
      .upsert(
        defaultCategories.map(c => ({ ...c, company_id: company.id })),
        { onConflict: 'company_id,name', ignoreDuplicates: true },
      )
    if (categoriesError) throw new Error('Não foi possível configurar as categorias financeiras iniciais.')

    // 8. Fallback idempotente. A garantia canônica é o trigger em companies;
    // este passo mantém o deploy seguro se a Edge chegar antes da migration.
    const { error: accountsError } = await ensureDefaultFinancialAccounts(supabaseAdmin, company.id)
    if (accountsError) throw new Error('Não foi possível configurar as contas financeiras iniciais.')

    // 9. Seed catálogo de serviço default (tipos de serviço, status de OS, tipos de tarefa).
    //    NÃO-FATAL: se falhar, a empresa já foi criada — apenas registra o erro e segue.
    try {
      const { error: seedCatalogError } = await supabaseAdmin.rpc('seed_company_catalog', {
        p_company_id: company.id,
      })
      if (seedCatalogError) {
        console.error('Aviso: falha ao semear catálogo de serviço (não-fatal):', seedCatalogError)
      }
    } catch (seedErr) {
      console.error('Aviso: exceção ao semear catálogo de serviço (não-fatal):', seedErr)
    }

    // Provisionamento externo fica por ultimo: se qualquer etapa obrigatoria
    // anterior falhar, o rollback nao deixa customer orfao no Asaas.
    // Continua BEST-EFFORT; checkout e backfill recuperam indisponibilidade.
    try {
      const provision = await provisionAsaasCustomer(supabaseAdmin, {
        id: company.id,
        name: company_name,
        email: company_email || admin_email,
        cnpj: company_cnpj || null,
        asaas_customer_id: null,
        address: company_address || null,
        billing_notifications_enabled: false,
        billing_email: null,
      })
      if (provision.outcome === 'failed') {
        console.error('[create-company] Asaas customer não provisionado (não-fatal):', provision.error)
      }
    } catch (asaasErr) {
      console.error('[create-company] Exceção ao provisionar customer Asaas (não-fatal):', asaasErr)
    }

    const { error: completionError } = await supabaseAdmin
      .from('companies')
      .update({ creation_completed_at: new Date().toISOString() })
      .eq('id', company.id)
      .eq('creation_idempotency_key', creationIdempotencyKey)
      .select('id')
      .single()
    if (completionError) throw new Error('Não foi possível concluir o registro idempotente da empresa.')

    // A partir daqui o catch nao deve desfazer uma criacao concluida.
    createdCompanyId = null
    createdUserId = null

    return new Response(JSON.stringify({
      success: true, 
      company_id: company.id, 
      user_id: userId 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('create-company error:', error)
    if (supabaseAdmin && (createdCompanyId || createdUserId)) {
      await rollbackCreation(supabaseAdmin, createdCompanyId, createdUserId, creationIdempotencyKey)
    }
    return new Response(JSON.stringify({ error: 'Não foi possível criar a empresa. Tente novamente.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
