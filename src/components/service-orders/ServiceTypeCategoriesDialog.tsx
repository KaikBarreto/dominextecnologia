import { useState, useRef } from 'react';
import { Plus, GripVertical, Pencil, Trash2, Check, X, Tags } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useServiceTypeCategories, type ServiceTypeCategory } from '@/hooks/useServiceTypeCategories';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface ServiceTypeCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceTypeCategoriesDialog({ open, onOpenChange }: ServiceTypeCategoriesDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.serviceTypeCategories;

  const { categories, createCategory, updateCategory, deleteCategory, reorderCategories } = useServiceTypeCategories();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6B7280');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createCategory.mutate(
      { name: newName.trim(), color: newColor },
      { onSuccess: () => { setNewName(''); setNewColor('#6B7280'); } },
    );
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteCategory.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id) setDragOverId(id);
  };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const fromIdx = categories.findIndex((c) => c.id === draggedId);
    const toIdx = categories.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...categories];
    const [removed] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, removed);
    reorderCategories.mutate(newOrder.map((c) => c.id));
    setDraggedId(null);
    setDragOverId(null);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      className="sm:max-w-[480px]"
    >
      <div className="space-y-4">
        {/* Lista */}
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t.empty}</p>
        ) : (
          <div className="rounded-xl border divide-y overflow-hidden">
            {categories.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                isEditing={editingId === cat.id}
                isDragging={draggedId === cat.id}
                isDragOver={dragOverId === cat.id}
                onEdit={() => setEditingId(cat.id)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(name, color) => {
                  updateCategory.mutate(
                    { id: cat.id, name, color },
                    { onSuccess: () => setEditingId(null) },
                  );
                }}
                onDelete={() => setDeleteId(cat.id)}
                onDragStart={(e) => handleDragStart(e, cat.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, cat.id)}
                onDrop={(e) => handleDrop(e, cat.id)}
                dragNodeRef={dragNodeRef}
                editLabel={t.editLabel}
                deleteLabel={t.deleteLabel}
              />
            ))}
          </div>
        )}

        {/* Criar nova categoria */}
        <div className="border-t pt-4 space-y-2">
          <Label>{t.newCategory}</Label>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <Button
              type="button"
              size="icon"
              onClick={handleCreate}
              disabled={!newName.trim() || createCategory.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Confirm delete */}
        <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.deleteCancel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t.deleteConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ResponsiveModal>
  );
}

interface CategoryRowProps {
  category: ServiceTypeCategory;
  isEditing: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (name: string, color: string) => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  dragNodeRef: React.MutableRefObject<HTMLDivElement | null>;
  editLabel: string;
  deleteLabel: string;
}

function CategoryRow({
  category,
  isEditing,
  isDragging,
  isDragOver,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  editLabel,
  deleteLabel,
}: CategoryRowProps) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color ?? '#6B7280');

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 p-2 bg-muted/30">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 h-8"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit(name.trim(), color);
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
        <ColorPicker value={color} onChange={setColor} />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-success hover:text-success"
          onClick={() => onSaveEdit(name.trim(), color)}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelEdit}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 transition-colors select-none',
        isDragging && 'opacity-40',
        isDragOver && 'bg-primary/5',
      )}
    >
      <div className="cursor-grab text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </div>
      <div
        className="h-4 w-4 rounded-full shrink-0"
        style={{ backgroundColor: category.color ?? '#6B7280' }}
      />
      <span className="flex-1 text-sm truncate">{category.name}</span>
      <RowActionsMenu
        actions={[
          { label: editLabel, icon: Pencil, variant: 'edit', onClick: onEdit },
          { label: deleteLabel, icon: Trash2, variant: 'delete', onClick: onDelete },
        ]}
      />
    </div>
  );
}
