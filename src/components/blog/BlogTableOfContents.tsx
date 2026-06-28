import { useEffect, useMemo, useState, type RefObject } from 'react';
import { ChevronRight, List, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const COLLAPSE_KEY = 'blog-toc-collapsed';

type TocItem = { id: string; text: string; level: 2 | 3 };

/** Um grupo do índice: um H2 e os H3 que vêm depois dele até o próximo H2. */
type TocGroup = { head: TocItem; children: TocItem[] };

/**
 * Índice de navegação ("estrutura do documento", estilo Google Docs) do post,
 * em formato de ACCORDION por seção.
 *
 * Lê os <h2>/<h3> que vivem DENTRO do HTML renderizado por
 * dangerouslySetInnerHTML no container `.blog-content`. Como esses títulos não
 * têm `id`, atribuímos um slug em runtime pra poder ancorar/rolar até eles.
 *
 * Estrutura:
 *  - Cada H2 vira o cabeçalho de um accordion (negrito, maior), com chevron.
 *  - Os H3 abaixo dele ficam num painel colapsável, FECHADO por padrão.
 *  - H2 sem filhos não tem chevron nem painel.
 *
 * Scroll-spy via IntersectionObserver marca a seção atual e AUTO-EXPANDE o
 * grupo onde o leitor está (recolhendo os demais). Clique em H2/H3 navega;
 * clique no H2 também alterna o accordion. Desktop-only: quem renderiza
 * esconde no mobile (`hidden lg:block`).
 */

/** Slug kebab-case acent-safe a partir do texto do heading. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export function BlogTableOfContents({
  contentRef,
  // `contentKey` força recoleta quando o conteúdo do post muda (ex.: troca de slug).
  contentKey,
}: {
  contentRef: RefObject<HTMLElement | null>;
  contentKey?: string | number;
}) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Grupos expandidos manualmente (chave = id do H2 cabeçalho).
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // Grupo expandido pelo scroll-spy (1 por vez). Combina com os manuais.
  const [autoOpenGroup, setAutoOpenGroup] = useState<string | null>(null);
  // Painel inteiro recolhido (estilo Google Docs). Default ABERTO; persiste.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  });

  const setCollapsedPersisted = (value: boolean) => {
    setCollapsed(value);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
    } catch {
      /* localStorage indisponível: estado segue só em memória. */
    }
  };

  // 1) Coleta os headings DEPOIS do conteúdo montar, atribui ids e monta a lista.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const headings = Array.from(
      root.querySelectorAll<HTMLHeadingElement>('h2, h3'),
    );
    const used = new Set<string>();
    const collected: TocItem[] = [];

    for (const heading of headings) {
      const text = (heading.textContent || '').trim();
      if (!text) continue;

      let id = heading.id;
      if (!id) {
        const base = slugify(text) || 'secao';
        let candidate = base;
        let i = 2;
        while (used.has(candidate)) candidate = `${base}-${i++}`;
        id = candidate;
        heading.id = id;
      }
      used.add(id);

      // offset pro header sticky (h-16/top-24) ao usar âncoras nativas.
      heading.style.scrollMarginTop = '96px';

      collected.push({ id, text, level: heading.tagName === 'H3' ? 3 : 2 });
    }

    setItems(collected);
    setOpenGroups(new Set());
    setAutoOpenGroup(null);
    // contentKey/contentRef.current variam quando o post muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentRef, contentKey]);

  // 2) Agrupa em H2 -> [H3...]. H3 órfãos (antes de qualquer H2) viram grupo
  //    sem cabeçalho real, usando o próprio H3 como "head" (sem filhos).
  const groups = useMemo<TocGroup[]>(() => {
    const result: TocGroup[] = [];
    let current: TocGroup | null = null;

    for (const item of items) {
      if (item.level === 2) {
        current = { head: item, children: [] };
        result.push(current);
      } else if (current) {
        current.children.push(item);
      } else {
        // H3 sem H2 anterior: trata como grupo próprio sem filhos.
        result.push({ head: item, children: [] });
      }
    }
    return result;
  }, [items]);

  // Mapa id -> id do H2 cabeçalho do grupo a que pertence (pra auto-expand).
  const groupOfId = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      map.set(g.head.id, g.head.id);
      for (const c of g.children) map.set(c.id, g.head.id);
    }
    return map;
  }, [groups]);

  // 3) Scroll-spy: marca a seção visível mais alta no viewport.
  useEffect(() => {
    if (items.length === 0) return;

    const observed = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => !!el);
    if (observed.length === 0) return;

    // Guarda quais headings estão "em vista" pra escolher o mais alto.
    const visible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            visible.delete(entry.target.id);
          }
        }

        if (visible.size > 0) {
          // O mais próximo do topo (menor top) é a seção atual.
          let topId: string | null = null;
          let topVal = Infinity;
          visible.forEach((top, id) => {
            if (top < topVal) {
              topVal = top;
              topId = id;
            }
          });
          if (topId) setActiveId(topId);
        }
      },
      {
        // Faixa de detecção logo abaixo do header sticky até ~60% da tela.
        rootMargin: '-96px 0px -55% 0px',
        threshold: 0,
      },
    );

    observed.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  // 4) Auto-expande o grupo da seção ativa (scroll-spy) e recolhe os demais
  //    auto-abertos. Os manuais (openGroups) continuam respeitados.
  useEffect(() => {
    if (!activeId) return;
    const owner = groupOfId.get(activeId);
    setAutoOpenGroup(owner ?? null);
  }, [activeId, groupOfId]);

  const navigateTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
    // Atualiza o hash sem pular bruscamente.
    history.replaceState(null, '', `#${id}`);
  };

  const toggleGroup = (headId: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      // O estado "aberto" efetivo considera também o auto-open; ao clicar,
      // alternamos contra esse estado efetivo pra o clique sempre "fazer algo".
      const effectivelyOpen = next.has(headId) || autoOpenGroup === headId;
      if (effectivelyOpen) {
        next.delete(headId);
        // Se o auto-open era esse grupo, derruba pra fechar de fato.
        if (autoOpenGroup === headId) setAutoOpenGroup(null);
      } else {
        next.add(headId);
      }
      return next;
    });
  };

  const isGroupOpen = (headId: string) =>
    openGroups.has(headId) || autoOpenGroup === headId;

  if (groups.length === 0) return null;

  // RECOLHIDO: só um botão-ícone sticky no lugar do índice. O conteúdo não se
  // mexe porque a coluna do grid (2xl) tem largura fixa de qualquer jeito.
  if (collapsed) {
    return (
      <div className="sticky top-24">
        <button
          type="button"
          onClick={() => setCollapsedPersisted(false)}
          aria-expanded={false}
          aria-label="Mostrar índice"
          title="Mostrar índice"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50 dark:hover:border-primary/40 dark:hover:text-primary"
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <nav
      aria-label="Conteúdo do artigo"
      className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2"
    >
      <div className="mb-3 flex items-center justify-between gap-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-white/40">
          <List className="h-3.5 w-3.5" />
          Neste artigo
        </p>
        <button
          type="button"
          onClick={() => setCollapsedPersisted(true)}
          aria-expanded={true}
          aria-label="Recolher índice"
          title="Recolher índice"
          className="-mr-1 flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-white/40 dark:hover:bg-white/[0.06] dark:hover:text-white/80"
        >
          <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <ul className="space-y-0.5 border-l border-neutral-200 dark:border-white/10">
        {groups.map((group) => {
          const headId = group.head.id;
          const hasChildren = group.children.length > 0;
          const open = hasChildren && isGroupOpen(headId);
          const headActive = group.head.id === activeId;
          const panelId = `toc-panel-${headId}`;

          return (
            <li key={headId}>
              {/* Cabeçalho H2: negrito e maior; alterna accordion + navega. */}
              <button
                type="button"
                onClick={() => {
                  if (hasChildren) toggleGroup(headId);
                  navigateTo(headId);
                }}
                aria-current={headActive ? 'location' : undefined}
                aria-expanded={hasChildren ? open : undefined}
                aria-controls={hasChildren ? panelId : undefined}
                className={[
                  'group -ml-px flex w-full items-center border-l-2 py-1.5 pl-1.5 pr-2 text-left text-sm font-semibold leading-snug transition-colors',
                  headActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-neutral-700 hover:border-neutral-300 hover:text-neutral-900 dark:text-white/70 dark:hover:border-white/25 dark:hover:text-white',
                ].join(' ')}
              >
                {/* Gutter de largura FIXA: o chevron mora aqui quando há filhos;
                    quando não há, o slot fica vazio mas ocupa o mesmo espaço,
                    pra TODOS os títulos H2 começarem na mesma posição x. */}
                <span className="flex w-4 shrink-0 items-center justify-center">
                  {hasChildren ? (
                    <ChevronRight
                      aria-hidden="true"
                      className={[
                        'h-3.5 w-3.5 transition-transform duration-200',
                        open ? 'rotate-90' : '',
                      ].join(' ')}
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 pl-1">{group.head.text}</span>
              </button>

              {/* Painel colapsável com os H3 filhos. Animação por grid-rows. */}
              {hasChildren ? (
                <div
                  id={panelId}
                  role="region"
                  aria-label={group.head.text}
                  className={[
                    'grid transition-[grid-template-rows] duration-200 ease-out',
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                  ].join(' ')}
                >
                  <div className="overflow-hidden">
                    <ul className="space-y-0.5 pb-0.5">
                      {group.children.map((child) => {
                        const childActive = child.id === activeId;
                        return (
                          <li key={child.id}>
                            <a
                              href={`#${child.id}`}
                              onClick={(e) => {
                                e.preventDefault();
                                navigateTo(child.id);
                              }}
                              aria-current={childActive ? 'location' : undefined}
                              tabIndex={open ? 0 : -1}
                              className={[
                                'group -ml-px block border-l-2 py-1 pl-7 text-xs leading-snug transition-colors',
                                childActive
                                  ? 'border-primary font-semibold text-primary'
                                  : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800 dark:text-white/45 dark:hover:border-white/25 dark:hover:text-white/80',
                              ].join(' ')}
                            >
                              {child.text}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default BlogTableOfContents;
