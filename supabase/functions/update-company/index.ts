import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { canonicalizeCompanyOrigin } from '../_shared/company-origin.ts'
import { resolveFirstPaidWhatsappTier } from '../_shared/whatsapp-pricing.ts'

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

class ValidationError extends Error {}

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
    const { data: isSuperAdmin } = await supabase.rpc('has_role', {
      _user_id: auth.user.id,
      _role: 'super_admin',
    })
    if (!isSuperAdmin) return json({ error: 'Apenas administradores podem editar empresas.' }, 403)

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

    if (isCustom) {
      const { data: rows, error } = await supabase
        .from('subscription_modules')
        .select('code, price')
        .eq('is_active', true)
        .in('code', [...targetCodes, EXTRA_USER])
      if (error) throw new Error(`Falha ao consultar catálogo: ${error.message}`)
      const byCode = new Map((rows || []).map((row) => [row.code, Number(row.price) || 0]))
      const missing = REQUIRED_CUSTOM.filter((code) => !byCode.has(code))
      if (missing.length) throw new ValidationError('Os módulos obrigatórios do plano personalizado não estão disponíveis.')
      validModules = targetCodes.filter((code) => byCode.has(code))
      catalogValue = validModules.reduce((sum, code) => sum + (byCode.get(code) || 0), 0)

      if (validModules.includes('whatsapp')) {
        const offer = await resolveFirstPaidWhatsappTier(supabase)
        if (!offer) throw new ValidationError('O preço do WhatsApp não está configurado corretamente.')
        whatsappTier = offer.tier
        catalogValue += offer.price - (byCode.get('whatsapp') || 0)
      }
      if (validModules.includes('nfe')) {
        const tier = Math.max(1, Number(body.nfse_tier) || 1)
        const { data: row, error: tierError } = await supabase
          .from('nfse_tiers').select('price').eq('tier', tier).maybeSingle()
        if (tierError || !row) throw new ValidationError('O nível de Notas Fiscais não está configurado corretamente.')
        catalogValue += (Number(row.price) || 0) - (byCode.get('nfe') || 0)
      }
      targetMaxUsers = Math.max(INCLUDED_USERS, targetMaxUsers)
      const extraUserPrice = byCode.get(EXTRA_USER) || 0
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
    const negotiatedPrice = Number(body.custom_price) > 0 ? Number(body.custom_price) : null
    const isPureTrial = status === 'testing' && body.plan_locked !== true && negotiatedPrice === null && !(Number(body.subscription_value) > 0)
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

    const patch = {
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
      segment: body.segment || null,
      custom_price: negotiatedPrice,
      custom_price_permanent: negotiatedPrice ? body.custom_price_permanent !== false : true,
      custom_price_months: negotiatedPrice && body.custom_price_permanent === false
        ? Math.max(1, Number(body.custom_price_months) || 1)
        : null,
      nfse_tier: validModules.includes('nfe') ? Math.max(1, Number(body.nfse_tier) || 1) : 1,
      whatsapp_tier: validModules.includes('whatsapp') ? whatsappTier : 1,
      plan_locked: !isPureTrial && (body.plan_locked === true || (status === 'testing' && catalogValue > 0)),
    }
    const { error: applyError } = await supabase.rpc('admin_apply_company_update', {
      p_company_id: companyId,
      p_patch: patch,
      p_modules: isCustom ? validModules : [],
    })
    if (applyError) throw new Error(`Não foi possível salvar a empresa: ${applyError.message}`)

    return json({ success: true, subscription_value: isPureTrial ? 0 : catalogValue })
  } catch (error) {
    console.error('[update-company]', error)
    const status = error instanceof ValidationError ? 400 : 500
    return json({ error: error instanceof Error ? error.message : 'Erro interno.' }, status)
  }
})
