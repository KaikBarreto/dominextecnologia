// ─────────────────────────────────────────────────────────────────────────────
// ProcessCanvas — editor visual do fluxograma de processo.
//
// Molde: `orgchart/OrgChartCanvas.tsx`. Reaproveita a infra compartilhada de
// `@/lib/canvas/*` (viewport/helper-lines/prefs/export) em vez de reimplementar.
//
// ⚠️ Auto-save: o `graphRef`/`metaRef` são atualizados por `useEffect` a cada
// mudança de `nodes`/`edges`/`meta`, e o debounce SEMPRE lê do ref dentro do
// timeout — nunca do closure do render. `hydratedRef` bloqueia o primeiro
// save (carregado do banco) até a hidratação terminar. Ver comentário extenso
// equivalente em `OrgChartCanvas.tsx` (procure por `graphRef`/`hydratedRef`).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import '@xyflow/react/dist/style.css';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  ControlButton,
  addEdge,
  getNodesBounds,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react';
import { type CanvasPrefs, CANVAS_PREFS_KEYS, useCanvasPrefs } from '@/lib/canvas/useCanvasPrefs';
import { getHelperLines } from '@/lib/canvas/helperLines';
import { centerCanvasOnFlowPoint, centerCanvasOnNode, fitCanvasToNodes } from '@/lib/canvas/centerViewport';
import { HelperLines } from '@/components/canvas/HelperLines';
import {
  Plus,
  Wand2,
  Loader2,
  Check,
  Trash2,
  Undo2,
  Redo2,
  Download,
  Settings2,
  Maximize,
  Minimize,
  Rows3,
  ShieldAlert,
  ClipboardList,
  X,
  ChevronRight,
  FileText,
  AlignStartVertical,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMediaBreakpoint } from '@/hooks/use-mobile';
import { useIsDark } from '@/hooks/useIsDark';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { formatDate } from '@/lib/format';
import { openPdfInTab, openPendingPdfTab } from '@/utils/openPdfInTab';
import { MESSAGES } from '@/lib/i18n/messages';
import { useEmployees, type Employee } from '@/hooks/useEmployees';
import { useProcesses, type Process } from '@/hooks/useProcesses';
import {
  isLaneNode,
  PROCESS_NODE_TYPE,
  PROCESS_LANE_TYPE,
  type ProcessEdge as PEdge,
  type ProcessGraph,
  type ProcessMeta,
  type ProcessNode as PNode,
  type ProcessNodeData,
  type ProcessLaneData,
} from '@/lib/flowchart/types';
import { PALETTE_ORDER, getShapeSpec, PROCESS_FALLBACK_NODE_SIZE, type ProcessShape, type ProcessEdgeKind } from '@/lib/flowchart/shapes';
import { validateProcessGraph, type ProcessIssue } from '@/lib/flowchart/validate';
import { useUndoRedoShortcuts } from '@/lib/canvas/useUndoRedoShortcuts';
import { autoLayoutProcess, sortLanesFirst } from '@/lib/flowchart/layout';
import { tidyProcessGraph, normalizeEdgeHandles } from '@/lib/flowchart/tidy';
import { cn } from '@/lib/utils';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ProcessStepNode, ProcessEmployeesProvider } from './ProcessNode';
import {
  PROCESS_ICONS,
  PROCESS_ICON_KEYS,
  resolveProcessIcon,
  shapeAcceptsCustomIcon,
  SHAPE_ACCENT,
} from './processIcons';
import { ProcessLaneNode, ProcessLaneConfigProvider } from './ProcessLaneNode';
import { ProcessFlowEdge } from './ProcessEdge';

type AnyData = ProcessNodeData | ProcessLaneData;
type RFNode = Node<AnyData>;

const LANE_COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
const SWATCH_COLORS = LANE_COLORS;

const DEFAULT_LANE_SIZE = { width: 640, height: 220 };
const LANE_STACK_GAP = 40;

// Serializa o grafo LIMPO (tira campos transitórios do React Flow) antes de
// gravar no banco. `extent` é derivado de `parentId` na hidratação — não
// persiste (não faz parte do contrato `ProcessNode`).
/**
 * Cor do selo de um rótulo de aresta.
 *
 * A decisão binária (Sim/Não) é a informação que mais se consulta num
 * fluxograma, então ela ganha a cor de ação do app: verde segue, vermelho
 * desvia. Qualquer outro rótulo (ex.: "Acima de R$ 5.000") recebe o selo
 * neutro — continua legível, sem fingir que é um sim/não.
 *
 * Reconhece os 4 idiomas do app. Comparação sem acento e sem caixa.
 */
const BRANCH_YES = ['sim', 'yes', 'si', 'oui', 'aprovado', 'aprovada', 'ok', 'conforme'];
const BRANCH_NO = ['nao', 'no', 'non', 'reprovado', 'reprovada', 'negado'];

function branchTone(label?: unknown): { bg: string; fg: string } {
  const raw = typeof label === 'string' ? label : '';
  const norm = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (BRANCH_YES.includes(norm)) return { bg: '#16A34A', fg: '#FFFFFF' };
  if (BRANCH_NO.includes(norm)) return { bg: '#DC2626', fg: '#FFFFFF' };
  return { bg: '#475569', fg: '#FFFFFF' };
}

function serializeGraph(nodes: RFNode[], edges: Edge[]): ProcessGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      parentId: n.parentId,
      width: n.width ?? undefined,
      height: n.height ?? undefined,
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      label: typeof e.label === 'string' ? e.label : undefined,
      data: { kind: (e.data as { kind?: ProcessEdgeKind } | undefined)?.kind ?? 'sequence' },
    })),
  };
}

function toRFNode(n: PNode): RFNode {
  return {
    id: n.id,
    type: n.type ?? PROCESS_NODE_TYPE,
    position: n.position,
    parentId: n.parentId,
    extent: n.parentId ? 'parent' : undefined,
    width: n.width,
    height: n.height,
    data: n.data,
  };
}

function toRFEdge(e: PEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    label: e.label,
    data: { kind: e.data?.kind ?? 'sequence' },
  };
}

function defaultLabelForShape(shape: ProcessShape, t: Record<string, unknown>): string {
  const shapes = (t as { shapes?: Record<string, string> }).shapes;
  return shapes?.[shape] ?? shape;
}

// Componente FILHO do <ReactFlow> só para capturar a instância (mesmo padrão
// do organograma — `useReactFlow` só funciona dentro da árvore do provider).
function FlowController({ onReady }: { onReady: (inst: ReactFlowInstance<RFNode, Edge>) => void }) {
  const instance = useReactFlow<RFNode, Edge>();
  useEffect(() => { onReady(instance); }, [instance, onReady]);
  return null;
}

interface ProcessCanvasInnerProps {
  process: Process;
  employeesById: Record<string, Employee>;
  otherProcesses: Process[];
  fullscreen?: boolean;
  containerReady?: boolean;
  onBack?: () => void;
  backLabel?: string;
  backIcon?: ReactNode;
}

