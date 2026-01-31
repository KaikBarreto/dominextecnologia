import { useState, useRef } from 'react';
import { Plus, GripVertical, Pencil, Trash2, Check, X, Trophy, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useCrmStages, STAGE_COLORS, type CrmStage } from '@/hooks/useCrmStages';
import { cn } from '@/lib/utils';

interface StageManagerDialogProps {
  children: React.ReactNode;
}

export function StageManagerDialog({ children }: StageManagerDialogProps) {
  const { stages, createStage, updateStage, deleteStage, reorderStages, getStageColorClass } = useCrmStages();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newStage, setNewStage] = useState({ name: '', color: 'muted', is_won: false, is_lost: false });
  
  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleCreateStage = () => {
    if (!newStage.name.trim()) return;
    createStage.mutate(newStage, {
      onSuccess: () => setNewStage({ name: '', color: 'muted', is_won: false, is_lost: false }),
    });
  };

  const handleUpdateStage = (stage: CrmStage, updates: Partial<CrmStage>) => {
    updateStage.mutate({ id: stage.id, ...updates });
  };

  const handleDeleteStage = () => {
    if (deleteId) {
      deleteStage.mutate(deleteId, {
        onSuccess: () => setDeleteId(null),
      });
    }
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, stageId: string) => {
    setDraggedId(stageId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', stageId);
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '0.5';
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== stageId) {
      setDragOverId(stageId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const draggedIndex = stages.findIndex(s => s.id === draggedId);
    const targetIndex = stages.findIndex(s => s.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Create new order
    const newOrder = [...stages];
    const [removed] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, removed);

    // Update positions
    reorderStages.mutate(newOrder.map(s => s.id));

    setDraggedId(null);
    setDragOverId(null);
  };

  const EditableRow = ({ stage }: { stage: CrmStage }) => {
    const [name, setName] = useState(stage.name);
    const [color, setColor] = useState(stage.color);
    const [isWon, setIsWon] = useState(stage.is_won);
    const [isLost, setIsLost] = useState(stage.is_lost);

    const isEditing = editingId === stage.id;
    const isDragging = draggedId === stage.id;
    const isDragOver = dragOverId === stage.id;

    const handleSave = () => {
      handleUpdateStage(stage, { name, color, is_won: isWon, is_lost: isLost });
      setEditingId(null);
    };

    const handleCancel = () => {
      setName(stage.name);
      setColor(stage.color);
      setIsWon(stage.is_won);
      setIsLost(stage.is_lost);
      setEditingId(null);
    };

    if (isEditing) {
      return (
        <div className="flex flex-col gap-3 p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do estágio"
              className="flex-1"
              autoFocus
            />
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_COLORS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-3 h-3 rounded-full', c.class.split(' ')[0])} />
                      {c.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id={`won-${stage.id}`}
                  checked={isWon}
                  onCheckedChange={(checked) => {
                    setIsWon(checked);
                    if (checked) setIsLost(false);
                  }}
                />
                <Label htmlFor={`won-${stage.id}`} className="text-xs flex items-center gap-1">
                  <Trophy className="h-3 w-3 text-success" />
                  Ganho
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={`lost-${stage.id}`}
                  checked={isLost}
                  onCheckedChange={(checked) => {
                    setIsLost(checked);
                    if (checked) setIsWon(false);
                  }}
                />
                <Label htmlFor={`lost-${stage.id}`} className="text-xs flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-destructive" />
                  Perdido
                </Label>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSave}>
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
          "flex items-center gap-2 p-2 rounded-lg border bg-card transition-all group",
          isDragging && "opacity-50",
          isDragOver && "border-primary border-2 bg-primary/5",
          !isDragging && !isDragOver && "hover:bg-muted/30"
        )}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
        <Badge className={cn(getStageColorClass(stage.color), 'font-medium')}>
          {stage.name}
        </Badge>
        <div className="flex-1 flex items-center gap-2">
          {stage.is_won && (
            <Trophy className="h-3.5 w-3.5 text-success" />
          )}
          {stage.is_lost && (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setEditingId(stage.id)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => setDeleteId(stage.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Estágios do Pipeline</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* New Stage Form */}
            <div className="space-y-3 p-3 rounded-lg border-2 border-dashed border-muted">
              <Label className="text-sm font-medium">Novo Estágio</Label>
              <div className="flex gap-2">
                <Input
                  value={newStage.name}
                  onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
                  placeholder="Nome do estágio"
                  className="flex-1"
                />
                <Select
                  value={newStage.color}
                  onValueChange={(color) => setNewStage({ ...newStage, color })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_COLORS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div className={cn('w-3 h-3 rounded-full', c.class.split(' ')[0])} />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleCreateStage}
                  disabled={!newStage.name.trim() || createStage.isPending}
                  size="icon"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Stages List with Drag & Drop */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-2">
                Arraste para reordenar os estágios
              </p>
              {stages.map((stage) => (
                <EditableRow key={stage.id} stage={stage} />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover estágio?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Leads neste estágio ficarão sem estágio atribuído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStage}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
