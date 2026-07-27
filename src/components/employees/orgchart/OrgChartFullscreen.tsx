import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Layers, ListTree, Search, StickyNote, X } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';
import type { OrgChart, OrgNode } from '@/hooks/useOrgCharts';
import { OrgChartCanvas } from './OrgChartCanvas';
import { OrgChartTreeView } from './OrgChartTreeView';

// ── Tipo de foco ──────────────────────────────────────────────────────────────
// ids  = nós que devem ficar em evidência (opacity 1).
// focusId = nó que deve ser centralizado no canvas (só "busca pessoa").
export interface Spotlight {
  ids: string[];
  focusId?: string;
}

type ToolId = 'tree' | 'highlight' | 'search';

/**
 * Ferramentas da toolkit vertical (esquerda, dentro do canvas). Container
 * extensível: para adicionar uma ferramenta nova, basta empurrar um item aqui
 * (ícone lucide + chave de i18n do rótulo) e tratar seu `id` no painel abaixo.
 *
 * Itens com `action` são ações imediatas (não abrem painel, não ficam "ativos").
 * Itens sem `action` são panel tools (togglam activeTool).
 */
type ToolEntry =
  | {
      kind: 'action';
      icon: typeof ListTree;
      labelKey: 'addBoxTool';
      action: () => void;
    }
  | {
      kind: 'panel';
      id: ToolId;
      icon: typeof ListTree;
      labelKey: 'treeTool' | 'highlightTool' | 'searchTool';
    };

// Normaliza string para busca: lower-case + remove acentos.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Editor de organograma em TELA CHEIA.
 *
 * Renderiza (via portal no body) um container que se ancora sobre o `<main>` do
 * shell do app — ou seja, cobre exatamente a região de conteúdo (abaixo do
 * header, acima do footer, ao lado do sidebar) SEM esconder a navegação. O
 * sub-nav das abas de Funcionários some porque o `OrgChartTab` deixa de
 * renderizá-lo enquanto este overlay está montado.
 *
 * A ancoragem é feita medindo o retângulo do `<main>` (com ResizeObserver +
 * listeners de resize/scroll), então funciona nos 3 shells (sidebar/topbar/
 * mobile) sem hardcodar alturas de header/footer.
 */
