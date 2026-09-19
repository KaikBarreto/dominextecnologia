/**
 * Hierarquia de categoria financeira, em memória.
 *
 * A lista de categorias já chega INTEIRA no client (`useFinancialCategories`
 * faz um `select('*')` por empresa; o maior tenant tem 48 categorias). Então
 * tudo aqui é O(n) sobre essa lista: nenhuma contagem desnormalizada, nenhuma
 * consulta por categoria, nenhum N+1.
 *
 * Regras que o BANCO garante (gatilho `trg_financial_categories_valida_parent`,
 * migration 20260919260000) e que estes helpers assumem:
 * - só DOIS níveis: raiz e filha. Neto é recusado.
 * - pai e filha da mesma empresa e de `type` compatível.
 * - nome ÚNICO por empresa, inclusive entre filhas de pais diferentes.
 * - excluir o pai NÃO apaga a filha (`ON DELETE SET NULL`): ela vira raiz.
 * - o pai continua aceitando lançamento direto. Ganhar filha não o transforma
 *   em cabeçalho: o histórico dele continua dele.
 */

export interface CategoryNodeLike {
  id: string;
  name: string;
  parent_id: string | null;
}

const NO_CHILDREN: readonly unknown[] = Object.freeze([]);

export interface CategoryTree<T extends CategoryNodeLike> {
  /** Categorias sem pai DENTRO do recorte recebido, na ordem original. */
  roots: T[];
  /** Filhas de um id, na ordem original. Sempre o MESMO array vazio quando não há. */
  childrenOf: (id: string) => readonly T[];
  hasChildren: (id: string) => boolean;
  parentOf: (cat: CategoryNodeLike) => T | null;
  byId: Map<string, T>;
  byName: Map<string, T>;
}

/**
 * Monta o mapa `parent_id → filhas` numa passada.
 *
 * Filha cujo PAI não está no recorte recebido (ex.: lista filtrada por tipo, ou
 * pai inativo escondido do select) é tratada como RAIZ — senão ela sumiria da
 * tela sem nenhum aviso, que é pior do que aparecer um nível acima.
 */
export function buildCategoryTree<T extends CategoryNodeLike>(
  categories: readonly T[] | null | undefined,
): CategoryTree<T> {
  const list = categories ?? [];
  const byId = new Map<string, T>();
  const byName = new Map<string, T>();
  for (const cat of list) {
    byId.set(cat.id, cat);
    byName.set(cat.name, cat);
  }

  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const cat of list) {
    const parentId = cat.parent_id;
    if (parentId && byId.has(parentId)) {
      const arr = children.get(parentId);
      if (arr) arr.push(cat);
      else children.set(parentId, [cat]);
    } else {
      roots.push(cat);
    }
  }

  return {
    roots,
    childrenOf: (id: string) => children.get(id) ?? (NO_CHILDREN as readonly T[]),
    hasChildren: (id: string) => (children.get(id)?.length ?? 0) > 0,
    parentOf: (cat: CategoryNodeLike) => (cat.parent_id ? byId.get(cat.parent_id) ?? null : null),
    byId,
    byName,
  };
}

/** Quantas linhas uma raiz ocupa na tela (ela mesma + filhas). */
export function countWithChildren<T extends CategoryNodeLike>(tree: CategoryTree<T>, root: T): number {
  return 1 + tree.childrenOf(root.id).length;
}

// ─── Select em cascata ──────────────────────────────────────────────────────

export interface CategoryCascade<T extends CategoryNodeLike> {
  /** Nome da RAIZ exibida no primeiro select. '' quando nada escolhido. */
  parentName: string;
  /** Nome da FILHA escolhida. '' quando o valor gravado é a própria raiz. */
  childName: string;
  /** Filhas da raiz escolhida. Vazio = segundo select nem aparece. */
  children: readonly T[];
}

/**
 * Traduz o NOME GRAVADO (sempre o da folha escolhida, nunca "Pai › Filha") nos
 * dois selects da cascata.
 *
 * O caminho "Pai › Filha" é só visual: o que vai pro banco continua sendo uma
 * string só, no mesmo campo de sempre (`financial_transactions.category`).
 */
export function resolveCategoryCascade<T extends CategoryNodeLike>(
  tree: CategoryTree<T>,
  selectedName: string | null | undefined,
): CategoryCascade<T> {
  const selected = (selectedName ?? '').trim();
  if (!selected) return { parentName: '', childName: '', children: NO_CHILDREN as readonly T[] };

  const cat = tree.byName.get(selected);
  if (!cat) {
    // Nome órfão (categoria apagada): continua sendo o valor do primeiro select,
    // pra o campo não parecer vazio ao editar um lançamento antigo.
    return { parentName: selected, childName: '', children: NO_CHILDREN as readonly T[] };
  }

  const parent = tree.parentOf(cat);
  if (parent) {
    return { parentName: parent.name, childName: cat.name, children: tree.childrenOf(parent.id) };
  }
  return { parentName: cat.name, childName: '', children: tree.childrenOf(cat.id) };
}

