import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDownUp,
  ArrowLeft,
  Check,
  Layers,
  ListFilter,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
} from 'lucide-react';
import { fuzzyIncludesAny } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import {
  ListDetailLayout,
  type ListDetailItem,
  type ListDetailSortOption,
} from '@/components/ui/ListDetailLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDataPagination } from '@/hooks/useDataPagination';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  useCostCenters,
  CostCenterInactiveDuplicateError,
  type CostCenter,
  type CostCenterInput,
} from '@/hooks/useCostCenters';
import { CostCenterForm, type CostCenterFormData } from './CostCenterFormDialog';
import { getCostCenterIcon } from './categoryIcons';

type StatusFilter = 'all' | 'active' | 'inactive';
type SortValue = 'name-asc' | 'name-desc' | 'updated-desc';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
];

const SORT_OPTIONS: Array<{ value: SortValue; label: string }> = [
  { value: 'name-asc', label: 'Nome (A–Z)' },
  { value: 'name-desc', label: 'Nome (Z–A)' },
  { value: 'updated-desc', label: 'Atualizados recentemente' },
];

function sortCostCenters(items: CostCenter[], sort: SortValue, locale: string) {
  return items.slice().sort((a, b) => {
    if (sort === 'updated-desc') return b.updated_at.localeCompare(a.updated_at);
    const byName = a.name.localeCompare(b.name, locale, { sensitivity: 'base' });
    return sort === 'name-desc' ? -byName : byName;
  });
}

