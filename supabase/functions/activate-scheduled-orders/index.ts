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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const today = new Date().toISOString().split('T')[0]

    // Update all scheduled orders whose date has arrived to pendente
    const { data, error } = await supabase
      .from('service_orders')
      .update({ status: 'pendente' })
      .eq('status', 'agendada')
      .lte('scheduled_date', today)
      .select('id')

    if (error) throw error

    const count = data?.length ?? 0
    console.log(`Activated ${count} scheduled orders for ${today}`)

    return new Response(
      JSON.stringify({ message: `${count} orders activated`, date: today }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error activating scheduled orders:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
