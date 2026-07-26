import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { Plus, Wand2, Loader2, Check, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useEmployees, type Employee } from '@/hooks/useEmployees';
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
import { OrgChartNode, OrgEmployeesProvider, ORG_NODE_TYPE } from './OrgChartNode';
import { layoutOrgChart } from './layout';

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

interface CanvasInnerProps {
  chart: OrgChart;
  employees: Employee[];
  employeesById: Record<string, Employee>;
}

function OrgChartCanvasInner({ chart, employees, employeesById }: CanvasInnerProps) {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.orgchart;
  const { saveGraph } = useOrgCharts();
  const rf = useReactFlow();

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

  // ── Adicionar nó (funcionário ou manual) ──────────────────────────────────
  const addNode = useCallback(
    (data: OrgNodeData) => {
      // Nó novo entra perto do centro do viewport atual.
      let position = { x: 0, y: 0 };
      try {
        const vp = rf.getViewport();
        const el = document.querySelector('.org-flow-wrapper') as HTMLElement | null;
        const w = el?.clientWidth ?? 800;
        const h = el?.clientHeight ?? 600;
        position = rf.screenToFlowPosition
          ? rf.screenToFlowPosition({ x: (el?.getBoundingClientRect().left ?? 0) + w / 2, y: (el?.getBoundingClientRect().top ?? 0) + h / 2 })
          : { x: (-vp.x + w / 2) / vp.zoom, y: (-vp.y + h / 2) / vp.zoom };
      } catch {
        /* usa 0,0 */
      }
      const newNode: RFNode = {
        id: crypto.randomUUID(),
        type: ORG_NODE_TYPE,
        position,
        data,
      };
      setNodes((nds) => [...nds, newNode]);
      scheduleSave();
      setAddOpen(false);
    },
    [rf, setNodes, scheduleSave],
  );

  // ── Organizar (dagre) ─────────────────────────────────────────────────────
  const organize = useCallback(() => {
    setNodes((nds) => {
      const laid = layoutOrgChart(nds, edges);
      return laid;
    });
    scheduleSave();
    // fitView depois que as posições assentam.
    setTimeout(() => rf.fitView({ duration: 400, padding: 0.2 }), 60);
  }, [edges, setNodes, scheduleSave, rf]);

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

  return (
    <OrgEmployeesProvider value={employeesById}>
      <div className="flex flex-col">
        {/* Toolbar */}
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

        {isMobile && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t.mobileHint}</span>
          </div>
        )}

        {/* Canvas — precisa de altura definida senão o React Flow não renderiza. */}
        <div className="org-flow-wrapper h-[calc(100vh-20rem)] min-h-[420px] w-full overflow-hidden rounded-xl border bg-muted/20">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodesDraggable={!isMobile}
            nodesConnectable={!isMobile}
            elementsSelectable
            deleteKeyCode={isMobile ? null : ['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls showInteractive={!isMobile} />
            {!isMobile && <MiniMap pannable zoomable className="!bg-card" />}
          </ReactFlow>
        </div>

        {/* Painel de edição (desktop): flutua abaixo da toolbar quando há seleção. */}
        {!isMobile && selectedNode && (
          <EditPanel
            key={selectedNode.id}
            node={selectedNode}
            employeesById={employeesById}
            onChange={updateSelected}
            onDelete={deleteSelected}
            onClose={() => setSelectedNodeId(null)}
            t={t}
          />
        )}
      </div>

      <AddNodeModal
        open={addOpen}
        onOpenChange={setAddOpen}
        employees={employees}
        onAdd={addNode}
        t={t}
      />
    </OrgEmployeesProvider>
  );
}

// ── Modal de adicionar nó ────────────────────────────────────────────────────
interface AddNodeModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employees: Employee[];
  onAdd: (data: OrgNodeData) => void;
  t: any;
}

function AddNodeModal({ open, onOpenChange, employees, onAdd, t }: AddNodeModalProps) {
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
      setSector('');
      setColor('');
    }
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
        <ColorPicker value={color} onChange={setColor} />
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
  t: any;
}

function EditPanel({ node, employeesById, onChange, onDelete, onClose, t }: EditPanelProps) {
  const d = node.data;
  const isEmployee = d.kind === 'employee';
  const emp = isEmployee && d.employeeId ? employeesById[d.employeeId] : undefined;

  return (
    <div className="mt-3 rounded-xl border bg-card p-4 shadow-sm">
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
          />
        </div>
      </div>

      <div className="mt-4">
        <Button variant="destructive" size="sm" onClick={onDelete}>
          {t.editPanel.deleteNode}
        </Button>
      </div>
    </div>
  );
}

// ── Seletor de cor do setor ──────────────────────────────────────────────────
function ColorPicker({
  value,
  onChange,
  allowNone,
  noneLabel,
}: {
  value: string;
  onChange: (c: string) => void;
  allowNone?: boolean;
  noneLabel?: string;
}) {
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
            value === c ? 'scale-110 border-foreground' : 'border-transparent',
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export function OrgChartCanvas({ chart }: { chart: OrgChart }) {
  const { employees } = useEmployees();
  const employeesById = useMemo(() => {
    const map: Record<string, Employee> = {};
    for (const e of employees) map[e.id] = e;
    return map;
  }, [employees]);

  return (
    <ReactFlowProvider>
      <OrgChartCanvasInner chart={chart} employees={employees} employeesById={employeesById} />
    </ReactFlowProvider>
  );
}
