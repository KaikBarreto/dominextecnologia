import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes a string for search: strips accents, trims, lowercases and
 * collapses multiple spaces. Acento fora do jeito não pode esconder resultado —
 * "Antonio" tem que achar "Antônio".
 * Use `fuzzyIncludes(haystack, needle)` instead of `haystack.toLowerCase().includes(needle.toLowerCase())`.
 */
export function normalizeSearch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Só os dígitos da string — telefone, CPF/CNPJ, CEP, número de OS. */
export function onlyDigits(str: string | null | undefined): string {
  return (str ?? '').replace(/\D+/g, '');
}

/**
 * A busca digitada é um número (telefone, documento, CEP, nº de OS)?
 * Vale quando não há nenhuma letra e sobram pelo menos 3 dígitos — abaixo disso
 * a comparação por dígitos traria ruído demais ("21" casaria com meio sistema).
 */
function isNumericQuery(normalizedNeedle: string): boolean {
  if (/[a-z]/.test(normalizedNeedle)) return false;
  return onlyDigits(normalizedNeedle).length >= 3;
}

/**
 * Checks if `haystack` contains `needle`, de forma tolerante:
 * - ignora acento ("Antonio" acha "Antônio");
 * - ignora espaço sobrando e casa sem espaço ("daluz" acha "da luz");
 * - aceita palavras soltas e fora de ordem ("marcos braga" acha "Marcos Antônio
 *   Moraes Braga"), exigindo que TODAS apareçam;
 * - quando o que foi digitado é só número, compara apenas os dígitos dos dois
 *   lados, então a máscara não atrapalha: "21 96830-1901", "(21) 96830-1901" e
 *   "21968301901" são a mesma busca. Vale pra telefone, CPF/CNPJ e código.
 */
export function fuzzyIncludes(haystack: string | null | undefined, needle: string): boolean {
  if (!needle || !needle.trim()) return true;
  if (!haystack) return false;
  const h = normalizeSearch(haystack);
  const n = normalizeSearch(needle);
  if (!n) return true;

  // Busca numérica: telefone/documento/código, comparando só os dígitos.
  if (isNumericQuery(n)) {
    const haystackDigits = onlyDigits(h);
    return haystackDigits.length > 0 && haystackDigits.includes(onlyDigits(n));
  }

  // Normal match with normalized spaces
  if (h.includes(n)) return true;
  // Match ignoring all spaces (e.g. "daluz" matches "da luz")
  if (h.replace(/\s/g, '').includes(n.replace(/\s/g, ''))) return true;
  // Palavras soltas em qualquer ordem: todas precisam aparecer no haystack.
  const tokens = n.split(' ').filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => h.includes(token))) return true;
  return false;
}

/**
 * Mesma tolerância do `fuzzyIncludes`, mas varrendo vários campos da mesma
 * entidade (nome, telefone, celular, e-mail, documento...). Basta UM campo
 * casar. Atalho pras listagens que hoje encadeiam `fuzzyIncludes` num OR.
 */
export function fuzzyIncludesAny(
  fields: Array<string | null | undefined>,
  needle: string,
): boolean {
  if (!needle || !needle.trim()) return true;
  return fields.some((field) => field && fuzzyIncludes(field, needle));
}

/**
 * Casa telefone/celular, mas SÓ quando o que foi digitado é claramente um
 * telefone (6 dígitos ou mais, sem letra). Existe pras telas cujo número
 * principal é outro — nº da OS, nº do orçamento: ali, digitar "123" não pode
 * trazer todo cliente que tem "123" em algum lugar do celular.
 * Onde não há esse conflito (Clientes, CRM), use `fuzzyIncludesAny` direto.
 */
export function fuzzyIncludesPhone(
  haystack: string | null | undefined,
  needle: string,
): boolean {
  if (!haystack || !needle) return false;
  const n = normalizeSearch(needle);
  if (/[a-z]/.test(n)) return false;
  const needleDigits = onlyDigits(n);
  if (needleDigits.length < 6) return false;
  const haystackDigits = onlyDigits(haystack);
  return haystackDigits.length > 0 && haystackDigits.includes(needleDigits);
}
