import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleDot,
  Eye,
  FileBarChart,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Sigma,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  type DreLayoutBundle,
  type DreLayoutProfileBundle,
  useDreLayoutProfiles,
} from "@/hooks/useDreLayoutProfiles";

interface Props {
  companyId?: string;
  canManage: boolean;
  onBack: () => void;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível concluir esta ação";

const classificationValue = (assignment: Record<string, any>) =>
  assignment.classification === "group" && assignment.group_id
    ? `group:${assignment.group_id}`
    : assignment.classification;

export function DreLayoutProfilesPanel({ companyId, canManage, onBack }: Props) {
  const dre = useDreLayoutProfiles(companyId);
  const [newName, setNewName] = useState("");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const configuration = dre.configuration;
  const profiles = configuration?.profiles.filter((item) => !item.profile.is_archived) ?? [];
  const editingProfile = profiles.find((item) => item.profile.id === editingProfileId) ?? null;

  const run = async (action: Promise<unknown>, success: string) => {
    try {
      await action;
      toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return toast.error("Dê um nome para a visão");
    try {
      await run(dre.createDraft.mutateAsync({ name }), "Visão criada como rascunho");
      setNewName("");
    } catch {
      // O erro já foi apresentado pelo helper.
    }
  };

  if (editingProfile?.draft) {
    return (
      <DreDraftEditor
        profile={editingProfile}
        draft={editingProfile.draft}
        canManage={canManage}
        dre={dre}
        validationMessages={validationMessages}
        onValidationMessages={setValidationMessages}
        onBack={() => { setEditingProfileId(null); setValidationMessages([]); }}
      />
    );
  }

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 gap-2" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Voltar à organização padrão
          </Button>
          <h3 className="text-lg font-semibold">Outras visões do mesmo DRE</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Categorias e lançamentos continuam os mesmos. Cada visão muda apenas a forma de agrupar e calcular a apresentação.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FileBarChart className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-medium">DRE padrão do sistema</p>
              <p className="text-xs text-muted-foreground">Recomendado para a maioria das empresas.</p>
            </div>
          </div>
          {configuration?.settings.mode === "legacy" ? (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Em uso
            </span>
          ) : canManage ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={dre.restoreLegacy.isPending}
              onClick={() => void run(dre.restoreLegacy.mutateAsync(), "DRE padrão restaurado")}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Usar padrão
            </Button>
          ) : null}
        </div>
      </div>

      {dre.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : dre.error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          O recurso de outras visões ainda não está disponível neste ambiente. O DRE padrão continua funcionando normalmente.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {profiles.map((bundle) => {
            const isDefault = configuration?.settings.mode === "custom"
              && configuration.settings.default_profile_id === bundle.profile.id;
            return (
              <div key={bundle.profile.id} className={cn("rounded-xl border bg-background p-4", isDefault && "border-primary/40 ring-1 ring-primary/15")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{bundle.profile.name}</p>
                      {isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Em uso</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {bundle.active ? `Versão ${bundle.active.layout.version} publicada` : "Ainda não publicada"}
                      {bundle.draft ? " · possui rascunho" : ""}
                    </p>
                  </div>
                  <FileBarChart className="h-5 w-5 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canManage && (
                    <Button
                      size="sm"
                      variant={bundle.draft ? "default" : "outline"}
                      className="gap-2"
                      onClick={async () => {
                        if (!bundle.draft) {
                          await run(
                            dre.createDraft.mutateAsync({ profileId: bundle.profile.id, name: bundle.profile.name }),
                            "Nova versão criada como rascunho",
                          );
                        }
                        setEditingProfileId(bundle.profile.id);
                      }}
                    >
                      <Settings2 className="h-3.5 w-3.5" /> {bundle.draft ? "Continuar configuração" : "Criar nova versão"}
                    </Button>
                  )}
                  {bundle.active && !isDefault && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void run(dre.setDefault.mutateAsync(bundle.profile.id), `${bundle.profile.name} agora está em uso`)}
                    >
                      Usar esta visão
                    </Button>
                  )}
                  {canManage && !isDefault && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto h-9 w-9 text-destructive"
                      aria-label={`Arquivar ${bundle.profile.name}`}
                      onClick={() => void run(dre.archiveProfile.mutateAsync(bundle.profile.id), "Visão arquivada")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canManage && !dre.error && (
        <div className="rounded-xl border border-dashed p-4">
          <Label htmlFor="new-dre-view">Criar outra visão</Label>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">
            Exemplos: DRE gerencial, DRE contábil ou EBITDA.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="new-dre-view"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Nome da visão"
              onKeyDown={(event) => { if (event.key === "Enter") void create(); }}
            />
            <Button className="gap-2 sm:w-auto" onClick={() => void create()} disabled={dre.createDraft.isPending}>
              {dre.createDraft.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar rascunho
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DreDraftEditor({
  profile,
  draft,
  canManage,
  dre,
  validationMessages,
  onValidationMessages,
  onBack,
}: {
  profile: DreLayoutProfileBundle;
  draft: DreLayoutBundle;
  canManage: boolean;
  dre: ReturnType<typeof useDreLayoutProfiles>;
  validationMessages: string[];
  onValidationMessages: (messages: string[]) => void;
  onBack: () => void;
}) {
  const macroNodes = useMemo(
    () => draft.nodes.filter((node) => node.node_type === "macro_group").sort((a, b) => a.sort_order - b.sort_order),
    [draft.nodes],
  );
  const subtotalNodes = useMemo(
    () => draft.nodes.filter((node) => node.node_type === "subtotal").sort((a, b) => a.sort_order - b.sort_order),
    [draft.nodes],
  );
  const orderedNodes = useMemo(
    () => [...draft.nodes].sort((a, b) => a.sort_order - b.sort_order),
    [draft.nodes],
  );
  const configurableNodes = useMemo(
    () => orderedNodes.filter((node) => node.node_type !== "final_result"),
    [orderedNodes],
  );
  const [selectedNodeId, setSelectedNodeId] = useState(macroNodes[0]?.id ?? "");
  const selectedNode = macroNodes.find((node) => node.id === selectedNodeId) ?? macroNodes[0];
  const groups = draft.groups.filter((group) => group.macro_node_id === selectedNode?.id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const [label, setLabel] = useState(selectedNode?.label ?? "");
  const [entryKind, setEntryKind] = useState<"income" | "expense" | "mixed">(selectedNode?.entry_kind ?? "expense");
  const [affectsResult, setAffectsResult] = useState(Boolean(selectedNode?.affects_result));
  const [showWhenZero, setShowWhenZero] = useState(Boolean(selectedNode?.show_when_zero));
  const [newGroupName, setNewGroupName] = useState("");
  const [addingMacro, setAddingMacro] = useState(false);
  const [newMacroName, setNewMacroName] = useState("");
  const [newMacroKind, setNewMacroKind] = useState<"income" | "expense" | "mixed">("expense");
  const [addingSubtotal, setAddingSubtotal] = useState(false);
  const [newSubtotalName, setNewSubtotalName] = useState("");
  const [newSubtotalKind, setNewSubtotalKind] = useState<"running_total" | "selected_macros">("running_total");

  useEffect(() => {
    setLabel(selectedNode?.label ?? "");
    setEntryKind(selectedNode?.entry_kind ?? "expense");
    setAffectsResult(Boolean(selectedNode?.affects_result));
    setShowWhenZero(Boolean(selectedNode?.show_when_zero));
  }, [selectedNode?.id, selectedNode?.label, selectedNode?.entry_kind, selectedNode?.affects_result, selectedNode?.show_when_zero]);

  const compatibleGroups = (kind: string) => draft.groups.filter((group) => {
    const macro = draft.nodes.find((node) => node.id === group.macro_node_id);
    if (kind === "mixed") return macro?.entry_kind === "mixed";
    return macro?.entry_kind === "mixed" || macro?.entry_kind === kind;
  });

  const assign = async (assignment: Record<string, any>, value: string, source = false) => {
    const classification = value.startsWith("group:") ? "group" : value;
    const groupId = value.startsWith("group:") ? value.slice(6) : null;
    try {
      if (source) {
        await dre.setDraftSourceAssignment.mutateAsync({ assignmentId: assignment.id, classification: classification as any, groupId });
      } else {
        await dre.setDraftCategoryAssignment.mutateAsync({ assignmentId: assignment.id, classification: classification as any, groupId });
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const moveNode = async (nodeId: string, direction: -1 | 1) => {
    const currentIndex = configurableNodes.findIndex((node) => node.id === nodeId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= configurableNodes.length) return;
    const next = [...configurableNodes];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    try {
      await dre.reorderDraftNodes.mutateAsync({ layoutId: draft.layout.id, nodeIds: next.map((node) => node.id) });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const moveGroup = async (groupId: string, direction: -1 | 1) => {
    const currentIndex = groups.findIndex((group) => group.id === groupId);
    const targetIndex = currentIndex + direction;
    if (!selectedNode || currentIndex < 0 || targetIndex < 0 || targetIndex >= groups.length) return;
    const next = [...groups];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    try {
      await dre.reorderDraftGroups.mutateAsync({ macroNodeId: selectedNode.id, groupIds: next.map((group) => group.id) });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const publish = async () => {
    try {
      const validation = await dre.validateLayout(draft.layout.id);
      const messages = [...validation.blockers, ...validation.warnings].map((item) => `${item.message}${item.count ? ` (${item.count})` : ""}`);
      onValidationMessages(messages);
      if (!validation.valid) return toast.error("Resolva as pendências antes de publicar");
      await dre.publishLayout.mutateAsync(draft.layout.id);
      toast.success("Visão publicada. Use o botão ‘Usar esta visão’ quando quiser ativá-la.");
      onBack();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 gap-2" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> Todas as visões
          </Button>
          <h3 className="text-lg font-semibold">{profile.profile.name}</h3>
          <p className="text-sm text-muted-foreground">Rascunho da versão {draft.layout.version}</p>
        </div>
        {canManage && (
          <Button className="gap-2" onClick={() => void publish()} disabled={dre.publishLayout.isPending}>
            {dre.publishLayout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Validar e publicar
          </Button>
        )}
      </div>

      {validationMessages.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="mb-1 font-medium">Revisão antes de publicar</p>
          <ul className="space-y-1">
            {validationMessages.map((message) => <li key={message}>• {message}</li>)}
          </ul>
        </div>
      )}

      <div className="grid min-h-[560px] overflow-hidden rounded-xl border lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="border-b bg-muted/20 p-3 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="flex items-center gap-2"><FileBarChart className="h-3.5 w-3.5" /> Estrutura</span>
            {canManage && (
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Adicionar macrogrupo" onClick={() => setAddingMacro((value) => !value)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {addingMacro && (
            <div className="mb-3 space-y-2 rounded-lg border bg-background p-2">
              <Input className="h-8 text-xs" value={newMacroName} onChange={(event) => setNewMacroName(event.target.value)} placeholder="Nome do macrogrupo" autoFocus />
              <Select value={newMacroKind} onValueChange={(value) => setNewMacroKind(value as typeof newMacroKind)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Receitas</SelectItem>
                  <SelectItem value="expense">Despesas</SelectItem>
                  <SelectItem value="mixed">Receitas e despesas</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-8 flex-1" onClick={() => setAddingMacro(false)}>Cancelar</Button>
                <Button
                  size="sm"
                  className="h-8 flex-1"
                  disabled={!newMacroName.trim() || dre.createDraftNode.isPending}
                  onClick={async () => {
                    try {
                      const nodeId = await dre.createDraftNode.mutateAsync({ layoutId: draft.layout.id, label: newMacroName, entryKind: newMacroKind });
                      setNewMacroName("");
                      setAddingMacro(false);
                      setSelectedNodeId(nodeId);
                      toast.success("Macrogrupo criado");
                    } catch (error) {
                      toast.error(errorMessage(error));
                    }
                  }}
                >
                  Criar
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            {orderedNodes.map((node) => {
              const movableIndex = configurableNodes.findIndex((candidate) => candidate.id === node.id);
              const movable = node.node_type !== "final_result";
              return (
                <div key={node.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={node.node_type !== "macro_group"}
                    onClick={() => setSelectedNodeId(node.id)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                      node.node_type === "macro_group" ? "hover:bg-background" : "cursor-default text-muted-foreground",
                      selectedNode?.id === node.id && "bg-background font-medium shadow-sm ring-1 ring-border",
                    )}
                  >
                    {node.node_type === "macro_group" ? <CircleDot className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{node.label}</span>
                  </button>
                  {canManage && movable && (
                    <div className="flex shrink-0">
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Subir ${node.label}`} disabled={movableIndex <= 0 || dre.reorderDraftNodes.isPending} onClick={() => void moveNode(node.id, -1)}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Descer ${node.label}`} disabled={movableIndex >= configurableNodes.length - 1 || dre.reorderDraftNodes.isPending} onClick={() => void moveNode(node.id, 1)}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 w-full justify-start gap-2 text-xs text-muted-foreground"
              onClick={() => setAddingSubtotal((value) => !value)}
            >
              <Sigma className="h-3.5 w-3.5" /> Adicionar linha de subtotal
            </Button>
          )}
          {addingSubtotal && (
            <div className="mt-2 space-y-2 rounded-lg border bg-background p-2">
              <Input className="h-8 text-xs" value={newSubtotalName} onChange={(event) => setNewSubtotalName(event.target.value)} placeholder="Ex.: EBITDA" autoFocus />
              <Select value={newSubtotalKind} onValueChange={(value) => setNewSubtotalKind(value as typeof newSubtotalKind)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="running_total">Somar tudo acima</SelectItem>
                  <SelectItem value="selected_macros">Somar blocos escolhidos</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-8 flex-1" onClick={() => setAddingSubtotal(false)}>Cancelar</Button>
                <Button
                  size="sm"
                  className="h-8 flex-1"
                  disabled={!newSubtotalName.trim() || dre.createDraftSubtotal.isPending}
                  onClick={async () => {
                    try {
                      await dre.createDraftSubtotal.mutateAsync({ layoutId: draft.layout.id, label: newSubtotalName, calculationKind: newSubtotalKind });
                      setNewSubtotalName("");
                      setAddingSubtotal(false);
                      toast.success("Subtotal adicionado antes do resultado final");
                    } catch (error) {
                      toast.error(errorMessage(error));
                    }
                  }}
                >
                  Criar
                </Button>
              </div>
            </div>
          )}
        </aside>

        <main className="border-b p-4 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia da seção</p>
              <h4 className="mt-1 font-semibold">{selectedNode?.label}</h4>
            </div>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
              <span className="font-semibold">{selectedNode?.label}</span>
              <span className="text-xs text-white/70">{affectsResult ? "Compõe o resultado" : "Somente informativo"}</span>
            </div>
            {groups.map((group) => {
              const count = draft.categoryAssignments.filter((assignment) => assignment.group_id === group.id).length;
              return (
                <div key={group.id} className="flex items-center justify-between border-t px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">{count} {count === 1 ? "item" : "itens"}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">valor</span>
                </div>
              );
            })}
            {groups.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Adicione ao menos um grupo interno.</p>}
          </div>

          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias nesta visão</p>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {draft.categoryAssignments.map((assignment) => (
                <div key={assignment.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_240px] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{assignment.category_name_snapshot}</p>
                    <p className="text-xs text-muted-foreground">
                      {assignment.category_type_snapshot === "income"
                        ? "Receita"
                        : assignment.category_type_snapshot === "expense"
                          ? "Despesa"
                          : "Entrada e saída"}
                    </p>
                  </div>
                  <AssignmentSelect
                    value={classificationValue(assignment)}
                    groups={compatibleGroups(assignment.category_type_snapshot)}
                    onChange={(value) => void assign(assignment, value)}
                    disabled={!canManage}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linhas de subtotal</p>
              <p className="mt-1 text-xs text-muted-foreground">Aparecem antes do resultado final e nunca alteram os lançamentos.</p>
            </div>
            {subtotalNodes.map((subtotal) => {
              const selectedIds = draft.calculationSources
                .filter((source) => source.calculation_node_id === subtotal.id)
                .map((source) => source.macro_node_id);
              return (
                <div key={subtotal.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{subtotal.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {subtotal.calculation_kind === "running_total" ? "Soma os blocos participantes posicionados acima." : "Soma somente os blocos marcados abaixo."}
                      </p>
                    </div>
                    {canManage && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-destructive"
                        aria-label={`Excluir subtotal ${subtotal.label}`}
                        onClick={() => void dre.deleteDraftNode.mutateAsync(subtotal.id)
                          .then(() => toast.success("Subtotal excluído"))
                          .catch((error) => toast.error(errorMessage(error)))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {subtotal.calculation_kind === "selected_macros" && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {macroNodes.filter((macro) => macro.affects_result).map((macro) => {
                        const checked = selectedIds.includes(macro.id);
                        return (
                          <label key={macro.id} className="flex items-center gap-2 rounded-md bg-muted/25 px-2.5 py-2 text-xs">
                            <Checkbox
                              checked={checked}
                              disabled={!canManage || dre.setDraftCalculationSources.isPending}
                              onCheckedChange={(next) => {
                                const macroNodeIds = next
                                  ? [...selectedIds, macro.id]
                                  : selectedIds.filter((id) => id !== macro.id);
                                void dre.setDraftCalculationSources.mutateAsync({ calculationNodeId: subtotal.id, macroNodeIds })
                                  .catch((error) => toast.error(errorMessage(error)));
                              }}
                            />
                            <span>{macro.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {subtotalNodes.length === 0 && <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Nenhum subtotal adicional nesta visão.</p>}
          </div>
        </main>

        <aside className="space-y-5 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como esta seção funciona</p>
            <p className="mt-1 text-sm text-muted-foreground">As mudanças valem somente para esta visão.</p>
          </div>
          {selectedNode && (
            <>
              <div className="space-y-2">
                <Label htmlFor="macro-label">Nome do macrogrupo</Label>
                <Input id="macro-label" value={label} onChange={(event) => setLabel(event.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-2">
                <Label>Tipo de lançamento</Label>
                <Select value={entryKind} onValueChange={(value) => setEntryKind(value as any)} disabled={!canManage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Receitas</SelectItem>
                    <SelectItem value="expense">Despesas</SelectItem>
                    <SelectItem value="mixed">Receitas e despesas</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Para trocar o tipo, mova antes os itens incompatíveis.</p>
              </div>
              <div className="space-y-3 rounded-lg border p-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Entra no resultado</span>
                  <Switch checked={affectsResult} onCheckedChange={setAffectsResult} disabled={!canManage} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Mostrar quando zerado</span>
                  <Switch checked={showWhenZero} onCheckedChange={setShowWhenZero} disabled={!canManage} />
                </label>
              </div>
              {canManage && (
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await dre.updateDraftNode.mutateAsync({
                        nodeId: selectedNode.id,
                        label,
                        entryKind,
                        affectsResult,
                        showWhenZero,
                      });
                      toast.success("Macrogrupo atualizado");
                    } catch (error) {
                      toast.error(errorMessage(error));
                    }
                  }}
                >
                  <Save className="h-4 w-4" /> Salvar seção
                </Button>
              )}
              {canManage && groups.length === 0 && !selectedNode.is_percentage_base && macroNodes.length > 1 && (
                <Button
                  className="w-full gap-2 text-destructive hover:text-destructive"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await dre.deleteDraftNode.mutateAsync(selectedNode.id);
                      setSelectedNodeId(macroNodes.find((node) => node.id !== selectedNode.id)?.id ?? "");
                      toast.success("Macrogrupo vazio excluído");
                    } catch (error) {
                      toast.error(errorMessage(error));
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Excluir macrogrupo vazio
                </Button>
              )}

              <div className="border-t pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grupos internos</p>
                <div className="space-y-2">
                  {groups.map((group, index) => (
                    <DraftGroupRow
                      key={group.id}
                      group={group}
                      canManage={canManage}
                      dre={dre}
                      canMoveUp={index > 0}
                      canMoveDown={index < groups.length - 1}
                      onMoveUp={() => void moveGroup(group.id, -1)}
                      onMoveDown={() => void moveGroup(group.id, 1)}
                    />
                  ))}
                </div>
                {canManage && (
                  <div className="mt-3 flex gap-2">
                    <Input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Novo grupo" />
                    <Button
                      size="icon"
                      aria-label="Adicionar grupo interno"
                      disabled={!newGroupName.trim()}
                      onClick={async () => {
                        try {
                          await dre.createDraftGroup.mutateAsync({
                            layoutId: draft.layout.id,
                            macroNodeId: selectedNode.id,
                            name: newGroupName,
                          });
                          setNewGroupName("");
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Publicar troca somente a apresentação selecionada. Categorias, lançamentos, valores, datas e moedas permanecem intactos.
      </div>
    </div>
  );
}

function AssignmentSelect({
  value,
  groups,
  onChange,
  disabled,
}: {
  value: string;
  groups: Array<Record<string, any>>;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("h-9 text-xs", value === "unclassified" && "border-amber-400 bg-amber-50")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unclassified">Sem classificação — revisar</SelectItem>
        <SelectItem value="outside_dre">Fora do DRE — visível na auditoria</SelectItem>
        {groups.map((group) => <SelectItem key={group.id} value={`group:${group.id}`}>{group.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DraftGroupRow({
  group,
  canManage,
  dre,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  group: Record<string, any>;
  canManage: boolean;
  dre: ReturnType<typeof useDreLayoutProfiles>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [name, setName] = useState(group.name);
  useEffect(() => setName(group.name), [group.name]);
  return (
    <div className="flex gap-1.5">
      <Input className="h-9 text-xs" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} />
      {canManage && name.trim() !== group.name && (
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9"
          aria-label={`Salvar ${group.name}`}
          onClick={() => void dre.updateDraftGroup.mutateAsync({ groupId: group.id, name })
            .then(() => toast.success("Grupo atualizado"))
            .catch((error) => toast.error(errorMessage(error)))}
        >
          <Save className="h-3.5 w-3.5" />
        </Button>
      )}
      {canManage && (
        <>
          <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Subir ${group.name}`} disabled={!canMoveUp || dre.reorderDraftGroups.isPending} onClick={onMoveUp}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" aria-label={`Descer ${group.name}`} disabled={!canMoveDown || dre.reorderDraftGroups.isPending} onClick={onMoveDown}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      {canManage && (
        <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" aria-label={`Excluir ${group.name}`} onClick={() => void dre.deleteDraftGroup.mutateAsync(group.id).catch((error) => toast.error(errorMessage(error)))}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
