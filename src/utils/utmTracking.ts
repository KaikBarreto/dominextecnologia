/**
 * UTM/Affiliate tracking utilities.
 *
 * Padrão Dominex:
 *  - Quem chega na LP/cadastro pode trazer parâmetros: ?utm_source=...&origem=...&vendedor=...&ref=...&plano=...&ciclo=...&tipo=...&bloqueado=1&preco=...&meses_promo=...
 *  - Origem default = "Site/Google"
 *  - utm_source mapeia para origem; param explícito `origem` sobrepõe utm_source
 *  - Persistência em sessionStorage (1ª aterrissagem ganha; não sobrescreve a menos que venha NOVO param)
 *  - vendedor = referral_code de salespeople; se ausente => sem vendedor
 */

const STORAGE_KEY = 'dominex_utm_data';

export interface UtmData {
  origem: string;
  vendedor?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  // Affiliate plan lock-in (opcional)
  plano?: string | null;
  ciclo?: string | null;
  tipo?: string | null; // 'teste' | 'venda'
  bloqueado?: boolean;
  preco?: number | null;
  meses_promo?: number | null;
  capturedAt?: string;
}

const SOURCE_TO_ORIGIN: Record<string, string> = {
  facebook: 'Facebook/Instagram',
  instagram: 'Facebook/Instagram',
  fb: 'Facebook/Instagram',
  ig: 'Facebook/Instagram',
  google: 'Site/Google',
  site: 'Site/Google',
  organic: 'Site/Google',
  whatsapp: 'WhatsApp',
  wa: 'WhatsApp',
  youtube: 'YouTube',
  yt: 'YouTube',
  tiktok: 'TikTok',
  email: 'Email Marketing',
  linkedin: 'LinkedIn',
  indicacao: 'Indicação',
};

function safeParseFloat(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function safeParseInt(v: string | null): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function mapSourceToOrigin(source: string | null | undefined): string | null {
  if (!source) return null;
  const k = source.toLowerCase().trim();
  if (SOURCE_TO_ORIGIN[k]) return SOURCE_TO_ORIGIN[k];
  // Fallback genérico para qualquer utm_source não conhecido
  return 'Tráfego Pago';
}

/**
 * Lê parâmetros da URL atual (qualquer rota) e mescla com sessionStorage.
 * Salva o resultado de volta. Sempre retorna um objeto com `origem` definida.
 */
export function captureUtmFromUrl(search?: string): UtmData {
  const params = new URLSearchParams(search ?? (typeof window !== 'undefined' ? window.location.search : ''));
  const stored = readStoredUtm();

  const utm_source = params.get('utm_source')?.toLowerCase().trim() || stored.utm_source || null;
  const utm_medium = params.get('utm_medium')?.toLowerCase().trim() || stored.utm_medium || null;
  const utm_campaign = params.get('utm_campaign')?.toLowerCase().trim() || stored.utm_campaign || null;

  // origem explícita sobrepõe utm_source
  const explicitOrigem = params.get('origem')?.trim();
  const origem =
    explicitOrigem ||
    stored.origem || // mantém o que já estava se nada novo veio
    mapSourceToOrigin(utm_source) ||
    'Site/Google';

  // vendedor: param vendedor ou ref (alias)
  const vendedor = (params.get('vendedor') || params.get('ref'))?.trim().toLowerCase() || stored.vendedor || null;

  const plano = params.get('plano')?.trim() || stored.plano || null;
  const ciclo = params.get('ciclo')?.trim() || stored.ciclo || null;
  const tipo = params.get('tipo')?.trim() || stored.tipo || null;
  const bloqueado = params.get('bloqueado') === '1' || params.get('bloqueado') === 'true' || !!stored.bloqueado;
  const preco = safeParseFloat(params.get('preco')) ?? stored.preco ?? null;
  const meses_promo = safeParseInt(params.get('meses_promo')) ?? stored.meses_promo ?? null;

  const data: UtmData = {
    origem,
    vendedor: vendedor || null,
    utm_source,
    utm_medium,
    utm_campaign,
    plano,
    ciclo,
    tipo,
    bloqueado,
    preco,
    meses_promo,
    capturedAt: stored.capturedAt || new Date().toISOString(),
  };

  writeStoredUtm(data);
  return data;
}

export function readStoredUtm(): UtmData {
  if (typeof window === 'undefined') return { origem: 'Site/Google' };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { origem: 'Site/Google' };
    const parsed = JSON.parse(raw) as UtmData;
    if (!parsed.origem) parsed.origem = 'Site/Google';
    return parsed;
  } catch {
    return { origem: 'Site/Google' };
  }
}

function writeStoredUtm(data: UtmData) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* sessionStorage indisponível (modo privado) — ignorar */
  }
}

export function clearStoredUtm() {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

/**
 * Constrói uma URL de cadastro propagando origem/vendedor + lock-in.
 * Usar SEMPRE em CTAs da LP em vez de hardcoded "/cadastro?origem=Site".
 */
export function buildCadastroUrl(extra: Partial<UtmData> & { plano?: string } = {}): string {
  const data = readStoredUtm();
  const params = new URLSearchParams();

  const origem = extra.origem || data.origem || 'Site/Google';
  params.set('origem', origem);

  const vendedor = extra.vendedor ?? data.vendedor;
  if (vendedor) params.set('vendedor', vendedor);

  const plano = extra.plano ?? data.plano;
  if (plano) params.set('plano', plano);

  const ciclo = extra.ciclo ?? data.ciclo;
  if (ciclo) params.set('ciclo', ciclo);

  if (data.bloqueado || extra.bloqueado) params.set('bloqueado', '1');

  const preco = extra.preco ?? data.preco;
  if (preco != null) params.set('preco', String(preco));

  const meses_promo = extra.meses_promo ?? data.meses_promo;
  if (meses_promo != null) params.set('meses_promo', String(meses_promo));

  const tipo = extra.tipo ?? data.tipo;
  if (tipo) params.set('tipo', tipo);

  return `/cadastro?${params.toString()}`;
}
