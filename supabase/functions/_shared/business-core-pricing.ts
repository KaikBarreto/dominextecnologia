import { coreIncludesModule, type BusinessCore } from './business-core.ts';

const SHARED_REQUIRED = ['basic', 'finance_advanced', 'pricing_advanced'];
const SERVICE_REQUIRED = ['customer_portal', 'video_questions'];

export function requiredCustomModulesForCore(core: BusinessCore, chosen: readonly string[] = []): string[] {
  return [...SHARED_REQUIRED, ...(core === 'services' || chosen.includes('service_operations') ? SERVICE_REQUIRED : [])];
}

export function customCommercialModulesForCore(core: BusinessCore, chosen: readonly string[]): string[] {
  const hasServices = core === 'services' || chosen.includes('service_operations');
  if (!hasServices && chosen.includes('contracts')) {
    throw new Error('Adicione o kit Serviços para contratar recursos de prestação de serviços.');
  }
  return [...new Set([...requiredCustomModulesForCore(core, chosen), ...chosen])]
    .filter(code => hasServices || !SERVICE_REQUIRED.includes(code))
    .filter(code => code !== 'extra_user' && (code === 'basic' || !coreIncludesModule(core, code)));
}

export interface BusinessCorePriceSnapshot {
  businessCore: BusinessCore;
  basePrice: number | null;
  configured: boolean;
}

export function parseBusinessCoreBasePrice(value: unknown, expectedCore: BusinessCore): BusinessCorePriceSnapshot {
  const row = value as Record<string, unknown> | null;
  if (!row || row.business_core !== expectedCore || typeof row.configured !== 'boolean') {
    throw new Error('Não foi possível conferir o preço deste kit. Tente novamente.');
  }
  const price = row.base_price;
  if (!row.configured && price === null) return { businessCore: expectedCore, basePrice: null, configured: false };
  if (!row.configured || typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 1000000) {
    throw new Error('Não foi possível conferir o preço deste kit. Tente novamente.');
  }
  return { businessCore: expectedCore, basePrice: price, configured: true };
}

/** A ausência legítima do preço de Loja não é uma concessão gratuita. */
export async function loadBusinessCoreBasePrice(client: { rpc: unknown }, core: BusinessCore): Promise<number | null> {
  const rpc = (client.rpc as (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>).bind(client);
  const { data, error } = await rpc('get_business_core_base_price_v1', { p_business_core: core });
  if (error) throw new Error('Não foi possível consultar o preço deste kit. Tente novamente.');
  return parseBusinessCoreBasePrice(data, core).basePrice;
}
