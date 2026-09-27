import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, GripVertical, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { useAdminCrmPipelines, type AdminCrmPipeline } from '@/hooks/useAdminCrm';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
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
import { AdminStageManagerDialog } from '@/components/admin/AdminStageManagerDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (pipelineId: string) => void;
  embedded?: boolean;
  initialExpandedPipelineId?: string | null;
}

export function AdminPipelineManagerDialog({ open, onOpenChange, onCreated, embedded = false, initialExpandedPipelineId }: Props) {
  const {
    pipelines,
    createPipeline,
    updatePipeline,
    setDefaultPipeline,
    reorderPipelines,
    deletePipeline,
  } = useAdminCrmPipelines();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#2563EB');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedPipelineId, setExpandedPipelineId] = useState<string | null>(initialExpandedPipelineId ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('#2563EB');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (initialExpandedPipelineId) setExpandedPipelineId(initialExpandedPipelineId);
  }, [initialExpandedPipelineId]);

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    createPipeline.mutate({ name, color: newColor }, {
      onSuccess: (pipeline) => {
        setNewName('');
        setNewColor('#2563EB');
        setShowCreateForm(false);
        setExpandedPipelineId(pipeline.id);
        onCreated?.(pipeline.id);
      },
    });
  };

  const reorder = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const from = pipelines.findIndex((pipeline) => pipeline.id === draggedId);
    const to = pipelines.findIndex((pipeline) => pipeline.id === targetId);
    if (from < 0 || to < 0) return;
    const ordered = [...pipelines];
    const [item] = ordered.splice(from, 1);
    ordered.splice(to, 0, item);
    reorderPipelines.mutate(ordered.map((pipeline) => pipeline.id));
    setDraggedId(null);
    setDragOverId(null);
  };

  const movePipeline = (id: string, offset: number) => {
    const currentIndex = pipelines.findIndex((pipeline) => pipeline.id === id);
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= pipelines.length) return;
    const ordered = [...pipelines];
    const [item] = ordered.splice(currentIndex, 1);
    ordered.splice(targetIndex, 0, item);
    reorderPipelines.mutate(ordered.map((pipeline) => pipeline.id));
  };

  const startEditing = (pipeline: AdminCrmPipeline) => {
    setEditingId(pipeline.id);
    setEditingName(pipeline.name);
    setEditingColor(pipeline.color ?? '#2563EB');
  };

  const content = (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Funis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie funis independentes e use cores para reconhecer cada processo rapidamente.
        </p>
      </div>

      {!showCreateForm ? (
        <Button variant="outline" className="gap-2" onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4" /> Novo funil
        </Button>
      ) : <div className="space-y-2 rounded-xl bg-muted/35 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="admin-new-pipeline">Novo funil</Label>
          <Button variant="ghost" size="icon" aria-label="Fechar novo funil" onClick={() => setShowCreateForm(false)}><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="admin-new-pipeline"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                create();
              }
            }}
            placeholder="Ex.: Parcerias, Onboarding, Renovação"
            className="min-w-[180px] flex-1"
          />
          <input
            aria-label="Cor do novo funil"
            type="color"
            value={newColor}
            onChange={(event) => setNewColor(event.target.value)}
            className="h-10 w-12 cursor-pointer rounded-lg border bg-transparent p-1"
          />
          <Button onClick={create} disabled={!newName.trim() || createPipeline.isPending}>
            <Plus className="mr-2 h-4 w-4" /> Criar
          </Button>
        </div>
      </div>}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Arraste para ordenar. O funil padrão é aberto primeiro.</p>
        {pipelines.map((pipeline) => (
          <div key={pipeline.id} className={cn('rounded-xl bg-muted/20', dragOverId === pipeline.id && draggedId !== pipeline.id && 'ring-2 ring-primary bg-primary/5')}>
          <div
            draggable={editingId !== pipeline.id}
            onDragStart={() => setDraggedId(pipeline.id)}
            onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
            onDragOver={(event) => { event.preventDefault(); setDragOverId(pipeline.id); }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(event) => { event.preventDefault(); reorder(pipeline.id); }}
            className={cn(
              'flex flex-wrap items-center gap-2 p-3 transition-all hover:bg-muted/30',
              draggedId === pipeline.id && 'opacity-50',
            )}
          >
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
            <div className="flex shrink-0 flex-col md:hidden">
              <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${pipeline.name} para cima`} disabled={pipelines[0]?.id === pipeline.id} onClick={() => movePipeline(pipeline.id, -1)}><ChevronUp className="h-3.5 w-3.5" /></button>
              <button type="button" className="p-0.5 disabled:opacity-30" aria-label={`Mover ${pipeline.name} para baixo`} disabled={pipelines[pipelines.length - 1]?.id === pipeline.id} onClick={() => movePipeline(pipeline.id, 1)}><ChevronDown className="h-3.5 w-3.5" /></button>
            </div>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
              aria-expanded={expandedPipelineId === pipeline.id}
              aria-label={expandedPipelineId === pipeline.id ? `Recolher ${pipeline.name}` : `Expandir ${pipeline.name}`}
              onClick={() => setExpandedPipelineId((current) => current === pipeline.id ? null : pipeline.id)}
            >
              {expandedPipelineId === pipeline.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {editingId === pipeline.id ? (
              <>
                <Input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  className="h-8 min-w-[150px] flex-1"
                  autoFocus
                />
                <input
                  aria-label="Cor do funil"
                  type="color"
                  value={editingColor}
                  onChange={(event) => setEditingColor(event.target.value)}
                  className="h-8 w-11 cursor-pointer rounded border bg-transparent p-1"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    const name = editingName.trim();
                    if (name) updatePipeline.mutate({ id: pipeline.id, name, color: editingColor });
                    setEditingId(null);
                  }}
                  aria-label="Salvar funil"
                >
                  <Check className="h-4 w-4 text-success" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancelar edição">
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{pipeline.name}</span>
                  <span
                    className="mt-1 block h-1 w-16 rounded-full"
                    style={{ backgroundColor: pipeline.color ?? '#2563EB' }}
                  />
                </div>
                {pipeline.is_default && (
                  <Badge className="gap-1 border-0 bg-primary text-primary-foreground">
                    <Star className="h-3 w-3" /> Padrão
                  </Badge>
                )}
                <RowActionsMenu
                  actions={[
                    { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => startEditing(pipeline) },
                    {
                      label: 'Definir como padrão',
                      icon: Star,
                      hidden: pipeline.is_default,
                      onClick: () => setDefaultPipeline.mutate(pipeline.id),
                    },
                    { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setDeleteId(pipeline.id) },
                  ]}
                />
              </>
            )}
          </div>
          {expandedPipelineId === pipeline.id && (
            <div className="px-3 pb-4 pt-1 sm:pl-12">
              <AdminStageManagerDialog
                open={false}
                onOpenChange={() => undefined}
                pipelineId={pipeline.id}
                pipelineName={pipeline.name}
                embedded
                compact
              />
            </div>
          )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {embedded ? content : (
        <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Gerenciar funis">
          {content}
        </ResponsiveModal>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(next) => !next && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este funil?</AlertDialogTitle>
            <AlertDialogDescription>
              A exclusão só será permitida se o funil não tiver etapas nem oportunidades vinculadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) deletePipeline.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
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
