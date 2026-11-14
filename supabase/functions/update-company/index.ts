import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { canonicalizeCompanyOrigin } from '../_shared/company-origin.ts'
import { resolveFirstPaidWhatsappTier } from '../_shared/whatsapp-pricing.ts'
import { syncCompanySubscriptionPrice } from '../_shared/company-subscription-price-sync.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const REQUIRED_CUSTOM = ['basic', 'customer_portal', 'finance_advanced', 'pricing_advanced', 'video_questions']
const EXTRA_USER = 'extra_user'
const INCLUDED_USERS = 5
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

class ValidationError extends Error {}

function normalizeSegments(value: unknown, fallback: unknown): string[] {
  if (value !== undefined && !Array.isArray(value)) {
    throw new ValidationError('Os segmentos informados são inválidos.')
  }

  const raw = Array.isArray(value) ? value : []
  if (raw.some((item) => typeof item !== 'string')) {
    throw new ValidationError('Os segmentos informados são inválidos.')
  }
  const normalized = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)

  if (normalized.length === 0 && typeof fallback === 'string' && fallback.trim()) {
    normalized.push(fallback.trim())
  }

  return [...new Set(normalized)]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autenticado.' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: auth, error: authError } = await supabase.auth.getUser(authHeader.slice(7))
    if (authError || !auth.user) return json({ error: 'Não autenticado.' }, 401)
    const [superAdminResult, companyPermissionResult] = await Promise.all([
      supabase.rpc('has_role', {
        _user_id: auth.user.id,
        _role: 'super_admin',
      }),
      supabase.rpc('has_admin_permission', {
        _user_id: auth.user.id,
        _permission: 'admin_empresas',
      }),
    ])
    if (superAdminResult.error || companyPermissionResult.error) {
      throw new Error('Não foi possível validar sua permissão para editar empresas.')
    }
    if (!superAdminResult.data && !companyPermissionResult.data) {
      return json({ error: 'Você não tem permissão para editar empresas.' }, 403)
    }

    const body = await req.json()
    const companyId = typeof body.company_id === 'string' ? body.company_id : ''
    const planCode = typeof body.subscription_plan === 'string' ? body.subscription_plan.trim() : ''
    if (!companyId || !body.name || !planCode) throw new ValidationError('Empresa, nome e plano são obrigatórios.')

    const isCustom = planCode === 'personalizado'
    const requested: string[] = Array.isArray(body.modules)
      ? body.modules.filter((code: unknown): code is string => typeof code === 'string').map((code: string) => code.trim()).filter(Boolean)
      : []
    const targetCodes = isCustom ? [...new Set([...REQUIRED_CUSTOM, ...requested.filter((code) => code !== EXTRA_USER)])] : []

    let catalogValue = 0
    let targetMaxUsers = Number(body.max_users) || INCLUDED_USERS
    let whatsappTier = 1
    let validModules: string[] = []
    const modulePriceByCode = new Map<string, number>()
    let extraUserPrice = 0

    if (isCustom) {
      const { data: rows, error } = await supabase
        .from('subscription_modules')
        .select('code, price')
        .eq('is_active', true)
        .in('code', [...targetCodes, EXTRA_USER])
      if (error) throw new Error(`Falha ao consultar catálogo: ${error.message}`)
      const byCode = new Map((rows || []).map((row) => [row.code, Number(row.price) || 0]))
      for (const [code, price] of byCode) modulePriceByCode.set(code, price)
      const missing = REQUIRED_CUSTOM.filter((code) => !byCode.has(code))
      if (missing.length) throw new ValidationError('Os módulos obrigatórios do plano personalizado não estão disponíveis.')
      validModules = targetCodes.filter((code) => byCode.has(code))
      catalogValue = validModules.reduce((sum, code) => sum + (byCode.get(code) || 0), 0)

      if (validModules.includes('whatsapp')) {
        const offer = await resolveFirstPaidWhatsappTier(supabase)
        if (!offer) throw new ValidationError('O preço do WhatsApp não está configurado corretamente.')
        whatsappTier = offer.tier
        catalogValue += offer.price - (byCode.get('whatsapp') || 0)
        modulePriceByCode.set('whatsapp', offer.price)
      }
      if (validModules.includes('nfe')) {
        const tier = Math.max(1, Number(body.nfse_tier) || 1)
        const { data: row, error: tierError } = await supabase
          .from('nfse_tiers').select('price').eq('tier', tier).maybeSingle()
        if (tierError || !row) throw new ValidationError('O nível de Notas Fiscais não está configurado corretamente.')
        catalogValue += (Number(row.price) || 0) - (byCode.get('nfe') || 0)
        modulePriceByCode.set('nfe', Number(row.price) || 0)
      }
      targetMaxUsers = Math.max(INCLUDED_USERS, targetMaxUsers)
      extraUserPrice = byCode.get(EXTRA_USER) || 0
      if (!(extraUserPrice > 0)) throw new ValidationError('O preço de usuário adicional não está configurado corretamente.')
      catalogValue += Math.max(0, targetMaxUsers - INCLUDED_USERS) * extraUserPrice
    } else {
      const { data: plan, error } = await supabase
        .from('subscription_plans')
        .select('price, max_users')
        .eq('code', planCode)
        .eq('is_active', true)
        .maybeSingle()
      if (error || !plan || !(Number(plan.price) > 0)) throw new ValidationError('O plano selecionado não está disponível no catálogo.')
      catalogValue = Number(plan.price)
      targetMaxUsers = Number(plan.max_users) || INCLUDED_USERS
    }

    const status = typeof body.subscription_status === 'string' ? body.subscription_status : 'testing'
    const segments = normalizeSegments(body.segments, body.segment)
    const negotiatedPrice = Number(body.custom_price) > 0 ? Number(body.custom_price) : null
    const hasPromotionsPayload = Object.prototype.hasOwnProperty.call(body, 'promotions')
    if (hasPromotionsPayload && !Array.isArray(body.promotions)) {
      throw new ValidationError('As condições promocionais informadas são inválidas.')
    }
    if (Array.isArray(body.promotions) && body.promotions.length > 0 && body.billing_cycle === 'yearly') {
      throw new ValidationError('Condições promocionais por cobrança estão disponíveis somente no ciclo mensal.')
    }
    if (Array.isArray(body.promotions) && body.promotions.length > 0 && negotiatedPrice !== null) {
      throw new ValidationError('Use valor personalizado ou condições promocionais por item, não os dois ao mesmo tempo.')
    }

    const sanitizedPromotions = Array.isArray(body.promotions)
      ? body.promotions.map((raw: unknown) => {
          if (!raw || typeof raw !== 'object') throw new ValidationError('Condição promocional inválida.')
          const item = raw as Record<string, unknown>
          const scopeType = item.scope_type === 'module' || item.scope_type === 'extra_users'
            ? item.scope_type
            : null
          if (!scopeType) throw new ValidationError('O tipo da condição promocional é inválido.')
          const id = typeof item.id === 'string' && UUID_RE.test(item.id) ? item.id : null
          const promotionalUnitPrice = Number(item.promotional_unit_price)
          const billingCycles = Math.floor(Number(item.billing_cycles))
          if (!Number.isFinite(promotionalUnitPrice) || promotionalUnitPrice < 0) {
            throw new ValidationError('O valor promocional deve ser zero ou maior.')
          }
          if (!Number.isInteger(billingCycles) || billingCycles < 1 || billingCycles > 60) {
            throw new ValidationError('Informe entre 1 e 60 cobranças promocionais.')
          }

          let moduleCode: string | null = null
          let quantity = 1
          let standardUnitPrice = 0
          if (scopeType === 'module') {
            moduleCode = typeof item.module_code === 'string' ? item.module_code.trim() : ''
            if (!isCustom || !moduleCode || !validModules.includes(moduleCode) || REQUIRED_CUSTOM.includes(moduleCode)) {
              throw new ValidationError('O módulo promocional precisa ser um adicional contratado.')
            }
            standardUnitPrice = modulePriceByCode.get(moduleCode) || 0
          } else {
            const contractedExtraUsers = Math.max(0, targetMaxUsers - INCLUDED_USERS)
            quantity = Math.floor(Number(item.quantity) || 0)
            if (!isCustom || quantity < 1 || quantity > contractedExtraUsers) {
              throw new ValidationError('A quantidade de usuários promocionais excede os adicionais contratados.')
            }
            standardUnitPrice = extraUserPrice
          }
          if (!(standardUnitPrice > 0) || promotionalUnitPrice > standardUnitPrice) {
            throw new ValidationError('O valor promocional não pode superar o valor normal do adicional.')
          }
          return {
            ...(id ? { id } : {}),
            scope_type: scopeType,
            module_code: moduleCode,
            quantity,
            standard_unit_price: standardUnitPrice,
            promotional_unit_price: Math.round(promotionalUnitPrice * 100) / 100,
            billing_cycles: billingCycles,
            reason: typeof item.reason === 'string' ? item.reason.trim().slice(0, 240) || null : null,
            created_by: auth.user.id,
          }
        })
      : undefined

    if (sanitizedPromotions) {
      const scopeKeys = sanitizedPromotions.map((promotion) =>
        promotion.scope_type === 'module' ? `module:${promotion.module_code}` : 'extra_users',
      )
      if (new Set(scopeKeys).size !== scopeKeys.length) {
        throw new ValidationError('Existe mais de uma condição promocional para o mesmo adicional.')
      }
      const totalDiscount = sanitizedPromotions.reduce(
        (sum, promotion) => sum + (promotion.standard_unit_price - promotion.promotional_unit_price) * promotion.quantity,
        0,
      )
      if (catalogValue - totalDiscount <= 0) {
        throw new ValidationError('A mensalidade total precisa permanecer maior que zero durante a promoção.')
      }
    }
    // Configurar uma promoção pressupõe uma mensalidade-base real. Um trial
    // gratuito só continua com valor zero quando não há item promocional.
    const hasConfiguredPromotions = (sanitizedPromotions?.length ?? 0) > 0
    const isPureTrial = status === 'testing'
      && body.plan_locked !== true
      && negotiatedPrice === null
      && !hasConfiguredPromotions
      && !(Number(body.subscription_value) > 0)
    const canonicalOrigin = await canonicalizeCompanyOrigin(
      supabase,
      typeof body.origin === 'string' ? body.origin : '',
      '[update-company]',
    )

    let affiliateId: string | null = null
    if (typeof body.affiliate_id === 'string' && body.affiliate_id) {
      const { data: affiliate } = await supabase.from('affiliates')
        .select('id').eq('id', body.affiliate_id).eq('is_active', true).maybeSingle()
      affiliateId = affiliate?.id ?? null
    }

    const patch: Record<string, unknown> = {
      name: body.name,
      cnpj: body.cnpj || null,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      contact_name: body.contact_name || null,
      subscription_status: status,
      subscription_plan: planCode,
      subscription_value: isPureTrial ? 0 : catalogValue,
      subscription_expires_at: body.subscription_expires_at || null,
      billing_cycle: body.billing_cycle === 'yearly' ? 'yearly' : 'monthly',
      max_users: targetMaxUsers,
      notes: body.notes || null,
      origin: canonicalOrigin,
      salesperson_id: body.salesperson_id || null,
      sdr_id: null,
      affiliate_id: affiliateId,
      segments,
      segment: segments[0] || null,
      custom_price: negotiatedPrice,
      custom_price_permanent: negotiatedPrice ? body.custom_price_permanent !== false : true,
      custom_price_months: negotiatedPrice && body.custom_price_permanent === false
        ? Math.max(1, Number(body.custom_price_months) || 1)
        : null,
      nfse_tier: validModules.includes('nfe') ? Math.max(1, Number(body.nfse_tier) || 1) : 1,
      whatsapp_tier: validModules.includes('whatsapp') ? whatsappTier : 1,
      plan_locked: !isPureTrial && (body.plan_locked === true || (status === 'testing' && catalogValue > 0)),
    }
    if (hasPromotionsPayload) patch.promotions = sanitizedPromotions ?? []
    const { error: applyError } = await supabase.rpc('admin_apply_company_update', {
      p_company_id: companyId,
      p_patch: patch,
      p_modules: isCustom ? validModules : [],
    })
    if (applyError) throw new Error(`Não foi possível salvar a empresa: ${applyError.message}`)

    let asaasWarning: string | undefined
    if (hasPromotionsPayload && !isPureTrial) {
      try {
        const sync = await syncCompanySubscriptionPrice(supabase, companyId, true)
        asaasWarning = sync.warning
      } catch (syncError) {
        console.error('[update-company] mensalidade salva, sincronização pendente:', syncError)
        asaasWarning = 'A condição promocional foi salva, mas a cobrança automática precisa de nova sincronização.'
      }
    }

    return json({
      success: true,
      subscription_value: isPureTrial ? 0 : catalogValue,
      ...(asaasWarning ? { asaas_warning: asaasWarning } : {}),
    })
  } catch (error) {
    console.error('[update-company]', error)
    const status = error instanceof ValidationError ? 400 : 500
    return json({ error: error instanceof Error ? error.message : 'Erro interno.' }, status)
  }
})
