import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlertCircle,
  FileBarChart,
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDreGroups, type DreGroup, type DreGroupNature } from '@/hooks/useDreGroups';
import { getCategoryIcon } from './categoryIcons';
import { cn } from '@/lib/utils';
import {
  buildCategoryRows,
  canMoveCategoryToDreNature,
  categoryIdsForDreMove,
  type CategoryTreeRow,
  type DreConfigCategory,
} from './dre-config-dnd';
import { DreLayoutProfilesPanel } from '@/components/financial-report/DreLayoutProfilesPanel';

interface DreGroupsManagerProps {
  /** Categorias do tenant atual, com aparência e hierarquia usadas na prévia. */
  categories: readonly DreConfigCategory[];
  showHeading?: boolean;
}

interface DreGroupsManagerDialogProps extends Omit<DreGroupsManagerProps, 'showHeading'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  canManage?: boolean;
}

const NATURES: Array<{
  value: DreGroupNature;
  label: string;
  description: string;
}> = [
  {
    value: 'revenue',
    label: 'Receita',
    description: 'Soma na receita bruta antes das deduções.',
  },
  {
    value: 'deduction',
    label: 'Dedução da receita',
    description: 'Reduz a receita bruta, como impostos e devoluções.',
  },
  {
    value: 'cost',
    label: 'Custo',
    description: 'Reduz o lucro bruto por estar ligado à entrega ou produção.',
  },
  {
    value: 'operating_expense',
    label: 'Despesa operacional',
    description: 'Reduz o resultado operacional da empresa.',
  },
  {
    value: 'non_operating',
    label: 'Não operacional',
    description: 'Compõe o resultado depois das atividades operacionais.',
  },
  {
    value: 'excluded',
    label: 'Fora da DRE',
    description: 'Não entra nos cálculos nem nos totais da DRE.',
  },
];

const natureByValue = new Map(NATURES.map((nature) => [nature.value, nature]));
const natureOrder = new Map(NATURES.map((nature, index) => [nature.value, index]));

type ConfirmAction = {
  kind: 'deactivate' | 'delete';
  group: DreGroup;
};