export function OrgChartFullscreen({
  chart,
  onBack,
  backLabel,
}: {
  chart: OrgChart;
  onBack: () => void;
  backLabel: string;
}) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  // Controla o estado de animação: entra em 'enter' no mount (fade + zoom-in),
  // vai pra 'leave' ao sair (fade + zoom-out) e só então chama onBack.
  const [phase, setPhase] = useState<'enter' | 'shown' | 'leave'>('enter');
  // Ferramenta ativa da toolkit lateral. `null` = nenhuma (só o canvas visível).
  // Container extensível: novas ferramentas entram em TOOLS abaixo.
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  // Sinal de nonce para disparar addBox no Canvas (incrementar = chamar addBox uma vez).
  const [addBoxSignal, setAddBoxSignal] = useState(0);

  // ── Estado de foco (spotlight) ────────────────────────────────────────────
  // null = sem foco (todos os nós visíveis normalmente).
  // { ids } = só esses nós ficam opacos; o resto esmaece para 0.15.
  // { ids, focusId } = mesma coisa + centraliza no nó focusId.
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);

  // Sinaliza que o container está pronto para o Canvas fazer fitBounds.
  // Usamos setTimeout fixo (transição dura 250ms + 80ms de folga) porque
  // onTransitionEnd num portal do React é não-confiável: o evento pode ser
  // engolido se o browser não pintar o frame inicial antes de o listener existir.
  const [containerReady, setContainerReady] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  // ── Painel arrastável ────────────────────────────────────────────────────────
  // null = posição padrão (centralizado verticalmente por CSS top:50%+translateY).
  // Quando setado com {x, y}, o painel usa coordenadas absolutas dentro do overlay
  // e transform:none (desativa o centro CSS).
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);

  // Ref para o elemento do painel e para o overlay (container posicionado).
  const panelRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Estado interno do arraste — guardado em ref para não causar re-render por
  // evento de ponteiro. Apenas panelPos (resultado final do move) dispara render.
  const dragState = useRef<{
    dragging: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanelX: number;
    startPanelY: number;
  } | null>(null);

  // Controla se o toolkit lateral está expandido (mouse hover). Usado para
  // empurrar o painel flutuante para a direita e evitar sobreposição.
  const [toolkitExpanded, setToolkitExpanded] = useState(false);

  // Ao (re)abrir qualquer ferramenta, reset para posição centralizada E limpa o spotlight.
  useEffect(() => {
    setPanelPos(null);
    // Limpa o foco ao trocar de ferramenta (evita nós "presos" esmaecidos).
    setSpotlight(null);
  }, [activeTool]);

  // Handlers do arraste via Pointer Events (captura para não perder o ponteiro
  // ao arrastar rápido fora do cabeçalho).
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ignora cliques no botão X (ou dentro dele).
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;

    e.preventDefault();

    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;

    const overlayRect = overlay.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    // Posição atual do painel relativa ao overlay.
    const currentX = panelRect.left - overlayRect.left;
    const currentY = panelRect.top - overlayRect.top;

    dragState.current = {
      dragging: true,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanelX: currentX,
      startPanelY: currentY,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current;
    if (!ds || !ds.dragging || ds.pointerId !== e.pointerId) return;

    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;

    const overlayRect = overlay.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    const dx = e.clientX - ds.startClientX;
    const dy = e.clientY - ds.startClientY;

    let newX = ds.startPanelX + dx;
    let newY = ds.startPanelY + dy;

    // Clamp: x — nunca escapa pela direita; nunca vai além da esquerda.
    const maxX = overlayRect.width - Math.min(panelRect.width, overlayRect.width);
    newX = Math.max(0, Math.min(newX, maxX));

    // Clamp: y — mantém pelo menos 48px de cabeçalho dentro do overlay (agarrável).
    const HEADER_HEIGHT = 48;
    newY = Math.max(0, Math.min(newY, overlayRect.height - HEADER_HEIGHT));

    setPanelPos({ x: newX, y: newY });
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragState.current;
    if (!ds || ds.pointerId !== e.pointerId) return;
    dragState.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // isDragging: derivado do ref — usado só para atualizar o cursor no cabeçalho.
  // Como refs não disparam render, usamos um state mínimo para o cursor.
  const [isDragging, setIsDragging] = useState(false);

  const handleHeaderPointerDownWithCursor = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    setIsDragging(true);
    handleHeaderPointerDown(e);
  };

  const handleHeaderPointerUpWithCursor = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    handleHeaderPointerUp(e);
  };

  const handleHeaderPointerMoveWithCursor = (e: React.PointerEvent<HTMLDivElement>) => {
    handleHeaderPointerMove(e);
  };
  // ── fim Painel arrastável ────────────────────────────────────────────────────

  // Localiza o <main> do shell e mede seu retângulo. Reage a resize do main,
  // resize da janela e scroll (o main pode se deslocar em telas curtas).
  useLayoutEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    mainRef.current = main;
    if (!main) return;

    const measure = () => {
      const r = main.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(main);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, []);

  // Dispara a transição de entrada no próximo frame (permite o browser pintar o
  // estado inicial 'enter' antes de animar para 'shown'). Após 330ms (250ms de
  // transição + 80ms de folga), sinaliza que o container está estável para o
  // Canvas poder rodar o fitBounds com tamanho real. Não depende de
  // onTransitionEnd, que é não-confiável em portais do React.
  useEffect(() => {
    const rafId = requestAnimationFrame(() => setPhase('shown'));
    const timerId = window.setTimeout(() => setContainerReady(true), 330);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, []);

  // Trava o scroll do body enquanto o editor está aberto (o canvas tem pan/zoom
  // próprio; scroll da página atrás atrapalharia).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleBack = () => {
    setPhase('leave');
    // Espera a transição de saída (~220ms) antes de desmontar.
    window.setTimeout(onBack, 220);
  };

  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.orgchart;

  // ── Setores únicos presentes no grafo (para a ferramenta "Destacar por setor") ──
  const uniqueSectors = useMemo(() => {
    const map = new Map<string, { color: string | undefined; ids: string[] }>();
    for (const node of chart.data.nodes) {
      const sector = node.data.sector?.trim();
      if (!sector) continue;
      if (!map.has(sector)) {
        map.set(sector, { color: node.data.sectorColor, ids: [] });
      }
      map.get(sector)!.ids.push(node.id);
    }
    return Array.from(map.entries()).map(([sector, { color, ids }]) => ({ sector, color, ids }));
  }, [chart.data.nodes]);

  // ── Estado da busca de pessoa ──────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  // Reseta busca ao abrir o painel de busca.
  useEffect(() => {
    if (activeTool !== 'search') {
      setSearchQuery('');
    }
  }, [activeTool]);

  const searchResults = useMemo(() => {
    const q = normalize(searchQuery.trim());
    if (!q) return [];
    return chart.data.nodes.filter((n) => {
      const hay = normalize(`${n.data.name ?? ''} ${n.data.role ?? ''}`);
      return hay.includes(q);
    });
  }, [searchQuery, chart.data.nodes]);

  if (!rect) return null;

  // ── Painel genérico: estilos de posição ──────────────────────────────────
  const panelStyle =
    panelPos !== null
      ? {
          left: panelPos.x,
          top: panelPos.y,
          transform: 'none',
          maxHeight: 'calc(100% - env(safe-area-inset-top) - 0.75rem - env(safe-area-inset-bottom))',
          width: 'max-content',
          minWidth: 'min(20rem, calc(100% - 3.75rem - 1.5rem))',
          maxWidth: 'calc(100% - 3.75rem - 1.5rem)',
        }
      : {
          top: '50%',
          // Quando o toolkit está expandido (hover → w-52 = 13rem, left-3 = 0.75rem),
          // o painel desliza para a direita para não ser coberto:
          //   expandido : left-3 (0.75rem) + w-52 (13rem) + gap (0.75rem) = 14.5rem
          //   colapsado : w-12 (3rem) + left-3 (0.75rem) + gap (0.75rem) = 4.5rem
          //               (equivale ao original "calc(3.75rem + 0.75rem)" ≈ 4.5rem)
          left: toolkitExpanded ? 'calc(14.5rem)' : 'calc(3.75rem + 0.75rem)',
          transform: 'translateY(-50%)',
          maxHeight: 'calc(100% - env(safe-area-inset-top) - 1.5rem - env(safe-area-inset-bottom))',
          width: 'max-content',
          minWidth: 'min(20rem, calc(100% - 3.75rem - 1.5rem))',
          // maxWidth acompanha o left para o painel não vazar da tela
          maxWidth: toolkitExpanded
            ? 'calc(100% - 14.5rem - 0.75rem)'
            : 'calc(100% - 3.75rem - 1.5rem)',
          // Transição suave acompanhando a animação do toolkit (200ms igual ao hover:w-52)
          transition: 'left 200ms ease, max-width 200ms ease',
        };

  const panelOpen = activeTool === 'tree' || activeTool === 'highlight' || activeTool === 'search';

  // Array de ferramentas do toolkit, construído aqui para ter acesso ao estado.
  // O item "Adicionar caixa" é uma ação (kind: 'action') — dispara e não abre painel.
  const TOOLS: ToolEntry[] = [
    {
      kind: 'action',
      icon: StickyNote,
      labelKey: 'addBoxTool',
      action: () => setAddBoxSignal((n) => n + 1),
    },
    { kind: 'panel', id: 'tree', icon: ListTree, labelKey: 'treeTool' },
    { kind: 'panel', id: 'highlight', icon: Layers, labelKey: 'highlightTool' },
    { kind: 'panel', id: 'search', icon: Search, labelKey: 'searchTool' },
  ];

  // Título e ícone de cada painel
  const panelMeta: Record<ToolId, { title: string; icon: typeof ListTree }> = {
    tree: { title: t.treePanelTitle, icon: ListTree },
    highlight: { title: t.highlightPanelTitle, icon: Layers },
    search: { title: t.searchPanelTitle, icon: Search },
  };

  return createPortal(
    <div
      ref={overlayRef}
      data-orgchart-root
      className="fixed z-40 bg-background"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        opacity: phase === 'shown' ? 1 : 0,
        // No REPOUSO usa transform:none (não scale(1)): um ancestral com transform
        // — mesmo scale(1) — QUEBRA o fit/medição do React Flow (viewport fica
        // identity). O zoom de entrada anima scale(0.96) → none (= scale 1).
        transform: phase === 'shown' ? 'none' : 'scale(0.96)',
        transformOrigin: 'center center',
        transition: 'opacity 250ms ease, transform 250ms ease',
        willChange: phase === 'shown' ? 'auto' : 'opacity, transform',
      }}
    >
      {/* Canvas (React Flow) — SEMPRE visível, ocupa toda a área. Botão voltar
          e título ficam dentro do canvas. */}
      <OrgChartCanvas
        chart={chart}
        fullscreen
        containerReady={containerReady}
        spotlight={spotlight}
        addBoxSignal={addBoxSignal}
        onBack={handleBack}
        backLabel={backLabel}
        backIcon={<ChevronLeft className="h-4 w-4" />}
      />

      {/* ── Toolkit vertical flutuante à ESQUERDA, centralizado na vertical ──
          Colapsado mostra só ícones; ao passar o mouse EXPANDE a largura
          (animado) revelando o título "Ferramentas" e o rótulo de cada
          ferramenta. Container extensível: cada item de TOOLS vira um botão. */}
      <div className="pointer-events-none absolute left-3 top-1/2 z-30 -translate-y-1/2">
        <div
          className="group pointer-events-auto flex w-12 flex-col gap-1 overflow-hidden rounded-2xl border bg-card/95 p-1.5 shadow-lg ring-1 ring-border backdrop-blur transition-[width] duration-200 ease-out hover:w-52"
          onMouseEnter={() => setToolkitExpanded(true)}
          onMouseLeave={() => setToolkitExpanded(false)}
        >
          {/* Título "Ferramentas" — revela (altura + opacidade) no hover */}
          <div className="max-h-0 overflow-hidden opacity-0 transition-all duration-200 ease-out group-hover:max-h-8 group-hover:opacity-100">
            <span className="block whitespace-nowrap px-1.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t.toolsTitle}
            </span>
          </div>
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const label = t[tool.labelKey];
            if (tool.kind === 'action') {
              // Item de ação: executa e pronto, nunca fica "ativo".
              // Leve separação visual entre a ação e os panel tools.
              return (
                <div key="action-addbox" className="contents">
                  <button
                    type="button"
                    onClick={tool.action}
                    title={label}
                    aria-label={label}
                    className="flex h-9 items-center gap-2.5 rounded-lg px-[9px] transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
                      {label}
                    </span>
                  </button>
                  {/* Divisória sutil entre ação e panel tools */}
                  <div className="mx-2 h-px bg-border opacity-60" />
                </div>
              );
            }
            // Panel tool: togla activeTool.
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool((cur) => (cur === tool.id ? null : tool.id))}
                title={label}
                aria-label={label}
                aria-pressed={isActive}
                className={cn(
                  'flex h-9 items-center gap-2.5 rounded-lg px-[9px] transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Painel flutuante À DIREITA da toolkit (janela sobreposta ao canvas) ──
          O canvas continua atrás/ao lado. Fecha pelo X ou reclicando na
          ferramenta. Mobile: quase full-width, deixando ver a borda esquerda
          (a toolkit) do canvas.
          Posição padrão: centralizado verticalmente (top:50% + translateY(-50%)),
          alinhado com a toolkit. Ao arrastar o cabeçalho, panelPos sobrescreve
          com coordenadas absolutas e desativa o translateY CSS. */}
      {panelOpen && activeTool && (
        <div
          ref={panelRef}
          className="pointer-events-auto absolute z-20 flex flex-col overflow-hidden rounded-xl border bg-card shadow-2xl ring-1 ring-border"
          style={panelStyle}
          role="dialog"
          aria-label={panelMeta[activeTool].title}
        >
          {/* Cabeçalho do painel — arrastável. Cursor grab/grabbing. Ignora X. */}
          <div
            className={cn(
              'flex shrink-0 items-center justify-between gap-2 border-b bg-card/95 px-3 py-2.5 backdrop-blur',
              'select-none',
              isDragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{ touchAction: isDragging ? 'none' : undefined }}
            onPointerDown={handleHeaderPointerDownWithCursor}
            onPointerMove={handleHeaderPointerMoveWithCursor}
            onPointerUp={handleHeaderPointerUpWithCursor}
            onPointerCancel={handleHeaderPointerUpWithCursor}
          >
            <div className="flex items-center gap-2 text-foreground">
              {(() => {
                const PanelIcon = panelMeta[activeTool].icon;
                return <PanelIcon className="h-4 w-4 text-primary" />;
              })()}
              <span className="text-sm font-semibold">{panelMeta[activeTool].title}</span>
            </div>
            {/* Botão X — não inicia arraste (closest('button') intercepta no pointerdown) */}
            <button
              type="button"
              onClick={() => setActiveTool(null)}
              title={t.close}
              aria-label={t.close}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Corpo rolável */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {/* ── Ferramenta: Árvore ─────────────────────────────────────── */}
            {activeTool === 'tree' && (
              <OrgChartTreeView graph={chart.data} className="h-full" />
            )}

            {/* ── Ferramenta: Destacar por setor ────────────────────────── */}
            {activeTool === 'highlight' && (
              <HighlightPanel
                sectors={uniqueSectors}
                spotlight={spotlight}
                onSpotlight={setSpotlight}
                t={t}
              />
            )}

            {/* ── Ferramenta: Buscar pessoa ──────────────────────────────── */}
            {activeTool === 'search' && (
              <SearchPanel
                query={searchQuery}
                results={searchResults}
                spotlight={spotlight}
                onQueryChange={setSearchQuery}
                onSpotlight={setSpotlight}
                t={t}
              />
            )}

          </div>
        </div>
      )}

    </div>,
    document.body,
  );
}

