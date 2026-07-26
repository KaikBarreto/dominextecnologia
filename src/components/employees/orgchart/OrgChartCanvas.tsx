import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import '@xyflow/react/dist/style.css';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Plus, Wand2, Loader2, Check, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIsDark } from '@/hooks/useIsDark';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useEmployees, type Employee } from '@/hooks/useEmployees';
import { useCompanyDiscProfiles } from '@/hooks/useEmployeeDisc';
import {
  useOrgCharts,
  type OrgChart,
  type OrgChartGraph,
  type OrgNodeData,
} from '@/hooks/useOrgCharts';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import {
  OrgChartNode,
  OrgEmployeesProvider,
  OrgDiscProvider,
  OrgQuickAddProvider,
  ORG_NODE_TYPE,
  type QuickAddDirection,
} from './OrgChartNode';
import { layoutOrgChart, layoutBranchFrom, normalizeEdgeHandlesTB } from './layout';

type RFNode = Node<OrgNodeData>;

const SECTOR_COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

// Serializa o grafo LIMPO: tira campos transitórios do React Flow (selected,
// dragging, measured, width/height calculados) antes de gravar no banco.
function serializeGraph(nodes: RFNode[], edges: Edge[]): OrgChartGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    })),
  };
}

// Componente FILHO do <ReactFlow> que existe só para capturar a instância do
// React Flow (via useReactFlow — só funciona dentro da árvore do <ReactFlow>,
// já que não há mais provider externo) e publicá-la ao pai por `onReady`. O pai
// guarda num ref e usa nas leituras de viewport/coordenadas da adição avulsa.
function FlowController({ onReady }: { onReady: (inst: ReactFlowInstance<RFNode, Edge>) => void }) {
  const instance = useReactFlow<RFNode, Edge>();
  useEffect(() => {
    onReady(instance);
  }, [instance, onReady]);
  return null;
}

interface CanvasInnerProps {
  chart: OrgChart;
  employees: Employee[];
  employeesById: Record<string, Employee>;
  /** employeeId → código do perfil DISC concluído (ex.: 'CI'). */
  discCodeByEmployee: Record<string, string>;
  fullscreen?: boolean;
  /**
   * Sinal externo de "container pronto para iniciar o poll de fit". No modo
   * fullscreen o pai (OrgChartFullscreen) sinaliza `true` via setTimeout fixo
   * (330ms) após a transição de entrada — mais confiável que onTransitionEnd
   * em portais do React. No modo normal (não-fullscreen) não é passado e
   * tratado como sempre-true. O poll ainda verifica estabilidade de tamanho
   * internamente (≥2 frames consecutivos com mesmo clientWidth/Height).
   */
  containerReady?: boolean;
  // Ações do editor fullscreen sobrepostas no canvas (só no modo fullscreen).
  onBack?: () => void;
  backLabel?: string;
  backIcon?: ReactNode;
}