export function DreGroupsManager({ categories, showHeading = true }: DreGroupsManagerProps) {
  const {
    dreGroups,
    isLoading,
    error,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    assignCategoriesToGroup,
  } = useDreGroups();

  const groups = useMemo(
    () => [...(dreGroups ?? [])].sort((a, b) =>
      (natureOrder.get(a.nature) ?? 999) - (natureOrder.get(b.nature) ?? 999)
      || a.sort_order - b.sort_order
      || a.name.localeCompare(b.name, 'pt-BR'),
    ),
    [dreGroups],
  );
  const usageByGroup = useMemo(() => {
    return categories.reduce<Map<string, number>>((counts, category) => {
      if (!category.dre_group_id) return counts;
      counts.set(category.dre_group_id, (counts.get(category.dre_group_id) ?? 0) + 1);
      return counts;
    }, new Map());
  }, [categories]);

  const [newName, setNewName] = useState('');
  const [newNature, setNewNature] = useState<DreGroupNature | ''>('operating_expense');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNature, setEditNature] = useState<DreGroupNature>('operating_expense');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isMutating = Boolean(
    createGroup.isPending
    || updateGroup.isPending
    || deleteGroup.isPending
    || reorderGroups.isPending
    || assignCategoriesToGroup.isPending,
  );

  const getUsageCount = (group: DreGroup) =>
    usageByGroup.get(group.id) ?? group.category_count ?? 0;

  const validateName = (name: string, ignoredId?: string) => {
    const normalized = name.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return 'Informe o nome do grupo.';
    if (groups.some((group) => group.id !== ignoredId && group.name.trim().toLocaleLowerCase('pt-BR') === normalized)) {
      return 'Já existe um grupo com esse nome.';
    }
    return null;
  };

  const handleCreate = () => {
    const nameError = validateName(newName);
    if (nameError) {
      setFormError(nameError);
      return;
    }
    if (!newNature) {
      setFormError('Selecione a natureza do grupo. Ela define o impacto nos cálculos da DRE.');
      return;
    }
    setFormError(null);
    setOperationError(null);
    createGroup.mutate(
      { name: newName.trim(), nature: newNature },
      {
        onSuccess: () => {
          setNewName('');
          setNewNature('operating_expense');
        },
        onError: () => setOperationError('Não foi possível criar o grupo. Tente novamente.'),
      },
    );
  };

  const startEditing = (group: DreGroup) => {
    setEditingId(group.id);
    setEditName(group.name);
    setEditNature(group.nature);
    setFormError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setFormError(null);
  };

  const handleSave = (group: DreGroup) => {
    const nameError = validateName(editName, group.id);
    if (nameError) {
      setFormError(nameError);
      return;
    }
    setFormError(null);
    setOperationError(null);
    updateGroup.mutate(
      {
        id: group.id,
        name: editName.trim(),
        // A natureza dos grupos essenciais define fórmulas estruturais da DRE.
        // Nome e posição são personalizáveis, mas essa semântica não é alterada pela UI.
        ...(group.is_system ? {} : { nature: editNature }),
      },
      {
        onSuccess: () => setEditingId(null),
        onError: () => setOperationError('Não foi possível salvar o grupo. Tente novamente.'),
      },
    );
  };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const moveCategoryToGroup = (categoryId: string, targetGroupId: string) => {
    const category = categories.find((item) => item.id === categoryId);
    const target = groups.find((group) => group.id === targetGroupId);
    if (!category || !target || category.dre_group_id === target.id) return;
    if (!canMoveCategoryToDreNature(category, target.nature)) {
      setOperationError('Esse grupo não aceita o tipo desta categoria. Escolha um grupo compatível.');
      return;
    }

    const categoryIds = categoryIdsForDreMove(category.id, categories);
    setOperationError(null);
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      next.delete(target.id);
      return next;
    });
    assignCategoriesToGroup.mutate(
      { categoryIds, groupId: target.id },
      { onError: () => setOperationError('Não foi possível mover a categoria. Tente novamente.') },
    );
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || isMutating) return;
    const activeKind = active.data.current?.kind as 'group' | 'category' | undefined;
    const activeId = active.data.current?.entityId as string | undefined;
    const targetGroupId = over.data.current?.groupId as string | undefined;
    if (!activeKind || !activeId || !targetGroupId) return;

    if (activeKind === 'group') {
      const source = groups.find((group) => group.id === activeId);
      const target = groups.find((group) => group.id === targetGroupId);
      if (!source || !target) return;
      if (source.nature !== target.nature) {
        setOperationError('Reordene grupos apenas dentro da mesma natureza da DRE.');
        return;
      }
      const sourceIndex = groups.findIndex((group) => group.id === source.id);
      const targetIndex = groups.findIndex((group) => group.id === target.id);
      const nextGroups = arrayMove(groups, sourceIndex, targetIndex);
      setOperationError(null);
      reorderGroups.mutate(nextGroups.map((group) => group.id), {
        onError: () => setOperationError('Não foi possível salvar a nova ordem. Tente novamente.'),
      });
      return;
    }

    moveCategoryToGroup(activeId, targetGroupId);
  };

  const reactivateGroup = (group: DreGroup) => {
    setOperationError(null);
    updateGroup.mutate(
      { id: group.id, is_active: true },
      { onError: () => setOperationError('Não foi possível reativar o grupo. Tente novamente.') },
    );
  };

  const executeConfirmedAction = () => {
    if (!confirmAction) return;
    const { group, kind } = confirmAction;
    const usageCount = getUsageCount(group);
    if (group.is_system || usageCount > 0 || (kind === 'delete' && group.is_active)) {
      setConfirmAction(null);
      return;
    }

    setOperationError(null);
    if (kind === 'deactivate') {
      updateGroup.mutate(
        { id: group.id, is_active: false },
        {
          onSuccess: () => setConfirmAction(null),
          onError: () => setOperationError('Não foi possível desativar o grupo. Tente novamente.'),
        },
      );
      return;
    }

    deleteGroup.mutate(group.id, {
      onSuccess: () => setConfirmAction(null),
      onError: () => setOperationError('Não foi possível excluir o grupo. Tente novamente.'),
    });
  };

  return (
    <>
      <div className="space-y-4 pb-1">
          {showHeading ? (
            <header className="border-b border-border/60 pb-4">
              <h2 className="text-lg font-semibold tracking-tight">Estrutura da DRE</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Crie grupos, organize a hierarquia e mova categorias sem sair desta tela. O seletor de cada categoria é a alternativa ao arraste.
              </p>
            </header>
          ) : null}
          {operationError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Não foi possível concluir a ação</AlertTitle>
              <AlertDescription>{operationError}</AlertDescription>
            </Alert>
          ) : null}

          {!isLoading && !error ? (
            <div className="grid gap-3 bg-muted/30 p-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
              <NatureField value={newNature} onChange={setNewNature} id="new-dre-group-nature" compact />
              <div className="space-y-1.5">
                <Label htmlFor="new-dre-group-name">Novo subgrupo</Label>
                <Input
                  id="new-dre-group-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Ex.: Despesas com pessoal"
                  maxLength={80}
                  onKeyDown={(event) => { if (event.key === 'Enter') handleCreate(); }}
                />
              </div>
              <Button type="button" onClick={handleCreate} disabled={isMutating} className="gap-2">
                {createGroup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </Button>
              {formError ? <p className="text-sm text-destructive sm:col-span-3" role="alert">{formError}</p> : null}
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-2" aria-label="Carregando grupos da DRE">
              {[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 w-full" />)}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Não foi possível carregar os grupos</AlertTitle>
              <AlertDescription>
                <p>Verifique sua conexão e tente novamente.</p>
              </AlertDescription>
            </Alert>
          ) : groups.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center">
              <p className="font-medium">Nenhum grupo configurado</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crie o primeiro grupo para organizar a apresentação da DRE.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border" aria-label="Prévia da estrutura da DRE">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Prévia da estrutura</span>
                <span>Ações</span>
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                {NATURES.map((nature, natureIndex) => {
                  const siblings = groups.filter((group) => group.nature === nature.value);
                  if (siblings.length === 0) return null;
                  const natureCode = String(natureIndex + 1).padStart(2, '0');

                  return (
                    <section key={nature.value}>
                      <div className="flex items-center gap-3 bg-slate-900 px-4 py-3 text-white">
                        <span className="text-xs font-semibold tracking-wide text-white/60">{natureCode}</span>
                        <span className="text-[15px] font-bold">{nature.label}</span>
                      </div>
                      <SortableContext
                        items={siblings.map((group) => `group:${group.id}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        {siblings.map((group, groupIndex) => {
                          const usageCount = getUsageCount(group);
                          const groupCode = `${natureCode}.${String(groupIndex + 1).padStart(2, '0')}`;
                          const categoryRows = buildCategoryRows(groupCode, group.id, categories);
                          const isExpanded = !collapsedGroupIds.has(group.id);
                          const protectedGroup = group.is_system || usageCount > 0;
                          const protectionReason = group.is_system
                            ? 'Grupo essencial: não pode ser desativado nem excluído.'
                            : usageCount > 0
                              ? `${usageCount} ${usageCount === 1 ? 'categoria vinculada' : 'categorias vinculadas'}: remova os vínculos antes de desativar ou excluir.`
                              : undefined;

                          return (
                            <SortableDreGroup key={group.id} group={group} disabled={isMutating}>
                              {(dragHandle, isOver) => (
                                <div
                                  data-testid={`dre-group-${group.id}`}
                                  className={cn(
                                    'border-b bg-muted/20 px-3 py-3 transition-colors sm:px-4',
                                    isOver && 'bg-primary/5 ring-2 ring-inset ring-primary/40',
                                  )}
                                >
                                  {editingId === group.id ? (
                                    <div className="space-y-3">
                                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
                                        <div className="space-y-1.5">
                                          <Label htmlFor={`dre-group-name-${group.id}`}>Nome</Label>
                                          <Input
                                            id={`dre-group-name-${group.id}`}
                                            value={editName}
                                            onChange={(event) => setEditName(event.target.value)}
                                            maxLength={80}
                                            autoFocus
                                          />
                                        </div>
                                        <NatureField
                                          value={editNature}
                                          onChange={setEditNature}
                                          id={`dre-group-nature-${group.id}`}
                                          disabled={group.is_system}
                                        />
                                      </div>
                                      {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
                                      <div className="flex justify-end gap-2">
                                        <Button type="button" variant="ghost" size="sm" onClick={cancelEditing} disabled={isMutating}>
                                          <X className="mr-1.5 h-4 w-4" />
                                          Cancelar
                                        </Button>
                                        <Button type="button" size="sm" onClick={() => handleSave(group)} disabled={isMutating}>
                                          {updateGroup.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                                          Salvar
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                      <div className="flex min-w-0 flex-1 items-start gap-1 sm:gap-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 shrink-0"
                                          onClick={() => toggleGroup(group.id)}
                                          aria-expanded={isExpanded}
                                          aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${group.name}`}
                                        >
                                          {isExpanded
                                            ? <ChevronDown className="h-4 w-4" />
                                            : <ChevronRight className="h-4 w-4" />}
                                        </Button>
                                        {dragHandle}

                                        <div className="min-w-0 flex-1 space-y-1 pt-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs font-medium tracking-wide text-muted-foreground">{groupCode}</span>
                                            <p className="truncate text-sm font-semibold">{group.name}</p>
                                            {!group.is_active ? <Badge className="bg-slate-600 text-white">Inativo</Badge> : null}
                                            {group.is_system ? (
                                              <Badge variant="outline" className="gap-1">
                                                <ShieldCheck className="h-3 w-3" />
                                                Essencial
                                              </Badge>
                                            ) : null}
                                            {usageCount > 0 ? (
                                              <Badge variant="outline">
                                                {usageCount} {usageCount === 1 ? 'categoria' : 'categorias'}
                                              </Badge>
                                            ) : null}
                                          </div>
                                          {protectionReason ? <p className="text-xs text-muted-foreground">{protectionReason}</p> : null}
                                        </div>
                                      </div>

                                      <div className="flex shrink-0 flex-wrap justify-end gap-1 border-t pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                                        <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${group.name}`} onClick={() => startEditing(group)} disabled={isMutating}>
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        {group.is_active ? (
                                          <Button type="button" variant="ghost" size="icon" aria-label={`Desativar ${group.name}`} title={protectionReason} onClick={() => setConfirmAction({ kind: 'deactivate', group })} disabled={protectedGroup || isMutating}>
                                            <Power className="h-4 w-4" />
                                          </Button>
                                        ) : (
                                          <Button type="button" variant="ghost" size="icon" aria-label={`Reativar ${group.name}`} onClick={() => reactivateGroup(group)} disabled={isMutating}>
                                            <RotateCcw className="h-4 w-4" />
                                          </Button>
                                        )}
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                          aria-label={`Excluir ${group.name}`}
                                          title={group.is_active ? 'Desative o grupo antes de excluí-lo.' : protectionReason}
                                          onClick={() => setConfirmAction({ kind: 'delete', group })}
                                          disabled={group.is_active || protectedGroup || isMutating}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  {isExpanded && categoryRows.length > 0 && editingId !== group.id ? (
                                    <div className="mt-3 divide-y divide-border/40 border-t border-border/50 pt-1">
                                      {categoryRows.map((row) => (
                                        <DraggableCategoryRow
                                          key={row.category.id}
                                          row={row}
                                          groupId={group.id}
                                          groups={groups}
                                          disabled={isMutating}
                                          onAssign={moveCategoryToGroup}
                                        />
                                      ))}
                                    </div>
                                  ) : null}
                                  {isExpanded && categoryRows.length === 0 && editingId !== group.id ? (
                                    <p className="mt-3 border-t border-dashed px-10 pt-3 text-xs text-muted-foreground">
                                      Nenhuma categoria neste grupo. Arraste uma categoria de outro grupo para cá.
                                    </p>
                                  ) : null}
                                </div>
                              )}
                            </SortableDreGroup>
                          );
                        })}
                      </SortableContext>
                    </section>
                  );
                })}
              </DndContext>
            </div>
          )}
      </div>

      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(nextOpen) => !nextOpen && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === 'delete' ? 'Excluir grupo da DRE?' : 'Desativar grupo da DRE?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === 'delete'
                ? `O grupo “${confirmAction.group.name}” será excluído permanentemente. Essa ação não pode ser desfeita.`
                : `O grupo “${confirmAction?.group.name}” deixará de estar disponível para novas classificações.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                executeConfirmedAction();
              }}
              disabled={isMutating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {confirmAction?.kind === 'delete' ? 'Excluir' : 'Desativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Mantido para o atalho contextual da DRE. A aba de configurações usa o
 * editor direto (`DreGroupsManager`) e não abre este modal intermediário.
 */
export function DreGroupsManagerDialog({
  open,
  onOpenChange,
  categories,
  companyId,
  canManage = true,
}: DreGroupsManagerDialogProps) {
  const [showOtherViews, setShowOtherViews] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setShowOtherViews(false);
    onOpenChange(nextOpen);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={showOtherViews ? 'Outras visões do DRE' : 'Configurar DRE'}
      description={showOtherViews
        ? 'Crie formas diferentes de apresentar os mesmos lançamentos e categorias.'
        : 'Organize os grupos e mova categorias arrastando. Use o seletor como alternativa acessível.'}
      className="sm:max-w-5xl"
    >
      {open && showOtherViews ? (
        <DreLayoutProfilesPanel
          companyId={companyId}
          canManage={canManage}
          onBack={() => setShowOtherViews(false)}
        />
      ) : open ? (
        <div className="space-y-5">
          <DreGroupsManager categories={categories} showHeading={false} />
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background">
                  <FileBarChart className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Precisa de outra forma de ver o DRE?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opcional: crie visões gerencial, contábil, EBITDA ou próprias sem mexer nos lançamentos.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild type="button" variant="ghost" size="sm">
                  <a href="/docs/guias/dre-tres-visoes.pdf" target="_blank" rel="noreferrer">Ver exemplo em PDF</a>
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowOtherViews(true)}>
                  Outras visões
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </ResponsiveModal>
  );
}

function SortableDreGroup({
  group,
  disabled,
  children,
}: {
  group: DreGroup;
  disabled: boolean;
  children: (dragHandle: ReactNode, isOver: boolean) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `group:${group.id}`,
    data: { kind: 'group', entityId: group.id, groupId: group.id },
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    position: 'relative',
    zIndex: isDragging ? 20 : undefined,
  };
  const dragHandle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="flex h-8 w-7 shrink-0 touch-none cursor-grab items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={`Arrastar grupo ${group.name}`}
      title="Arraste para reordenar"
      disabled={disabled}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return <div ref={setNodeRef} style={style}>{children(dragHandle, isOver)}</div>;
}

function DraggableCategoryRow({
  row,
  groupId,
  groups,
  disabled,
  onAssign,
}: {
  row: CategoryTreeRow;
  groupId: string;
  groups: DreGroup[];
  disabled: boolean;
  onAssign: (categoryId: string, groupId: string) => void;
}) {
  const { category, code, depth, parentName } = row;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `category:${category.id}`,
    data: { kind: 'category', entityId: category.id, groupId },
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 30 : undefined,
  };
  const Icon = getCategoryIcon(category.icon);
  const color = category.color || '#64748b';
  const allowedGroups = groups.filter((group) => canMoveCategoryToDreNature(category, group.nature));

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-wrap items-center gap-2 py-2 text-xs transition-colors hover:bg-muted/40 md:flex-nowrap',
        depth === 1 ? 'pl-12 pr-2' : 'pl-8 pr-2',
      )}
      data-testid={`dre-category-${category.id}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex h-7 w-6 shrink-0 touch-none cursor-grab items-center justify-center text-muted-foreground/70 hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Arrastar ${depth === 1 ? 'subcategoria' : 'categoria'} ${category.name}`}
        title="Arraste para outro grupo"
        disabled={disabled}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="w-[92px] shrink-0 text-[10px] tracking-wide text-muted-foreground">{code}</span>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full text-white',
          depth === 1 ? 'h-5 w-5' : 'h-6 w-6',
        )}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        <Icon className={depth === 1 ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </span>
      <span className={cn('min-w-0 flex-1 truncate text-foreground/85', depth === 1 ? 'font-normal' : 'font-medium')}>
        {category.name || 'Categoria vinculada'}
      </span>
      {depth === 1 ? (
        <span className="hidden max-w-[180px] truncate text-[10px] text-muted-foreground sm:inline" title={parentName}>
          Subcategoria{parentName ? ` de ${parentName}` : ''}
        </span>
      ) : null}
      <Select
        value={category.dre_group_id ?? undefined}
        onValueChange={(targetGroupId) => onAssign(category.id, targetGroupId)}
        disabled={disabled}
      >
        <SelectTrigger
          className="mt-1 h-8 w-full basis-full text-xs md:mt-0 md:w-[205px] md:basis-auto md:shrink-0"
          aria-label={`Mover ${category.name} para outro grupo DRE`}
        >
          <SelectValue placeholder="Escolher grupo" />
        </SelectTrigger>
        <SelectContent>
          {allowedGroups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {String((natureOrder.get(group.nature) ?? 0) + 1).padStart(2, '0')} · {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface NatureFieldProps {
  id: string;
  value: DreGroupNature | '';
  onChange: (nature: DreGroupNature) => void;
  disabled?: boolean;
  compact?: boolean;
}

function NatureField({ id, value, onChange, disabled = false, compact = false }: NatureFieldProps) {
  const selectedNature = value ? natureByValue.get(value) : null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{compact ? 'Natureza' : 'Natureza na DRE'}</Label>
      <Select
        value={value || undefined}
        onValueChange={(nextValue) => onChange(nextValue as DreGroupNature)}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-label="Natureza na DRE">
          <SelectValue placeholder="Selecione a natureza" />
        </SelectTrigger>
        <SelectContent>
          {NATURES.map((nature) => (
            <SelectItem key={nature.value} value={nature.value}>
              {nature.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!compact ? (
        <p className="min-h-8 text-xs leading-relaxed text-muted-foreground">
          {disabled
            ? 'A natureza de um grupo essencial é protegida para preservar os cálculos da DRE.'
            : selectedNature?.description ?? 'A natureza define onde o grupo entra e como afeta os totais.'}
        </p>
      ) : null}
    </div>
  );
}
