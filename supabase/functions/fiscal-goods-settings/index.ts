import { authorizeFiscalManager, corsHeaders, jsonResponse } from '../_shared/fiscal-auth.ts';
import { isValidDocument } from '../_shared/document-validation.ts';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const digits = (value: unknown, max = 30) => text(value, max).replace(/\D/g, '').slice(0, max);
const integer = (value: unknown, fallback: number) => { const result = Number(value); return Number.isInteger(result) ? result : fallback; };
const decimal = (value: unknown) => value == null || value === '' ? null : Number(value);
const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)) ? text(value) : null;
const UF = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']);

class SettingsError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}

const ensureRate = (value: unknown, label: string) => {
  const result = decimal(value);
  if (result != null && (!Number.isFinite(result) || result < 0 || result > 100)) throw new SettingsError('invalid_rate', `${label} precisa estar entre 0 e 100.`);
  return result;
};

type FiscalAuth = Extract<Awaited<ReturnType<typeof authorizeFiscalManager>>, { ok: true }>;

async function assertDefaultSeries(auth: FiscalAuth, id: string | null, direction: 'entrada' | 'saida') {
  if (!id) return null;
  const result = await auth.supabase.from('nfe_series').select('id,direction,series').eq('id', id).eq('company_id', auth.companyId).eq('active', true).maybeSingle();
  if (result.error || !result.data || ![direction, 'ambos'].includes(result.data.direction)) throw new SettingsError('invalid_series', `Escolha uma série ativa para ${direction}.`);
  return result.data;
}

async function saveDocumentSettings(auth: FiscalAuth, body: JsonObject) {
  const nfe = object(body.nfe); const nfce = object(body.nfce);
  if (nfce.afterPaymentMode === 'automatic') throw new SettingsError('automatic_blocked', 'A emissão automática permanece bloqueada até a aprovação do canário.');
  if (nfce.afterPaymentMode != null && !['off', 'ask'].includes(text(nfce.afterPaymentMode))) throw new SettingsError('invalid_mode', 'Escolha o comportamento após o pagamento.');
  const nfeSeries = integer(nfe.series, 1); const nfceSeries = integer(nfce.series, 1); const uf = text(nfce.uf, 2).toUpperCase();
  if (nfeSeries < 0 || nfeSeries > 889 || nfceSeries < 1 || nfceSeries > 889) throw new SettingsError('invalid_series', 'Revise as séries de NF-e e NFC-e.');
  if (nfce.enabled === true && !UF.has(uf)) throw new SettingsError('invalid_uf', 'Informe a UF de credenciamento da NFC-e.');
  const defaultExitSeriesId = uuid(nfe.defaultExitSeriesId);
  const defaultEntrySeriesId = uuid(nfe.defaultEntrySeriesId);
  const [exitSeries, entrySeries] = await Promise.all([
    assertDefaultSeries(auth, defaultExitSeriesId, 'saida'),
    assertDefaultSeries(auth, defaultEntrySeriesId, 'entrada'),
  ]);
  const [nfeResult, nfceResult] = await Promise.all([
    auth.supabase.from('company_nfe_settings').upsert({
      company_id: auth.companyId,
      // NF-e não possui mais rollout manual: toda empresa com o módulo fica
      // habilitada. A autorização fiscal ainda valida entitlement e cadastro.
      enabled: true,
      series: exitSeries?.series ?? nfeSeries,
      default_exit_series_id: defaultExitSeriesId,
      default_entry_series_id: defaultEntrySeriesId,
      default_operation_nature: text(nfe.defaultOperationNature, 60) || null,
    }, { onConflict: 'company_id' }),
    auth.supabase.from('company_nfce_settings').upsert({
      company_id: auth.companyId, enabled: nfce.enabled === true, series: nfceSeries, uf: uf || null,
      after_payment_mode: nfce.afterPaymentMode === 'off' ? 'off' : 'ask',
      default_operation_nature: text(nfce.defaultOperationNature, 60) || 'VENDA A CONSUMIDOR',
      include_identified_consumer: nfce.includeIdentifiedConsumer !== false,
      open_danfce_after_authorization: nfce.openDanfceAfterAuthorization === true,
    }, { onConflict: 'company_id' }),
  ]);
  if (nfeResult.error || nfceResult.error) throw new SettingsError('save_failed', 'Não foi possível salvar as configurações fiscais agora.', 500);
}

