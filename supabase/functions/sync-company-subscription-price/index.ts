import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { syncCompanySubscriptionPrice } from '../_shared/company-subscription-price-sync.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Autenticação necessária.' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: auth, error: authError } = await supabase.auth.getUser(authHeader.slice(7))
    if (authError || !auth.user) return json({ error: 'Autenticação inválida.' }, 401)

    const [superAdmin, companyPermission] = await Promise.all([
      supabase.rpc('has_role', { _user_id: auth.user.id, _role: 'super_admin' }),
      supabase.rpc('has_admin_permission', { _user_id: auth.user.id, _permission: 'admin_empresas' }),
    ])
    if (superAdmin.error || companyPermission.error) {
      return json({ error: 'Não foi possível validar sua permissão.' }, 503)
    }
    if (!superAdmin.data && !companyPermission.data) return json({ error: 'Acesso negado.' }, 403)

    const body = await req.json()
    const companyId = typeof body.company_id === 'string' ? body.company_id : ''
    if (!companyId) return json({ error: 'Empresa não informada.' }, 400)

    const result = await syncCompanySubscriptionPrice(supabase, companyId, true)
    return json({
      success: result.ok,
      applicable: result.applicable,
      target_monthly_value: result.targetMonthlyValue,
      ...(result.warning ? { warning: result.warning } : {}),
    }, result.ok ? 200 : 409)
  } catch (error) {
    console.error('[sync-company-subscription-price]', error)
    return json({ error: 'Não foi possível sincronizar a cobrança automática agora.' }, 500)
  }
})
