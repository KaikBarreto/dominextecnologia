import type { FinancialCategory } from '@/hooks/useFinancialCategories';

export const FINANCIAL_CATEGORY_FALLBACK_COLOR = '#64748b';

export type FinancialCategoryLookup = {
  byId: Map<string, FinancialCategory>;
  byName: Map<string, FinancialCategory>;
};

export interface FinancialCategoryDisplay {
  name: string;
  color: string;
  category: FinancialCategory | null;
}

export function buildFinancialCategoryLookup(
  categories: FinancialCategory[],
): FinancialCategoryLookup {
  return {
    byId: new Map(categories.map((category) => [category.id, category])),
    byName: new Map(categories.map((category) => [category.name, category])),
  };
}

/**
 * `financial_transactions.category` guarda historicamente o NOME da categoria.
 * Algumas integrações legadas, porém, gravaram o UUID nesse campo de texto.
 * A apresentação aceita os dois formatos para nunca expor identificador interno
 * em tela ou documento, sem reclassificar silenciosamente o dado persistido.
 */
export function resolveFinancialCategoryDisplay(
  value: string | null | undefined,
  lookup: FinancialCategoryLookup,
): FinancialCategoryDisplay {
  const raw = value?.trim() ?? '';
  const category = lookup.byName.get(raw) ?? lookup.byId.get(raw) ?? null;

  return {
    name: category?.name ?? raw,
    color: normalizeFinancialCategoryColor(category?.color),
    category,
  };
}

/** Só permite hexadecimal CSS no documento gerado; valores inválidos caem no cinza. */
export function normalizeFinancialCategoryColor(value: string | null | undefined): string {
  const color = value?.trim() ?? '';
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [r, g, b] = color.slice(1).split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return FINANCIAL_CATEGORY_FALLBACK_COLOR;
}

export function financialCategoryColorToRgb(
  value: string | null | undefined,
): [number, number, number] {
  const color = normalizeFinancialCategoryColor(value);
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}
