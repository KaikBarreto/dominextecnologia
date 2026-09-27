import { useState } from 'react';
import { Check, GripVertical, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (pipelineId: string) => void;
}

export function AdminPipelineManagerDialog({ open, onOpenChange, onCreated }: Props) {
  const {
    pipelines,
    createPipeline,
    updatePipeline,
    setDefaultPipeline,
    reorderPipelines,
    deletePipeline,
  } = useAdminCrmPipelines();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    createPipeline.mutate({ name }, {
      onSuccess: (pipeline) => {
        setNewName('');
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

  const startEditing = (pipeline: AdminCrmPipeline) => {
    setEditingId(pipeline.id);
    setEditingName(pipeline.name);
  };

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Gerenciar funis">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Crie funis independentes para organizar processos diferentes no CRM Admin.
          </p>

          <div className="space-y-2 rounded-lg border-2 border-dashed p-3">
            <Label htmlFor="admin-new-pipeline">Novo funil</Label>
            <div className="flex gap-2">
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
              />
              <Button onClick={create} disabled={!newName.trim() || createPipeline.isPending}>
                <Plus className="mr-2 h-4 w-4" /> Criar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {pipelines.map((pipeline) => (
              <div
                key={pipeline.id}
                draggable={editingId !== pipeline.id}
                onDragStart={() => setDraggedId(pipeline.id)}
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                onDragOver={(event) => { event.preventDefault(); setDragOverId(pipeline.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(event) => { event.preventDefault(); reorder(pipeline.id); }}
                className={cn(
                  'flex items-center gap-2 rounded-lg border bg-card p-2 transition-all',
                  draggedId === pipeline.id && 'opacity-50',
                  dragOverId === pipeline.id && draggedId !== pipeline.id && 'border-primary bg-primary/5',
                )}
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                {editingId === pipeline.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      className="h-8 flex-1"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        const name = editingName.trim();
                        if (name) updatePipeline.mutate({ id: pipeline.id, name });
                        setEditingId(null);
                      }}
                      aria-label="Salvar nome do funil"
                    >
                      <Check className="h-4 w-4 text-success" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancelar edição">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{pipeline.name}</span>
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
            ))}
          </div>
        </div>
      </ResponsiveModal>

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
