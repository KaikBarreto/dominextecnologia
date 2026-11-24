import { useState, useRef, useMemo } from 'react';
import { Plus, GripVertical, Pencil, Trash2, Check, X, Trophy, XCircle, ChevronUp, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ICON_OPTIONS, IconPreview } from '@/components/customers/originIcons';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useCrmStages, type CrmStage } from '@/hooks/useCrmStages';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { CrmStageAutomationDialog } from '@/components/crm/CrmStageAutomationDialog';
import { useCrmAutomationRules } from '@/hooks/useCrmStageAutomations';
import { useIsMobile } from '@/hooks/use-mobile';
import { countCrmStageRequirements } from '@/lib/crmAutomation';

interface StageManagerDialogProps {
  /** Renderiza o CRUD dentro de uma tela de configurações, sem abrir outro modal. */
  embedded?: boolean;
  /** Gatilho embutido (padrão histórico). Omitir quando o diálogo é aberto
   *  de fora, por `open`/`onOpenChange` (menu da engrenagem das abas de funil). */
  children?: React.ReactNode;
  /** Modo controlado. Ausente = o diálogo controla o próprio estado. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Funil dono das etapas gerenciadas aqui (Onda D — multi-pipeline). Toda
   * etapa listada/criada/reordenada neste diálogo pertence a ESTE funil —
   * outros funis da empresa não aparecem nem são afetados. Opcional só pro
   * bootstrap raríssimo de empresa sem nenhum funil ainda (o trigger do
   * banco cria o funil padrão sozinho nesse caso).
   */
  pipelineId?: string;
  /** Nome do funil, só pra deixar claro no título do diálogo qual funil está
   *  sendo editado quando a empresa tem mais de um. */
  pipelineName?: string;
  /** Versão enxuta usada dentro do funil expansível nas configurações. */
  compact?: boolean;
}

