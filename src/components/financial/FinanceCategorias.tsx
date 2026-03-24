import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Settings as SettingsIcon, Lock, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFinancialCategories, type FinancialCategory } from '@/hooks/useFinancialCategories';
import { CategoryFormDialog } from './CategoryFormDialog';
import { getCategoryIcon } from './categoryIcons';
import { cn } from '@/lib/utils';

export function FinanceCategorias() {
  const { categories, isLoading, createCategory, updateCategory, deleteCategory, reorderCategories } = useFinancialCategories();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialCategory | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [defaultType, setDefaultType] = useState<string>('entrada');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const receitas = categories.filter((c) => c.type === 'entrada' || c.type === 'ambos');
  const despesas = categories.filter((c) => c.type === 'saida' || c.type === 'ambos');

  const handleSubmit = async (data: any) => {
    if (editing) {
      await updateCategory.mutateAsync({ ...data, id: editing.id });
    } else {
      await createCategory.mutateAsync(data);
    }
    setEditing(null);
    setFormOpen(false);
  };

  const handleEdit = (cat: FinancialCategory) => {
    if (cat.is_system) return;
    setEditing(cat);
    setFormOpen(true);
  };

  const handleNew = (type: string) => {
    setEditing(null);
    setDefaultType(type);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteCategory.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  }, []);

  const handleDrop = useCallback((items: FinancialCategory[], idx: number) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setDragOverIdx(null);
      return;
    }
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    const updates = reordered.map((c, i) => ({ id: c.id, sort_order: i }));
    reorderCategories.mutate(updates);
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, reorderCategories]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

  const renderCategoryList = (items: FinancialCategory[]) => (
    <div className="space-y-1.5">
      {items.map((cat, idx) => {
        const Icon = getCategoryIcon(cat.icon);
        const isSystem = cat.is_system;
        const isDragging = dragIdx === idx;
        const isDragOver = dragOverIdx === idx;
        return (
          <div
            key={cat.id}
            draggable={!isSystem}
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={() => handleDrop(items, idx)}
            onDragEnd={handleDragEnd}
            className={cn(
              'group flex items-center justify-between rounded-xl border border-border px-4 py-3 transition-all duration-200',
              'hover:shadow-md hover:border-primary/20 hover:bg-accent/30',
              isDragging && 'opacity-40 scale-95',
              isDragOver && 'border-primary border-dashed bg-primary/5',
              !isSystem && 'cursor-grab active:cursor-grabbing',
            )}
          >
            <div className="flex items-center gap-3">
              {!isSystem && (
                <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
              )}
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 shadow-sm"
                style={{ backgroundColor: cat.color }}
              >
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{cat.name}</span>
                {isSystem && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>Categoria do sistema</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            {!isSystem && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleEdit(cat)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(cat.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
          <SettingsIcon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Configurações do Financeiro</h2>
          <p className="text-sm text-muted-foreground">Gerencie categorias de receita e despesa do módulo financeiro</p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold">Categorias de Receita</h3>
                  <p className="text-xs text-muted-foreground">{receitas.length} categorias · arraste para reordenar</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleNew('entrada')}>
                <Plus className="mr-1 h-4 w-4" />
                Nova
              </Button>
            </div>
            {receitas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma categoria de receita</p>
            ) : renderCategoryList(receitas)}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive">
                  <TrendingDown className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold">Categorias de Despesa</h3>
                  <p className="text-xs text-muted-foreground">{despesas.length} categorias · arraste para reordenar</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleNew('saida')}>
                <Plus className="mr-1 h-4 w-4" />
                Nova
              </Button>
            </div>
            {despesas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma categoria de despesa</p>
            ) : renderCategoryList(despesas)}
          </div>
        </div>
      )}

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
        onSubmit={handleSubmit}
        isLoading={createCategory.isPending || updateCategory.isPending}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Transações com esta categoria não serão afetadas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