function OrgChartCanvasInner({ chart, employees, employeesById, discCodeByEmployee, fullscreen, containerReady, onBack, backLabel, backIcon }: CanvasInnerProps) {
  const isMobile = useIsMobile();
  const isDark = useIsDark();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.orgchart;
  const { saveGraph, renameChart } = useOrgCharts();
  // Instância do React Flow do PRÓPRIO `<ReactFlow>` (não há mais provider
  // externo — o flow é dono do store). Capturada por um `<FlowController>`
  // renderizado como FILHO do `<ReactFlow>` via callback `onReady`, e guardada
  // aqui num ref para a adição avulsa ler viewport/coordenadas
  // (getViewport / screenToFlowPosition). Como o store agora é o do próprio
  // flow, essas leituras refletem o transform real na tela.
  const rfInstanceRef = useRef<ReactFlowInstance<RFNode, Edge> | null>(null);

  const nodeTypes = useMemo(() => ({ [ORG_NODE_TYPE]: OrgChartNode }), []);

  const initial = useMemo(
    () => ({
      nodes: chart.data.nodes.map((n) => ({
        id: n.id,
        type: ORG_NODE_TYPE,
        position: n.position,
        data: n.data,
      })) as RFNode[],
      edges: chart.data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      })) as Edge[],
    }),
    // Só recomputa quando o chart abre (id muda). Edições ficam no estado local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chart.id],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [addOpen, setAddOpen] = useState(false);
  // Origem + direção de uma adição rápida pelo "+" do nó. Quando setado, o modal
  // abre em modo "conectado": o novo nó entra ligado ao nó de origem na direção.
  const [pendingQuickAdd, setPendingQuickAdd] = useState<{ nodeId: string; dir: QuickAddDirection } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // ── Auto-save com debounce (~800ms), com selo de status ───────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Só liga DEPOIS que o estado inicial foi hidratado do banco. Sem isso, o
  // efeito de recarga abaixo dispararia um save do grafo recém-carregado (ou
  // vazio, no chart novo) e sobrescreveria o banco no load — o "Salvo" mentiria.
  const hydratedRef = useRef(false);

  // Recarrega o grafo ao trocar de organograma (e marca como hidratado para os
  // saves subsequentes serem só de mudança REAL do usuário, nunca do load).
  useEffect(() => {
    hydratedRef.current = false;
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setSelectedNodeId(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('idle');
    hydratedRef.current = true;
  }, [initial, setNodes, setEdges]);

  // Espelho SEMPRE atual do grafo. O save lê daqui (não do closure), então
  // pega o estado mais recente mesmo quando scheduleSave() é chamado no mesmo
  // tick de um setNodes/setEdges (o React ainda não re-renderizou com o novo
  // estado; o closure do callback teria o grafo ANTIGO).
  const graphRef = useRef(serializeGraph(initial.nodes, initial.edges));
  useEffect(() => {
    graphRef.current = serializeGraph(nodes, edges);
  }, [nodes, edges]);

  const scheduleSave = useCallback(() => {
    // Ignora saves antes da hidratação inicial (evita gravar vazio no load).
    if (!hydratedRef.current) return;
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Lê o grafo MAIS ATUAL do ref (atualizado a cada mudança), não um
      // snapshot capturado no início do debounce.
      const graph = graphRef.current;
      saveGraph.mutate(
        { id: chart.id, graph },
        {
          onSuccess: () => setSaveState('saved'),
          onError: () => setSaveState('idle'),
        },
      );
    }, 800);
  }, [chart.id, saveGraph]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ── Centralizar ao ENTRAR — via arrasto/wheel de MOUSE sintético ───────────
  //
  // DESCOBERTA (comprovada ao vivo): neste editor NENHUM comando de viewport da
  // API do React Flow funciona — `defaultViewport` é ignorado (nasce [0,0,1]) e
  // `fitView`/`setViewport`/`panBy` são inertes. A ÚNICA coisa que move o
  // viewport é um EVENTO DE MOUSE REAL, que o d3-zoom obedece. Então centralizar
  // = ler o transform e os nós direto do DOM e despachar um arrasto (e wheel)
  // sintético de MOUSE (não PointerEvent — o d3-zoom aqui escuta mouse) que leva
  // o centro da árvore ao centro do container, pelo delta exato.
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const [wrapperSize, setWrapperSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = flowWrapperRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setWrapperSize((prev) =>
          prev && prev.width === w && prev.height === h ? prev : { width: w, height: h },
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // No modo fullscreen, containerReady é false até o pai sinalizar (setTimeout
  // fixo de 330ms após a transição de entrada, mais confiável que onTransitionEnd
  // em portais). No modo normal a prop não é passada → undefined → sempre pronto.
  const isContainerReady = fullscreen ? (containerReady === true) : true;

  // Os nós já estão populados? Se o chart tem nós no banco, esperamos eles
  // entrarem no estado local antes de montar (senão o `defaultViewport` nasce
  // {0,0,1}). Se o chart legitimamente não tem nós, {0,0,1} é aceitável — então
  // consideramos "pronto" também nesse caso.
  const chartHasNoNodes = chart.data.nodes.length === 0;
  const nodesReady = nodes.length > 0 || chartHasNoNodes;

  // Gate de montagem do <ReactFlow>: precisa do tamanho real do container, em
  // fullscreen do container estável, E dos nós populados. Até lá não monta.
  const canMountFlow = !!wrapperSize && isContainerReady && nodesReady;

  // Centraliza a árvore no container disparando eventos de MOUSE sintéticos
  // (única coisa que move o viewport neste editor). Lê o transform atual e os
  // nós direto do DOM (via flowWrapperRef), computa o zoom-alvo (fit com padding,
  // maxZoom 1) e converge por WHEEL sintético, depois faz o PAN exato por um
  // arrasto de mouse (mousedown no pane + mousemove/mouseup no window). Se o zoom
  // sintético não estabilizar, o PAN exato sozinho já tira a árvore do canto.
  const centerOnTree = useCallback(() => {
    const wrapper = flowWrapperRef.current;
    if (!wrapper) return;
    const pane = wrapper.querySelector('.react-flow__pane');
    const vpEl = wrapper.querySelector('.react-flow__viewport');
    if (!pane || !vpEl) return;
    const rect = wrapper.getBoundingClientRect();

    // transform atual do viewport lido do style inline
    const parse = () => {
      const m = (vpEl as HTMLElement).style.transform.match(
        /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/,
      );
      return m ? { x: +m[1], y: +m[2], k: +m[3] } : { x: 0, y: 0, k: 1 };
    };

    // bounds da árvore em coords de FLOW, lendo os nós do DOM (translate do
    // transform, dividido pelo zoom atual, + tamanho medido também em flow).
    const nodeEls = Array.from(wrapper.querySelectorAll('.react-flow__node')) as HTMLElement[];
    if (!nodeEls.length) return;
    const kNow = parse().k || 1;
    const b = nodeEls.reduce(
      (a, n) => {
        const mm = n.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
        const x = mm ? +mm[1] : 0;
        const y = mm ? +mm[2] : 0;
        const w = n.offsetWidth / kNow;
        const h = n.offsetHeight / kNow;
        return {
          minX: Math.min(a.minX, x),
          minY: Math.min(a.minY, y),
          maxX: Math.max(a.maxX, x + w),
          maxY: Math.max(a.maxY, y + h),
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const bw = Math.max(b.maxX - b.minX, 1);
    const bh = Math.max(b.maxY - b.minY, 1);
    const cxFlow = (b.minX + b.maxX) / 2;
    const cyFlow = (b.minY + b.maxY) / 2;

    const cxScr = rect.left + rect.width / 2;
    const cyScr = rect.top + rect.height / 2;

    // 1) ZOOM alvo (fit com padding, maxZoom 1) via wheel sintético no centro do
    //    container, convergindo com teto de iterações. Se não convergir limpo,
    //    o PAN abaixo (recalculado no zoom vigente) ainda centraliza.
    const pad = 0.15;
    const targetZoom = Math.min(
      rect.width / (bw * (1 + 2 * pad)),
      rect.height / (bh * (1 + 2 * pad)),
      1,
    );
    let guard = 0;
    while (guard++ < 40 && Math.abs(parse().k - targetZoom) > 0.02) {
      const cur = parse().k;
      const deltaY = cur > targetZoom ? 100 : -100; // 100 = zoom out, -100 = zoom in
      pane.dispatchEvent(
        new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          view: window,
          deltaY,
          clientX: cxScr,
          clientY: cyScr,
        }),
      );
      // passou do alvo → para (evita oscilar em torno do target)
      if (Math.sign(parse().k - targetZoom) !== Math.sign(cur - targetZoom)) break;
    }

    // 2) PAN exato: leva o centro da árvore ao centro do container (recalcula com
    //    o zoom vigente). Arrasto de mouse: mousedown no pane, mousemove/mouseup
    //    no window (PointerEvent não funciona aqui; MouseEvent sim).
    const cur = parse();
    const treeScrX = cxFlow * cur.k + cur.x;
    const treeScrY = cyFlow * cur.k + cur.y;
    const dx = Math.round(rect.width / 2 - treeScrX);
    const dy = Math.round(rect.height / 2 - treeScrY);
    if (dx !== 0 || dy !== 0) {
      const o = (x: number, y: number, buttons = 1): MouseEventInit => ({
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
        buttons,
      });
      pane.dispatchEvent(new MouseEvent('mousedown', o(cxScr, cyScr)));
      window.dispatchEvent(new MouseEvent('mousemove', o(cxScr + dx * 0.5, cyScr + dy * 0.5)));
      window.dispatchEvent(new MouseEvent('mousemove', o(cxScr + dx, cyScr + dy)));
      window.dispatchEvent(new MouseEvent('mouseup', o(cxScr + dx, cyScr + dy, 0)));
    }
  }, []);

  // Centraliza UMA vez ao abrir/trocar de chart, quando o flow montou e os nós já
  // estão no DOM. Guard reseta em chart.id. Dois RAFs garantem que pane/nós já
  // têm posição no DOM antes de medir/despachar.
  const didCenterRef = useRef(false);
  useEffect(() => {
    didCenterRef.current = false;
  }, [chart.id]);
  useEffect(() => {
    if (!canMountFlow || didCenterRef.current || nodes.length === 0) return;
    didCenterRef.current = true;
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => centerOnTree());
    });
    return () => cancelAnimationFrame(raf1);
  }, [canMountFlow, nodes.length, centerOnTree]);

  // Handlers que aplicam a mudança E agendam o save.
  const handleNodesChange = useCallback(
    (changes: NodeChange<RFNode>[]) => {
      onNodesChange(changes);
      // Só salva em mudanças persistentes (posição/remoção/add), não em select.
      const meaningful = changes.some(
        (c) => c.type === 'position' || c.type === 'remove' || c.type === 'add' || c.type === 'replace',
      );
      if (meaningful) scheduleSave();
    },
    [onNodesChange, scheduleSave],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes);
      const meaningful = changes.some((c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace');
      if (meaningful) scheduleSave();
    },
    [onEdgesChange, scheduleSave],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) => addEdge({ ...conn, id: crypto.randomUUID() }, eds));
      scheduleSave();
    },
    [setEdges, scheduleSave],
  );

  // Abre o modal em modo "adição rápida conectada" a partir do "+" de um nó.
  const handleQuickAdd = useCallback((nodeId: string, dir: QuickAddDirection) => {
    setPendingQuickAdd({ nodeId, dir });
    setAddOpen(true);
  }, []);

  // ── Adicionar nó (funcionário ou manual) ──────────────────────────────────
  const addNode = useCallback(
    (data: OrgNodeData) => {
      const newId = crypto.randomUUID();
      const quick = pendingQuickAdd;

      if (quick) {
        // Adição CONECTADA: posiciona o novo nó ao lado do de origem na direção
        // escolhida e cria a aresta com a orientação certa, depois reorganiza só
        // a ramificação afetada (dagre na subárvore da raiz da branch).
        const origin = nodes.find((n) => n.id === quick.nodeId);
        const OFFSET_X = 300;
        const OFFSET_Y = 160;
        const base = origin?.position ?? { x: 0, y: 0 };
        const delta: Record<QuickAddDirection, { x: number; y: number }> = {
          top: { x: 0, y: -OFFSET_Y },
          bottom: { x: 0, y: OFFSET_Y },
          left: { x: -OFFSET_X, y: 0 },
          right: { x: OFFSET_X, y: 0 },
        };
        const newNode: RFNode = {
          id: newId,
          type: ORG_NODE_TYPE,
          position: { x: base.x + delta[quick.dir].x, y: base.y + delta[quick.dir].y },
          data,
        };

        // Direção define quem é source/target: 'top' → o novo nó é o superior
        // (source) do de origem; nas outras, o de origem é o superior do novo.
        const newEdge: Edge =
          quick.dir === 'top'
            ? { id: crypto.randomUUID(), source: newId, target: quick.nodeId }
            : { id: crypto.randomUUID(), source: quick.nodeId, target: newId };

        const nextNodes = [...nodes, newNode];
        const nextEdges = [...edges, newEdge];

        // Reorganiza só a branch a partir da raiz (sobe até o topo da árvore do
        // nó de origem) — mantém o resto do grafo intacto.
        const laid = layoutBranchFrom(nextNodes, nextEdges, quick.nodeId);
        setNodes(laid);
        setEdges(nextEdges);
        setPendingQuickAdd(null);
        scheduleSave();
        setAddOpen(false);
        // NÃO reenquadra: setViewport/fitView são inertes neste editor e um
        // remount por `key` no meio da edição piscaria a tela. O nó aparece na
        // posição calculada; o usuário reenquadra pelo "Organizar" se quiser.
        return;
      }

      // Adição AVULSA (botão da toolbar): nó novo entra perto do centro do
      // viewport atual, sem conexão.
      let position = { x: 0, y: 0 };
      try {
        const rf = rfInstanceRef.current;
        const el = document.querySelector('.org-flow-wrapper') as HTMLElement | null;
        const w = el?.clientWidth ?? 800;
        const h = el?.clientHeight ?? 600;
        if (rf?.screenToFlowPosition) {
          position = rf.screenToFlowPosition({
            x: (el?.getBoundingClientRect().left ?? 0) + w / 2,
            y: (el?.getBoundingClientRect().top ?? 0) + h / 2,
          });
        } else if (rf?.getViewport) {
          const vp = rf.getViewport();
          position = { x: (-vp.x + w / 2) / vp.zoom, y: (-vp.y + h / 2) / vp.zoom };
        }
      } catch {
        /* usa 0,0 */
      }
      const newNode: RFNode = {
        id: newId,
        type: ORG_NODE_TYPE,
        position,
        data,
      };
      setNodes((nds) => [...nds, newNode]);
      scheduleSave();
      setAddOpen(false);
    },
    [setNodes, setEdges, scheduleSave, pendingQuickAdd, nodes, edges],
  );

  // ── Organizar (dagre) ─────────────────────────────────────────────────────
  const organize = useCallback(() => {
    setNodes((nds) => {
      const laid = layoutOrgChart(nds, edges);
      return laid;
    });
    // Normaliza os handles pro layout TB: cada aresta desce reta (bottom do pai →
    // top do filho), sem "voltas" de handles arbitrários. Persistido no auto-save.
    setEdges((eds) => normalizeEdgeHandlesTB(eds));
    scheduleSave();
    // Recentraliza SEM remontar: dois RAFs para as posições do dagre já estarem
    // no DOM, então dispara o arrasto/wheel sintético que centraliza a árvore.
    requestAnimationFrame(() => requestAnimationFrame(() => centerOnTree()));
  }, [edges, setNodes, setEdges, scheduleSave, centerOnTree]);

  // ── Painel de edição do nó selecionado ────────────────────────────────────
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const updateSelected = useCallback(
    (patch: Partial<OrgNodeData>) => {
      if (!selectedNodeId) return;
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
      );
      scheduleSave();
    },
    [selectedNodeId, setNodes, scheduleSave],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    scheduleSave();
  }, [selectedNodeId, setNodes, setEdges, scheduleSave]);

  // Herda setor/cor do nó de origem quando o "+" foi acionado (quick-add).
  const inheritFromOrigin = useMemo(() => {
    if (!pendingQuickAdd) return { sector: undefined, sectorColor: undefined };
    const origin = nodes.find((n) => n.id === pendingQuickAdd.nodeId);
    return {
      sector: origin?.data.sector,
      sectorColor: origin?.data.sectorColor,
    };
  }, [pendingQuickAdd, nodes]);

  // BFS que coleta todos os IDs de descendentes de um nó (segue source→target).
  const getDescendantIds = useCallback(
    (nodeId: string): string[] => {
      const childrenOf = new Map<string, string[]>();
      for (const e of edges) {
        if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
        childrenOf.get(e.source)!.push(e.target);
      }
      const result: string[] = [];
      const visited = new Set<string>([nodeId]);
      const queue = [...(childrenOf.get(nodeId) ?? [])];
      while (queue.length) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue; // guarda de ciclo
        visited.add(cur);
        result.push(cur);
        for (const child of childrenOf.get(cur) ?? []) {
          if (!visited.has(child)) queue.push(child);
        }
      }
      return result;
    },
    [edges],
  );

  // Propaga sector+sectorColor do nó selecionado para todos os descendentes.
  const applyToDescendants = useCallback(() => {
    if (!selectedNodeId) return;
    const origin = nodes.find((n) => n.id === selectedNodeId);
    if (!origin) return;
    const { sector, sectorColor } = origin.data;
    const ids = getDescendantIds(selectedNodeId);
    if (ids.length === 0) return;
    setNodes((nds) =>
      nds.map((n) =>
        ids.includes(n.id) ? { ...n, data: { ...n.data, sector, sectorColor } } : n,
      ),
    );
    scheduleSave();
  }, [selectedNodeId, nodes, getDescendantIds, setNodes, scheduleSave]);

  const quickAddValue = useMemo(
    () => ({ onQuickAdd: handleQuickAdd, enabled: !isMobile, addLabel: t.toolbar.addNode }),
    [handleQuickAdd, isMobile, t.toolbar.addNode],
  );

  return (
    <OrgEmployeesProvider value={employeesById}>
      <OrgDiscProvider value={discCodeByEmployee}>
      <OrgQuickAddProvider value={quickAddValue}>
      <div className={cn('flex flex-col', fullscreen && 'h-full')}>
        {/* Toolbar clássica: só aparece quando NÃO é fullscreen (no fullscreen os
            botões viram overlays flutuantes dentro do canvas). */}
        {!fullscreen && (
          <div className="flex flex-wrap items-center gap-2 pb-3">
            {!isMobile && (
              <>
                <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" /> {t.toolbar.addNode}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={organize} title={t.toolbar.organizeHint}>
                  <Wand2 className="h-4 w-4" /> {t.toolbar.organize}
                </Button>
              </>
            )}
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              {saveState === 'saving' && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.status.saving}
                </>
              )}
              {saveState === 'saved' && (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" /> {t.status.saved}
                </>
              )}
            </div>
          </div>
        )}

        {isMobile && !fullscreen && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t.mobileHint}</span>
          </div>
        )}

        {/* Canvas — precisa de altura definida senão o React Flow não renderiza.
            Em fullscreen ocupa toda a altura restante do overlay. */}
        <div
          ref={flowWrapperRef}
          className={cn(
            'org-flow-wrapper relative w-full overflow-hidden bg-muted/20',
            fullscreen
              ? 'min-h-0 flex-1'
              : 'h-[calc(100vh-20rem)] min-h-[420px] rounded-xl border',
          )}
        >
          {/* Só monta o flow quando há tamanho real do container (e, em fullscreen,
              container estável) E os nós estão populados. A `key` remonta só ao
              TROCAR de chart (chart.id); a centralização é feita pelo
              `centerOnTree` (arrasto sintético), não por remount/defaultViewport. */}
          {canMountFlow && (
            <ReactFlow
              key={chart.id}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              colorMode={isDark ? 'dark' : 'light'}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              nodesDraggable={!isMobile}
              nodesConnectable={!isMobile}
              elementsSelectable
              deleteKeyCode={isMobile ? null : ['Backspace', 'Delete']}
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <FlowController onReady={(inst) => { rfInstanceRef.current = inst; }} />
              <Background gap={16} />
              <Controls showInteractive={!isMobile} />
            </ReactFlow>
          )}

          {/* ── Overlays flutuantes do editor fullscreen ─────────────────── */}
          {fullscreen && (
            <>
              {/* Canto superior ESQUERDO: Voltar (vermelho→branco) + título. */}
              <div
                className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
              >
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className={cn(
                      'pointer-events-auto group inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium shadow-md ring-1 ring-border backdrop-blur transition-colors',
                      'bg-card/85 text-foreground hover:bg-destructive hover:text-white hover:ring-destructive',
                    )}
                  >
                    <span className="text-destructive transition-colors group-hover:text-white">
                      {backIcon}
                    </span>
                    <span>{backLabel}</span>
                  </button>
                )}
                <InlineChartName
                  key={chart.id}
                  name={chart.name}
                  ariaLabel={t.toolbar.renameChartAria}
                  confirmLabel={t.toolbar.renameChartConfirm}
                  onRename={(next) => renameChart.mutate({ id: chart.id, name: next })}
                />
              </div>

              {/* Canto superior DIREITO: Adicionar nó + Organizar + selo salvar. */}
              <div
                className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-2"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
              >
                {(saveState === 'saving' || saveState === 'saved') && (
                  <span className="pointer-events-none hidden items-center gap-1.5 rounded-lg bg-card/85 px-2.5 py-1.5 text-xs text-muted-foreground shadow-md ring-1 ring-border backdrop-blur sm:inline-flex">
                    {saveState === 'saving' ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.status.saving}
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" /> {t.status.saved}
                      </>
                    )}
                  </span>
                )}
                {!isMobile && (
                  <>
                    <Button size="sm" className="pointer-events-auto gap-1.5 shadow-md" onClick={() => setAddOpen(true)}>
                      <Plus className="h-4 w-4" /> {t.toolbar.addNode}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="pointer-events-auto gap-1.5 shadow-md ring-1 ring-border"
                      onClick={organize}
                      title={t.toolbar.organizeHint}
                    >
                      <Wand2 className="h-4 w-4" /> {t.toolbar.organize}
                    </Button>
                  </>
                )}
              </div>

              {/* Dica mobile flutuante no rodapé (fullscreen). */}
              {isMobile && (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-start gap-2 rounded-lg border bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-md backdrop-blur">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t.mobileHint}</span>
                </div>
              )}

              {/* Painel de edição flutuante no canto inferior esquerdo (fullscreen). */}
              {!isMobile && selectedNode && (
                <div className="absolute bottom-3 left-3 z-20 w-[360px] max-w-[calc(100%-1.5rem)]">
                  <EditPanel
                    key={selectedNode.id}
                    node={selectedNode}
                    employeesById={employeesById}
                    onChange={updateSelected}
                    onDelete={deleteSelected}
                    onClose={() => setSelectedNodeId(null)}
                    onApplyToDescendants={applyToDescendants}
                    hasDescendants={getDescendantIds(selectedNode.id).length > 0}
                    t={t}
                    floating
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Painel de edição (desktop, modo NÃO fullscreen): abaixo do canvas. */}
        {!fullscreen && !isMobile && selectedNode && (
          <EditPanel
            key={selectedNode.id}
            node={selectedNode}
            employeesById={employeesById}
            onChange={updateSelected}
            onDelete={deleteSelected}
            onClose={() => setSelectedNodeId(null)}
            onApplyToDescendants={applyToDescendants}
            hasDescendants={getDescendantIds(selectedNode.id).length > 0}
            t={t}
          />
        )}
      </div>

      <AddNodeModal
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setPendingQuickAdd(null);
        }}
        employees={employees}
        onAdd={addNode}
        inheritSector={inheritFromOrigin.sector}
        inheritColor={inheritFromOrigin.sectorColor}
        t={t}
      />
      </OrgQuickAddProvider>
      </OrgDiscProvider>
    </OrgEmployeesProvider>
  );
}