export function StageManagerDialog({
  embedded = false,
  children,
  open: openProp,
  onOpenChange,
  pipelineId,
  pipelineName,
  compact = false,
}: StageManagerDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;
  const { stages: allStages, createStage, updateStage, deleteStage, reorderStages, getStageColorClass } =
    useCrmStages();
  // Só as etapas do funil sendo gerenciado — dragar/reordenar aqui NUNCA deve
  // reindexar a posição de etapas de OUTRO funil da mesma empresa.
  const stages = useMemo(
    () => (pipelineId ? allStages.filter((s) => s.pipeline_id === pipelineId) : allStages),
    [allStages, pipelineId],
  );
  const isMobile = useIsMobile();
  // Quantas automações cada etapa tem: sem isso a pessoa precisa abrir etapa
  // por etapa pra descobrir onde já existe regra configurada.
  const { rules: automationRules } = useCrmAutomationRules(pipelineId);
  const automationsByStage = useMemo(() => {
    const map = new Map<string, number>();
    automationRules.forEach((rule) => map.set(rule.trigger_stage_id, (map.get(rule.trigger_stage_id) ?? 0) + 1));
    return map;
  }, [automationRules]);
  const stageSummary = (stage: CrmStage) => {
    const requirements = countCrmStageRequirements(stage.requirements);
    const automations = automationsByStage.get(stage.id) ?? 0;
    const plural = (count: number, one: string, many: string) =>
      count === 1 ? one : many.replace('{count}', String(count));
    return [
      requirements > 0 ? plural(requirements, t.stages.rulesCountOne, t.stages.rulesCountMany) : null,
      automations > 0 ? plural(automations, t.stages.automationsCountOne, t.stages.automationsCountMany) : null,
    ].filter(Boolean).join(' · ');
  };
  const dialogTitle = pipelineName
    ? t.stages.titleWithPipeline.replace('{pipeline}', pipelineName)
    : t.stages.title;
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [configuringStage, setConfiguringStage] = useState<CrmStage | null>(null);
  const [newStage, setNewStage] = useState<{
    name: string;
    color: string;
    icon: string | null;
    is_won: boolean;
    is_lost: boolean;
  }>({
    name: '',
    color: '#6B7280',
    icon: null,
    is_won: false,
    is_lost: false,
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleCreateStage = () => {
    // pipelineId é obrigatório pro insert (CrmStageInsert.pipeline_id não é
    // mais opcional, espelhando a coluna NOT NULL do banco). Sem funil
    // resolvido (bootstrap raríssimo de empresa sem nenhum pipeline ainda),
    // este diálogo simplesmente não cria etapa avulsa — esse caso é coberto
    // por "Começar com estágios padrão" (seedDefaultStages), que aceita
    // funil ausente e deixa o trigger do banco criar um.
    if (!newStage.name.trim() || !pipelineId) return;
    createStage.mutate(
      { ...newStage, pipeline_id: pipelineId },
      {
        onSuccess: () => {
          setNewStage({ name: '', color: '#6B7280', icon: null, is_won: false, is_lost: false });
          setShowCreateForm(false);
        },
      },
    );
  };

  const handleUpdateStage = (stage: CrmStage, updates: Partial<CrmStage>) => {
    updateStage.mutate({ id: stage.id, ...updates });
  };

  const handleDeleteStage = () => {
    if (deleteId) {
      deleteStage.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  };

  const handleDragStart = (e: React.DragEvent, stageId: string) => {
    setDraggedId(stageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', stageId);
  };
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== stageId) setDragOverId(stageId);
  };
  const handleDragLeave = () => {
    setDragOverId(null);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const draggedIndex = stages.findIndex((s) => s.id === draggedId);
    const targetIndex = stages.findIndex((s) => s.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const newOrder = [...stages];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    reorderStages.mutate(newOrder.map((s) => s.id));
    setDraggedId(null);
    setDragOverId(null);
  };

  const moveStage = (id: string, offset: number) => {
    const currentIndex = stages.findIndex((stage) => stage.id === id);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= stages.length) return;
    const next = [...stages];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(targetIndex, 0, moved);
    reorderStages.mutate(next.map((stage) => stage.id));
  };

  const EditableRow = ({ stage }: { stage: CrmStage }) => {
    const [name, setName] = useState(stage.name);
    const [color, setColor] = useState(stage.color);
    const [icon, setIcon] = useState<string | null>(stage.icon);
    const [isWon, setIsWon] = useState(stage.is_won);
    const [isLost, setIsLost] = useState(stage.is_lost);
    const isEditing = editingId === stage.id;
    const isDragging = draggedId === stage.id;
    const isDragOver = dragOverId === stage.id;

    if (isEditing) {
      return (
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/30 p-3 last:border-b-0">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.stages.namePlaceholder}
              className="flex-1"
              autoFocus
            />
            <Select value={icon ?? 'none'} onValueChange={(v) => setIcon(v === 'none' ? null : v)}>
              <SelectTrigger className="w-[100px] h-9" aria-label={t.stages.iconLabel}>
                <div className="flex items-center gap-1.5">
                  {icon ? <IconPreview name={icon} className="h-3.5 w-3.5" /> : null}
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t.stages.iconNone}</SelectItem>
                {ICON_OPTIONS.map((ic) => (
                  <SelectItem key={ic} value={ic}>
                    <div className="flex items-center gap-2">
                      <IconPreview name={ic} className="h-3.5 w-3.5" />
                      <span className="text-xs">{ic}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id={`won-${stage.id}`}
                  checked={isWon}
                  onCheckedChange={(c) => {
                    setIsWon(c);
                    if (c) setIsLost(false);
                  }}
                />
                <Label
                  htmlFor={`won-${stage.id}`}
                  className="text-xs flex items-center gap-1"
                >
                  <Trophy className="h-3 w-3 text-success" />
                  {t.stages.wonLabel}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={`lost-${stage.id}`}
                  checked={isLost}
                  onCheckedChange={(c) => {
                    setIsLost(c);
                    if (c) setIsWon(false);
                  }}
                />
                <Label
                  htmlFor={`lost-${stage.id}`}
                  className="text-xs flex items-center gap-1"
                >
                  <XCircle className="h-3 w-3 text-destructive" />
                  {t.stages.lostLabel}
                </Label>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setName(stage.name);
                  setColor(stage.color);
                  setIcon(stage.icon);
                  setIsWon(stage.is_won);
                  setIsLost(stage.is_lost);
                  setEditingId(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  handleUpdateStage(stage, { name, color, icon, is_won: isWon, is_lost: isLost });
                  setEditingId(null);
                }}
              >
                <Check className="h-4 w-4 text-success" />
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={isDragging ? dragNodeRef : null}
        draggable={!isEditing}
        onDragStart={(e) => handleDragStart(e, stage.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, stage.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, stage.id)}
        className={cn(
          'group flex items-center gap-2 border-b border-border/60 px-3 py-2 transition-colors last:border-b-0',
          isDragging && 'opacity-50',
          isDragOver && 'bg-primary/5 ring-2 ring-inset ring-primary',
          !isDragging && !isDragOver && 'hover:bg-muted/30',
        )}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
        <div className="flex shrink-0 flex-col md:hidden">
          <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${stage.name} para cima`} disabled={stages[0]?.id === stage.id} onClick={() => moveStage(stage.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></button>
          <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${stage.name} para baixo`} disabled={stages[stages.length - 1]?.id === stage.id} onClick={() => moveStage(stage.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></button>
        </div>
        <Badge className={cn(getStageColorClass(stage.color), 'font-medium gap-1')}>
          {stage.icon && <IconPreview name={stage.icon} className="h-3 w-3" />}
          {stage.name}
        </Badge>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {stage.is_won && <Trophy className="h-3.5 w-3.5 shrink-0 text-success" />}
          {stage.is_lost && <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
          {stageSummary(stage) && (
            <span className="min-w-0 truncate text-xs text-muted-foreground">{stageSummary(stage)}</span>
          )}
        </div>
        {/* Regras e automações é a ação principal da etapa: no computador fica
            à vista, com rótulo. Escondida num menu que só aparecia no hover,
            ninguém descobria que a etapa aceita automação. */}
        {!isMobile && (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setConfiguringStage(stage)}>
            <SlidersHorizontal className="mr-1.5 h-4 w-4" />
            {t.stages.configureAction}
          </Button>
        )}
        {/* Menu SEMPRE visível: `opacity-0 + group-hover` escondia editar e
            excluir por completo no toque, onde hover não existe. */}
        <div className="shrink-0">
          <RowActionsMenu
            actions={[
              {
                label: t.stages.configureAction,
                icon: SlidersHorizontal,
                variant: 'edit',
                hidden: !isMobile,
                onClick: () => setConfiguringStage(stage),
              },
              {
                label: t.stages.editLabel,
                icon: Pencil,
                variant: 'edit',
                onClick: () => setEditingId(stage.id),
              },
              {
                label: t.stages.deleteLabel,
                icon: Trash2,
                variant: 'delete',
                onClick: () => setDeleteId(stage.id),
              },
            ]}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      {!embedded && children && <span onClick={() => setOpen(true)}>{children}</span>}
      {embedded ? (
        <section className={cn('space-y-4', !compact && 'space-y-5')} aria-label={dialogTitle}>
          {!compact && <div>
            <h2 className="text-xl font-semibold">{dialogTitle}</h2>
            <p className="text-sm text-muted-foreground mt-1">Crie, ordene e personalize as colunas deste funil.</p>
          </div>}
          <div className="space-y-3">
            {compact && (
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">{t.stages.sectionTitle}</h4>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{stages.length}</span>
                {!showCreateForm && (
                  <Button variant="outline" size="sm" onClick={() => setShowCreateForm(true)} className="ml-auto gap-1.5">
                    <Plus className="h-4 w-4" /> Novo estágio
                  </Button>
                )}
              </div>
            )}
            {showCreateForm ? (
              <div className="space-y-3 rounded-xl bg-muted/35 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">{t.stages.newStageLabel}</Label>
                  <Button variant="ghost" size="icon" aria-label="Fechar novo estágio" onClick={() => setShowCreateForm(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(150px,1fr)_110px_auto_auto]">
                  <Input autoFocus value={newStage.name} onChange={(e) => setNewStage({ ...newStage, name: e.target.value })} placeholder={t.stages.namePlaceholder} className="flex-1 min-w-[150px]" />
                  <Select value={newStage.icon ?? 'none'} onValueChange={(v) => setNewStage({ ...newStage, icon: v === 'none' ? null : v })}>
                    <SelectTrigger className="w-[110px] h-9" aria-label={t.stages.iconLabel}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">{t.stages.iconNone}</SelectItem>{ICON_OPTIONS.map((ic) => <SelectItem key={ic} value={ic}>{ic}</SelectItem>)}</SelectContent>
                  </Select>
                  <ColorPicker value={newStage.color} onChange={(color) => setNewStage({ ...newStage, color })} />
                  <Button onClick={handleCreateStage} disabled={!newStage.name.trim() || !pipelineId || createStage.isPending} className="gap-2 sm:justify-self-end"><Plus className="h-4 w-4" /> Adicionar estágio</Button>
                </div>
              </div>
            ) : !compact ? (
              <Button variant="outline" onClick={() => setShowCreateForm(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Novo estágio
              </Button>
            ) : null}
            {stages.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-8 text-center">
                <p className="font-medium">{t.stages.emptyTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.stages.emptyDesc}</p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border bg-card">
                  {stages.map((stage) => <EditableRow key={stage.id} stage={stage} />)}
                </div>
                {stages.length > 1 && <p className="text-xs text-muted-foreground">{t.stages.dragHint}</p>}
              </>
            )}
          </div>
        </section>
      ) : (
      <ResponsiveModal open={open} onOpenChange={setOpen} title={dialogTitle}>
        <div className="space-y-4">
          {!showCreateForm ? (
            <Button variant="outline" onClick={() => setShowCreateForm(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Novo estágio
            </Button>
          ) : (
          <div className="space-y-3 rounded-xl bg-muted/35 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">{t.stages.newStageLabel}</Label>
              <Button variant="ghost" size="icon" aria-label="Fechar novo estágio" onClick={() => setShowCreateForm(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input
                autoFocus
                value={newStage.name}
                onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                placeholder={t.stages.namePlaceholder}
                className="flex-1 min-w-[120px]"
              />
              <Select
                value={newStage.icon ?? 'none'}
                onValueChange={(v) => setNewStage({ ...newStage, icon: v === 'none' ? null : v })}
              >
                <SelectTrigger className="w-[100px] h-9" aria-label={t.stages.iconLabel}>
                  <div className="flex items-center gap-1.5">
                    {newStage.icon ? <IconPreview name={newStage.icon} className="h-3.5 w-3.5" /> : null}
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.stages.iconNone}</SelectItem>
                  {ICON_OPTIONS.map((ic) => (
                    <SelectItem key={ic} value={ic}>
                      <div className="flex items-center gap-2">
                        <IconPreview name={ic} className="h-3.5 w-3.5" />
                        <span className="text-xs">{ic}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ColorPicker
                value={newStage.color}
                onChange={(color) => setNewStage({ ...newStage, color })}
              />
              <Button
                onClick={handleCreateStage}
                disabled={!newStage.name.trim() || !pipelineId || createStage.isPending}
                size="icon"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          )}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t.stages.dragHint}</p>
            <div className="max-h-[400px] overflow-y-auto rounded-xl border bg-card">
              {stages.map((stage) => (
                <EditableRow key={stage.id} stage={stage} />
              ))}
            </div>
          </div>
        </div>
      </ResponsiveModal>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.stages.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.stages.deleteDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.stages.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStage}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t.stages.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {configuringStage && (
        <CrmStageAutomationDialog
          open
          onOpenChange={(next) => { if (!next) setConfiguringStage(null); }}
          stage={configuringStage}
          initialTab="rules"
        />
      )}
    </>
  );
}
