// Vocabulário de `financial_categories.type` no banco é `entrada | saida | ambos`.
// `'receita'/'despesa'` nunca existiu como valor de coluna — não reintroduzir.

export interface CategoryLike {
  type: string;
  is_active: boolean;
}

/**
 * Filtra categorias ativas compatíveis com o tipo de lançamento (`entrada`/`saida`).
 * Categorias `'ambos'` aparecem nos dois. Categorias inativas nunca aparecem.
 */
export function filterCategoriesByTransactionType<T extends CategoryLike>(
  categories: T[] | null | undefined,
  tipo: 'entrada' | 'saida'
): T[] {
  return (categories || []).filter((c) => c.is_active && (c.type === tipo || c.type === 'ambos'));
}

/**
 * Igual ao filtro acima, mas NUNCA some com a categoria que já está
 * selecionada no formulário.
 *
 * Por quê: ao editar um lançamento antigo cuja categoria foi desativada (ou
 * que mudou de tipo), o `SearchableSelect` não achava o `value` entre as
 * `options` e caía no placeholder — o campo parecia VAZIO, mesmo com o dado
 * intacto no banco. Quem salvasse de novo sem reparar perdia a categoria.
 * Aqui a categoria selecionada volta pro fim da lista (a UI marca como
 * "Inativa") só pra ela poder ser exibida e mantida.
 */
export function filterCategoriesForSelect<T extends CategoryLike & { name: string }>(
  categories: T[] | null | undefined,
  tipo: 'entrada' | 'saida',
  selectedName?: string | null
): T[] {
  const visible = filterCategoriesByTransactionType(categories, tipo);
  const selected = (selectedName ?? '').trim();
  if (!selected) return visible;
  if (visible.some((c) => c.name === selected)) return visible;
  const orphan = (categories || []).find((c) => c.name === selected);
  return orphan ? [...visible, orphan] : visible;
}