// ── Nome do organograma editável inline (auto-save no blur) ──────────────────
// Clica no rótulo → vira <input> (foco automático + seleção). onBlur salva via
// renameChart; Enter confirma (blur), Esc cancela (volta ao nome atual sem
// salvar). Não salva se o nome ficar vazio (mantém o anterior). Mesma tipografia
// do rótulo estático pra não "pular" ao alternar.
function InlineChartName({
  name,
  ariaLabel,
  confirmLabel,
  onRename,
}: {
  name: string;
  ariaLabel: string;
  confirmLabel: string;
  onRename: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Mantém o rótulo em dia se o nome mudar por fora (ex.: refetch) enquanto não
  // estamos editando.
  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  const startEditing = () => {
    setDraft(name);
    setEditing(true);
    // Foca e seleciona no próximo frame (input recém-montado).
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    // Só salva se mudou de fato e não ficou vazio; senão mantém o anterior.
    if (next && next !== name) onRename(next);
  };

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="pointer-events-auto hidden items-center gap-1 sm:inline-flex">
        <input
          ref={inputRef}
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          className="max-w-[40vw] rounded-lg bg-card/95 px-2.5 py-1.5 text-sm font-semibold shadow-md outline-none ring-2 ring-primary backdrop-blur focus:ring-primary"
        />
        {/* Botão de check (✓) — confirma o rename pelo MESMO caminho do blur/Enter.
            onMouseDown com preventDefault evita que o input perca o foco (e dispare
            onBlur) antes do onClick, evitando commit duplicado. */}
        <button
          type="button"
          aria-label={confirmLabel}
          title={confirmLabel}
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-md ring-1 ring-emerald-700/40 backdrop-blur transition-colors hover:bg-emerald-700"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="pointer-events-auto hidden max-w-[40vw] truncate rounded-lg bg-card/85 px-2.5 py-1.5 text-sm font-semibold shadow-md ring-1 ring-border backdrop-blur transition-colors hover:ring-primary sm:inline-block"
    >
      {name}
    </button>
  );
}

