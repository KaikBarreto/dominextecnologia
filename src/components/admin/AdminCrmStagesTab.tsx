import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Check, X, Trophy, Ban, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useAdminCrmPipelines, useAdminCrmStages, type AdminCrmStage } from '@/hooks/useAdminCrm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ICON_OPTIONS, IconPreview } from '@/components/customers/originIcons';
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
import { cn } from '@/lib/utils';

/** Seletor de ícone da etapa — mesmo componente e mesmo comportamento do
 *  StageManagerDialog do CRM do tenant (inclusive o valor sentinela 'none',
 *  porque SelectItem com value="" quebra o Radix). */
function StageIconSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <Select value={value ?? 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
      <SelectTrigger className="w-[100px] h-8 shrink-0" aria-label="Ícone da etapa">
        <div className="flex items-center gap-1.5">
          {value ? <IconPreview name={value} className="h-3.5 w-3.5" /> : null}
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Nenhum</SelectItem>
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
  );
}

interface AdminCrmStagesTabProps {
  pipelineId?: string | null;
  pipelineName?: string;
  embedded?: boolean;
  compact?: boolean;
}

export function AdminCrmStagesTab({ pipelineId, pipelineName, embedded = false, compact = false }: AdminCrmStagesTabProps = {}) {
  const { pipelines, defaultPipeline } = useAdminCrmPipelines();
  const [settingsPipelineId, setSettingsPipelineId] = useState<string | null>(null);
  const activePipelineId = pipelineId ?? settingsPipelineId ?? defaultPipeline?.id ?? null;
  const activePipelineName = pipelineName ?? pipelines.find((pipeline) => pipeline.id === activePipelineId)?.name;
  const { stages, createStage, updateStage, deleteStage, reorderStages } = useAdminCrmStages(activePipelineId);

  useEffect(() => {
    if (!pipelineId && !settingsPipelineId && defaultPipeline?.id) {
      setSettingsPipelineId(defaultPipeline.id);
    }
  }, [defaultPipeline?.id, pipelineId, settingsPipelineId]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#6B7280');
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [editIsWon, setEditIsWon] = useState(false);
  const [editIsLost, setEditIsLost] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const startEdit = (s: AdminCrmStage) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditColor(s.color);
    setEditIcon(s.icon ?? null);
    setEditIsWon(s.is_won);
    setEditIsLost(s.is_lost);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;
    updateStage.mutate({ id: editingId, name: editName.trim(), color: editColor, icon: editIcon, is_won: editIsWon, is_lost: editIsLost });
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createStage.mutate(
      {
        name: newName.trim(),
        color: newColor,
        icon: newIcon,
        position: stages.length,
        ...(activePipelineId ? { pipeline_id: activePipelineId } : {}),
      },
      {
        onSuccess: () => {
          setNewName('');
          setNewColor('#6B7280');
          setNewIcon(null);
          setShowCreateForm(false);
        },
      },
    );
  };

  const reorder = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const from = stages.findIndex((stage) => stage.id === draggedId);
    const to = stages.findIndex((stage) => stage.id === targetId);
    if (from < 0 || to < 0) return;
    const ordered = [...stages];
    const [item] = ordered.splice(from, 1);
    ordered.splice(to, 0, item);
    reorderStages.mutate(ordered.map((stage) => stage.id));
    setDraggedId(null);
    setDragOverId(null);
  };

  const moveStage = (id: string, offset: number) => {
    const currentIndex = stages.findIndex((stage) => stage.id === id);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= stages.length) return;
    const ordered = [...stages];
    const [item] = ordered.splice(currentIndex, 1);
    ordered.splice(targetIndex, 0, item);
    reorderStages.mutate(ordered.map((stage) => stage.id));
  };

  const content = (
    <>
      {embedded && !compact ? (
        <div className="px-6 pb-1">
          <h2 className="text-xl font-semibold">
            {activePipelineName ? `Estágios de ${activePipelineName}` : 'Estágios do CRM/Kanban'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Crie, ordene e personalize as colunas deste funil.</p>
        </div>
      ) : !embedded ? (
        <CardHeader>
          <CardTitle className="text-base">Estágios do CRM/Kanban</CardTitle>
          <p className="text-sm text-muted-foreground">
            Gerencie os estágios {activePipelineName ? `do funil ${activePipelineName}` : 'dos funis administrativos'}
          </p>
          {!pipelineId && pipelines.length > 0 && (
            <Select value={activePipelineId ?? undefined} onValueChange={setSettingsPipelineId}>
              <SelectTrigger className="mt-3 w-full sm:w-[280px]" aria-label="Funil dos estágios">
                <SelectValue placeholder="Selecione o funil" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: pipeline.color }} />
                      {pipeline.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
      ) : null}
      <CardContent className={cn('space-y-4', compact && 'p-0')}>
        {!showCreateForm ? (
          <Button variant="outline" className="gap-2" onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4" /> Novo estágio
          </Button>
        ) : (
          <div className="space-y-3 rounded-xl bg-muted/35 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="admin-new-stage">Novo estágio</Label>
              <Button variant="ghost" size="icon" aria-label="Fechar novo estágio" onClick={() => setShowCreateForm(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid items-center gap-2 sm:grid-cols-[minmax(150px,1fr)_100px_auto_auto]">
              <Input
                id="admin-new-stage"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome do estágio"
                className="h-9 min-w-[150px] flex-1"
              />
              <StageIconSelect value={newIcon} onChange={setNewIcon} />
              <ColorPicker value={newColor} onChange={setNewColor} />
              <Button size="sm" className="h-9" onClick={handleCreate} disabled={!newName.trim()}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar estágio
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Arraste os estágios para definir a ordem das colunas.</p>
          {stages.map((s) => (
            <div
              key={s.id}
              draggable={editingId !== s.id}
              onDragStart={() => setDraggedId(s.id)}
              onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
              onDragOver={(event) => { event.preventDefault(); setDragOverId(s.id); }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(event) => { event.preventDefault(); reorder(s.id); }}
              className={cn(
                'flex flex-wrap items-center gap-2 rounded-xl bg-muted/20 p-3 transition-all hover:bg-muted/30',
                draggedId === s.id && 'opacity-50',
                dragOverId === s.id && draggedId !== s.id && 'ring-2 ring-primary bg-primary/5',
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
              <div className="flex shrink-0 flex-col md:hidden">
                <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${s.name} para cima`} disabled={stages[0]?.id === s.id} onClick={() => moveStage(s.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${s.name} para baixo`} disabled={stages[stages.length - 1]?.id === s.id} onClick={() => moveStage(s.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></button>
              </div>
              {editingId === s.id ? (
                <>
                  <div className="flex min-w-[220px] flex-1 flex-wrap items-center gap-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 h-8 min-w-[120px]" />
                    <StageIconSelect value={editIcon} onChange={setEditIcon} />
                    <ColorPicker value={editColor} onChange={setEditColor} />
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Switch id="edit-won" checked={editIsWon} onCheckedChange={(v) => { setEditIsWon(v); if (v) setEditIsLost(false); }} />
                        <Label htmlFor="edit-won" className="text-xs">Ganho</Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Switch id="edit-lost" checked={editIsLost} onCheckedChange={(v) => { setEditIsLost(v); if (v) setEditIsWon(false); }} />
                        <Label htmlFor="edit-lost" className="text-xs">Perdido</Label>
                      </div>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={saveEdit}><Check className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                </>
              ) : (
                <>
                  <div className="h-6 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {s.icon && <IconPreview name={s.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="flex-1 text-sm font-medium truncate">{s.name}</span>
                  {s.is_won && <Badge variant="success" className="text-[10px]"><Trophy className="h-3 w-3 mr-1" />Ganho</Badge>}
                  {s.is_lost && <Badge variant="destructive" className="text-[10px]"><Ban className="h-3 w-3 mr-1" />Perdido</Badge>}
                  <RowActionsMenu
                    triggerClassName="h-7 w-7"
                    actions={[
                      { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => startEdit(s) },
                      { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setDeleteId(s.id) },
                    ]}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </>
  );

  return (
    <>
      {embedded ? <div className="-mx-1 space-y-4">{content}</div> : <Card>{content}</Card>}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este estágio?</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão só será permitida quando não houver oportunidades vinculadas a ele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) deleteStage.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
