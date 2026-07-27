import { useMemo, useState } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, ListTree, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { EmptyState } from '@/components/mobile/EmptyState';
import type { OrgChartGraph, OrgNode } from '@/hooks/useOrgCharts';

interface Props {
  graph: OrgChartGraph;
  className?: string;
}

// Nó com lista de filhos (para renderização recursiva).
interface TreeNode {
  node: OrgNode;
  children: TreeNode[];
}

/**
 * Monta a árvore de hierarquia a partir das arestas do grafo.
 *
 * Regras:
 * - source = chefe (pai), target = subordinado (filho).
 * - Raízes = nós que NUNCA aparecem como `target` de nenhuma aresta.
 * - Nós soltos (sem nenhuma aresta) também são raízes.
 * - Guarda de ciclo via Set de visitados: nó já visitado não é expandido
 *   novamente (evita loop infinito em grafos com ciclo ou multi-pai).
 * - Fallback: se todos os nós têm pai (ciclo puro), trata todos como raízes.
 * - Irmãos ordenados por name (estável).
 */
function buildTree(graph: OrgChartGraph): TreeNode[] {
  const { nodes, edges } = graph;

  if (nodes.length === 0) return [];

  const nodeById = new Map<string, OrgNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // Mapa: parentId → [childId, ...]
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const e of edges) {
    if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
    childrenOf.get(e.source)!.push(e.target);
    hasParent.add(e.target);
  }

  // Raízes = nodes que nunca são target de nenhuma aresta.
  let roots = nodes.filter((n) => !hasParent.has(n.id));

  // Fallback: ciclo puro — todos têm pai. Trata todos como raízes de 1º nível.
  if (roots.length === 0 && nodes.length > 0) {
    roots = [...nodes];
  }

  // Ordena raízes por nome.
  roots = [...roots].sort((a, b) => a.data.name.localeCompare(b.data.name));

  // Constrói recursivamente, cortando ciclos via Set global de visitados.
  const globalVisited = new Set<string>();

  function buildNode(nodeId: string): TreeNode | null {
    const node = nodeById.get(nodeId);
    if (!node) return null;
    if (globalVisited.has(nodeId)) return null; // ciclo detectado
    globalVisited.add(nodeId);

    const childIds = (childrenOf.get(nodeId) ?? []).slice().sort((a, b) => {
      const na = nodeById.get(a)?.data.name ?? '';
      const nb = nodeById.get(b)?.data.name ?? '';
      return na.localeCompare(nb);
    });

    const children: TreeNode[] = [];
    for (const cid of childIds) {
      // Nós com múltiplos pais: podem ser visitados via outro caminho,
      // mas o globalVisited corta a recursão repetida aqui.
      const child = buildNode(cid);
      if (child) children.push(child);
    }

    return { node, children };
  }

  const result: TreeNode[] = [];
  for (const root of roots) {
    const tree = buildNode(root.id);
    if (tree) result.push(tree);
  }

  return result;
}