function ProcessCanvasInner({
  process,
  employeesById,
  otherProcesses,
  fullscreen,
  containerReady,
  onBack,
  backLabel,
  backIcon,
}: ProcessCanvasInnerProps) {
  const { prefs, setPref } = useCanvasPrefs(CANVAS_PREFS_KEYS.process, { edgeStyle: 'straight' });
  // Limiar PRÓPRIO do editor (768), não o do shell (1024): num tablet a pessoa
  // quer DESENHAR, e com 1024 o iPad em retrato caía no modo só-leitura, sem
  // barra de ferramentas nenhuma. Só o celular de verdade fica em leitura.
  const isMobile = useMediaBreakpoint(768);
  const isDark = useIsDark();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();
  const { settings: companySettings } = useCompanySettings();
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.processes;
  const commonT = MESSAGES[locale].app.common;
  const { toast } = useToast();
  const { saveGraph, saveMeta } = useProcesses();

  const rfInstanceRef = useRef<ReactFlowInstance<RFNode, Edge> | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);

  // Aresta própria com halo (vão no cruzamento). Memo fora do render pra o
  // React Flow não remontar todas as arestas a cada atualização de estado.
  const edgeTypes = useMemo(() => ({ process: ProcessFlowEdge }), []);
  const nodeTypes = useMemo<NodeTypes>(
    () => ({ [PROCESS_NODE_TYPE]: ProcessStepNode, [PROCESS_LANE_TYPE]: ProcessLaneNode }),
    [],
  );

  const initial = useMemo(
    () => ({
      nodes: sortLanesFirst(process.data.nodes).map(toRFNode),
      edges: process.data.edges.map(toRFEdge),
    }),
    // Só recomputa ao trocar de processo — edições ficam no estado local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [process.id],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  // ── Metadados do processo (painel separado, save próprio) ─────────────────
  const [meta, setMetaState] = useState<ProcessMeta>(process.meta ?? {});
  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);
  const metaSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaHydratedRef = useRef(false);

  // ── Guias de alinhamento ───────────────────────────────────────────────────
  const helperLinesEnabled = prefs.smartGuides;
  const [helperLines, setHelperLines] = useState<{ horizontal?: number; vertical?: number }>({});

  // ── Histórico de undo/redo (snapshots do grafo, cap 50) ───────────────────
  const HISTORY_CAP = 50;
  type GraphSnapshot = { nodes: RFNode[]; edges: Edge[] };
  const historyPast = useRef<GraphSnapshot[]>([]);
  const historyFuture = useRef<GraphSnapshot[]>([]);
  const [historyLen, setHistoryLen] = useState({ past: 0, future: 0 });
  const syncHistoryLen = useCallback(() => {
    setHistoryLen({ past: historyPast.current.length, future: historyFuture.current.length });
  }, []);

  // Espelho SEMPRE atual do grafo — o save/undo lê daqui, nunca do closure.
  const graphRef = useRef<GraphSnapshot>({ nodes: initial.nodes, edges: initial.edges });
  useEffect(() => { graphRef.current = { nodes, edges }; }, [nodes, edges]);

  const pushHistory = useCallback(() => {
    historyPast.current = [graphRef.current, ...historyPast.current].slice(0, HISTORY_CAP);
    historyFuture.current = [];
    syncHistoryLen();
  }, [syncHistoryLen]);

  const applySnapshot = useCallback((snap: GraphSnapshot) => {
    setNodes(snap.nodes);
    setEdges(snap.edges);
  }, [setNodes, setEdges]);

  const scheduleSaveRef = useRef<() => void>(() => {/* preenchido abaixo */});

  const undo = useCallback(() => {
    if (!historyPast.current.length) return;
    const [prev, ...rest] = historyPast.current;
    historyFuture.current = [graphRef.current, ...historyFuture.current];
    historyPast.current = rest;
    syncHistoryLen();
    applySnapshot(prev);
    scheduleSaveRef.current();
  }, [applySnapshot, syncHistoryLen]);

  const redo = useCallback(() => {
    if (!historyFuture.current.length) return;
    const [next, ...rest] = historyFuture.current;
    historyPast.current = [graphRef.current, ...historyPast.current].slice(0, HISTORY_CAP);
    historyFuture.current = rest;
    syncHistoryLen();
    applySnapshot(next);
    scheduleSaveRef.current();
  }, [applySnapshot, syncHistoryLen]);

  // ── Hidratação ao trocar de processo ──────────────────────────────────────
  const hydratedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    hydratedRef.current = false;
    metaHydratedRef.current = false;
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setMetaState(process.meta ?? {});
    setSelectedNodeId(null);
    setEdgeMenu(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (metaSaveTimer.current) clearTimeout(metaSaveTimer.current);
    setSaveState('idle');
    historyPast.current = [];
    historyFuture.current = [];
    setHistoryLen({ past: 0, future: 0 });
    hydratedRef.current = true;
    metaHydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const scheduleSave = useCallback(() => {
    if (!hydratedRef.current) return;
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const graph = serializeGraph(graphRef.current.nodes, graphRef.current.edges);
      saveGraph.mutate(
        { id: process.id, graph },
        {
          onSuccess: () => setSaveState('saved'),
          onError: () => {
            setSaveState('error');
            toast({ title: t.canvas.saveError, variant: 'destructive' });
          },
        },
      );
    }, 800);
  }, [process.id, saveGraph, toast, t.canvas.saveError]);

  useEffect(() => { scheduleSaveRef.current = scheduleSave; }, [scheduleSave]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const scheduleMetaSave = useCallback(() => {
    if (!metaHydratedRef.current) return;
    setSaveState('saving');
    if (metaSaveTimer.current) clearTimeout(metaSaveTimer.current);
    metaSaveTimer.current = setTimeout(() => {
      saveMeta.mutate(
        { id: process.id, meta: metaRef.current },
        {
          onSuccess: () => setSaveState('saved'),
          onError: () => {
            setSaveState('error');
            toast({ title: t.canvas.saveError, variant: 'destructive' });
          },
        },
      );
    }, 800);
  }, [process.id, saveMeta, toast, t.canvas.saveError]);
  useEffect(() => () => { if (metaSaveTimer.current) clearTimeout(metaSaveTimer.current); }, []);

  const updateMeta = useCallback((patch: Partial<ProcessMeta>) => {
    setMetaState((prev) => ({ ...prev, ...patch }));
    scheduleMetaSave();
  }, [scheduleMetaSave]);

  // ── Validação (memoizada) ──────────────────────────────────────────────────
  const validation = useMemo(() => {
    const graph: ProcessGraph = {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, parentId: n.parentId, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: typeof e.label === 'string' ? e.label : undefined, data: e.data as { kind?: ProcessEdgeKind } | undefined })),
    };
    return validateProcessGraph(graph);
  }, [nodes, edges]);

  // ── Viewport (fit/center) — via arrasto sintético, API de viewport é no-op ──
  const [wrapperSize, setWrapperSize] = useState<{ width: number; height: number } | null>(null);
  const [mainViewport, setMainViewport] = useState<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });

  useEffect(() => {
    const el = flowWrapperRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setWrapperSize((prev) => (prev && prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isContainerReady = fullscreen ? containerReady === true : true;
  const processHasNoNodes = process.data.nodes.length === 0;
  const nodesReady = nodes.length > 0 || processHasNoNodes;
  const canMountFlow = !!wrapperSize && isContainerReady && nodesReady;

  const centerOnTree = useCallback(() => {
    fitCanvasToNodes(flowWrapperRef.current, { padding: 0.15, maxZoom: 1 });
  }, []);
  const centerOnNode = useCallback((nodeId: string) => {
    centerCanvasOnNode(flowWrapperRef.current, nodeId);
  }, []);
  const centerOnFlowPoint = useCallback((flowX: number, flowY: number) => {
    centerCanvasOnFlowPoint(flowWrapperRef.current, flowX, flowY);
  }, []);

  const didCenterRef = useRef(false);
  useEffect(() => { didCenterRef.current = false; }, [process.id]);
  useEffect(() => {
    if (!canMountFlow || didCenterRef.current || nodes.length === 0) return;
    didCenterRef.current = true;
    const raf1 = requestAnimationFrame(() => requestAnimationFrame(() => centerOnTree()));
    return () => cancelAnimationFrame(raf1);
  }, [canMountFlow, nodes.length, centerOnTree]);

  // ── Node/Edge changes ──────────────────────────────────────────────────────
  const handleNodesChange = useCallback(
    (changes: NodeChange<RFNode>[]) => {
      if (helperLinesEnabled) {
        const posChanges = changes.filter(
          (c): c is NodeChange<RFNode> & { type: 'position'; position: { x: number; y: number }; dragging: boolean } =>
            c.type === 'position' && (c as { dragging?: boolean }).dragging === true && !!(c as { position?: unknown }).position,
        );
        if (posChanges.length === 1) {
          const change = posChanges[0] as NodeChange<RFNode> & { type: 'position'; position: { x: number; y: number } };
          const dragged = nodes.find((n) => n.id === (change as { id: string }).id);
          // Helper lines só entre nós do MESMO pai (etapas de raias diferentes
          // não devem "colar" entre si — coordenadas relativas são distintas).
          const siblings = dragged ? nodes.filter((n) => n.parentId === dragged.parentId) : nodes;
          const lines = getHelperLines(change as Parameters<typeof getHelperLines>[0], siblings);
          if (lines.snapPosition.x !== undefined || lines.snapPosition.y !== undefined) {
            change.position = {
              x: lines.snapPosition.x ?? change.position.x,
              y: lines.snapPosition.y ?? change.position.y,
            };
          }
          setHelperLines({ horizontal: lines.horizontal, vertical: lines.vertical });
        } else {
          setHelperLines({});
        }
      }
      onNodesChange(changes);
      const meaningful = changes.some(
        (c) => c.type === 'position' || c.type === 'remove' || c.type === 'add' || c.type === 'replace' || c.type === 'dimensions',
      );
      if (meaningful) scheduleSave();
    },
    [helperLinesEnabled, nodes, onNodesChange, scheduleSave],
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
      pushHistory();
      setEdges((eds) => addEdge({ ...conn, id: crypto.randomUUID(), data: { kind: 'sequence' } }, eds));
      scheduleSave();
    },
    [setEdges, scheduleSave, pushHistory],
  );

  // ── Reparentar ao soltar sobre uma raia (arrasto pra dentro/fora) ─────────
  // Lê as posições/tamanhos diretamente do DOM (mesmo princípio de
  // `centerViewport.ts`: a leitura via `screenToFlowPosition` da instância é
  // confiável — o que é no-op são os comandos de VIEWPORT, não as conversões
  // de coordenada nem o change-pipeline de posição/dimensão).
  const onNodeDragStop = useCallback((_evt: unknown, node: RFNode) => {
    if (node.type === PROCESS_LANE_TYPE) {
      scheduleSave();
      setHelperLines({});
      return;
    }
    const rf = rfInstanceRef.current;
    const wrapper = flowWrapperRef.current;
    if (!rf || !wrapper) { scheduleSave(); setHelperLines({}); return; }

    const nodeEl = wrapper.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`);
    const laneEls = Array.from(wrapper.querySelectorAll<HTMLElement>('.react-flow__node')).filter(
      (el) => el.getAttribute('data-id') !== node.id && nodes.find((n) => n.id === el.getAttribute('data-id'))?.type === PROCESS_LANE_TYPE,
    );
    if (!nodeEl) { scheduleSave(); setHelperLines({}); return; }

    const nodeRect = nodeEl.getBoundingClientRect();
    const nodeArea = nodeRect.width * nodeRect.height;
    let bestLaneId: string | null = null;
    let bestOverlap = 0;
    for (const laneEl of laneEls) {
      const laneId = laneEl.getAttribute('data-id');
      if (!laneId) continue;
      const laneRect = laneEl.getBoundingClientRect();
      const ix = Math.max(0, Math.min(nodeRect.right, laneRect.right) - Math.max(nodeRect.left, laneRect.left));
      const iy = Math.max(0, Math.min(nodeRect.bottom, laneRect.bottom) - Math.max(nodeRect.top, laneRect.top));
      const overlap = ix * iy;
      if (overlap > bestOverlap) { bestOverlap = overlap; bestLaneId = laneId; }
    }
    // Só reparenta se a maior parte do nó está sobre a raia (evita "roçar").
    const targetLaneId = nodeArea > 0 && bestOverlap / nodeArea > 0.4 ? bestLaneId : null;

    if ((targetLaneId ?? undefined) !== node.parentId) {
      pushHistory();
      const nodeTopLeftFlow = rf.screenToFlowPosition({ x: nodeRect.left, y: nodeRect.top });
      if (targetLaneId) {
        const laneEl = laneEls.find((el) => el.getAttribute('data-id') === targetLaneId)!;
        const laneRect = laneEl.getBoundingClientRect();
        const laneTopLeftFlow = rf.screenToFlowPosition({ x: laneRect.left, y: laneRect.top });
        const relative = { x: nodeTopLeftFlow.x - laneTopLeftFlow.x, y: nodeTopLeftFlow.y - laneTopLeftFlow.y };
        setNodes((nds) => sortLanesFirst(nds.map((n) => (
          n.id === node.id ? { ...n, parentId: targetLaneId, extent: 'parent', position: relative } : n
        ))));
      } else {
        setNodes((nds) => nds.map((n) => (
          n.id === node.id ? { ...n, parentId: undefined, extent: undefined, position: nodeTopLeftFlow } : n
        )));
      }
    }
    setHelperLines({});
    scheduleSave();
  }, [nodes, pushHistory, scheduleSave, setNodes]);

  const onNodeDragStart = useCallback(() => { pushHistory(); }, [pushHistory]);

  // ── Adicionar forma (paleta) ───────────────────────────────────────────────
  const centerFlowPosition = useCallback((): { x: number; y: number } => {
    try {
      const rf = rfInstanceRef.current;
      const el = flowWrapperRef.current;
      const w = el?.clientWidth ?? 800;
      const h = el?.clientHeight ?? 600;
      if (rf?.screenToFlowPosition && el) {
        const r = el.getBoundingClientRect();
        return rf.screenToFlowPosition({ x: r.left + w / 2, y: r.top + h / 2 });
      }
    } catch { /* usa 0,0 */ }
    return { x: 0, y: 0 };
  }, []);

  const addShape = useCallback((shape: ProcessShape) => {
    pushHistory();
    const id = crypto.randomUUID();
    const center = centerFlowPosition();
    const size = getShapeSpec(shape).size;

    // Posição livre a partir do centro da tela. Sem isto, cada forma nova cai
    // EXATAMENTE no mesmo ponto e some debaixo da anterior: quem adiciona cinco
    // etapas vê uma. Em cascata diagonal até achar um lugar sem sobreposição.
    const CASCADE = 36;
    const MAX_TRIES = 60;
    const occupied = nodes
      .filter((n) => !n.parentId) // filho de raia vive em outro sistema de coordenadas
      .map((n) => ({
        x: n.position.x,
        y: n.position.y,
        w: n.measured?.width ?? n.width ?? PROCESS_FALLBACK_NODE_SIZE.width,
        h: n.measured?.height ?? n.height ?? PROCESS_FALLBACK_NODE_SIZE.height,
      }));
    const overlaps = (x: number, y: number) =>
      occupied.some(
        (o) => x < o.x + o.w && x + size.width > o.x && y < o.y + o.h && y + size.height > o.y,
      );

    let x = center.x - size.width / 2;
    let y = center.y - size.height / 2;
    for (let i = 0; i < MAX_TRIES && overlaps(x, y); i++) {
      x += CASCADE;
      y += CASCADE;
    }

    const newNode: RFNode = {
      id,
      type: PROCESS_NODE_TYPE,
      position: { x, y },
      data: { shape, label: defaultLabelForShape(shape, t) },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
    setPaletteOpen(false);
    scheduleSave();
  }, [nodes, centerFlowPosition, pushHistory, scheduleSave, setNodes, t]);

  const addLane = useCallback(() => {
    pushHistory();
    const id = crypto.randomUUID();
    const existingLanes = nodes.filter((n) => n.type === PROCESS_LANE_TYPE);
    const maxBottom = existingLanes.reduce((acc, l) => Math.max(acc, l.position.y + (l.height ?? DEFAULT_LANE_SIZE.height)), -LANE_STACK_GAP);
    const color = LANE_COLORS[existingLanes.length % LANE_COLORS.length];
    const newLane: RFNode = {
      id,
      type: PROCESS_LANE_TYPE,
      position: { x: 0, y: maxBottom + LANE_STACK_GAP },
      width: DEFAULT_LANE_SIZE.width,
      height: DEFAULT_LANE_SIZE.height,
      zIndex: -1,
      data: { label: '', color },
    };
    setNodes((nds) => sortLanesFirst([...nds, newLane]));
    setSelectedNodeId(id);
    scheduleSave();
  }, [nodes, pushHistory, scheduleSave, setNodes]);

  const renameLane = useCallback((laneId: string, name: string) => {
    setNodes((nds) => nds.map((n) => (n.id === laneId ? { ...n, data: { ...n.data, label: name } } : n)));
    scheduleSave();
  }, [setNodes, scheduleSave]);

  // ── Seleção / edição ───────────────────────────────────────────────────────
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const updateSelectedData = useCallback((patch: Partial<AnyData>) => {
    if (!selectedNodeId) return;
    pushHistory();
    setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
    scheduleSave();
  }, [selectedNodeId, setNodes, scheduleSave, pushHistory]);

  const applyColorToLane = useCallback((color: string | undefined) => {
    if (!selectedNode?.parentId || !color) return;
    pushHistory();
    const laneId = selectedNode.parentId;
    setNodes((nds) => nds.map((n) => (n.id === laneId ? { ...n, data: { ...n.data, color } } : n)));
    scheduleSave();
  }, [selectedNode, setNodes, scheduleSave, pushHistory]);

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;
    pushHistory();
    if (node.type === PROCESS_LANE_TYPE) {
      // Excluir raia NÃO leva as etapas: elas voltam a ser de nível superior,
      // preservando a posição ABSOLUTA (soma da posição relativa + a da raia).
      setNodes((nds) => nds
        .filter((n) => n.id !== selectedNodeId)
        .map((n) => (n.parentId === selectedNodeId
          ? { ...n, parentId: undefined, extent: undefined, position: { x: node.position.x + n.position.x, y: node.position.y + n.position.y } }
          : n)));
    } else {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    }
    setSelectedNodeId(null);
    scheduleSave();
  }, [selectedNodeId, nodes, setNodes, setEdges, scheduleSave, pushHistory]);

  // ── Aresta: label + tipo (sequência/informação) + exclusão ────────────────
  const selectedEdge = edges.find((e) => e.id === edgeMenu?.id) ?? null;
  const updateSelectedEdge = useCallback((patch: { label?: string; kind?: ProcessEdgeKind }) => {
    if (!edgeMenu) return;
    setEdges((eds) => eds.map((e) => (e.id === edgeMenu.id ? {
      ...e,
      label: patch.label !== undefined ? patch.label : e.label,
      data: { kind: patch.kind ?? (e.data as { kind?: ProcessEdgeKind } | undefined)?.kind ?? 'sequence' },
    } : e)));
    scheduleSave();
  }, [edgeMenu, setEdges, scheduleSave]);

  const deleteEdge = useCallback((id: string) => {
    pushHistory();
    setEdges((eds) => eds.filter((e) => e.id !== id));
    scheduleSave();
    setEdgeMenu(null);
  }, [setEdges, scheduleSave, pushHistory]);

  // ── Organizar (dagre) ─────────────────────────────────────────────────────
  /** Converte o estado do React Flow pro grafo puro que os motores consomem. */
  const toPureGraph = useCallback(() => ({
    nodes: nodes.map((n) => ({
      id: n.id, type: n.type, position: n.position, parentId: n.parentId,
      width: n.width, height: n.height, data: n.data,
    })) as PNode[],
    edges: edges.map((e) => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle, targetHandle: e.targetHandle,
      label: typeof e.label === 'string' ? e.label : undefined,
      data: e.data as { kind?: ProcessEdgeKind } | undefined,
    })) as PEdge[],
  }), [nodes, edges]);

  /** Aplica posições e pontos de conexão vindos de um motor puro. */
  const applyGraph = useCallback((laid: PNode[], laidEdges: PEdge[]) => {
    const byId = new Map(laid.map((n) => [n.id, n]));
    setNodes((nds) => sortLanesFirst(nds.map((n) => {
      const l = byId.get(n.id);
      if (!l) return n;
      return { ...n, position: l.position, width: l.width ?? n.width, height: l.height ?? n.height };
    })));
    const edgeById = new Map(laidEdges.map((e) => [e.id, e]));
    setEdges((eds) => eds.map((e) => {
      const l = edgeById.get(e.id);
      return l ? { ...e, sourceHandle: l.sourceHandle, targetHandle: l.targetHandle } : e;
    }));
    scheduleSave();
  }, [setNodes, setEdges, scheduleSave]);

  // ── Organizar: reposiciona TUDO pelo dagre e reancora as setas ─────────────
  // A reancoragem não é detalhe: sem ela o dagre arruma as caixas e as linhas
  // continuam saindo do ponto antigo, dando a volta por fora do desenho.
  const organize = useCallback(() => {
    pushHistory();
    const pure = toPureGraph();
    const laid = autoLayoutProcess(pure.nodes, pure.edges);
    const { edges: laidEdges } = normalizeEdgeHandles({ nodes: laid, edges: pure.edges });
    applyGraph(laid, laidEdges);
    requestAnimationFrame(() => requestAnimationFrame(() => centerOnTree()));
  }, [toPureGraph, applyGraph, pushHistory, centerOnTree]);

  // ── Formatar: mantém o arranjo do usuário e só arruma o acabamento ─────────
  // Alinha o que estava quase alinhado, encaixa na grade e reancora as setas.
  // É o "tidy up" dos programas de fluxograma: não joga fora o seu desenho.
  const tidy = useCallback(() => {
    pushHistory();
    const pure = toPureGraph();
    const out = tidyProcessGraph(pure);
    applyGraph(out.nodes as PNode[], out.edges as PEdge[]);
  }, [toPureGraph, applyGraph, pushHistory]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async (format: 'png' | 'pdf') => {
    if (nodes.length === 0) {
      toast({ title: t.canvas.exportEmpty, variant: 'destructive' });
      return;
    }
    const element = flowWrapperRef.current?.querySelector<HTMLElement>('.react-flow__viewport') ?? null;
    if (!element) return;
    try {
      if (format === 'png') {
        const { exportGraphPng } = await import('@/lib/canvas/graphExport');
        await exportGraphPng({ element, nodes, isDark, graphName: process.name, filePrefix: 'processo' });
      } else {
        const { exportGraphPdf } = await import('@/lib/canvas/graphExport');
        await exportGraphPdf({ element, nodes, isDark, graphName: process.name, filePrefix: 'processo', hideBranding: whiteLabelEnabled });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: msg === 'EMPTY' ? t.canvas.exportEmpty : msg, variant: 'destructive' });
    }
  }, [nodes, isDark, process.name, whiteLabelEnabled, toast, t.canvas.exportEmpty]);

  // ── POP (Procedimento Operacional Padrão) ──────────────────────────────────
  //
  // O PDF do desenho serve pra pendurar na parede; o POP é o documento que o
  // técnico segue e que a auditoria pede. Por isso leva o desenho EMBUTIDO
  // (capturado aqui, em tema claro) junto do passo a passo numerado.
  //
  // A aba é pré-aberta no clique (openPendingPdfTab) — abrir depois do await
  // cai no bloqueador de pop-up do navegador.
  const [popLoading, setPopLoading] = useState(false);
  const handleDownloadPop = useCallback(async () => {
    if (popLoading) return;
    const pendingTab = openPendingPdfTab();
    setPopLoading(true);
    try {
      // Desenho embutido: sem nó nenhum, `captureGraphDataUrl` devolve null e o
      // documento simplesmente omite a seção do fluxograma (segue válido).
      const element =
        flowWrapperRef.current?.querySelector<HTMLElement>('.react-flow__viewport') ?? null;
      let flowchartImage: string | null = null;
      if (element && nodes.length > 0) {
        const { captureGraphDataUrl } = await import('@/lib/canvas/graphExport');
        flowchartImage = await captureGraphDataUrl(element, nodes);
      }

      const isWhiteLabel = !!companySettings?.white_label_enabled;
      const { generateProcessPopPdf } = await import('@/utils/processPopPdf');
      const blob = await generateProcessPopPdf({
        processName: process.name,
        // Mesmo formato que vai pro banco: sem `selected`/`dragging`/`measured`.
        graph: serializeGraph(graphRef.current.nodes, graphRef.current.edges),
        meta,
        version: process.version,
        code: process.public_short_code,
        flowchartImage,
        employeeNameById: Object.fromEntries(
          Object.values(employeesById).map((e) => [e.id, e.name]),
        ),
        branding: {
          // Vazio OMITE a linha no documento. 'Dominex' aqui viraria o nome da
          // empresa do cliente no POP dele — ver comentário em ProcessPopDocument.
          companyName: companySettings?.name?.trim() ?? '',
          logoUrl:
            (isWhiteLabel
              ? companySettings?.white_label_logo_url || companySettings?.logo_url
              : companySettings?.logo_url) ?? null,
          isWhiteLabel,
        },
        locale,
        generatedAtLabel: formatDate(new Date().toISOString(), locale, timezone),
      });
      openPdfInTab(blob, `pop-${process.name}`, pendingTab);
    } catch (err) {
      if (pendingTab && !pendingTab.closed) pendingTab.close();
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setPopLoading(false);
    }
  }, [
    popLoading,
    nodes,
    meta,
    process.name,
    process.version,
    process.public_short_code,
    employeesById,
    companySettings,
    locale,
    timezone,
    toast,
  ]);

  // ── Browser fullscreen real (Fullscreen API) ──────────────────────────────
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsBrowserFullscreen(
      !!(document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement),
    );
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  const toggleBrowserFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const fsEl = document.fullscreenElement ?? d.webkitFullscreenElement;
    if (fsEl) { (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.()); return; }
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    Promise.resolve(el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()).catch(() => {/* ambiente sem suporte */});
  }, []);

  // Desfazer/refazer por teclado (Ctrl+Z / Cmd+Z, Shift pra refazer).
  useUndoRedoShortcuts({ onUndo: undo, onRedo: redo });

  const curved = prefs.edgeStyle !== 'straight';
  const displayEdges = useMemo(
    () => edges.map((e) => {
      const kind = (e.data as { kind?: ProcessEdgeKind } | undefined)?.kind ?? 'sequence';
      const tone = branchTone(e.label);
      return {
        ...e,
        // Aresta própria (`ProcessFlowEdge`): abre um vão onde cruza outra
        // linha. Sem isso, dois traços da mesma cor se encontram e viram borrão.
        type: 'process',
        // Aresta COM rótulo sobe de camada: sem isso, a linha de outra aresta
        // desenhada depois passa POR CIMA do selo e corta o "Sim"/"Não" ao meio.
        zIndex: e.label ? 10 : 0,
        data: { ...(e.data ?? {}), curved },
        style: kind === 'information' ? { strokeDasharray: '6 4' } : undefined,
        // Rótulo de bifurcação vira SELO SATURADO: num fluxograma, "Sim" e "Não"
        // são a informação mais consultada do desenho — texto solto sobre a
        // linha se perde. Verde/vermelho seguem as cores de ação do app.
        ...(e.label
          ? {
              labelShowBg: true,
              // Retângulo com respiro, canto discreto e cor cheia — é a
              // informação mais consultada do desenho, tem que ter peso.
              labelBgPadding: [14, 8] as [number, number],
              labelBgBorderRadius: 5,
              labelBgStyle: { fill: tone.bg, stroke: 'none' },
              labelStyle: { fill: tone.fg, fontWeight: 700, fontSize: 12, letterSpacing: 0.2 },
            }
          : {}),
      };
    }),
    [edges, curved],
  );

  return (
    <ProcessEmployeesProvider value={employeesById}>
      <ProcessLaneConfigProvider value={{ namePlaceholder: t.canvas.laneNamePlaceholder, onRename: renameLane }}>
        <div className={cn('flex flex-col', fullscreen && 'h-full')}>
          {!fullscreen && (
            <div className="flex flex-wrap items-center gap-2 pb-3">
              {!isMobile && (
                <ProcessToolbarButtons
                  t={t}
                  paletteOpen={paletteOpen}
                  setPaletteOpen={setPaletteOpen}
                  onAddShape={addShape}
                  onAddLane={addLane}
                  onOrganize={organize}
                  onTidy={tidy}
                  onUndo={undo}
                  onRedo={redo}
                  historyLen={historyLen}
                  onExport={handleExport}
                  onDownloadPop={handleDownloadPop}
                  popLoading={popLoading}
                  prefs={prefs}
                  setPref={setPref}
                  validation={validation}
                  validationOpen={validationOpen}
                  setValidationOpen={setValidationOpen}
                  onSelectIssue={(nodeId) => { setSelectedNodeId(nodeId); centerOnNode(nodeId); }}
                  metaOpen={metaOpen}
                  setMetaOpen={setMetaOpen}
                  meta={meta}
                  onMetaChange={updateMeta}
                />
              )}
              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <SaveStatus state={saveState} t={t} />
              </div>
            </div>
          )}

          <div
            ref={flowWrapperRef}
            className={cn(
              'process-flow-wrapper relative w-full overflow-hidden bg-muted/20',
              fullscreen ? 'min-h-0 flex-1' : 'h-[calc(100vh-20rem)] min-h-[420px] rounded-xl border',
            )}
          >
            {canMountFlow && (
              <ReactFlow
                key={process.id}
                nodes={nodes}
                edges={displayEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                colorMode={isDark ? 'dark' : 'light'}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_e, node) => { setSelectedNodeId(node.id); setEdgeMenu(null); }}
                onPaneClick={() => { setSelectedNodeId(null); setEdgeMenu(null); }}
                onMove={(_, vp) => { setEdgeMenu(null); setMainViewport(vp); }}
                onEdgeClick={(event, edge) => {
                  const rect = flowWrapperRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setSelectedNodeId(null);
                  setEdgeMenu({ id: edge.id, x: event.clientX - rect.left, y: event.clientY - rect.top });
                }}
                onNodeDragStart={onNodeDragStart}
                onNodeDragStop={onNodeDragStop}
                nodesDraggable={!isMobile}
                nodesConnectable={!isMobile}
                elementsSelectable
                deleteKeyCode={isMobile ? null : ['Backspace', 'Delete']}
                minZoom={0.15}
                maxZoom={2}
                snapToGrid={prefs.snapGrid}
                snapGrid={[16, 16]}
                defaultEdgeOptions={{ type: 'process' }}
                proOptions={{ hideAttribution: true }}
              >
                <FlowController onReady={(inst) => { rfInstanceRef.current = inst; }} />
                {prefs.background !== 'none' && (
                  <Background
                    gap={16}
                    variant={
                      prefs.background === 'lines' ? BackgroundVariant.Lines
                        : prefs.background === 'cross' ? BackgroundVariant.Cross
                        : BackgroundVariant.Dots
                    }
                  />
                )}
                <Controls showFitView={false} showInteractive={!isMobile}>
                  <ControlButton
                    onClick={toggleBrowserFullscreen}
                    title={isBrowserFullscreen ? t.canvas.fullscreenExit : t.canvas.fullscreenEnter}
                    aria-label={isBrowserFullscreen ? t.canvas.fullscreenExit : t.canvas.fullscreenEnter}
                  >
                    {isBrowserFullscreen ? <Minimize /> : <Maximize />}
                  </ControlButton>
                </Controls>
                {prefs.minimap && (
                  <ProcessMiniMap
                    nodes={nodes}
                    edges={displayEdges}
                    nodeTypes={nodeTypes}
                    isDark={isDark}
                    mainViewport={mainViewport}
                    mainSize={wrapperSize ?? { width: 0, height: 0 }}
                    onNavigate={centerOnFlowPoint}
                  />
                )}
                <HelperLines horizontal={helperLines.horizontal} vertical={helperLines.vertical} />
              </ReactFlow>
            )}

            {/* ── Popover flutuante de edição de aresta ─────────────────────── */}
            {edgeMenu && selectedEdge && (
              <div
                className="absolute z-30 w-64 rounded-lg border bg-card p-3 shadow-lg"
                style={{ left: edgeMenu.x, top: edgeMenu.y, transform: 'translate(-50%, 8px)' }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs">{t.canvas.edgeLabelPlaceholder}</Label>
                  <button type="button" onClick={() => setEdgeMenu(null)} aria-label={commonT.close} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Input
                  autoFocus
                  value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
                  onChange={(e) => updateSelectedEdge({ label: e.target.value })}
                  placeholder={t.canvas.edgeLabelPlaceholder}
                  className="mb-2 h-8 text-xs"
                />
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{t.canvas.edgeKind}</span>
                  <div className="flex rounded-md border p-0.5">
                    {(['sequence', 'information'] as ProcessEdgeKind[]).map((kind) => {
                      const active = ((selectedEdge.data as { kind?: ProcessEdgeKind } | undefined)?.kind ?? 'sequence') === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => updateSelectedEdge({ kind })}
                          className={cn(
                            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                            active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {kind === 'sequence' ? t.canvas.edgeSequence : t.canvas.edgeInformation}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button variant="destructive" size="sm" className="w-full gap-1.5" onClick={() => deleteEdge(edgeMenu.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> {commonT.delete}
                </Button>
              </div>
            )}

            {/* ── Overlays de fullscreen (voltar + ações) ───────────────────── */}
            {fullscreen && (
              <>
                <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                  {onBack && (
                    <button
                      type="button"
                      onClick={onBack}
                      className="pointer-events-auto group inline-flex items-center gap-1 rounded-lg bg-card/85 px-2.5 py-1.5 text-sm font-medium shadow-md ring-1 ring-border backdrop-blur transition-colors hover:bg-destructive hover:text-white hover:ring-destructive"
                    >
                      <span className="text-destructive transition-colors group-hover:text-white">{backIcon}</span>
                      <span>{backLabel}</span>
                    </button>
                  )}
                  <span className="pointer-events-auto hidden min-w-0 max-w-[22vw] truncate rounded-lg bg-card/85 px-2.5 py-1.5 text-sm font-semibold shadow-md ring-1 ring-border backdrop-blur lg:inline-block xl:max-w-[30vw]">
                    {process.name}
                  </span>
                  {!isMobile && (
                    <>
                      <button type="button" onClick={undo} disabled={historyLen.past === 0} title={t.canvas.undo} aria-label={t.canvas.undo} className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg bg-card/85 shadow-md ring-1 ring-border backdrop-blur transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40">
                        <Undo2 className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={redo} disabled={historyLen.future === 0} title={t.canvas.redo} aria-label={t.canvas.redo} className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg bg-card/85 shadow-md ring-1 ring-border backdrop-blur transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40">
                        <Redo2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>

                <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-2" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                  <span className="pointer-events-none hidden items-center gap-1.5 rounded-lg bg-card/85 px-2.5 py-1.5 text-xs text-muted-foreground shadow-md ring-1 ring-border backdrop-blur sm:inline-flex">
                    <SaveStatus state={saveState} t={t} />
                  </span>
                  {!isMobile && (
                    <ProcessToolbarButtons
                      t={t}
                      compact
                      paletteOpen={paletteOpen}
                      setPaletteOpen={setPaletteOpen}
                      onAddShape={addShape}
                      onAddLane={addLane}
                      onOrganize={organize}
                      onTidy={tidy}
                      onUndo={undo}
                      onRedo={redo}
                      historyLen={historyLen}
                      onExport={handleExport}
                      onDownloadPop={handleDownloadPop}
                      popLoading={popLoading}
                      prefs={prefs}
                      setPref={setPref}
                      validation={validation}
                      validationOpen={validationOpen}
                      setValidationOpen={setValidationOpen}
                      onSelectIssue={(nodeId) => { setSelectedNodeId(nodeId); centerOnNode(nodeId); }}
                      metaOpen={metaOpen}
                      setMetaOpen={setMetaOpen}
                      meta={meta}
                      onMetaChange={updateMeta}
                    />
                  )}
                </div>

                {!isMobile && selectedNode && (
                  <div className="absolute bottom-3 left-3 z-20 w-[360px] max-w-[calc(100%-1.5rem)]">
                    <NodeEditPanel
                      key={selectedNode.id}
                      node={selectedNode}
                      otherProcesses={otherProcesses}
                      employeesById={employeesById}
                      onChange={updateSelectedData}
                      onDelete={deleteSelected}
                      onClose={() => setSelectedNodeId(null)}
                      onApplyColorToLane={applyColorToLane}
                      t={t}
                      closeLabel={commonT.close}
                      floating
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Painel de edição (desktop, não-fullscreen) */}
          {!fullscreen && !isMobile && selectedNode && (
            <NodeEditPanel
              key={selectedNode.id}
              node={selectedNode}
              otherProcesses={otherProcesses}
              employeesById={employeesById}
              onChange={updateSelectedData}
              onDelete={deleteSelected}
              onClose={() => setSelectedNodeId(null)}
              onApplyColorToLane={applyColorToLane}
              t={t}
              closeLabel={commonT.close}
            />
          )}

          {/* Drawer de edição (mobile) */}
          <ResponsiveModal
            open={isMobile && !!selectedNode}
            onOpenChange={(o) => { if (!o) setSelectedNodeId(null); }}
            title={t.edit.title}
          >
            {selectedNode && (
              <NodeEditPanel
                node={selectedNode}
                otherProcesses={otherProcesses}
                employeesById={employeesById}
                onChange={updateSelectedData}
                onDelete={deleteSelected}
                onClose={() => setSelectedNodeId(null)}
                onApplyColorToLane={applyColorToLane}
                t={t}
                closeLabel={commonT.close}
                bare
              />
            )}
          </ResponsiveModal>
        </div>
      </ProcessLaneConfigProvider>
    </ProcessEmployeesProvider>
  );
}

// ── Selo de status de salvamento ────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SaveStatus({ state, t }: { state: 'idle' | 'saving' | 'saved' | 'error'; t: any }) {
  if (state === 'saving') {
    return <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.canvas.saving}</>;
  }
  if (state === 'saved') {
    return <><Check className="h-3.5 w-3.5 text-success" /> {t.canvas.saved}</>;
  }
  if (state === 'error') {
    return <span className="text-destructive">{t.canvas.saveError}</span>;
  }
  return null;
}

// ── Toolbar (paleta + ações) — compartilhada entre modo normal e fullscreen ──
interface ProcessToolbarButtonsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  compact?: boolean;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  onAddShape: (shape: ProcessShape) => void;
  onAddLane: () => void;
  onOrganize: () => void;
  onTidy: () => void;
  onUndo: () => void;
  onRedo: () => void;
  historyLen: { past: number; future: number };
  onExport: (format: 'png' | 'pdf') => void;
  onDownloadPop: () => void;
  popLoading: boolean;
  prefs: CanvasPrefs;
  setPref: <K extends keyof CanvasPrefs>(key: K, value: CanvasPrefs[K]) => void;
  validation: { issues: ProcessIssue[]; errorCount: number; warningCount: number };
  validationOpen: boolean;
  setValidationOpen: (v: boolean) => void;
  onSelectIssue: (nodeId: string) => void;
  metaOpen: boolean;
  setMetaOpen: (v: boolean) => void;
  meta: ProcessMeta;
  onMetaChange: (patch: Partial<ProcessMeta>) => void;
}

function ProcessToolbarButtons({
  t,
  compact,
  paletteOpen,
  setPaletteOpen,
  onAddShape,
  onAddLane,
  onOrganize,
  onTidy,
  onUndo,
  onRedo,
  historyLen,
  onExport,
  onDownloadPop,
  popLoading,
  prefs,
  setPref,
  validation,
  validationOpen,
  setValidationOpen,
  onSelectIssue,
  metaOpen,
  setMetaOpen,
  meta,
  onMetaChange,
}: ProcessToolbarButtonsProps) {
  const btnVariant = compact ? 'secondary' : 'outline';
  const issueCount = validation.errorCount + validation.warningCount;
  return (
    <>
      <Popover open={paletteOpen} onOpenChange={setPaletteOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" className={cn('gap-1.5', compact && 'shadow-md')} title={t.canvas.addShape} aria-label={t.canvas.addShape}>
            <Plus className="h-4 w-4" /> <span className="hidden xl:inline">{t.canvas.addShape}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="grid grid-cols-4 gap-1.5">
            {PALETTE_ORDER.map((shape) => {
              const label = t.shapes?.[shape] ?? shape;
              const hint = t.shapeHints?.[shape] ?? label;
              return (
                <button
                  key={shape}
                  type="button"
                  title={hint}
                  onClick={() => onAddShape(shape)}
                  className="flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ShapePreviewIcon shape={shape} />
                  <span className="line-clamp-1 w-full text-center">{label}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Button size="sm" variant={btnVariant} className={cn('gap-1.5', compact && 'shadow-md ring-1 ring-border')} onClick={onAddLane} title={t.canvas.addLane} aria-label={t.canvas.addLane}>
        <Rows3 className="h-4 w-4" /> <span className="hidden xl:inline">{t.canvas.addLane}</span>
      </Button>

      <Button size="sm" variant={btnVariant} className={cn('gap-1.5', compact && 'shadow-md ring-1 ring-border')} onClick={onTidy} title={t.canvas.tidyHint} aria-label={t.canvas.tidy}>
        <AlignStartVertical className="h-4 w-4" /> <span className="hidden xl:inline">{t.canvas.tidy}</span>
      </Button>

      <Button size="sm" variant={btnVariant} className={cn('gap-1.5', compact && 'shadow-md ring-1 ring-border')} onClick={onOrganize} title={t.canvas.arrangeHint} aria-label={t.canvas.arrange}>
        <Wand2 className="h-4 w-4" /> <span className="hidden xl:inline">{t.canvas.arrange}</span>
      </Button>

      <Button size="sm" variant={btnVariant} className={cn('gap-1', compact && 'shadow-md ring-1 ring-border')} onClick={onUndo} disabled={historyLen.past === 0} title={t.canvas.undo} aria-label={t.canvas.undo}>
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button size="sm" variant={btnVariant} className={cn('gap-1', compact && 'shadow-md ring-1 ring-border')} onClick={onRedo} disabled={historyLen.future === 0} title={t.canvas.redo} aria-label={t.canvas.redo}>
        <Redo2 className="h-4 w-4" />
      </Button>

      <Popover open={validationOpen} onOpenChange={setValidationOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant={btnVariant} className={cn('relative gap-1.5', compact && 'shadow-md ring-1 ring-border')} title={t.validation.title} aria-label={t.validation.title}>
            <ShieldAlert className="h-4 w-4" />
            {issueCount > 0 && (
              <Badge className="h-5 min-w-5 justify-center bg-destructive px-1 text-[10px] text-destructive-foreground">
                {issueCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <ValidationPanel validation={validation} t={t} onSelectIssue={onSelectIssue} />
        </PopoverContent>
      </Popover>

      <Popover open={metaOpen} onOpenChange={setMetaOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant={btnVariant} className={cn('gap-1.5', compact && 'shadow-md ring-1 ring-border')} title={t.meta.title} aria-label={t.meta.title}>
            <ClipboardList className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <MetaPanel meta={meta} onChange={onMetaChange} t={t} />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={btnVariant} className={cn('gap-1.5', compact && 'shadow-md ring-1 ring-border')} title={t.canvas.export}>
            <Download className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <button type="button" onClick={() => onExport('png')} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
            <Download className="h-4 w-4" /> {t.canvas.exportPng}
          </button>
          <button type="button" onClick={() => onExport('pdf')} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
            <Download className="h-4 w-4" /> {t.canvas.exportPdf}
          </button>
          <div className="my-1 h-px bg-border" />
          {/* O POP é o entregável de verdade: documento, não imagem. */}
          <button
            type="button"
            onClick={onDownloadPop}
            disabled={popLoading}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
          >
            {popLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {t.pop.download}
          </button>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant={btnVariant} className={cn('gap-1.5', compact && 'shadow-md ring-1 ring-border')} title={t.canvas.settings} aria-label={t.canvas.settings}>
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0">
          <CanvasSettingsPanel prefs={prefs} setPref={setPref} t={t} />
        </PopoverContent>
      </Popover>
    </>
  );
}

function ShapePreviewIcon({ shape }: { shape: ProcessShape }) {
  // Pré-visualização minúscula só pra paleta — reaproveita o mapeamento visual
  // via classe utilitária simples (não precisa do ícone lucide aqui).
  const base = 'h-6 w-6 border';
  if (shape === 'start' || shape === 'end') {
    return <span className={cn(base, 'rounded-full', shape === 'start' ? 'bg-success' : 'bg-destructive')} />;
  }
  if (shape === 'decision') return <span className={cn(base, 'rotate-45 rounded-sm bg-muted')} />;
  if (shape === 'note') return <span className={cn(base, 'border-l-4 border-amber-400 bg-amber-50')} />;
  return <span className={cn(base, 'rounded-md bg-muted')} />;
}

// ── Painel de preferências ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CanvasSettingsPanel({ prefs, setPref, t }: { prefs: CanvasPrefs; setPref: <K extends keyof CanvasPrefs>(key: K, value: CanvasPrefs[K]) => void; t: any }) {
  return (
    <div className="flex flex-col divide-y">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-sm text-foreground">{t.canvas.edgeStyle}</span>
        <div className="flex rounded-md border p-0.5">
          {(['curved', 'straight'] as const).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setPref('edgeStyle', style)}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                prefs.edgeStyle === style ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {style === 'curved' ? t.canvas.edgeCurved : t.canvas.edgeStraight}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-sm text-foreground">{t.canvas.background}</span>
        <Select value={prefs.background} onValueChange={(v) => setPref('background', v as CanvasPrefs['background'])}>
          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dots">{t.canvas.backgroundDots}</SelectItem>
            <SelectItem value="lines">{t.canvas.backgroundLines}</SelectItem>
            <SelectItem value="cross">{t.canvas.backgroundCross}</SelectItem>
            <SelectItem value="none">{t.canvas.backgroundNone}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-sm text-foreground">{t.canvas.minimap}</span>
        <Switch checked={prefs.minimap} onCheckedChange={(c) => setPref('minimap', c)} aria-label={t.canvas.minimap} />
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-sm text-foreground">{t.canvas.snapGrid}</span>
        <Switch checked={prefs.snapGrid} onCheckedChange={(c) => setPref('snapGrid', c)} aria-label={t.canvas.snapGrid} />
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-sm text-foreground">{t.canvas.smartGuides}</span>
        <Switch checked={prefs.smartGuides} onCheckedChange={(c) => setPref('smartGuides', c)} aria-label={t.canvas.smartGuides} />
      </div>
    </div>
  );
}

// ── Painel de problemas (validação) ─────────────────────────────────────────
function ValidationPanel({
  validation,
  t,
  onSelectIssue,
}: {
  validation: { issues: ProcessIssue[]; errorCount: number; warningCount: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  onSelectIssue: (nodeId: string) => void;
}) {
  if (validation.issues.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
        <ShieldAlert className="h-7 w-7 opacity-30" />
        <p>{t.validation.allGood}</p>
      </div>
    );
  }
  const errors = validation.issues.filter((i) => i.severity === 'error');
  const warnings = validation.issues.filter((i) => i.severity === 'warning');
  const pluralize = (count: number, forms: { one: string; other: string }) => (count === 1 ? forms.one : forms.other).replace('{count}', String(count));
  return (
    <div className="flex max-h-96 flex-col">
      <div className="border-b px-4 py-2.5">
        <p className="text-sm font-semibold">{t.validation.title}</p>
        <p className="text-xs text-muted-foreground">
          {errors.length > 0 && pluralize(errors.length, t.validation.errorCount)}
          {errors.length > 0 && warnings.length > 0 && ' · '}
          {warnings.length > 0 && pluralize(warnings.length, t.validation.warningCount)}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {validation.issues.map((issue, idx) => (
          <button
            key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? idx}`}
            type="button"
            disabled={!issue.nodeId}
            title={issue.nodeId ? t.validation.goToNode : undefined}
            onClick={() => issue.nodeId && onSelectIssue(issue.nodeId)}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
          >
            <span
              title={issue.severity === 'error' ? t.validation.severityError : t.validation.severityWarning}
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                issue.severity === 'error' ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground',
              )}
            >
              <ShieldAlert className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">
              {t.issues?.[issue.code] ?? issue.code}
            </span>
            {issue.nodeId && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Painel de metadados (SIPOC) ─────────────────────────────────────────────
function StringListField({
  values,
  onChange,
  placeholder,
  addLabel,
  removeLabel,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  removeLabel?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span key={`${v}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {v}
            <button type="button" onClick={() => onChange(values.filter((_, idx) => idx !== i))} aria-label={removeLabel} className="text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={add} aria-label={addLabel} title={addLabel}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function MetaPanel({
  meta,
  onChange,
  t,
}: {
  meta: ProcessMeta;
  onChange: (patch: Partial<ProcessMeta>) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  return (
    <div className="max-h-96 space-y-3 overflow-y-auto p-4">
      <p className="text-sm font-semibold">{t.meta.title}</p>
      <div className="space-y-1.5">
        <Label className="text-xs">{t.meta.objective}</Label>
        <Textarea value={meta.objective ?? ''} onChange={(e) => onChange({ objective: e.target.value })} placeholder={t.meta.objectivePlaceholder} className="min-h-16 text-xs" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t.meta.scope}</Label>
        <Textarea value={meta.scope ?? ''} onChange={(e) => onChange({ scope: e.target.value })} placeholder={t.meta.scopePlaceholder} className="min-h-14 text-xs" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t.meta.trigger}</Label>
        <Input value={meta.trigger ?? ''} onChange={(e) => onChange({ trigger: e.target.value })} placeholder={t.meta.triggerPlaceholder} className="h-8 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t.meta.area}</Label>
          <Input value={meta.area ?? ''} onChange={(e) => onChange({ area: e.target.value })} placeholder={t.meta.areaPlaceholder} className="h-8 text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t.meta.frequency}</Label>
          <Input value={meta.frequency ?? ''} onChange={(e) => onChange({ frequency: e.target.value })} placeholder={t.meta.frequencyPlaceholder} className="h-8 text-xs" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t.meta.owner}</Label>
        <Input value={meta.ownerLabel ?? ''} onChange={(e) => onChange({ ownerLabel: e.target.value })} placeholder={t.meta.ownerPlaceholder} className="h-8 text-xs" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t.meta.inputs}</Label>
        <StringListField values={meta.inputs ?? []} onChange={(v) => onChange({ inputs: v })} placeholder={t.meta.inputsPlaceholder} addLabel={t.meta.addItem} removeLabel={t.meta.removeItem} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t.meta.outputs}</Label>
        <StringListField values={meta.outputs ?? []} onChange={(v) => onChange({ outputs: v })} placeholder={t.meta.outputsPlaceholder} addLabel={t.meta.addItem} removeLabel={t.meta.removeItem} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t.meta.indicators}</Label>
        <StringListField values={meta.indicators ?? []} onChange={(v) => onChange({ indicators: v })} placeholder={t.meta.indicatorsPlaceholder} addLabel={t.meta.addItem} removeLabel={t.meta.removeItem} />
      </div>
    </div>
  );
}

// ── Seletor de cor simples (paleta fixa + custom hex) ───────────────────────
function normalizeHex(input: string): string | null {
  let v = input.trim().toLowerCase();
  if (!v) return null;
  if (!v.startsWith('#')) v = `#${v}`;
  if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return /^#[0-9a-f]{6}$/.test(v) ? v : null;
}

/**
 * Seletor de ícone da etapa. Grade rolável com o catálogo + a opção "padrão da
 * forma" (que é o estado inicial, e não um ícone a mais).
 *
 * O selecionado aparece SATURADO na cor de acento da etapa — o mesmo selo que
 * vai aparecer no desenho, pra escolha e resultado baterem.
 */
function IconSwatches({
  value,
  accent,
  defaultIcon: DefaultIcon,
  defaultLabel,
  onChange,
}: {
  value?: string;
  accent: string;
  defaultIcon: (typeof PROCESS_ICONS)[keyof typeof PROCESS_ICONS];
  defaultLabel: string;
  onChange: (key?: string) => void;
}) {
  return (
    <div className="max-h-36 overflow-y-auto rounded-lg border p-2">
      <div className="grid grid-cols-8 gap-1.5">
        <button
          type="button"
          title={defaultLabel}
          aria-label={defaultLabel}
          onClick={() => onChange(undefined)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
            !value ? 'border-transparent text-white' : 'text-muted-foreground hover:bg-muted',
          )}
          style={!value ? { backgroundColor: accent } : undefined}
        >
          <DefaultIcon className="h-4 w-4" strokeWidth={2.2} />
        </button>
        {PROCESS_ICON_KEYS.map((key) => {
          const Glyph = PROCESS_ICONS[key as keyof typeof PROCESS_ICONS];
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              title={key}
              aria-label={key}
              onClick={() => onChange(key)}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
                active ? 'border-transparent text-white' : 'text-muted-foreground hover:bg-muted',
              )}
              style={active ? { backgroundColor: accent } : undefined}
            >
              <Glyph className="h-4 w-4" strokeWidth={2.2} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorSwatches({ value, onChange, allowNone, noneLabel }: { value: string; onChange: (c: string) => void; allowNone?: boolean; noneLabel?: string }) {
  const normalized = value ? value.toLowerCase() : '';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowNone && (
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn('h-7 rounded-full border px-2.5 text-xs', !value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
        >
          {noneLabel}
        </button>
      )}
      {SWATCH_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          className={cn('h-7 w-7 rounded-full border-2 transition-transform', normalized === c.toLowerCase() ? 'scale-110 border-foreground' : 'border-transparent')}
          style={{ backgroundColor: c }}
        />
      ))}
      <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border">
        <input
          type="color"
          value={normalizeHex(value) ?? '#3b82f6'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent p-0"
        />
      </span>
    </div>
  );
}

// ── Painel de edição de nó/raia ─────────────────────────────────────────────
interface NodeEditPanelProps {
  node: RFNode;
  otherProcesses: Process[];
  employeesById: Record<string, Employee>;
  onChange: (patch: Partial<AnyData>) => void;
  onDelete: () => void;
  onClose: () => void;
  onApplyColorToLane: (color: string | undefined) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  closeLabel: string;
  floating?: boolean;
  bare?: boolean;
}

function NodeEditPanel({ node, otherProcesses, employeesById, onChange, onDelete, onClose, onApplyColorToLane, t, closeLabel, floating, bare }: NodeEditPanelProps) {
  const isLane = node.type === PROCESS_LANE_TYPE;
  const wrapperCls = bare ? '' : cn('rounded-xl border bg-card p-4', floating ? 'shadow-xl backdrop-blur' : 'mt-3 shadow-sm');

  if (isLane) {
    const d = node.data as ProcessLaneData;
    return (
      <div className={wrapperCls}>
        {!bare && (
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">{t.edit.title}</p>
            <Button variant="ghost" size="sm" aria-label={closeLabel} onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t.edit.colorField}</Label>
            <ColorSwatches value={d.color ?? ''} onChange={(c) => onChange({ color: c || undefined })} />
          </div>
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> {t.canvas.deleteLane}
          </Button>
        </div>
      </div>
    );
  }

  const d = node.data as ProcessNodeData;
  const employeeList = Object.values(employeesById);

  return (
    <div className={wrapperCls}>
      {!bare && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">{t.edit.title}</p>
          <Button variant="ghost" size="sm" aria-label={closeLabel} onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">{t.edit.labelField}</Label>
          <Input value={d.label} onChange={(e) => onChange({ label: e.target.value })} placeholder={t.edit.labelPlaceholder} />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">{t.edit.descriptionField}</Label>
          <Textarea value={d.description ?? ''} onChange={(e) => onChange({ description: e.target.value })} placeholder={t.edit.descriptionPlaceholder} className="min-h-16" />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">{t.edit.responsibleField}</Label>
          <Select
            value={d.responsibleEmployeeId ?? '__free__'}
            onValueChange={(v) => onChange(v === '__free__' ? { responsibleEmployeeId: undefined } : { responsibleEmployeeId: v, responsibleLabel: undefined })}
          >
            <SelectTrigger className="h-9"><SelectValue placeholder={t.edit.responsiblePlaceholder} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__free__">{t.edit.responsibleFree}</SelectItem>
              {employeeList.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!d.responsibleEmployeeId && (
            <Input
              value={d.responsibleLabel ?? ''}
              onChange={(e) => onChange({ responsibleLabel: e.target.value })}
              placeholder={t.edit.responsibleFree}
              className="mt-1.5"
            />
          )}
        </div>
        {d.shape === 'delay' && (
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">{t.edit.durationField}</Label>
            <Input value={d.duration ?? ''} onChange={(e) => onChange({ duration: e.target.value })} placeholder={t.edit.durationPlaceholder} />
          </div>
        )}
        {d.shape === 'subprocess' && (
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">{t.edit.linkedProcessField}</Label>
            <Select value={d.linkedProcessId ?? '__none__'} onValueChange={(v) => onChange({ linkedProcessId: v === '__none__' ? undefined : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder={t.edit.linkedProcessPlaceholder} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t.edit.linkedProcessPlaceholder}</SelectItem>
                {otherProcesses.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {shapeAcceptsCustomIcon(d.shape) && (
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">{t.edit.iconField}</Label>
            <IconSwatches
              value={d.icon}
              accent={d.color || SHAPE_ACCENT[d.shape]}
              defaultIcon={resolveProcessIcon(d.shape, undefined)}
              defaultLabel={t.edit.iconDefault}
              onChange={(k) => onChange({ icon: k })}
            />
          </div>
        )}
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">{t.edit.colorField}</Label>
          <ColorSwatches value={d.color ?? ''} onChange={(c) => onChange({ color: c || undefined })} allowNone noneLabel={t.edit.colorField} />
          {node.parentId && (
            <button
              type="button"
              onClick={() => onApplyColorToLane(d.color)}
              disabled={!d.color}
              className="text-[11px] font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.edit.applyColorToLane}
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <Button variant="destructive" size="sm" className="gap-1.5" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> {t.canvas.deleteNode}
        </Button>
      </div>
    </div>
  );
}

// ── Minimapa próprio ─────────────────────────────────────────────────────────
// A API de viewport do React Flow é NO-OP neste app (ver cabeçalho de
// `centerViewport.ts`) — o `<MiniMap>` embutido do React Flow leria o mesmo
// transform travado. Por isso o minimapa é um segundo `<ReactFlow>` miniatura
// não-interativo com `fit` calculado manualmente (mesmo padrão do organograma,
// `OrgChartMiniMap.tsx`, adaptado aqui para tipos genéricos de processo).
const MINIMAP_BRAND = '#00C597';
const MINIMAP_PAD = 12;

function computeMiniFit(nodes: RFNode[], boxW: number, boxH: number): { x: number; y: number; zoom: number } | null {
  if (!nodes.length || boxW <= 0 || boxH <= 0) return null;
  const bounds = getNodesBounds(nodes);
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const zoom = Math.min((boxW - MINIMAP_PAD * 2) / bounds.width, (boxH - MINIMAP_PAD * 2) / bounds.height);
  const tx = MINIMAP_PAD - bounds.x * zoom + ((boxW - MINIMAP_PAD * 2) - bounds.width * zoom) / 2;
  const ty = MINIMAP_PAD - bounds.y * zoom + ((boxH - MINIMAP_PAD * 2) - bounds.height * zoom) / 2;
  return { x: tx, y: ty, zoom };
}

function ProcessMiniMap({
  nodes,
  edges,
  nodeTypes,
  isDark,
  mainViewport,
  mainSize,
  onNavigate,
}: {
  nodes: RFNode[];
  edges: Edge[];
  nodeTypes: NodeTypes;
  isDark: boolean;
  mainViewport: { x: number; y: number; zoom: number };
  mainSize: { width: number; height: number };
  onNavigate: (flowX: number, flowY: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      setBoxSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    setBoxSize({ w: rect.width, h: rect.height });
    return () => ro.disconnect();
  }, []);

  const nodesSignature = useMemo(
    () => `${nodes.length}|${nodes.map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)}`).join(';')}`,
    [nodes],
  );
  const fit = useMemo(
    () => computeMiniFit(nodes, boxSize.w, boxSize.h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodesSignature, boxSize.w, boxSize.h],
  );
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !fit) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const vp = box.querySelector<HTMLElement>('.react-flow__viewport');
        if (!vp) return;
        vp.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.zoom})`;
        vp.style.transformOrigin = '0 0';
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [fit]);

  const navigateFromPoint = (clientX: number, clientY: number) => {
    const box = boxRef.current;
    const currentFit = fitRef.current;
    if (!box || !currentFit || !currentFit.zoom) return;
    const rect = box.getBoundingClientRect();
    const flowX = (clientX - rect.left - currentFit.x) / currentFit.zoom;
    const flowY = (clientY - rect.top - currentFit.y) / currentFit.zoom;
    onNavigate(flowX, flowY);
  };
  const dragging = useRef(false);

  return (
    <div ref={boxRef} className="absolute bottom-3 right-3 z-20 h-40 w-56 overflow-hidden rounded-lg border bg-card/95 shadow-lg ring-1 ring-border">
      <ReactFlowProvider>
        <div className="pointer-events-none absolute inset-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode={isDark ? 'dark' : 'light'}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.001}
            maxZoom={4}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
          />
        </div>
      </ReactFlowProvider>
      {fit && fit.zoom > 0 && (() => {
        const mz = mainViewport.zoom || 1;
        const flowX = -mainViewport.x / mz;
        const flowY = -mainViewport.y / mz;
        const flowW = mainSize.width / mz;
        const flowH = mainSize.height / mz;
        const left = flowX * fit.zoom + fit.x;
        const top = flowY * fit.zoom + fit.y;
        const width = flowW * fit.zoom;
        const height = flowH * fit.zoom;
        return (
          <div
            className="pointer-events-none absolute z-10"
            style={{ left, top, width: Math.max(width, 2), height: Math.max(height, 2), border: `2px solid ${MINIMAP_BRAND}`, backgroundColor: 'rgba(0,197,151,0.08)', borderRadius: 3, boxSizing: 'border-box' }}
          />
        );
      })()}
      <div
        className="absolute inset-0 z-20 cursor-pointer"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; navigateFromPoint(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (dragging.current) navigateFromPoint(e.clientX, e.clientY); }}
        onPointerUp={(e) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { dragging.current = false; }}
      />
    </div>
  );
}

// ── Export público ───────────────────────────────────────────────────────────
export function ProcessCanvas({
  process,
  fullscreen,
  containerReady,
  onBack,
  backLabel,
  backIcon,
}: {
  process: Process;
  fullscreen?: boolean;
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

  const { processes } = useProcesses();
  const otherProcesses = useMemo(() => processes.filter((p) => p.id !== process.id), [processes, process.id]);

  // Sem <ReactFlowProvider> externo de propósito — mesmo motivo do organograma:
  // o <ReactFlow> interno precisa criar o PRÓPRIO store pro defaultViewport
  // nascer certo (ver cabeçalho de `centerViewport.ts`).
  return (
    <ProcessCanvasInner
      process={process}
      employeesById={employeesById}
      otherProcesses={otherProcesses}
      fullscreen={fullscreen}
      containerReady={containerReady}
      onBack={onBack}
      backLabel={backLabel}
      backIcon={backIcon}
    />
  );
}
