import { fuzzyIncludes, normalizeSearch, onlyDigits } from '@/lib/utils';

export interface NfeInventoryMatchCandidate {
  id: string;
  name: string;
  fiscal_gtin?: string | null;
  barcode?: string | null;
}

export interface NfeInventoryMatchSource {
  name: string;
  gtin?: string | null;
}

/**
 * Sugere um material somente quando o vínculo é inequívoco.
 *
 * Ordem de confiança:
 * 1. GTIN exato (cadastro fiscal ou código de barras);
 * 2. nome normalizado exato;
 * 3. nome aproximado pela busca tolerante do produto.
 *
 * Em qualquer nível, dois candidatos deixam a linha sem seleção. É preferível
 * pedir revisão humana a movimentar o saldo de um material incorreto.
 */
export function findSafeNfeInventoryMatch<T extends NfeInventoryMatchCandidate>(
  source: NfeInventoryMatchSource,
  candidates: T[],
): T | null {
  const gtin = onlyDigits(source.gtin);
  if (gtin) {
    const gtinMatches = candidates.filter((candidate) =>
      [candidate.fiscal_gtin, candidate.barcode]
        .map(onlyDigits)
        .some((value) => value === gtin),
    );
    if (gtinMatches.length === 1) return gtinMatches[0];
    if (gtinMatches.length > 1) return null;
  }

  const normalizedName = normalizeSearch(source.name);
  if (!normalizedName) return null;

  const exactNameMatches = candidates.filter(
    (candidate) => normalizeSearch(candidate.name) === normalizedName,
  );
  if (exactNameMatches.length === 1) return exactNameMatches[0];
  if (exactNameMatches.length > 1) return null;

  const approximateMatches = candidates.filter((candidate) =>
    fuzzyIncludes(candidate.name, source.name) || fuzzyIncludes(source.name, candidate.name),
  );
  return approximateMatches.length === 1 ? approximateMatches[0] : null;
}
