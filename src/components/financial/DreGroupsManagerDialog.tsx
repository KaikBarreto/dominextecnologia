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
  categories: readonly Pick<FinancialCategory, 'dre_group_id'>[];
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
    () => [...(dreGroups ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR')),
    [dreGroups],
  );
  const usageByGroup = useMemo(() => {
    return categories.reduce<Map<string, number>>((counts, category) => {
      if (!category.dre_group_id) return counts;
      counts.set(category.dre_group_id, (counts.get(category.dre_group_id) ?? 0) + 1);
      return counts;
    }, new Map());
  }, [categories]);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNature, setNewNature] = useState<DreGroupNature | ''>('');
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
          setNewNature('');
          setShowCreate(false);
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
    const targetIndex = currentIndex + offset;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= groups.length) return;

    const nextGroups = [...groups];
    const [moved] = nextGroups.splice(currentIndex, 1);
    nextGroups.splice(targetIndex, 0, moved);
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

  const closeCreate = () => {
    setShowCreate(false);
    setNewName('');
    setNewNature('');
    setFormError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      closeCreate();
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
        title="Grupos da DRE"
        description="Defina a ordem e como cada grupo impacta o demonstrativo de resultado."
        className="sm:max-w-[720px]"
      >
        <div className="space-y-4 pb-1">
          {operationError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Não foi possível concluir a ação</AlertTitle>
              <AlertDescription>{operationError}</AlertDescription>
            </Alert>
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
            <div className="space-y-2" aria-label="Grupos da DRE ordenados">
              {groups.map((group, index) => {
                const usageCount = getUsageCount(group);
                const protectedGroup = group.is_system || usageCount > 0;
                const protectionReason = group.is_system
                  ? 'Grupo essencial: não pode ser desativado nem excluído.'
                  : usageCount > 0
                    ? `${usageCount} ${usageCount === 1 ? 'categoria vinculada' : 'categorias vinculadas'}: remova os vínculos antes de desativar ou excluir.`
                    : undefined;

                return (
                  <div
                    key={group.id}
                    className="rounded-xl border bg-card p-3 shadow-sm"
                    data-testid={`dre-group-${group.id}`}
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
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <div className="flex shrink-0 flex-col gap-1" aria-label={`Ordenar ${group.name}`}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={`Mover ${group.name} para cima`}
                              onClick={() => moveGroup(group.id, -1)}
                              disabled={index === 0 || isMutating}
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
                              disabled={index === groups.length - 1 || isMutating}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">{group.name}</p>
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
                            <p className="text-sm font-medium text-muted-foreground">
                              {natureByValue.get(group.nature)?.label ?? group.nature}
                            </p>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {natureByValue.get(group.nature)?.description ?? 'Natureza sem descrição disponível.'}
                            </p>
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
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && !error ? (
            <div className="border-t pt-4">
              {showCreate ? (
                <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-dre-group-name">Nome</Label>
                      <Input
                        id="new-dre-group-name"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        placeholder="Ex.: Despesas administrativas"
                        maxLength={80}
                        autoFocus
                      />
                    </div>
                    <NatureField value={newNature} onChange={setNewNature} id="new-dre-group-nature" />
                  </div>
                  {formError ? <p className="text-sm text-destructive" role="alert">{formError}</p> : null}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="ghost" onClick={closeCreate} disabled={isMutating}>
                      Cancelar
                    </Button>
                    <Button type="button" onClick={handleCreate} disabled={isMutating}>
                      {createGroup.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      Criar grupo
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setFormError(null);
                    setShowCreate(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Novo grupo
                </Button>
              )}
            </div>
          ) : null}
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
}

function NatureField({ id, value, onChange, disabled = false }: NatureFieldProps) {
  const selectedNature = value ? natureByValue.get(value) : null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Natureza na DRE</Label>
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
      <p className="min-h-8 text-xs leading-relaxed text-muted-foreground">
        {disabled
          ? 'A natureza de um grupo essencial é protegida para preservar os cálculos da DRE.'
          : selectedNature?.description ?? 'A natureza define onde o grupo entra e como afeta os totais.'}
      </p>
    </div>
  );
}