// ── Painel "Destacar por setor" ───────────────────────────────────────────────
interface SectorEntry {
  sector: string;
  color: string | undefined;
  ids: string[];
}

function HighlightPanel({
  sectors,
  spotlight,
  onSpotlight,
  t,
}: {
  sectors: SectorEntry[];
  spotlight: Spotlight | null;
  onSpotlight: (s: Spotlight | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  // ID do setor ativo = primeiro id da lista de ids (usamos como key estável).
  const activeSectorKey = spotlight?.ids[0] ?? null;

  const handleSectorClick = (entry: SectorEntry) => {
    // Clicar na linha ativa → limpa.
    if (activeSectorKey !== null && entry.ids[0] === activeSectorKey) {
      onSpotlight(null);
    } else {
      onSpotlight({ ids: entry.ids });
    }
  };

  if (sectors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
        <Layers className="h-8 w-8 opacity-30" />
        <p>{t.noResults}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Lista de setores */}
      <div className="min-h-0 overflow-y-auto">
        {sectors.map((entry) => {
          const isActive = activeSectorKey !== null && entry.ids[0] === activeSectorKey;
          return (
            <button
              key={entry.sector}
              type="button"
              onClick={() => handleSectorClick(entry)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                isActive
                  ? 'bg-primary/10 text-foreground'
                  : 'text-foreground hover:bg-muted/60',
              )}
            >
              {/* Bolinha de cor do setor */}
              <span
                className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: entry.color ?? '#94a3b8' }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.sector}</span>
              {/* Contagem de pessoas */}
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  isActive
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {entry.ids.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Botão limpar destaque — visível quando há spotlight ativo */}
      {spotlight && (
        <div className="shrink-0 border-t px-4 py-2.5">
          <button
            type="button"
            onClick={() => onSpotlight(null)}
            className="w-full rounded-lg border border-dashed py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            {t.clearHighlight}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Painel "Buscar pessoa" ────────────────────────────────────────────────────
function SearchPanel({
  query,
  results,
  spotlight,
  onQueryChange,
  onSpotlight,
  t,
}: {
  query: string;
  results: OrgNode[];
  spotlight: Spotlight | null;
  onQueryChange: (q: string) => void;
  onSpotlight: (s: Spotlight | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Foca o input ao montar.
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleResultClick = (node: OrgNode) => {
    onSpotlight({ ids: [node.id], focusId: node.id });
  };

  const handleClear = () => {
    onQueryChange('');
    onSpotlight(null);
    inputRef.current?.focus();
  };

  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex flex-col">
      {/* Input de busca */}
      <div className="shrink-0 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              // Limpa spotlight ao apagar a busca completamente.
              if (!e.target.value.trim()) onSpotlight(null);
            }}
            placeholder={t.searchPersonPlaceholder}
            className={cn(
              'h-9 w-full rounded-lg border bg-background pl-8 pr-8 text-sm text-foreground outline-none',
              'placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/40',
            )}
          />
          {hasQuery && (
            <button
              type="button"
              onClick={handleClear}
              aria-label={t.close}
              className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Lista de resultados */}
      <div className="min-h-0 max-h-80 overflow-y-auto">
        {!hasQuery ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {t.searchPersonPlaceholder}
          </p>
        ) : results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t.noResults}</p>
        ) : (
          results.map((node) => {
            const isActive = spotlight?.focusId === node.id;
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => handleResultClick(node)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  isActive
                    ? 'bg-primary/10 text-foreground'
                    : 'text-foreground hover:bg-muted/60',
                )}
              >
                {/* Bolinha de cor do setor */}
                {node.data.sectorColor ? (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
                    style={{ backgroundColor: node.data.sectorColor }}
                    aria-hidden
                  />
                ) : (
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/25" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{node.data.name}</p>
                  {node.data.role && (
                    <p className="truncate text-xs text-muted-foreground">{node.data.role}</p>
                  )}
                  {node.data.sector && !node.data.role && (
                    <p className="truncate text-xs text-muted-foreground">{node.data.sector}</p>
                  )}
                </div>
                {/* Chip de setor (quando tem cargo) */}
                {node.data.sector && node.data.role && (
                  <span
                    className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-block"
                    style={
                      node.data.sectorColor
                        ? { backgroundColor: `${node.data.sectorColor}22`, color: node.data.sectorColor }
                        : undefined
                    }
                  >
                    {node.data.sector}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Botão limpar quando há spotlight via busca */}
      {spotlight && hasQuery && (
        <div className="shrink-0 border-t px-4 py-2.5">
          <button
            type="button"
            onClick={handleClear}
            className="w-full rounded-lg border border-dashed py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            {t.clearHighlight}
          </button>
        </div>
      )}
    </div>
  );
}

