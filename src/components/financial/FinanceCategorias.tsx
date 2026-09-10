import { useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Settings as SettingsIcon, Lock, GripVertical, ChevronUp, ChevronDown, Tag } from 'lucide-react';
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
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

type CategoryGroup = 'receitas' | 'despesas';

// Grupos do DRE, na ordem em que aparecem na demonstração de resultado.
// `dre_group` é `text` livre no banco (sem enum/check) — qualquer valor
// fora dos 3 conhecidos (ou NULL) cai no bucket final "outros".
type DreGroupKey = 'impostos' | 'cmv' | 'opex' | 'outros';
const DRE_GROUP_ORDER: DreGroupKey[] = ['impostos', 'cmv', 'opex', 'outros'];

function getDreGroupKey(cat: FinancialCategory): DreGroupKey {
  return cat.dre_group === 'impostos' || cat.dre_group === 'cmv' || cat.dre_group === 'opex'
    ? cat.dre_group
    : 'outros';
}

interface DespesaGroup {
  key: DreGroupKey;
  label: string;
  items: FinancialCategory[];
}

export function FinanceCategorias() {
  const { categories, isLoading, createCategory, updateCategory, deleteCategory, reorderCategories } = useFinancialCategories();
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialCategory | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [defaultType, setDefaultType] = useState<string>('entrada');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Grupo (chave DRE, ou 'flat' quando a lista não está agrupada) de onde o
  // drag começou/está passando por cima — usado só pra travar drop cross-grupo.
  const [dragGroupKey, setDragGroupKey] = useState<string | null>(null);
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null);
  const [mobileGroup, setMobileGroup] = useState<CategoryGroup>('receitas');

  const receitas = categories.filter((c) => c.type === 'entrada' || c.type === 'ambos');
  const despesas = categories.filter((c) => c.type === 'saida' || c.type === 'ambos');

  // Despesas agrupadas por dre_group, na ordem do DRE. Só grupos com pelo
  // menos 1 item entram — evita divisória fantasma de grupo vazio.
  const despesaGroups: DespesaGroup[] = (() => {
    const buckets: Record<DreGroupKey, FinancialCategory[]> = { impostos: [], cmv: [], opex: [], outros: [] };
    despesas.forEach((cat) => buckets[getDreGroupKey(cat)].push(cat));
    const labels: Record<DreGroupKey, string> = {
      impostos: fin.categoryForm.dreGroups.impostos,
      cmv: fin.categoryForm.dreGroups.cmv,
      opex: fin.categoryForm.dreGroups.opex,
      outros: fin.categoryForm.dreGroups.outros,
    };
    return DRE_GROUP_ORDER
      .map((key) => ({ key, label: labels[key], items: buckets[key] }))
      .filter((g) => g.items.length > 0);
  })();

  // Requisito 3: só desenha divisória quando há 2+ grupos com item. Empresa
  // que nunca classificou (quase tudo em 'opex') continua vendo lista plana.
  const shouldGroupDespesas = despesaGroups.length >= 2;

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
      toast({ title: fin.categories.systemEditWarning });
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
      toast({ title: fin.categories.systemDeleteWarning });
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

  const handleDragStart = useCallback((idx: number, groupKey: string) => {
    setDragIdx(idx);
    setDragGroupKey(groupKey);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number, groupKey: string) => {
    e.preventDefault();
    setDragOverIdx(idx);
    setDragOverGroupKey(groupKey);
  }, []);

  /**
   * `fullList` é a fonte da verdade do sort_order (todas as despesas, ou
   * todas as receitas — nunca só o grupo). `groupItems` é o subconjunto
   * visualmente arrastado (um grupo do DRE, ou a lista inteira quando não
   * está agrupada, quando `groupItems === fullList`).
   *
   * Exemplo: fullList = [A(impostos), B(cmv), C(cmv), D(cmv), E(opex)],
   * grupo cmv = [B, C, D] ocupando as posições globais 1,2,3. Arrastar D
   * (idx local 2) pra idx local 0 dá [D, B, C]; reinserido nas MESMAS
   * posições globais 1,2,3 → fullList vira [A, D, B, C, E]. Só então
   * renumeramos sort_order 0..4. A(0) e E(4) nunca se movem.
   */
  const handleDrop = useCallback((fullList: FinancialCategory[], groupItems: FinancialCategory[], idx: number, groupKey: string) => {
    const originIdx = dragIdx;
    const originGroup = dragGroupKey;
    setDragIdx(null);
    setDragOverIdx(null);
    setDragGroupKey(null);
    setDragOverGroupKey(null);
    // Bloqueia reordenar entre grupos diferentes: não reclassifica a categoria.
    if (originIdx === null || originGroup !== groupKey || originIdx === idx) return;

    const reorderedGroup = [...groupItems];
    const [moved] = reorderedGroup.splice(originIdx, 1);
    reorderedGroup.splice(idx, 0, moved);

    const groupIds = new Set(groupItems.map((c) => c.id));
    let cursor = 0;
    const fullReordered = fullList.map((cat) => (groupIds.has(cat.id) ? reorderedGroup[cursor++] : cat));

    const updates = fullReordered.map((c, i) => ({ id: c.id, sort_order: i }));
    reorderCategories.mutate(updates);
  }, [dragIdx, dragGroupKey, reorderCategories]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
    setDragGroupKey(null);
    setDragOverGroupKey(null);
  }, []);

  // Reorder via setas (mobile) — substitui drag-drop. Mesma regra: só reordena
  // dentro do grupo (groupItems), renumerando sempre o array completo (fullList).
  const moveCategory = useCallback((fullList: FinancialCategory[], groupItems: FinancialCategory[], idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= groupItems.length) return;

    const reorderedGroup = [...groupItems];
    const [moved] = reorderedGroup.splice(idx, 1);
    reorderedGroup.splice(targetIdx, 0, moved);

    const groupIds = new Set(groupItems.map((c) => c.id));
    let cursor = 0;
    const fullReordered = fullList.map((cat) => (groupIds.has(cat.id) ? reorderedGroup[cursor++] : cat));

    const updates = fullReordered.map((c, i) => ({ id: c.id, sort_order: i }));
    reorderCategories.mutate(updates);
  }, [reorderCategories]);

  // ─── DESKTOP: lista com drag-drop, escopado a um grupo ─────────────────────
  // `fullList` é a lista completa (todas despesas, ou todas receitas) usada
  // como fonte de verdade do sort_order. `groupItems` é o que é renderizado
  // aqui (um grupo do DRE, ou a lista inteira quando `groupKey === 'flat'`).
  const renderCategoryList = (fullList: FinancialCategory[], groupItems: FinancialCategory[], groupKey: string) => (
    <div className="space-y-1.5">
      {groupItems.map((cat, idx) => {
        const Icon = getCategoryIcon(cat.icon);
        const isSystem = cat.is_system;
        const isDragging = dragIdx === idx && dragGroupKey === groupKey;
        const isDragOver = dragOverIdx === idx && dragOverGroupKey === groupKey && dragGroupKey === groupKey;
        return (
          <div
            key={cat.id}
            draggable={!isSystem}
            onDragStart={() => handleDragStart(idx, groupKey)}
            onDragOver={(e) => handleDragOver(e, idx, groupKey)}
            onDrop={() => handleDrop(fullList, groupItems, idx, groupKey)}
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
                    <TooltipContent>{fin.categories.systemTooltip}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            {!isSystem && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <RowActionsMenu
                  actions={[
                    { label: fin.categories.actions.edit, icon: Pencil, variant: 'edit', onClick: () => handleEdit(cat) },
                    { label: fin.categories.actions.delete, icon: Trash2, variant: 'delete', onClick: () => setDeleteId(cat.id) },
                  ]}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // ─── MOBILE: item com MobileListItem + setas ↑↓ ────────────────────────────
  // `fullList` é a fonte de verdade do sort_order; `groupItems` é o grupo em
  // que o item está renderizado (um grupo do DRE, ou a lista inteira quando
  // não agrupada). Primeiro/último item do GRUPO não pode sair dele.
  const renderMobileItem = (cat: FinancialCategory, idx: number, groupItems: FinancialCategory[], fullList: FinancialCategory[]) => {
    const Icon = getCategoryIcon(cat.icon);
    const isSystem = cat.is_system;
    const isFirst = idx === 0;
    const isLast = idx === groupItems.length - 1;

    const actions: ItemAction[] = [];
    if (!isSystem && !isFirst) {
      actions.push({
        key: 'move-up',
        label: fin.categories.actions.moveUp,
        icon: <ChevronUp className="h-4 w-4" />,
        onClick: () => moveCategory(fullList, groupItems, idx, -1),
      });
    }
    if (!isSystem && !isLast) {
      actions.push({
        key: 'move-down',
        label: fin.categories.actions.moveDown,
        icon: <ChevronDown className="h-4 w-4" />,
        onClick: () => moveCategory(fullList, groupItems, idx, 1),
      });
    }
    actions.push({
      key: 'edit',
      label: fin.categories.actions.edit,
      icon: <Pencil className="h-4 w-4" />,
      variant: 'edit' as const,
      onClick: () => handleEdit(cat),
    });
    actions.push({
      key: 'delete',
      label: fin.categories.actions.delete,
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
              {fin.categories.system}
            </Badge>
          ) : undefined
        }
      />
    );
  };

  // Divisória discreta reutilizada no desktop e no mobile: nome do grupo do
  // DRE + contagem, sem card, sem travessão.
  const renderGroupDivider = (label: string, count: number) => (
    <div className="flex items-center gap-2 px-0.5 pb-1.5 pt-3 first:pt-0">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
        {label} <span className="normal-case font-normal text-muted-foreground/70">({count})</span>
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );

  // ─── MOBILE: lista completa, plana ou agrupada por DRE ─────────────────────
  const renderMobileList = (fullList: FinancialCategory[], groups: DespesaGroup[] | null) => {
    if (fullList.length === 0) {
      return (
        <EmptyState
          size="compact"
          icon={<Tag className="h-10 w-10" />}
          title={mobileGroup === 'receitas' ? fin.categories.empty.noRevenueMobile : fin.categories.empty.noExpenseMobile}
          description={fin.categories.empty.mobileDescription}
          action={{
            label: fin.categories.empty.newAction,
            onClick: () => handleNew(mobileGroup === 'receitas' ? 'entrada' : 'saida'),
          }}
        />
      );
    }

    if (!groups) {
      return (
        <div className="rounded-xl border bg-card overflow-hidden">
          {fullList.map((cat, idx) => renderMobileItem(cat, idx, fullList, fullList))}
        </div>
      );
    }

    return (
      <div>
        {groups.map((g) => (
          <div key={g.key}>
            {renderGroupDivider(g.label, g.items.length)}
            <div className="rounded-xl border bg-card overflow-hidden">
              {g.items.map((cat, idx) => renderMobileItem(cat, idx, g.items, fullList))}
            </div>
          </div>
        ))}
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
            <h2 className="text-base font-semibold leading-tight">{fin.categories.header.title}</h2>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {fin.categories.header.subtitle}
            </p>
          </div>
        </div>

        <MobilePillTabs
          tabs={[
            { value: 'receitas', label: `${fin.categories.tabs.revenue} (${receitas.length})`, icon: <TrendingUp className="h-3.5 w-3.5" /> },
            { value: 'despesas', label: `${fin.categories.tabs.expense} (${despesas.length})`, icon: <TrendingDown className="h-3.5 w-3.5" /> },
          ]}
          activeTab={mobileGroup}
          onTabChange={(v) => setMobileGroup(v as CategoryGroup)}
        />

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : (
          renderMobileList(activeItems, mobileGroup === 'despesas' && shouldGroupDespesas ? despesaGroups : null)
        )}

        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={fin.categories.fabLabel}
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
              <AlertDialogTitle>{fin.categories.deleteDialog.title}</AlertDialogTitle>
              <AlertDialogDescription>{fin.categories.deleteDialog.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{fin.categories.deleteDialog.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {fin.categories.deleteDialog.confirm}
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
                  <h3 className="font-bold">{fin.categories.sections.revenueTitle}</h3>
                  <p className="text-xs text-muted-foreground">{receitas.length} {fin.categories.sections.countSuffix} · {fin.categories.sections.reorderHint}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleNew('entrada')}>
                <Plus className="mr-1 h-4 w-4" />
                {fin.categories.sections.newButton}
              </Button>
            </div>
            {receitas.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<Tag className="h-10 w-10" />}
                title={fin.categories.empty.noRevenueTitle}
                description={fin.categories.empty.noRevenueDescription}
                action={{ label: fin.categories.actions.new, onClick: () => handleNew('entrada') }}
              />
            ) : renderCategoryList(receitas, receitas, 'flat')}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive">
                  <TrendingDown className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold">{fin.categories.sections.expenseTitle}</h3>
                  <p className="text-xs text-muted-foreground">{despesas.length} {fin.categories.sections.countSuffix} · {fin.categories.sections.reorderHint}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleNew('saida')}>
                <Plus className="mr-1 h-4 w-4" />
                {fin.categories.sections.newButton}
              </Button>
            </div>
            {despesas.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<Tag className="h-10 w-10" />}
                title={fin.categories.empty.noExpenseTitle}
                description={fin.categories.empty.noExpenseDescription}
                action={{ label: fin.categories.actions.new, onClick: () => handleNew('saida') }}
              />
            ) : shouldGroupDespesas ? (
              <div>
                {despesaGroups.map((g) => (
                  <div key={g.key}>
                    {renderGroupDivider(g.label, g.items.length)}
                    {renderCategoryList(despesas, g.items, g.key)}
                  </div>
                ))}
              </div>
            ) : renderCategoryList(despesas, despesas, 'flat')}
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
            <AlertDialogTitle>{fin.categories.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{fin.categories.deleteDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{fin.categories.deleteDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {fin.categories.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