// ── Modal de adicionar nó ────────────────────────────────────────────────────
interface AddNodeModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employees: Employee[];
  onAdd: (data: OrgNodeData) => void;
  /** Setor herdado do nó pai quando o modal abre via quick-add "+" */
  inheritSector?: string;
  /** Cor herdada do nó pai quando o modal abre via quick-add "+" */
  inheritColor?: string;
  t: any;
}

function AddNodeModal({ open, onOpenChange, employees, onAdd, inheritSector, inheritColor, t }: AddNodeModalProps) {
  const [tab, setTab] = useState<'employee' | 'manual'>('employee');
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualRole, setManualRole] = useState('');
  const [sector, setSector] = useState('');
  const [color, setColor] = useState<string>('');

  useEffect(() => {
    if (open) {
      setTab('employee');
      setSearch('');
      setManualName('');
      setManualRole('');
      // Pré-preenche com os valores do pai quando vem de um quick-add.
      setSector(inheritSector ?? '');
      setColor(inheritColor ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = employees.filter(
    (e) => fuzzyIncludes(e.name, search) || fuzzyIncludes(e.position || '', search),
  );

  const addEmployee = (e: Employee) => {
    onAdd({
      kind: 'employee',
      employeeId: e.id,
      name: e.name,
      role: e.position || undefined,
      sector: sector || undefined,
      sectorColor: color || undefined,
    });
  };

  const addManual = () => {
    if (!manualName.trim()) return;
    onAdd({
      kind: 'manual',
      name: manualName.trim(),
      role: manualRole.trim() || undefined,
      sector: sector || undefined,
      sectorColor: color || undefined,
    });
  };

  const sectorFields = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">{t.addNodeModal.sectorLabel}</Label>
        <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder={t.addNodeModal.sectorPlaceholder} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t.addNodeModal.colorLabel}</Label>
        <ColorPicker value={color} onChange={setColor} customLabel={t.addNodeModal.customColor} />
      </div>
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t.addNodeModal.title}>
      <div className="space-y-4 py-2">
        <MobilePillTabs
          tabs={[
            { value: 'employee', label: t.addNodeModal.tabEmployee },
            { value: 'manual', label: t.addNodeModal.tabManual },
          ]}
          activeTab={tab}
          onTabChange={(v) => setTab(v as 'employee' | 'manual')}
        />

        {tab === 'employee' ? (
          <div className="space-y-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.addNodeModal.searchEmployee} />
            {sectorFields}
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t.addNodeModal.noEmployees}</p>
              ) : (
                filtered.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => addEmployee(e)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <Avatar className="h-9 w-9">
                      <SignedAvatarImage src={e.photo_url} alt={e.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {e.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.name}</p>
                      {e.position && <p className="truncate text-xs text-muted-foreground">{e.position}</p>}
                    </div>
                    <Plus className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.addNodeModal.nameLabel}</Label>
              <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder={t.addNodeModal.namePlaceholder} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.addNodeModal.roleLabel}</Label>
              <Input value={manualRole} onChange={(e) => setManualRole(e.target.value)} placeholder={t.addNodeModal.rolePlaceholder} />
            </div>
            {sectorFields}
            <Button className="w-full" disabled={!manualName.trim()} onClick={addManual}>
              {t.addNodeModal.add}
            </Button>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}

// ── Painel de edição de nó (desktop) ─────────────────────────────────────────
interface EditPanelProps {
  node: RFNode;
  employeesById: Record<string, Employee>;
  onChange: (patch: Partial<OrgNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
  /** Propaga setor+cor do nó atual para todos os descendentes. */
  onApplyToDescendants: () => void;
  /** true quando o nó tem ao menos um descendente (via aresta). */
  hasDescendants: boolean;
  t: any;
  floating?: boolean;
}

function EditPanel({ node, employeesById, onChange, onDelete, onClose, onApplyToDescendants, hasDescendants, t, floating }: EditPanelProps) {
  const d = node.data;
  const isEmployee = d.kind === 'employee';
  const emp = isEmployee && d.employeeId ? employeesById[d.employeeId] : undefined;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4',
        floating ? 'shadow-xl backdrop-blur' : 'mt-3 shadow-sm',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{t.editPanel.title}</p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t.editPanel.close}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {isEmployee ? (
          <div className="sm:col-span-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {emp ? `${emp.name}${emp.position ? ` · ${emp.position}` : ''}` : d.name}
            <p className="mt-1">{t.editPanel.employeeHint}</p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.editPanel.nameLabel}</Label>
              <Input value={d.name} onChange={(e) => onChange({ name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.editPanel.roleLabel}</Label>
              <Input value={d.role ?? ''} onChange={(e) => onChange({ role: e.target.value })} />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">{t.editPanel.sectorLabel}</Label>
          <Input
            value={d.sector ?? ''}
            onChange={(e) => onChange({ sector: e.target.value })}
            placeholder={t.editPanel.sectorPlaceholder}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t.editPanel.colorLabel}</Label>
          <ColorPicker
            value={d.sectorColor ?? ''}
            onChange={(c) => onChange({ sectorColor: c || undefined })}
            allowNone
            noneLabel={t.editPanel.noColor}
            customLabel={t.editPanel.customColor}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button variant="destructive" size="sm" onClick={onDelete}>
          {t.editPanel.deleteNode}
        </Button>
        {hasDescendants && (
          <Button variant="outline" size="sm" onClick={onApplyToDescendants}>
            {t.editPanel.applyToDescendants}
          </Button>
        )}
      </div>
    </div>
  );
}

// Normaliza um hex digitado pelo usuário (#RGB ou #RRGGBB, com/sem #) para o
// formato #rrggbb minúsculo; devolve null se não for hex válido.
function normalizeHex(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  if (!v.startsWith('#')) v = `#${v}`;
  if (/^#[0-9a-f]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

// ── Seletor de cor do setor ──────────────────────────────────────────────────
function ColorPicker({
  value,
  onChange,
  allowNone,
  noneLabel,
  customLabel,
}: {
  value: string;
  onChange: (c: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
  customLabel: string;
}) {
  const normalized = value ? value.toLowerCase() : '';
  // Cor personalizada = tem valor mas não é um dos presets.
  const isCustom = !!normalized && !SECTOR_COLORS.some((c) => c.toLowerCase() === normalized);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(isCustom ? normalized : '#3b82f6');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowNone && (
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'h-7 rounded-full border px-2.5 text-xs',
            !value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground',
          )}
        >
          {noneLabel}
        </button>
      )}
      {SECTOR_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          className={cn(
            'h-7 w-7 rounded-full border-2 transition-transform',
            normalized === c.toLowerCase() ? 'scale-110 border-foreground' : 'border-transparent',
          )}
          style={{ backgroundColor: c }}
        />
      ))}

      {/* Cor personalizada: swatch com anel arco-íris; abre popover com input de
          cor nativo + campo hex. Fica ativo (preenchido) se a cor não for preset. */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={customLabel}
            title={customLabel}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform',
              isCustom ? 'scale-110 border-foreground' : 'border-transparent',
            )}
            style={
              isCustom
                ? { backgroundColor: normalized }
                : {
                    background:
                      'conic-gradient(from 0deg, #ef4444, #f59e0b, #22c55e, #0ea5e9, #8b5cf6, #ec4899, #ef4444)',
                  }
            }
          >
            {!isCustom && <Plus className="h-3.5 w-3.5 text-white drop-shadow" />}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 space-y-3" align="start">
          <Label className="text-xs">{customLabel}</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={normalizeHex(draft) ?? '#3b82f6'}
              onChange={(e) => {
                setDraft(e.target.value);
                onChange(e.target.value);
              }}
              className="h-9 w-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
              aria-label={customLabel}
            />
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                const hex = normalizeHex(e.target.value);
                if (hex) onChange(hex);
              }}
              placeholder="#3b82f6"
              className="h-9 font-mono text-sm"
              maxLength={7}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function OrgChartCanvas({
  chart,
  fullscreen,
  containerReady,
  onBack,
  backLabel,
  backIcon,
}: {
  chart: OrgChart;
  fullscreen?: boolean;
  /**
   * Quando `fullscreen=true`, o pai deve passar `false` enquanto a transição
   * de entrada estiver acontecendo e `true` após ela (via setTimeout fixo,
   * não onTransitionEnd). No modo normal deixar `undefined` (sempre-pronto).
   * O poll interno ainda verifica estabilidade de tamanho antes de fitBounds.
   */
  containerReady?: boolean;
  onBack?: () => void;
  backLabel?: string;
  backIcon?: ReactNode;
}) {
  const { employees } = useEmployees();
  const employeesById = useMemo(() => {
    const map: Record<string, Employee> = {};
    for (const e of employees) map[e.id] = e;
    return map;
  }, [employees]);

  // Perfis DISC concluídos da empresa → mapa employeeId → profile_code. Só entra
  // quem tem uma aplicação COMPLETED com profile_code; o nó decide se mostra.
  const { profilesByEmployee } = useCompanyDiscProfiles();
  const discCodeByEmployee = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [employeeId, summary] of Object.entries(profilesByEmployee)) {
      const code = summary.latestCompleted?.profile_code;
      if (code) map[employeeId] = code;
    }
    return map;
  }, [profilesByEmployee]);

  // Sem <ReactFlowProvider> externo de propósito: assim o <ReactFlow> (dentro do
  // Inner) cria o PRÓPRIO store e o `defaultViewport` é aplicado na criação
  // (com provider externo o store nascia [0,0,1] e ignorava o defaultViewport).
  return (
    <OrgChartCanvasInner
      chart={chart}
      employees={employees}
      employeesById={employeesById}
      discCodeByEmployee={discCodeByEmployee}
      fullscreen={fullscreen}
      containerReady={containerReady}
      onBack={onBack}
      backLabel={backLabel}
      backIcon={backIcon}
    />
  );
}