/** Coleta todos os IDs de nós em uma subárvore (para determinar o default aberto). */
function collectIds(nodes: TreeNode[], maxDepth: number, depth = 0): Set<string> {
  const ids = new Set<string>();
  if (depth >= maxDepth) return ids;
  for (const n of nodes) {
    ids.add(n.node.id);
    if (n.children.length > 0) {
      for (const id of collectIds(n.children, maxDepth, depth + 1)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

/** Coleta IDs de todos os nós QUE TÊM filhos (para "expandir tudo"). */
function collectParentIds(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) {
        ids.add(n.node.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

/** Conta o total de nós na árvore. */
function countNodes(nodes: TreeNode[]): number {
  let total = 0;
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      total += 1;
      walk(n.children);
    }
  };
  walk(nodes);
  return total;
}

/**
 * Resultado do filtro de busca:
 * - `visible`: IDs que devem aparecer (matches + seus ancestrais).
 * - `matches`: IDs que casam com o termo (para destacar).
 * - `forceExpand`: ancestrais de matches (revela caminhos fundos).
 */
interface SearchResult {
  visible: Set<string>;
  matches: Set<string>;
  forceExpand: Set<string>;
}

function computeSearch(nodes: TreeNode[], term: string): SearchResult | null {
  const q = term.trim().toLowerCase();
  if (!q) return null;

  const visible = new Set<string>();
  const matches = new Set<string>();
  const forceExpand = new Set<string>();

  const walk = (node: TreeNode, ancestors: string[]): boolean => {
    const { name, role, sector } = node.node.data;
    const hay = `${name ?? ''} ${role ?? ''} ${sector ?? ''}`.toLowerCase();
    const selfMatch = hay.includes(q);

    let childMatch = false;
    for (const child of node.children) {
      if (walk(child, [...ancestors, node.node.id])) childMatch = true;
    }

    if (selfMatch || childMatch) {
      visible.add(node.node.id);
      if (selfMatch) matches.add(node.node.id);
      // Ancestrais precisam ficar visíveis e expandidos para revelar o match.
      for (const a of ancestors) {
        visible.add(a);
        forceExpand.add(a);
      }
      // Se o próprio nó tem filhos que casam, expande ele também.
      if (childMatch) forceExpand.add(node.node.id);
      return true;
    }
    return false;
  };

  for (const root of nodes) walk(root, []);
  return { visible, matches, forceExpand };
}

/** Destaca ocorrências do termo dentro de um texto. */
function highlight(text: string, term: string) {
  const q = term.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(lq, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={key++} className="rounded bg-primary/20 px-0.5 text-primary">
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    i = idx + q.length;
  }
  return parts;
}

// ── Sub-componente de linha de nó ──────────────────────────────────────────────
interface NodeRowProps {
  treeNode: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  search: SearchResult | null;
  term: string;
  /** Guias de indentação: um flag por nível ancestral indicando se há irmão
   *  abaixo naquele nível (para desenhar a linha vertical contínua ou parar). */
  ancestorHasNext: boolean[];
  isLast: boolean;
}

function NodeRow({
  treeNode,
  depth,
  expanded,
  onToggle,
  search,
  term,
  ancestorHasNext,
  isLast,
}: NodeRowProps) {
  const { node } = treeNode;
  const { name, role, sector, sectorColor } = node.data;

  // Filhos visíveis (respeitando busca).
  const visibleChildren = search
    ? treeNode.children.filter((c) => search.visible.has(c.node.id))
    : treeNode.children;
  const hasChildren = visibleChildren.length > 0;

  // Durante busca, ancestrais forçados ficam abertos independente do Set.
  const isOpen = hasChildren && (expanded.has(node.id) || (search?.forceExpand.has(node.id) ?? false));
  const isMatch = search?.matches.has(node.id) ?? false;

  const INDENT = 20; // px por nível

  return (
    <div>
      {/* Linha do nó */}
      <div
        className={cn(
          'group relative flex min-h-[42px] items-center gap-2 rounded-lg pr-2 transition-colors',
          isMatch ? 'bg-primary/5' : 'hover:bg-muted/60',
        )}
      >
        {/* Guias de indentação verticais (uma por nível ancestral) */}
        {ancestorHasNext.map((hasNext, level) => (
          <span
            key={level}
            aria-hidden
            className="pointer-events-none absolute top-0 h-full border-l border-border/60"
            style={{ left: `${8 + level * INDENT + 9}px`, display: hasNext ? 'block' : 'none' }}
          />
        ))}
        {/* Conector L do nó atual (curva do pai até este item) */}
        {depth > 0 && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 border-l border-border/60"
              style={{
                left: `${8 + (depth - 1) * INDENT + 9}px`,
                height: isLast ? '21px' : '100%',
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute border-b border-border/60"
              style={{
                left: `${8 + (depth - 1) * INDENT + 9}px`,
                width: `${INDENT - 4}px`,
                top: '21px',
              }}
            />
          </>
        )}

        {/* Chevron ou espaçador, indentado pelo nível */}
        <span className="flex shrink-0 items-center" style={{ paddingLeft: `${8 + depth * INDENT}px` }}>
          {hasChildren ? (
            <button
              type="button"
              aria-label={isOpen ? 'Recolher' : 'Expandir'}
              aria-expanded={isOpen}
              onClick={() => onToggle(node.id)}
              className={cn(
                'z-[1] flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors',
                'hover:bg-muted hover:text-foreground',
              )}
            >
              <ChevronRight
                className={cn('h-4 w-4 transition-transform duration-150', isOpen && 'rotate-90')}
              />
            </button>
          ) : (
            <span className="h-5 w-5" aria-hidden />
          )}
        </span>

        {/* Bolinha de cor do setor */}
        {sectorColor ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
            style={{ backgroundColor: sectorColor }}
            aria-hidden
          />
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/25" aria-hidden />
        )}

        {/* Nome e cargo — whitespace-nowrap para que a linha mais funda
            estique o painel (width: max-content). Overflow horizontal é
            tratado pelo scroll do miolo (overflow-auto). */}
        <span className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0">
          <span className={cn('whitespace-nowrap text-sm font-medium', isMatch ? 'text-primary' : 'text-foreground')}>
            {term ? highlight(name, term) : name}
          </span>
          {role && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {term ? highlight(role, term) : role}
            </span>
          )}
          {sector && !role && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {term ? highlight(sector, term) : sector}
            </span>
          )}
        </span>

        {/* Chip de setor (quando já tem cargo — fica na extremidade direita) */}
        {sector && role && (
          <span
            className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-block"
            style={
              sectorColor
                ? { backgroundColor: `${sectorColor}22`, color: sectorColor }
                : undefined
            }
          >
            {sector}
          </span>
        )}
      </div>

      {/* Filhos — mostrados somente se expandido */}
      {hasChildren && isOpen && (
        <div>
          {visibleChildren.map((child, i) => (
            <NodeRow
              key={child.node.id}
              treeNode={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              search={search}
              term={term}
              ancestorHasNext={[...ancestorHasNext, !isLast]}
              isLast={i === visibleChildren.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export function OrgChartTreeView({ graph, className }: Props) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.orgchart;

  const tree = useMemo(() => buildTree(graph), [graph]);
  const total = useMemo(() => countNodes(tree), [tree]);

  // Default: expande os 2 primeiros níveis.
  const defaultExpanded = useMemo(() => collectIds(tree, 2), [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);

  const [term, setTerm] = useState('');
  const search = useMemo(() => computeSearch(tree, term), [tree, term]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(collectParentIds(tree));
  const collapseAll = () => setExpanded(new Set());

  // Raízes visíveis (respeitando busca).
  const visibleRoots = search ? tree.filter((r) => search.visible.has(r.node.id)) : tree;

  if (graph.nodes.length === 0) {
    return (
      <div className={cn('flex h-full items-center justify-center py-12', className)}>
        <EmptyState
          icon={<ListTree className="h-10 w-10" />}
          title={t.empty.title}
          description={t.empty.description}
          size="compact"
        />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col bg-card', className)}>
      {/* Controles fixos no topo */}
      <div className="shrink-0 space-y-2 border-b p-2.5">
        {/* Busca */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t.searchPlaceholder}
            className={cn(
              'h-9 w-full rounded-lg border bg-background pl-8 pr-8 text-sm text-foreground outline-none',
              'placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40',
            )}
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label={t.close}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Ações: expandir/recolher tudo + contador */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandAll}
              title={t.expandAll}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.expandAll}</span>
            </button>
            <button
              type="button"
              onClick={collapseAll}
              title={t.collapseAll}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.collapseAll}</span>
            </button>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t.peopleCount.replace('{count}', String(total))}
          </span>
        </div>
      </div>

      {/* Árvore rolável — overflow-auto: Y sempre, X quando bater no maxWidth do painel */}
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {visibleRoots.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {t.searchEmpty}
          </div>
        ) : (
          visibleRoots.map((rootNode, i) => (
            <NodeRow
              key={rootNode.node.id}
              treeNode={rootNode}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              search={search}
              term={term}
              ancestorHasNext={[]}
              isLast={i === visibleRoots.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
}
