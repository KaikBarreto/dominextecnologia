import { buildSlugSegment } from '@/utils/prettyLinks';

interface ServiceOrderShareLinkParams {
  /** Código curto público (`public_short_code`). Quando presente, gera URL bonita. */
  shortCode?: string | null;
  customerName?: string | null;
  serviceName?: string | null;
  /** UUID antigo — fallback retrocompatível quando não há `shortCode`. */
  osId?: string | null;
  /**
   * Identificador opcional para o crawler buscar novamente o preview social.
   * Não muda a OS nem a URL canônica; serve apenas para escapar do cache de
   * aplicativos como o WhatsApp quando a arte foi atualizada.
   */
  previewKey?: string | number | null;
}

/**
 * Monta o link público de acompanhamento da OS (modo cliente).
 *
 * Retrocompatível: aceita tanto a string `osId` antiga quanto um objeto
 * `{ shortCode, customerName, serviceName, osId }`.
 *
 * - Com `shortCode`: gera `…/os-tecnico/cliente-servico-<codigo>?modo=cliente`.
 * - Sem `shortCode`: cai no `osId` (UUID), que continua resolvendo nos dois modos.
 */
export function buildServiceOrderShareLink(
  arg: string | ServiceOrderShareLinkParams,
): string {
  const params: ServiceOrderShareLinkParams =
    typeof arg === 'string' ? { osId: arg } : arg;

  const { shortCode, customerName, serviceName, osId, previewKey } = params;

  const segment = shortCode
    ? buildSlugSegment([customerName, serviceName], shortCode, 'os')
    : osId ?? '';

  const query = new URLSearchParams({ modo: 'cliente' });
  if (previewKey !== null && previewKey !== undefined && String(previewKey).trim()) {
    query.set('preview', String(previewKey));
  }

  return `https://www.dominex.app/os-tecnico/${segment}?${query.toString()}`;
}

interface ProposalShareLinkParams {
  /** Token público da proposta (`quotes.token`, 64 hex). É o que resolve a página. */
  token: string;
  /** Nome do destinatário (cliente ou prospecto) — vira slug decorativo. */
  recipientName?: string | null;
}

/**
 * Monta o link público amigável da proposta comercial.
 *
 * O `token` é SEMPRE o último segmento (nunca contém '-'), então
 * `…/proposta/maria-silva-<token>` resolve igual a `…/proposta/<token>` — o
 * `ProposalPublic` extrai o token via `extractQuoteToken`. Quando não há nome,
 * cai no token puro (compatível com os links antigos já distribuídos).
 */
export function buildProposalShareLink({ token, recipientName }: ProposalShareLinkParams): string {
  const segment = recipientName
    ? buildSlugSegment([recipientName], token, 'proposta')
    : token;
  return `https://www.dominex.app/proposta/${segment}`;
}

/**
 * Monta o link wa.me a partir de um telefone "sujo" (com máscara/espaços).
 * Números com `+`/`00` preservam o DDI; números nacionais usam o país da
 * empresa. Retorna null quando o número não respeita o contrato regional.
 *
 * Quando `message` é informada e não-vazia, a conversa abre com o texto já
 * pré-preenchido (`?text=...`) pro operador só conferir e enviar. Sem `message`,
 * mantém o comportamento padrão (abre o chat sem texto).
 */
type CountryPhoneRule = {
  dialCode: string;
  nationalMin: number;
  nationalMax: number;
  stripTrunkZero: boolean;
};

// Mantém o mesmo contrato regional do worker. A UI usa esta função antes de
// abrir um wa.me; o worker continua sendo a validação autoritativa dos envios
// automáticos.
const WHATSAPP_COUNTRY_PHONE_RULES: Readonly<Record<string, CountryPhoneRule>> = {
  BR: { dialCode: '55', nationalMin: 10, nationalMax: 11, stripTrunkZero: true },
  CV: { dialCode: '238', nationalMin: 7, nationalMax: 7, stripTrunkZero: false },
  PT: { dialCode: '351', nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  AO: { dialCode: '244', nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  MZ: { dialCode: '258', nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  ST: { dialCode: '239', nationalMin: 7, nationalMax: 7, stripTrunkZero: false },
  GW: { dialCode: '245', nationalMin: 7, nationalMax: 7, stripTrunkZero: false },
  TL: { dialCode: '670', nationalMin: 7, nationalMax: 8, stripTrunkZero: false },
  US: { dialCode: '1', nationalMin: 10, nationalMax: 10, stripTrunkZero: false },
  GB: { dialCode: '44', nationalMin: 9, nationalMax: 10, stripTrunkZero: true },
  CA: { dialCode: '1', nationalMin: 10, nationalMax: 10, stripTrunkZero: false },
  AU: { dialCode: '61', nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  ES: { dialCode: '34', nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  MX: { dialCode: '52', nationalMin: 10, nationalMax: 10, stripTrunkZero: false },
  AR: { dialCode: '54', nationalMin: 10, nationalMax: 11, stripTrunkZero: true },
  CL: { dialCode: '56', nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  CO: { dialCode: '57', nationalMin: 10, nationalMax: 10, stripTrunkZero: false },
  PE: { dialCode: '51', nationalMin: 9, nationalMax: 9, stripTrunkZero: false },
  UY: { dialCode: '598', nationalMin: 8, nationalMax: 8, stripTrunkZero: false },
  PY: { dialCode: '595', nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  BO: { dialCode: '591', nationalMin: 8, nationalMax: 8, stripTrunkZero: false },
  FR: { dialCode: '33', nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  BE: { dialCode: '32', nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  CH: { dialCode: '41', nationalMin: 9, nationalMax: 9, stripTrunkZero: true },
  DE: { dialCode: '49', nationalMin: 5, nationalMax: 11, stripTrunkZero: true },
  IT: { dialCode: '39', nationalMin: 6, nationalMax: 11, stripTrunkZero: false },
  JP: { dialCode: '81', nationalMin: 9, nationalMax: 10, stripTrunkZero: true },
};

export function normalizeWhatsAppPhone(
  phone: string | null | undefined,
  countryCode = 'BR',
): string | null {
  const value = phone?.trim();
  if (!value) return null;

  const international = value.startsWith('+') || value.startsWith('00');
  let digits = value.replace(/\D/g, '');
  if (value.startsWith('00')) digits = digits.slice(2);
  if (international) return digits.length >= 8 && digits.length <= 15 ? digits : null;

  const rule = WHATSAPP_COUNTRY_PHONE_RULES[countryCode.trim().toUpperCase()];
  if (!rule) return null;

  const existingNationalLength = digits.startsWith(rule.dialCode)
    ? digits.length - rule.dialCode.length
    : -1;
  if (existingNationalLength >= rule.nationalMin && existingNationalLength <= rule.nationalMax) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  if (rule.stripTrunkZero) digits = digits.replace(/^0/, '');
  if (digits.length < rule.nationalMin || digits.length > rule.nationalMax) return null;
  const normalized = `${rule.dialCode}${digits}`;
  return normalized.length >= 8 && normalized.length <= 15 ? normalized : null;
}

export function buildWhatsAppLink(
  phone: string | null | undefined,
  message?: string,
  countryCode = 'BR',
): string | null {
  const number = normalizeWhatsAppPhone(phone, countryCode);
  if (!number) return null;
  const text = message?.trim();
  return text
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${number}`;
}
