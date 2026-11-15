import { authorizeFiscalManager, corsHeaders, jsonResponse } from '../_shared/fiscal-auth.ts';

const integer = (value: unknown, fallback: number) => {
  const result = Number(value); return Number.isInteger(result) ? result : fallback;
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed', message: 'Método não permitido.' }, 405);
  const auth = await authorizeFiscalManager(req); if (!auth.ok) return auth.response;
  try {
    const body = object(await req.json()); const nfe = object(body.nfe); const nfce = object(body.nfce);
    const nfeSeries = integer(nfe.series, 1); const nfceSeries = integer(nfce.series, 1); const uf = text(nfce.uf).toUpperCase();
    if (nfeSeries < 0 || nfeSeries > 889 || nfceSeries < 1 || nfceSeries > 889) return jsonResponse({ error: 'invalid_series', message: 'Revise as séries de NF-e e NFC-e.' }, 422);
    if (nfce.enabled === true && !/^[A-Z]{2}$/.test(uf)) return jsonResponse({ error: 'invalid_uf', message: 'Informe a UF de credenciamento da NFC-e.' }, 422);

    // Aprovações e próximo número nunca vêm do browser. O upsert atualiza só
    // a intenção do tenant e preserva os gates administrados pelo backend.
    const [nfeResult, nfceResult] = await Promise.all([
      auth.supabase.from('company_nfe_settings').upsert({
        company_id: auth.companyId, enabled: nfe.enabled === true, series: nfeSeries,
        default_operation_nature: text(nfe.defaultOperationNature) || null,
      }, { onConflict: 'company_id' }),
      auth.supabase.from('company_nfce_settings').upsert({
        company_id: auth.companyId, enabled: nfce.enabled === true, series: nfceSeries, uf: uf || null,
      }, { onConflict: 'company_id' }),
    ]);
    if (nfeResult.error || nfceResult.error) {
      console.error('[fiscal-goods-settings] save', { nfe: nfeResult.error?.message, nfce: nfceResult.error?.message, company: auth.companyId.slice(0, 8) });
      return jsonResponse({ error: 'save_failed', message: 'Não foi possível salvar as configurações fiscais agora.' }, 500);
    }
    return jsonResponse({ ok: true }, 200);
  } catch (error) {
    console.error('[fiscal-goods-settings] unexpected', { message: (error as Error).message });
    return jsonResponse({ error: 'internal_error', message: 'Não foi possível salvar as configurações fiscais agora.' }, 500);
  }
});