// ─── Agregação da DRE ───────────────────────────────────────────────────────

export interface DreRowLike {
  name: string;
  key: string;
  value: number;
}

export type DreRowNode<R extends DreRowLike> =
  | { kind: 'leaf'; key: string; row: R }
  | {
      kind: 'parent';
      key: string;
      name: string;
      /** Subtotal = linha própria do pai + filhas DESTE MESMO grupo. Nunca soma por cima. */
      total: number;
      /** Linha do próprio pai (lançamento direto nele). `null` = pai sem lançamento próprio. */
      own: R | null;
      children: R[];
    };

export interface GroupDreRowsOptions {
  /** Nome do pai da categoria, ou `null` pra raiz/pai desconhecido. */
  parentNameOf: (categoryName: string) => string | null;
  /**
   * `true` quando o PAI pertence ao MESMO grupo do DRE desta lista.
   *
   * 🔴 É esta pergunta que impede o vazamento entre grupos: filha `opex` de um
   * pai `cmv` continua sendo uma linha SOLTA dentro de OPEX. Se ela fosse somada
   * no subtotal do pai (que vive em CSP), o total de OPEX deixaria de bater com
   * a soma das linhas de OPEX, e o valor apareceria em dois grupos.
   */
  parentInSameGroup: (parentName: string) => boolean;
  /** Chave da linha agregada, no mesmo padrão `${grupo}:${nome}` das linhas. */
  makeKey: (categoryName: string) => string;
}

/**
 * Dobra as linhas de UM grupo do DRE em nós pai/folha.
 *
 * INVARIANTE (testada): a soma de `total`/`row.value` dos nós devolvidos é
 * EXATAMENTE a soma de `value` das linhas recebidas. Toda linha aparece em
 * exatamente um nó: ou como folha, ou dentro de um único pai. Recolher o pai
 * mostra o subtotal NO LUGAR das filhas, nunca por cima delas.
 */
export function groupDreRowsByParent<R extends DreRowLike>(
  rows: readonly R[],
  opts: GroupDreRowsOptions,
): DreRowNode<R>[] {
  const { parentNameOf, parentInSameGroup, makeKey } = opts;

  // 1ª passada: quem é filha de um pai que mora NESTE grupo.
  const childrenByParent = new Map<string, R[]>();
  for (const row of rows) {
    const parentName = parentNameOf(row.name);
    if (!parentName || !parentInSameGroup(parentName)) continue;
    const arr = childrenByParent.get(parentName);
    if (arr) arr.push(row);
    else childrenByParent.set(parentName, [row]);
  }
  if (childrenByParent.size === 0) {
    // Nenhuma hierarquia neste grupo: a tela continua idêntica ao que era.
    return rows.map((row) => ({ kind: 'leaf', key: row.key, row }));
  }

  // 2ª passada: monta os nós, sem repetir nenhuma linha.
  const nodes: DreRowNode<R>[] = [];
  const emitted = new Set<string>();
  for (const row of rows) {
    const parentName = parentNameOf(row.name);
    const isChildHere = !!parentName && parentInSameGroup(parentName);
    if (isChildHere) continue; // entra dentro do pai, não como linha solta

    const children = childrenByParent.get(row.name);
    if (children && children.length > 0) {
      emitted.add(row.name);
      nodes.push({
        kind: 'parent',
        key: makeKey(row.name),
        name: row.name,
        total: row.value + children.reduce((acc, c) => acc + c.value, 0),
        own: row,
        children,
      });
    } else {
      nodes.push({ kind: 'leaf', key: row.key, row });
    }
  }

  // Pai SEM lançamento próprio no período: não existe linha pra ele em `rows`,
  // mas as filhas existem. O nó nasce assim mesmo, com `own: null` — senão as
  // filhas sumiriam da tela.
  for (const [parentName, children] of childrenByParent) {
    if (emitted.has(parentName)) continue;
    nodes.push({
      kind: 'parent',
      key: makeKey(parentName),
      name: parentName,
      total: children.reduce((acc, c) => acc + c.value, 0),
      own: null,
      children,
    });
  }

  // Mesma ordem de leitura das linhas simples: do maior pro menor.
  return nodes.sort((a, b) => nodeValue(b) - nodeValue(a));
}

export function nodeValue<R extends DreRowLike>(node: DreRowNode<R>): number {
  return node.kind === 'leaf' ? node.row.value : node.total;
}
