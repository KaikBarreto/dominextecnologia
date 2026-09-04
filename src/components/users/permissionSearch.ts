// ─────────────────────────────────────────────────────────────────────────────
// Busca do editor de permissões — helper PURO (sem React, sem Supabase).
//
// Regras (as mesmas que o editor de permissões promete ao admin):
//   • Busca vazia devolve TUDO.
//   • Tela casa por rótulo OU descrição → mantém a tela E todas as ações dela.
//   • Só uma ação-filha casa → mantém a tela, mas SÓ com as ações que casaram.
//   • Nada casou → a tela some do resultado.
//
// A comparação ignora acento e maiúscula ("orcamento" acha "Orçamentos") e também
// ignora espaço ("ordemservico" acha "Ordem de Serviço"), espelhando o
// `fuzzyIncludes` do repo mas com a normalização de acento por cima.
// ─────────────────────────────────────────────────────────────────────────────

/** Rótulo + descrição de uma tela ou ação — o mínimo que a busca precisa ler. */
export interface PermissionSearchItem {
  key: string;
  label: string;
  description?: string;
}

/** Uma tela e as ações recolhidas dentro dela. */
export interface PermissionSearchGroup<
  TScreen extends PermissionSearchItem = PermissionSearchItem,
  TAction extends PermissionSearchItem = PermissionSearchItem,
> {
  screen: TScreen;
  actions: TAction[];
}

/** Minúscula, sem acento, sem espaço duplicado. */
export function normalizePermissionText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** `text` contém `query`, ignorando acento, maiúscula e espaço. */
export function permissionTextMatches(text: string | null | undefined, query: string): boolean {
  const n = normalizePermissionText(query);
  if (!n) return true;
  const h = normalizePermissionText(text);
  if (!h) return false;
  if (h.includes(n)) return true;
  return h.replace(/ /g, '').includes(n.replace(/ /g, ''));
}

/** Item casa se o rótulo OU a descrição casarem. */
export function permissionItemMatches(item: PermissionSearchItem, query: string): boolean {
  return permissionTextMatches(item.label, query) || permissionTextMatches(item.description, query);
}

/**
 * Filtra a árvore tela → ações. Devolve os MESMOS objetos (sem clonar tela nem
 * ação) pra o React não remontar linha à toa enquanto o admin digita.
 */
export function filterPermissionTree<
  TScreen extends PermissionSearchItem,
  TAction extends PermissionSearchItem,
>(
  groups: PermissionSearchGroup<TScreen, TAction>[],
  query: string,
): PermissionSearchGroup<TScreen, TAction>[] {
  if (!normalizePermissionText(query)) return groups;

  const result: PermissionSearchGroup<TScreen, TAction>[] = [];
  for (const group of groups) {
    // Tela casou: leva a tela inteira, com todas as ações dela.
    if (permissionItemMatches(group.screen, query)) {
      result.push(group);
      continue;
    }
    // Tela não casou, mas alguma ação sim: leva a tela só com as ações que casaram.
    const actions = group.actions.filter(a => permissionItemMatches(a, query));
    if (actions.length > 0) result.push({ screen: group.screen, actions });
  }
  return result;
}

/** Filtra a lista de ações sem tela-pai (bloco "Geral" do editor). */
export function filterPermissionActions<TAction extends PermissionSearchItem>(
  actions: TAction[],
  query: string,
): TAction[] {
  if (!normalizePermissionText(query)) return actions;
  return actions.filter(a => permissionItemMatches(a, query));
}
