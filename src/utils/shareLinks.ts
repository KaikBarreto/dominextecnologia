import { buildSlugSegment } from '@/utils/prettyLinks';

interface ServiceOrderShareLinkParams {
  /** Código curto público (`public_short_code`). Quando presente, gera URL bonita. */
  shortCode?: string | null;
  customerName?: string | null;
  serviceName?: string | null;
  /** UUID antigo — fallback retrocompatível quando não há `shortCode`. */
  osId?: string | null;
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

  const { shortCode, customerName, serviceName, osId } = params;

  const segment = shortCode
    ? buildSlugSegment([customerName, serviceName], shortCode, 'os')
    : osId ?? '';

  return `https://dominex.app/os-tecnico/${segment}?modo=cliente`;
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
  return `https://dominex.app/proposta/${segment}`;
}

/**
 * Monta o link wa.me a partir de um telefone "sujo" (com máscara/espaços).
 * Remove tudo que não é dígito; se o número não começar com 55 (DDI Brasil)
 * e tiver até 11 dígitos (DDD + número), prefixa 55. Retorna null se não
 * houver dígitos suficientes pra um número válido.
 *
 * Quando `message` é informada e não-vazia, a conversa abre com o texto já
 * pré-preenchido (`?text=...`) pro operador só conferir e enviar. Sem `message`,
 * mantém o comportamento padrão (abre o chat sem texto).
 */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message?: string,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const number = digits.startsWith('55') ? digits : `55${digits}`;
  const text = message?.trim();
  return text
    ? `https://wa.me/${number}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${number}`;
}
