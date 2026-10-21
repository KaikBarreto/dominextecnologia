/**
 * Seções do Portal do Contrato (`contracts.portal_sections`) — tipos, chaves e
 * normalização. Fica fora do componente de propósito: a MESMA régua vale no
 * servidor (edge `pmoc-portal-share` e RPCs) e aqui no cliente.
 *
 * Os 3 estados de uma seção do Portal do Contrato.
 *
 * Chave AUSENTE no jsonb = `'free'` = LIVRE. É a lei da entrega: os links deste
 * portal estão em QR code IMPRESSO e em conversa de WhatsApp, então contrato sem
 * configuração abre igual a sempre. O default aqui é o INVERSO do Portal do
 * Cliente (que nasce fail-closed).
 */
export type ContractPortalSectionState = 'free' | 'password' | 'hidden';

/** Chaves do jsonb — UNDERSCORE no banco (o NAV do portal usa hífen). */
export const CONTRACT_PORTAL_SECTION_KEYS = [
  'visao_geral',
  'equipamentos',
  'cronograma',
  'ocorrencias',
  'documentos',
  'historico',
  'historico_pmoc',
  'cobrancas',
] as const;

export type ContractPortalSectionKey = typeof CONTRACT_PORTAL_SECTION_KEYS[number];

export type ContractPortalSections = Partial<
  Record<ContractPortalSectionKey, ContractPortalSectionState>
>;

/**
 * Normaliza o jsonb vindo do banco: só as 8 chaves conhecidas e só os 3 valores
 * do enum. Qualquer coisa fora disso vira `'free'`, igual ao servidor (edge e
 * RPC). Uma régua só nas três pontas.
 */
export function parseContractPortalSections(value: unknown): ContractPortalSections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: ContractPortalSections = {};
  for (const key of CONTRACT_PORTAL_SECTION_KEYS) {
    const state = typeof raw[key] === 'string' ? (raw[key] as string).trim() : '';
    if (state === 'password' || state === 'hidden') out[key] = state;
  }
  return out;
}
