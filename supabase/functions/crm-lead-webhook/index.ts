import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const pickString = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const pickNumber = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const normalized = value.replace(',', '.').trim();
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const url = new URL(req.url);
    const token = url.searchParams.get('token') || req.headers.get('x-webhook-token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token do webhook é obrigatório' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: webhook, error: webhookError } = await supabaseAdmin
      .from('crm_webhooks')
      .select('id, name, origin, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .maybeSingle();

    if (webhookError) throw webhookError;
    if (!webhook) {
      return new Response(JSON.stringify({ error: 'Webhook inválido ou inativo' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const payload = typeof body === 'object' && body !== null
      ? (typeof body.lead === 'object' && body.lead !== null ? body.lead as Record<string, unknown> : body as Record<string, unknown>)
      : {};

    const name = pickString(payload, ['name', 'full_name', 'nome']);
    const phone = pickString(payload, ['phone', 'phone_number', 'telefone', 'whatsapp']);
    const email = pickString(payload, ['email']);
    const title = pickString(payload, ['title', 'titulo', 'subject']) || `Lead via ${webhook.name}`;
    const details = pickString(payload, ['notes', 'observations', 'message', 'mensagem']);
    const incomingSource = pickString(payload, ['source', 'origem']);
    const value = pickNumber(payload, ['value', 'valor']);

    const source = webhook.origin || incomingSource || 'Webhook Externo';

    const requestedStageId = pickString(payload, ['stage_id']);

    let stageId: string | null = null;
    if (requestedStageId) {
      const { data: requestedStage } = await supabaseAdmin
        .from('crm_stages')
        .select('id')
        .eq('id', requestedStageId)
        .maybeSingle();
      stageId = requestedStage?.id ?? null;
    }

    if (!stageId) {
      const { data: defaultStage } = await supabaseAdmin
        .from('crm_stages')
        .select('id')
        .eq('is_won', false)
        .eq('is_lost', false)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();

      stageId = defaultStage?.id ?? null;
    }

    const notes = [
      details,
      name ? `Nome: ${name}` : null,
      phone ? `Telefone: ${phone}` : null,
      email ? `Email: ${email}` : null,
      `Origem webhook: ${webhook.name}`,
      `Payload bruto: ${JSON.stringify(body)}`,
    ]
      .filter(Boolean)
      .join('\n');

    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .insert({
        title,
        source,
        stage_id: stageId,
        status: 'lead',
        notes,
        value: value ?? null,
      })
      .select('id, title, source, stage_id')
      .single();

    if (leadError) throw leadError;

    return new Response(
      JSON.stringify({ success: true, lead }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('crm-lead-webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
