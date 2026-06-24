import { slugify } from "@/lib/slugify";

/**
 * Helpers de "links amigáveis" — URLs no formato `slug-do-nome-<codigoCurto>`,
 * mantendo retrocompatibilidade com os identificadores antigos (UUID / token 32hex).
 *
 * O código curto (`public_short_code`) é gerado no servidor com o alfabeto base32
 * sem ambíguos `abcdefghjkmnpqrstuvwxyz23456789`, 12 caracteres (~60 bits).
 * Ele é SEMPRE o último segmento do path, e nunca contém `-`, então `split('-').pop()`
 * recupera o código mesmo quando o nome tem hifens.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTRACT_TOKEN_RE = /^[0-9a-f]{32}$/;
const SHORT_CODE_RE = /^[a-hj-np-z2-9]{12}$/; // base32 sem 0 o 1 l i
const QUOTE_TOKEN_RE = /^[0-9a-f]{64}$/; // token da proposta: encode(gen_random_bytes(32), 'hex')

/** É o UUID antigo da OS / detalhe interno? */
export function isUuid(v: string | undefined | null): boolean {
  return !!v && UUID_RE.test(v);
}

/** É o token público antigo de contrato (32 hex)? */
export function isContractToken(v: string | undefined | null): boolean {
  return !!v && CONTRACT_TOKEN_RE.test(v);
}

/** Extrai o código curto do fim do param. Retorna null se o último segmento não for um código válido. */
export function extractShortCode(param: string | undefined | null): string | null {
  if (!param) return null;
  const last = param.split("-").pop() ?? "";
  return SHORT_CODE_RE.test(last) ? last : null;
}

/**
 * Extrai o token da proposta do path `/proposta/:token`.
 *
 * Aceita os dois formatos, em ordem de prioridade (retrocompat):
 *  - link antigo: o param INTEIRO é o token de 64 hex (sem slug) → devolve direto;
 *  - link amigável novo: `slug-do-nome-<token64hex>` → o token é o último segmento
 *    após split('-') (o token nunca contém '-', então `pop()` o recupera mesmo
 *    quando o nome do destinatário tem hifens).
 *
 * Retorna null se nada parecer um token válido.
 */
export function extractQuoteToken(param: string | undefined | null): string | null {
  if (!param) return null;
  if (QUOTE_TOKEN_RE.test(param)) return param;
  const last = param.split("-").pop() ?? "";
  return QUOTE_TOKEN_RE.test(last) ? last : null;
}

function trimSlug(s: string, max = 60): string {
  return slugify(s).slice(0, max).replace(/-+$/g, "");
}

/**
 * Monta o miolo do path: slug de um ou mais nomes + código curto.
 * Ex.: buildSlugSegment(['Cliente Demo', 'Manutenção Preventiva'], 'a1b2c3d4e5f6')
 *      → 'cliente-demo-manutencao-preventiva-a1b2c3d4e5f6'
 * Partes vazias são ignoradas; se tudo for vazio usa `fallback`.
 */
export function buildSlugSegment(
  names: Array<string | null | undefined>,
  shortCode: string,
  fallback = "item",
): string {
  const slug =
    names
      .filter(Boolean)
      .map((n) => trimSlug(String(n)))
      .filter(Boolean)
      .join("-") || fallback;
  return `${slug}-${shortCode}`;
}
