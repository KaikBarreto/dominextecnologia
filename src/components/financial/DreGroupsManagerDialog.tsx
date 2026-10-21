import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
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
import type { FinancialCategory } from '@/hooks/useFinancialCategories';

interface DreGroupsManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Categorias do tenant atual, usadas apenas para impedir ações destrutivas em grupos vinculados. */
  categories: readonly Pick<FinancialCategory, 'id' | 'name' | 'dre_group_id'>[];
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

export function DreGroupsManagerDialog({
  open,
  onOpenChange,
  categories,
}: DreGroupsManagerDialogProps) {
  const {
    dreGroups,
    isLoading,
    error,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
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
  const categoriesByGroup = useMemo(() => {
    const grouped = new Map<string, Array<Pick<FinancialCategory, 'id' | 'name'>>>();
    categories.forEach((category) => {
      if (!category.dre_group_id) return;
      const current = grouped.get(category.dre_group_id) ?? [];
      current.push(category);
      grouped.set(category.dre_group_id, current);
    });
    grouped.forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    return grouped;
  }, [categories]);

  const [newName, setNewName] = useState('');
  const [newNature, setNewNature] = useState<DreGroupNature | ''>('operating_expense');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNature, setEditNature] = useState<DreGroupNature>('operating_expense');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const isMutating = Boolean(
    createGroup.isPending || updateGroup.isPending || deleteGroup.isPending || reorderGroups.isPending,
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

  const moveGroup = (groupId: string, offset: -1 | 1) => {
    const currentIndex = groups.findIndex((group) => group.id === groupId);
    if (currentIndex < 0) return;
    const siblings = groups.filter((group) => group.nature === groups[currentIndex].nature);
    const siblingIndex = siblings.findIndex((group) => group.id === groupId);
    const targetSibling = siblings[siblingIndex + offset];
    if (!targetSibling) return;
    const targetIndex = groups.findIndex((group) => group.id === targetSibling.id);

    const nextGroups = [...groups];
    [nextGroups[currentIndex], nextGroups[targetIndex]] = [nextGroups[targetIndex], nextGroups[currentIndex]];
    setOperationError(null);
    reorderGroups.mutate(nextGroups.map((group) => group.id), {
      onError: () => setOperationError('Não foi possível salvar a nova ordem. Tente novamente.'),
    });
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

  const resetCreate = () => {
    setNewName('');
    setNewNature('operating_expense');
    setFormError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetCreate();
      cancelEditing();
      setConfirmAction(null);
      setOperationError(null);
    }
    onOpenChange(nextOpen);
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={handleOpenChange}
        title="Configurar DRE"
        description="Edite a estrutura vendo a mesma hierarquia de grupos e categorias que aparece no demonstrativo."
        className="sm:max-w-5xl"
      >
        <div className="space-y-4 pb-1">
          {operationError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Não foi possível concluir a ação</AlertTitle>
              <AlertDescription>{operationError}</AlertDescription>
            </Alert>
          ) : null}

          {!isLoading && !error ? (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
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
              {groups.map((group, index) => {
                const usageCount = getUsageCount(group);
                const assignedCategories = categoriesByGroup.get(group.id) ?? [];
                const nature = natureByValue.get(group.nature);
                const natureIndex = NATURES.findIndex((item) => item.value === group.nature);
                const natureCode = String(natureIndex + 1).padStart(2, '0');
                const siblings = groups.filter((item) => item.nature === group.nature);
                const groupIndex = siblings.findIndex((item) => item.id === group.id);
                const groupCode = `${natureCode}.${String(groupIndex + 1).padStart(2, '0')}`;
                const showNatureHeader = index === 0 || groups[index - 1]?.nature !== group.nature;
                const protectedGroup = group.is_system || usageCount > 0;
                const protectionReason = group.is_system
                  ? 'Grupo essencial: não pode ser desativado nem excluído.'
                  : usageCount > 0
                    ? `${usageCount} ${usageCount === 1 ? 'categoria vinculada' : 'categorias vinculadas'}: remova os vínculos antes de desativar ou excluir.`
                    : undefined;

                return (
                  <div key={group.id} data-testid={`dre-group-${group.id}`}>
                    {showNatureHeader && (
                      <div className="flex items-center gap-3 bg-slate-900 px-4 py-3 text-white">
                        <span className="text-xs font-semibold tracking-wide text-white/60">{natureCode}</span>
                        <span className="text-[15px] font-bold">{nature?.label ?? group.nature}</span>
                      </div>
                    )}
                    <div className="border-b bg-muted/20 px-3 py-3 sm:px-4">
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
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="flex shrink-0 flex-col gap-1" aria-label={`Ordenar ${group.name}`}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Mover ${group.name} para cima`}
                              onClick={() => moveGroup(group.id, -1)}
                              disabled={groupIndex === 0 || isMutating}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Mover ${group.name} para baixo`}
                              onClick={() => moveGroup(group.id, 1)}
                              disabled={groupIndex === siblings.length - 1 || isMutating}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium tracking-wide text-muted-foreground">{groupCode}</span>
                              <p className="truncate text-sm font-semibold">{group.name}</p>
                              {!group.is_active ? <Badge variant="secondary">Inativo</Badge> : null}
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
                            {protectionReason ? (
                              <p className="text-xs text-muted-foreground">{protectionReason}</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap justify-end gap-1 border-t pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${group.name}`}
                            onClick={() => startEditing(group)}
                            disabled={isMutating}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {group.is_active ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Desativar ${group.name}`}
                              title={protectionReason}
                              onClick={() => setConfirmAction({ kind: 'deactivate', group })}
                              disabled={protectedGroup || isMutating}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Reativar ${group.name}`}
                              onClick={() => reactivateGroup(group)}
                              disabled={isMutating}
                            >
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
                    {assignedCategories.length > 0 && editingId !== group.id && (
                      <div className="mt-3 divide-y divide-border/40 border-t border-border/50 pt-1">
                        {assignedCategories.map((category, categoryIndex) => (
                          <div key={category.id || `${group.id}-${categoryIndex}`} className="flex items-center gap-3 py-2 pl-10 text-xs text-muted-foreground">
                            <span className="shrink-0 text-[10px] tracking-wide">
                              {groupCode}.{String(categoryIndex + 1).padStart(3, '0')}
                            </span>
                            <span className="truncate text-foreground/80">{category.name || 'Categoria vinculada'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </ResponsiveModal>

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
