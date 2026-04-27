import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id')
      .eq('is_active', true);

    if (empError) throw empError;
    if (!employees || employees.length === 0) {
      return new Response(JSON.stringify({ message: 'No active employees', generated: 0 }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    let totalGenerated = 0;
    for (const emp of employees) {
      const { data, error } = await supabase.rpc('generate_payroll_for_employee', {
        p_employee_id: emp.id,
        p_lookahead_days: 35,
      });
      if (error) {
        console.error(`Error generating payroll for ${emp.id}:`, error);
        continue;
      }
      totalGenerated += Number(data ?? 0);
    }

    return new Response(JSON.stringify({ message: 'Payroll generated', generated: totalGenerated }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-payroll:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
