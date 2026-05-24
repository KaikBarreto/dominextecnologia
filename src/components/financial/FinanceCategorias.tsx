import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Settings as SettingsIcon, Lock, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFinancialCategories, type FinancialCategory } from '@/hooks/useFinancialCategories';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { CategoryFormDialog } from './CategoryFormDialog';
import { getCategoryIcon } from './categoryIcons';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';

type CategoryGroup = 'receitas' | 'despesas';

export function FinanceCategorias() {
  const { categories, isLoading, createCategory, updateCategory, deleteCategory, reorderCategories } = useFinancialCategories();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialCategory | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [defaultType, setDefaultType] = useState<string>('entrada');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [mobileGroup, setMobileGroup] = useState<CategoryGroup>('receitas');

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
    if (cat.is_system) {
      toast({ title: 'Categoria do sistema não pode ser editada' });
      return;
    }
    setEditing(cat);
    setFormOpen(true);
  };

  const handleNew = (type: string) => {
    setEditing(null);
    setDefaultType(type);
    setFormOpen(true);
  };

  const handleAskDelete = (cat: FinancialCategory) => {
    if (cat.is_system) {
      toast({ title: 'Categoria do sistema não pode ser excluída' });
      return;
    }
    setDeleteId(cat.id);
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

  // Reorder via setas (mobile) — substitui drag-drop.
  const moveCategory = useCallback((items: FinancialCategory[], idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const reordered = [...items];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIdx, 0, moved);
    const updates = reordered.map((c, i) => ({ id: c.id, sort_order: i }));
    reorderCategories.mutate(updates);
  }, [reorderCategories]);

  // ─── DESKTOP: lista com drag-drop (mantida intacta) ───────────────────────
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
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <RowActionsMenu
                  actions={[
                    { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => handleEdit(cat) },
                    { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setDeleteId(cat.id) },
                  ]}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ─── MOBILE: lista com MobileListItem + setas ↑↓ ───────────────────────────
  const renderMobileList = (items: FinancialCategory[]) => {
    if (items.length === 0) {
      return (
        <EmptyState
          icon={<SettingsIcon className="h-10 w-10" />}
          title={mobileGroup === 'receitas' ? 'Nenhuma categoria de receita' : 'Nenhuma categoria de despesa'}
          description='Toque em "+" para criar a primeira'
        />
      );
    }
    return (
      <div className="rounded-xl border bg-card overflow-hidden">
        {items.map((cat, idx) => {
          const Icon = getCategoryIcon(cat.icon);
          const isSystem = cat.is_system;
          const isFirst = idx === 0;
          const isLast = idx === items.length - 1;

          const actions: ItemAction[] = [];
          if (!isSystem && !isFirst) {
            actions.push({
              key: 'move-up',
              label: 'Mover para cima',
              icon: <ChevronUp className="h-4 w-4" />,
              onClick: () => moveCategory(items, idx, -1),
            });
          }
          if (!isSystem && !isLast) {
            actions.push({
              key: 'move-down',
              label: 'Mover para baixo',
              icon: <ChevronDown className="h-4 w-4" />,
              onClick: () => moveCategory(items, idx, 1),
            });
          }
          actions.push({
            key: 'edit',
            label: 'Editar',
            icon: <Pencil className="h-4 w-4" />,
            variant: 'edit' as const,
            onClick: () => handleEdit(cat),
          });
          actions.push({
            key: 'delete',
            label: 'Excluir',
            icon: <Trash2 className="h-4 w-4" />,
            variant: 'destructive' as const,
            onClick: () => handleAskDelete(cat),
          });

          return (
            <MobileListItem
              key={cat.id}
              actions={actions}
              leading={
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: cat.color }}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
              }
              title={cat.name}
              subtitle={
                isSystem ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                    <Lock className="h-2.5 w-2.5" />
                    Sistema
                  </Badge>
                ) : undefined
              }
            />
          );
        })}
      </div>
    );
  };

  // ─── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    const activeItems = mobileGroup === 'receitas' ? receitas : despesas;
    const defaultTypeForNew = mobileGroup === 'receitas' ? 'entrada' : 'saida';

    return (
      <div className="space-y-4 pb-24">
        <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary shrink-0">
            <SettingsIcon className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">Categorias</h2>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Receitas e despesas do financeiro
            </p>
          </div>
        </div>

        <MobilePillTabs
          tabs={[
            { value: 'receitas', label: `Receitas (${receitas.length})`, icon: <TrendingUp className="h-3.5 w-3.5" /> },
            { value: 'despesas', label: `Despesas (${despesas.length})`, icon: <TrendingDown className="h-3.5 w-3.5" /> },
          ]}
          activeTab={mobileGroup}
          onTabChange={(v) => setMobileGroup(v as CategoryGroup)}
        />

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : (
          renderMobileList(activeItems)
        )}

        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Categoria"
          onClick={() => handleNew(defaultTypeForNew)}
        />

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

  // ─── DESKTOP LAYOUT ────────────────────────────────────────────────────────
  // Header próprio removido em v1.9.22 polish: hoje o componente só vive
  // dentro de modal (FinanceBanks "Gerenciar Categorias"), que já tem seu
  // próprio title — header interno era duplicado visualmente.
  return (
    <div className="space-y-5">
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