/** Configuração de centros de custo em lista + detalhe, sem rota ou modal intermediário. */
export function FinanceCostCenters() {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.costCentersScreen;
  const canManage = useCanManageFinanceSettings();
  const {
    costCenters,
    isLoading,
    isError,
    refetch,
    createCostCenter,
    updateCostCenter,
    deleteCostCenter,
    reactivateCostCenter,
  } = useCostCenters();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSearch, setMobileSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [mobileSort, setMobileSort] = useState<SortValue>('name-asc');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<{
    existing: CostCenter;
    input: CostCenterInput;
  } | null>(null);

  const selected = costCenters.find((center) => center.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !costCenters.some((center) => center.id === selectedId)) {
      setSelectedId(null);
    }
  }, [costCenters, selectedId]);

  const statusFiltered = useMemo(
    () => costCenters.filter((center) => (
      statusFilter === 'all'
      || (statusFilter === 'active' ? center.is_active : !center.is_active)
    )),
    [costCenters, statusFilter],
  );

  const mobileFiltered = useMemo(() => {
    const searched = statusFiltered.filter((center) =>
      fuzzyIncludesAny([center.name, center.description], mobileSearch),
    );
    return sortCostCenters(searched, mobileSort, locale);
  }, [locale, mobileSearch, mobileSort, statusFiltered]);

  const pagination = useDataPagination(mobileFiltered, 10, 'finance-cost-centers-mobile');
  const setPage = pagination.setPage;
  useEffect(() => {
    setPage(1);
  }, [mobileSearch, mobileSort, setPage, statusFilter]);

  const listItems = useMemo<ListDetailItem[]>(() => statusFiltered.map((center) => {
    const Icon = getCostCenterIcon(center.icon) ?? Layers;
    return {
      id: center.id,
      title: center.name,
      subtitle: center.description || undefined,
      searchText: center.description || undefined,
      leading: (
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full shadow-sm"
          style={{ backgroundColor: center.color }}
          aria-hidden="true"
        >
          <Icon className="h-5 w-5 text-white" />
        </span>
      ),
      trailing: (
        <Badge className={center.is_active ? 'bg-success text-white' : 'bg-slate-600 text-white'}>
          {center.is_active ? t.status.active : t.status.inactive}
        </Badge>
      ),
    };
  }), [statusFiltered, t.status.active, t.status.inactive]);

  const desktopSortOptions = useMemo<ListDetailSortOption[]>(() => [
    {
      value: 'name-asc',
      label: 'Nome (A–Z)',
      shortLabel: 'A–Z',
      compare: (a, b) => a.title.localeCompare(b.title, locale, { sensitivity: 'base' }),
    },
    {
      value: 'name-desc',
      label: 'Nome (Z–A)',
      shortLabel: 'Z–A',
      compare: (a, b) => b.title.localeCompare(a.title, locale, { sensitivity: 'base' }),
    },
    {
      value: 'updated-desc',
      label: 'Atualizados recentemente',
      shortLabel: 'Recentes',
      compare: (a, b) => {
        const first = costCenters.find((center) => center.id === a.id)?.updated_at ?? '';
        const second = costCenters.find((center) => center.id === b.id)?.updated_at ?? '';
        return second.localeCompare(first);
      },
    },
  ], [costCenters, locale]);

  const selectCenter = (id: string) => {
    setSelectedId(id);
    setCreating(false);
  };

  const startCreating = () => {
    setCreating(true);
    setSelectedId(null);
  };

  const handleSubmit = async (data: CostCenterFormData) => {
    try {
      if (selected && !creating) {
        await updateCostCenter.mutateAsync({ ...data, id: selected.id });
      } else {
        const created = await createCostCenter.mutateAsync(data);
        setSelectedId(created.id);
        setCreating(false);
      }
    } catch (error) {
      if (error instanceof CostCenterInactiveDuplicateError) {
        setReactivateTarget({ existing: error.existing, input: data });
      }
      // As mutations já exibem o toast dos demais erros. O formulário fica
      // aberto para correção ou nova tentativa, sem rejeição não tratada.
    }
  };

  const handleToggleActive = (center: CostCenter) => {
    updateCostCenter.mutate({
      id: center.id,
      name: center.name,
      color: center.color,
      icon: center.icon,
      description: center.description,
      is_active: !center.is_active,
    });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteCostCenter.mutateAsync(deleteId);
    if (selectedId === deleteId) setSelectedId(null);
    setDeleteId(null);
  };

  const handleConfirmReactivate = async () => {
    if (!reactivateTarget) return;
    await reactivateCostCenter.mutateAsync({
      id: reactivateTarget.existing.id,
      ...reactivateTarget.input,
    });
    setSelectedId(reactivateTarget.existing.id);
    setCreating(false);
    setReactivateTarget(null);
  };

  const filtersButton = (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 w-full justify-center gap-2">
          <ListFilter className="h-4 w-4" />
          Filtros
          {statusFilter !== 'all' ? (
            <Badge className="h-5 min-w-5 bg-primary px-1.5 text-[10px] text-primary-foreground">1</Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
        {STATUS_FILTERS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-between"
            onClick={() => setStatusFilter(option.value)}
            aria-pressed={statusFilter === option.value}
          >
            {option.label}
            {statusFilter === option.value ? <Check className="h-4 w-4" /> : null}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );

  const detail = creating ? (
    <CostCenterDetailHeader title={t.empty.newAction} onBack={isMobile ? () => setCreating(false) : undefined}>
      <CostCenterForm
        onSubmit={handleSubmit}
        onCancel={() => setCreating(false)}
        isLoading={createCostCenter.isPending}
      />
    </CostCenterDetailHeader>
  ) : selected ? (
    <CostCenterDetailHeader
      center={selected}
      title={selected.name}
      statusLabel={selected.is_active ? t.status.active : t.status.inactive}
      onBack={isMobile ? () => setSelectedId(null) : undefined}
      actions={canManage ? (
        <>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={startCreating}>
            <Plus className="h-4 w-4" />
            {t.newButton}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => handleToggleActive(selected)}
            disabled={updateCostCenter.isPending}
          >
            {selected.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            {selected.is_active ? t.actions.deactivate : t.actions.activate}
          </Button>
          <Button
            type="button"
            variant="destructive-ghost"
            size="sm"
            className="gap-2"
            onClick={() => setDeleteId(selected.id)}
          >
            <Trash2 className="h-4 w-4" />
            {t.actions.delete}
          </Button>
        </>
      ) : undefined}
    >
      <CostCenterForm
        key={selected.id}
        costCenter={selected}
        onSubmit={handleSubmit}
        isLoading={updateCostCenter.isPending}
        showActions={canManage}
        readOnly={!canManage}
      />
    </CostCenterDetailHeader>
  ) : (
    <div className="flex min-h-[420px] items-center justify-center px-4 py-10">
      <EmptyState
        icon={<Layers className="h-10 w-10" />}
        title="Selecione um centro de custo"
        description="Escolha um item na lista para visualizar e editar seus dados."
        action={canManage ? { label: t.empty.newAction, onClick: startCreating } : undefined}
      />
    </div>
  );

  if (isLoading) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]" aria-label="Carregando centros de custo">
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />)}
        </div>
        <Skeleton className="hidden h-[520px] w-full lg:block" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <Layers className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar os centros de custo</AlertTitle>
        <AlertDescription className="mt-2 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Verifique sua conexão e tente novamente antes de alterar as configurações financeiras.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="min-w-0 pb-24 lg:pb-0">
      {isMobile ? (
        selected || creating ? detail : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.header.subtitle}</p>
            {costCenters.length > 0 ? (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={mobileSearch}
                    onChange={(event) => setMobileSearch(event.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="pl-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {filtersButton}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="h-9 justify-center gap-2">
                        <ArrowDownUp className="h-4 w-4" />
                        Ordenar
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 p-2">
                      {SORT_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-between"
                          onClick={() => setMobileSort(option.value)}
                          aria-pressed={mobileSort === option.value}
                        >
                          {option.label}
                          {mobileSort === option.value ? <Check className="h-4 w-4" /> : null}
                        </Button>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>
                {pagination.paginatedItems.length > 0 ? (
                  <div className="overflow-hidden rounded-xl bg-muted/25">
                    {pagination.paginatedItems.map((center) => {
                      const Icon = getCostCenterIcon(center.icon) ?? Layers;
                      return (
                        <MobileListItem
                          key={center.id}
                          onClick={() => selectCenter(center.id)}
                          className={!center.is_active ? 'opacity-70' : ''}
                          leading={
                            <span
                              className="flex h-10 w-10 items-center justify-center rounded-full shadow-sm"
                              style={{ backgroundColor: center.color }}
                            >
                              <Icon className="h-5 w-5 text-white" />
                            </span>
                          }
                          title={center.name}
                          subtitle={
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="min-w-0 flex-1 truncate">{center.description || 'Sem descrição'}</span>
                              <Badge className={center.is_active ? 'bg-success text-white' : 'bg-slate-600 text-white'}>
                                {center.is_active ? t.status.active : t.status.inactive}
                              </Badge>
                            </span>
                          }
                        />
                      );
                    })}
                    <DataTablePagination
                      page={pagination.page}
                      totalPages={pagination.totalPages}
                      totalItems={pagination.totalItems}
                      from={pagination.from}
                      to={pagination.to}
                      pageSize={pagination.pageSize}
                      onPageChange={pagination.setPage}
                      onPageSizeChange={pagination.setPageSize}
                    />
                  </div>
                ) : (
                  <EmptyState
                    size="compact"
                    icon={<Layers className="h-9 w-9" />}
                    title={costCenters.length === 0 ? t.empty.title : t.noResults}
                    description={costCenters.length === 0 ? t.empty.description : undefined}
                    action={costCenters.length === 0 && canManage
                      ? { label: t.empty.newAction, onClick: startCreating }
                      : undefined}
                  />
                )}
              </>
            ) : (
              <EmptyState
                size="compact"
                icon={<Layers className="h-10 w-10" />}
                title={t.empty.title}
                description={t.empty.description}
                action={canManage ? { label: t.empty.newAction, onClick: startCreating } : undefined}
              />
            )}
          </div>
        )
      ) : (
        <ListDetailLayout
          items={listItems}
          selectedId={selectedId ?? undefined}
          listTitle="Centros de custo"
          listDescription={`${statusFiltered.length} ${statusFiltered.length === 1 ? 'item disponível' : 'itens disponíveis'}`}
          listFilters={filtersButton}
          sortOptions={desktopSortOptions}
          pageSize={10}
          storageKey="finance-cost-centers-list-detail"
          searchPlaceholder={t.searchPlaceholder}
          emptyLabel={costCenters.length === 0 ? t.empty.title : t.noResults}
          onSelect={selectCenter}
          detailClassName="min-w-0"
        >
          {detail}
        </ListDetailLayout>
      )}

      {isMobile && canManage && !selected && !creating ? (
        <FABButton icon={<Plus className="h-5 w-5" />} label={t.fabLabel} onClick={startCreating} />
      ) : null}

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteCostCenter.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(reactivateTarget)}
        onOpenChange={(open) => !open && setReactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.reactivateDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.reactivateDialog.description.replace('{name}', reactivateTarget?.existing.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.reactivateDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReactivate} disabled={reactivateCostCenter.isPending}>
              {t.reactivateDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CostCenterDetailHeader({
  center,
  title,
  statusLabel,
  onBack,
  actions,
  children,
}: {
  center?: CostCenter;
  title: string;
  statusLabel?: string;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const Icon = center ? (getCostCenterIcon(center.icon) ?? Layers) : Plus;
  return (
    <div className="min-w-0">
      {onBack ? (
        <Button type="button" variant="ghost" className="mb-2 -ml-3 gap-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
      ) : null}
      <header className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
            style={center ? { backgroundColor: center.color } : undefined}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight">{title}</h2>
            {statusLabel && center ? (
              <Badge className={center.is_active ? 'mt-1.5 bg-success text-white' : 'mt-1.5 bg-slate-600 text-white'}>
                {statusLabel}
              </Badge>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Preencha os dados para criar o cadastro.</p>
            )}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="py-5">{children}</div>
    </div>
  );
}