async function upsertSeries(auth: FiscalAuth, raw: unknown) {
  const record = object(raw); const id = uuid(record.id); const series = integer(record.series, -1); const direction = text(record.direction);
  if (!text(record.label, 80) || series < 0 || series > 889 || !['entrada', 'saida', 'ambos'].includes(direction)) throw new SettingsError('invalid_series', 'Revise nome, número e direção da série.');
  const lastNumberUsed = integer(record.lastNumberUsed, record.lastNumberUsed == null ? 0 : -1);
  if (!id && (lastNumberUsed < 0 || lastNumberUsed > 999_999_998)) throw new SettingsError('invalid_last_number', 'A última numeração utilizada precisa estar entre 0 e 999.999.998.');
  const values: JsonObject = { company_id: auth.companyId, label: text(record.label, 80), series, direction, active: record.active !== false };
  // Avanço explícito do contador de uma série existente: cobre quem continuou a
  // numeração em outro emissor. Só anda para frente; editar a série sem este campo
  // nunca toca no contador.
  if (id && record.advanceLastNumberUsed != null) {
    const advanceTo = integer(record.advanceLastNumberUsed, -1);
    if (advanceTo < 0 || advanceTo > 999_999_998) throw new SettingsError('invalid_last_number', 'A última numeração utilizada precisa estar entre 0 e 999.999.998.');
    const current = await auth.supabase.from('nfe_series').select('next_number').eq('id', id).eq('company_id', auth.companyId).maybeSingle();
    const currentNext = Number(object(current.data).next_number);
    if (current.error || !Number.isInteger(currentNext)) throw new SettingsError('series_save_failed', 'Não foi possível conferir a numeração atual da série. Tente novamente.', 409);
    if (advanceTo + 1 < currentNext) throw new SettingsError('series_number_backwards', `A numeração só pode avançar. A próxima nota desta série já é a nº ${currentNext}.`, 409);
    if (advanceTo + 1 > currentNext) values.next_number = advanceTo + 1;
  }
  const query = id
    ? auth.supabase.from('nfe_series').update(values).eq('id', id).eq('company_id', auth.companyId).select('id').maybeSingle()
    : auth.supabase.from('nfe_series').insert({ ...values, next_number: lastNumberUsed + 1 }).select('id').single();
  const result = await query;
  if (result.error || !result.data) throw new SettingsError('series_save_failed', 'Não foi possível salvar a série. Confira se o número já existe e se ela já foi usada.', 409);
  return result.data;
}

async function upsertScenario(auth: FiscalAuth, raw: unknown) {
  const record = object(raw); const id = uuid(record.id); const direction = text(record.direction);
  const cfopInternal = digits(record.cfopInternal, 4) || null; const cfopInterstate = digits(record.cfopInterstate, 4) || null;
  if (!text(record.name, 100) || !text(record.operationNature, 60) || !['entrada', 'saida'].includes(direction)) throw new SettingsError('invalid_scenario', 'Revise nome, direção e natureza do cenário.');
  const cfopPattern = direction === 'entrada' ? /^[1-3][0-9]{3}$/ : /^[5-7][0-9]{3}$/;
  if ((cfopInternal && !cfopPattern.test(cfopInternal)) || (cfopInterstate && !cfopPattern.test(cfopInterstate))) throw new SettingsError('invalid_cfop', 'O CFOP não corresponde à direção do cenário.');
  const values = {
    company_id: auth.companyId, name: text(record.name, 100), direction, operation_kind: 'normal', operation_nature: text(record.operationNature, 60),
    destination_scope: ['interna', 'interestadual', 'ambos'].includes(text(record.destinationScope)) ? text(record.destinationScope) : 'ambos',
    cfop_internal: cfopInternal, cfop_interstate: cfopInterstate,
    icms_code: digits(record.icmsCode, 3) || null, icms_rate: ensureRate(record.icmsRate, 'A alíquota de ICMS'), icms_reduction_rate: ensureRate(record.icmsReductionRate, 'A redução de ICMS'),
    pis_cst: digits(record.pisCst, 2) || null, pis_rate: ensureRate(record.pisRate, 'A alíquota de PIS'),
    cofins_cst: digits(record.cofinsCst, 2) || null, cofins_rate: ensureRate(record.cofinsRate, 'A alíquota de COFINS'),
    ipi_cst: digits(record.ipiCst, 2) || null, ipi_rate: ensureRate(record.ipiRate, 'A alíquota de IPI'),
    notes: text(record.notes, 1000) || null, active: record.active !== false, application_status: 'draft',
  };
  const query = id
    ? auth.supabase.from('fiscal_goods_scenarios').update(values).eq('id', id).eq('company_id', auth.companyId).select('id').maybeSingle()
    : auth.supabase.from('fiscal_goods_scenarios').insert(values).select('id').single();
  const result = await query;
  if (result.error || !result.data) throw new SettingsError('scenario_save_failed', 'Não foi possível salvar o cenário. Confira os códigos fiscais informados.', 409);
  return result.data;
}

