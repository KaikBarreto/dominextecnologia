import { useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, Check, X, Star } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useCrmPipelines, type CrmPipeline } from '@/hooks/useCrmPipelines';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface PipelineManagerDialogProps {
  children: React.ReactNode;
}

/**
 * CRUD de funis do CRM (Onda D — multi-pipeline). Diálogo IRMÃO do
 * StageManagerDialog, não uma aba dentro dele: funil é um nível acima de
 * etapa (funil CONTÉM etapas), e o StageManagerDialog já passou a operar
 * "dentro" de um funil selecionado — misturar os dois CRUDs no mesmo diálogo
 * obrigaria a navegar entre dois contextos diferentes na mesma tela. Dois
 * botões lado a lado ("Gerenciar Estágios" / "Gerenciar Funis") deixam claro
 * que são coisas diferentes, do jeito que Kommo/RD Station também separam.
 */
export function PipelineManagerDialog({ children }: PipelineManagerDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;
  const { pipelines, createPipeline, updatePipeline, setDefaultPipeline, deletePipeline, reorderPipelines } =
    useCrmPipelines();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createPipeline.mutate(
      { name: newName.trim() },
      { onSuccess: () => setNewName('') },
    );
  };

  const handleDelete = () => {
    if (deleteId) {
      deletePipeline.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) setDragOverId(id);
  };
  const handleDragLeave = () => setDragOverId(null);
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const draggedIndex = pipelines.findIndex((p) => p.id === draggedId);
    const targetIndex = pipelines.findIndex((p) => p.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const newOrder = [...pipelines];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);
    reorderPipelines.mutate(newOrder.map((p) => p.id));
    setDraggedId(null);
    setDragOverId(null);
  };

  const Row = ({ pipeline }: { pipeline: CrmPipeline }) => {
    const [name, setName] = useState(pipeline.name);
    const isEditing = editingId === pipeline.id;
    const isDragging = draggedId === pipeline.id;
    const isDragOver = dragOverId === pipeline.id;

    if (isEditing) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.pipelines.namePlaceholder}
            className="flex-1"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setName(pipeline.name);
              setEditingId(null);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!name.trim()}
            onClick={() => {
              updatePipeline.mutate({ id: pipeline.id, name: name.trim() });
              setEditingId(null);
            }}
          >
            <Check className="h-4 w-4 text-success" />
          </Button>
        </div>
      );
    }

    return (
      <div
        draggable
        onDragStart={(e) => handleDragStart(e, pipeline.id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, pipeline.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, pipeline.id)}
        className={cn(
          'flex items-center gap-2 p-2 rounded-lg border bg-card transition-all group',
          isDragging && 'opacity-50',
          isDragOver && 'border-primary border-2 bg-primary/5',
          !isDragging && !isDragOver && 'hover:bg-muted/30',
        )}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
        <span className="flex-1 font-medium text-sm truncate">{pipeline.name}</span>
        {pipeline.is_default ? (
          <Badge className="bg-primary text-white gap-1">
            <Star className="h-3 w-3" />
            {t.pipelines.defaultBadge}
          </Badge>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={setDefaultPipeline.isPending}
            onClick={() => setDefaultPipeline.mutate(pipeline.id)}
          >
            {t.pipelines.setDefaultAction}
          </Button>
        )}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <RowActionsMenu
            actions={[
              {
                label: t.pipelines.editLabel,
                icon: Pencil,
                variant: 'edit',
                onClick: () => setEditingId(pipeline.id),
              },
              {
                label: t.pipelines.deleteLabel,
                icon: Trash2,
                variant: 'delete',
                onClick: () => setDeleteId(pipeline.id),
              },
            ]}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <ResponsiveModal open={open} onOpenChange={setOpen} title={t.pipelines.title}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t.pipelines.subtitle}</p>

          <div className="flex gap-2 p-3 rounded-lg border-2 border-dashed border-muted">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.pipelines.namePlaceholder}
              className="flex-1"
            />
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || createPipeline.isPending}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            <p className="text-xs text-muted-foreground mb-2">{t.pipelines.dragHint}</p>
            {pipelines.map((pipeline) => (
              <Row key={pipeline.id} pipeline={pipeline} />
            ))}
          </div>
        </div>
      </ResponsiveModal>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.pipelines.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.pipelines.deleteDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.pipelines.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t.pipelines.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