async function upsertCarrier(auth: FiscalAuth, raw: unknown) {
  const record = object(raw); const id = uuid(record.id); const document = digits(record.document, 14);
  const state = text(record.state, 2).toUpperCase() || null; const vehicleState = text(record.vehicleState, 2).toUpperCase() || null;
  const vehiclePlate = text(record.vehiclePlate, 7).replace(/[^A-Za-z0-9]/g, '').toUpperCase() || null;
  if (!text(record.name, 120) || !isValidDocument(document)) throw new SettingsError('invalid_carrier', 'Informe o nome e um CPF/CNPJ válido da transportadora.');
  if ((state && !UF.has(state)) || (vehicleState && !UF.has(vehicleState))) throw new SettingsError('invalid_uf', 'Revise a UF da transportadora e do veículo.');
  const values = {
    company_id: auth.companyId, name: text(record.name, 120), document,
    state_registration: text(record.stateRegistration, 20).toUpperCase() || null, address: text(record.address, 120) || null,
    address_number: text(record.addressNumber, 20) || null, complement: text(record.complement, 60) || null,
    neighborhood: text(record.neighborhood, 60) || null, city: text(record.city, 60) || null, state,
    zip_code: digits(record.zipCode, 8) || null, municipality_code: digits(record.municipalityCode, 7) || null,
    rntc: digits(record.rntc, 20) || null, vehicle_plate: vehiclePlate, vehicle_state: vehicleState,
    active: record.active !== false,
  };
  const query = id
    ? auth.supabase.from('fiscal_goods_carriers').update(values).eq('id', id).eq('company_id', auth.companyId).select('id').maybeSingle()
    : auth.supabase.from('fiscal_goods_carriers').insert(values).select('id').single();
  const result = await query;
  if (result.error || !result.data) throw new SettingsError('carrier_save_failed', 'Não foi possível salvar a transportadora. Confira documento, CEP, município e placa.', 409);
  return result.data;
}

async function removeRecord(auth: FiscalAuth, table: string, rawId: unknown) {
  const id = uuid(rawId); if (!id) throw new SettingsError('invalid_record', 'Cadastro fiscal inválido.');
  const result = await auth.supabase.from(table).delete().eq('id', id).eq('company_id', auth.companyId).select('id').maybeSingle();
  if (result.error || !result.data) throw new SettingsError('delete_failed', table === 'nfe_series' ? 'A série já utilizada não pode ser excluída. Desative-a para preservar o histórico.' : 'Não foi possível excluir este cadastro fiscal.', 409);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed', message: 'Método não permitido.' }, 405);
  const auth = await authorizeFiscalManager(req); if (!auth.ok) return auth.response;
  try {
    const actor = await auth.supabase.from('profiles').select('is_active').eq('user_id', auth.userId).eq('company_id', auth.companyId).maybeSingle();
    if (actor.error || actor.data?.is_active !== true) return jsonResponse({ error: 'forbidden', message: 'Seu acesso administrativo não está disponível.' }, 403);
    const entitlement = await auth.supabase.rpc('tenant_subscription_allows_access', { _company_id: auth.companyId });
    if (entitlement.error || entitlement.data !== true) return jsonResponse({ error: 'module_inactive', message: 'O acesso fiscal desta empresa não está disponível.' }, 403);
    const body = object(await req.json()); const action = text(body.action) || 'save_settings';
    let data: unknown = null;
    if (action === 'save_settings') await saveDocumentSettings(auth, body);
    else if (action === 'upsert_series') data = await upsertSeries(auth, body.record);
    else if (action === 'delete_series') await removeRecord(auth, 'nfe_series', body.id);
    else if (action === 'upsert_scenario') data = await upsertScenario(auth, body.record);
    else if (action === 'delete_scenario') await removeRecord(auth, 'fiscal_goods_scenarios', body.id);
    else if (action === 'upsert_carrier') data = await upsertCarrier(auth, body.record);
    else if (action === 'delete_carrier') await removeRecord(auth, 'fiscal_goods_carriers', body.id);
    else throw new SettingsError('invalid_action', 'Ação de configuração fiscal inválida.', 400);
    return jsonResponse({ ok: true, data }, 200);
  } catch (error) {
    if (error instanceof SettingsError) return jsonResponse({ error: error.code, message: error.message }, error.status);
    console.error('[fiscal-goods-settings] unexpected', { failed: true });
    return jsonResponse({ error: 'internal_error', message: 'Não foi possível salvar as configurações fiscais agora.' }, 500);
  }
});
