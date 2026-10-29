import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Car,
  DollarSign,
  Gift,
  HardHat,
  Package,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterButton } from '@/components/ui/FilterButton';
import {
  ListDetailLayout,
  type ListDetailItem,
  type ListDetailSortOption,
} from '@/components/ui/ListDetailLayout';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FABButton } from '@/components/mobile/FABButton';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
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
import {
  useCostResourceItems,
  useCostResources,
  type CostResource,
  type CostResourceCategory,
} from '@/hooks/useCostResources';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatNumber } from '@/lib/format';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { CostResourceFormSheet } from './CostResourceFormSheet';
import {
  filterGlobalCostResources,
  type ResourceStatusFilter,
} from './globalCostResourceFilters';

const CATEGORY_ICONS: Record<
  CostResourceCategory,
  { icon: React.ComponentType<{ className?: string }>; hex: string }
> = {
  vehicle: { icon: Car, hex: '#0284c7' },
  tool: { icon: Wrench, hex: '#d97706' },
  gift: { icon: Gift, hex: '#db2777' },
  epi: { icon: HardHat, hex: '#16a34a' },
  other: { icon: Package, hex: '#475569' },
};

function ResourceAvatar({ resource, className }: { resource: CostResource; className?: string }) {
  const category = CATEGORY_ICONS[resource.category];
  const Icon = category.icon;

  if (resource.photo_url) {
    return <img src={resource.photo_url} alt="" className={cn('shrink-0 rounded-lg border object-cover', className)} />;
  }

  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-lg text-white', className)}
      style={{ backgroundColor: category.hex }}
      aria-hidden="true"
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function GlobalCostsTab() {
  const { locale, currency } = useAppLocaleContext();
  const tgc = MESSAGES[locale].app.crm.globalCosts;
  const fmt = useCallback((value: number) => formatMoney(value, currency, locale), [currency, locale]);
  const isMobile = useIsMobile();

  const categoryConfig = useMemo(
    () => [
      { value: 'vehicle' as const, label: tgc.categoryVehicles, ...CATEGORY_ICONS.vehicle },
      { value: 'tool' as const, label: tgc.categoryTools, ...CATEGORY_ICONS.tool },
      { value: 'gift' as const, label: tgc.categoryGifts, ...CATEGORY_ICONS.gift },
      { value: 'epi' as const, label: tgc.categoryEpi, ...CATEGORY_ICONS.epi },
      { value: 'other' as const, label: tgc.categoryOther, ...CATEGORY_ICONS.other },
    ],
    [tgc],
  );

  const { resources, kpis, isLoading, createResource, updateResource, deleteResource } = useCostResources();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<CostResourceCategory[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<ResourceStatusFilter[]>([]);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState<CostResourceCategory>('vehicle');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<CostResource | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CostResource | null>(null);

  const filteredResources = useMemo(
    () => filterGlobalCostResources(resources, selectedCategories, selectedStatuses),
    [resources, selectedCategories, selectedStatuses],
  );
  const selectedResource = resources.find((resource) => resource.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !filteredResources.some((resource) => resource.id === selectedId)) {
      setSelectedId(null);
      setMobileDetailOpen(false);
    }
  }, [filteredResources, selectedId]);

  const { data: selectedItems, isLoading: isLoadingItems } = useCostResourceItems(selectedResource?.id ?? null);
  const categoryByValue = useMemo(
    () => new Map(categoryConfig.map((category) => [category.value, category])),
    [categoryConfig],
  );
  const resourceById = useMemo(
    () => new Map(filteredResources.map((resource) => [resource.id, resource])),
    [filteredResources],
  );

  const listItems: ListDetailItem[] = useMemo(
    () => filteredResources.map((resource) => {
      const category = categoryByValue.get(resource.category)!;
      const statusLabel = resource.is_active ? tgc.badgeActive : tgc.badgeInactive;
      const amount = Number(resource.total_monthly_cost ?? 0);
      return {
        id: resource.id,
        title: resource.name,
        subtitle: `${category.label} · ${statusLabel}`,
        searchText: `${category.label} ${statusLabel} ${resource.notes ?? ''}`,
        imageUrl: resource.photo_url,
        imageAlt: resource.name,
        leading: resource.photo_url ? undefined : <ResourceAvatar resource={resource} className="h-10 w-10" />,
        trailing: (
          <span className="whitespace-nowrap text-right text-xs font-semibold tabular-nums text-foreground">
            {fmt(amount)}
            <span className="block text-[10px] font-normal text-muted-foreground">
              {resource.category === 'gift' ? tgc.perUnit : tgc.perMonth}
            </span>
          </span>
        ),
      };
    }),
    [categoryByValue, filteredResources, fmt, tgc],
  );

  const sortOptions: ListDetailSortOption[] = useMemo(() => {
    const byName = (a: ListDetailItem, b: ListDetailItem) =>
      a.title.localeCompare(b.title, locale, { sensitivity: 'base' });
    const cost = (item: ListDetailItem) => Number(resourceById.get(item.id)?.total_monthly_cost ?? 0);
    return [
      { value: 'name-asc', label: tgc.sortNameAsc, shortLabel: 'A-Z', compare: byName },
      { value: 'name-desc', label: tgc.sortNameDesc, shortLabel: 'Z-A', compare: (a, b) => byName(b, a) },
      { value: 'cost-desc', label: tgc.sortCostDesc, shortLabel: '↓', compare: (a, b) => cost(b) - cost(a) },
      { value: 'cost-asc', label: tgc.sortCostAsc, shortLabel: '↑', compare: (a, b) => cost(a) - cost(b) },
    ];
  }, [locale, resourceById, tgc]);

  const activeFilterCount = selectedCategories.length + selectedStatuses.length;
  const handleChooseCategory = (category: CostResourceCategory) => {
    setCreateCategory(category);
    setEditingResource(null);
    setCategoryPickerOpen(false);
    setSheetOpen(true);
  };
  const handleOpenEdit = (resource: CostResource) => {
    setEditingResource(resource);
    setSheetOpen(true);
  };
  const handleSave = (data: {
    name: string;
    monthly_hours: number;
    is_active: boolean;
    notes: string;
    photo_url?: string | null;
    items: Array<{ name: string; value: number; is_monthly: boolean; annual_value?: number | null }>;
  }) => {
    const items = data.items.map((item) => ({ ...item, annual_value: item.annual_value ?? undefined }));
    if (editingResource) {
      updateResource.mutate({ id: editingResource.id, ...data, items }, { onSuccess: () => setSheetOpen(false) });
    } else {
      createResource.mutate({ category: createCategory, ...data, items }, { onSuccess: () => setSheetOpen(false) });
    }
  };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    const deletedId = pendingDelete.id;
    deleteResource.mutate(deletedId, {
      onSuccess: () => {
        if (selectedId === deletedId) {
          setSelectedId(null);
          setMobileDetailOpen(false);
        }
      },
    });
    setPendingDelete(null);
  };

  const statItems: StatCarouselItem[] = useMemo(
    () => [
      { key: 'vehicle', label: tgc.kpiVehicles, count: fmt(kpis.vehicleHourlyCost) as unknown as number, icon: <Car className="h-4 w-4" />, accentColor: CATEGORY_ICONS.vehicle.hex },
      { key: 'tool', label: tgc.kpiTools, count: fmt(kpis.toolHourlyCost) as unknown as number, icon: <Wrench className="h-4 w-4" />, accentColor: CATEGORY_ICONS.tool.hex },
      { key: 'epi', label: tgc.kpiEpi, count: fmt(kpis.epiHourlyCost) as unknown as number, icon: <HardHat className="h-4 w-4" />, accentColor: CATEGORY_ICONS.epi.hex },
      { key: 'gift', label: tgc.kpiGift, count: fmt(kpis.giftCostPerUnit) as unknown as number, icon: <Gift className="h-4 w-4" />, accentColor: CATEGORY_ICONS.gift.hex },
    ],
    [fmt, kpis, tgc],
  );

  const listFilters = (
    <FilterButton
      activeCount={activeFilterCount}
      onClear={() => {
        setSelectedCategories([]);
        setSelectedStatuses([]);
      }}
      embedded
    >
      <FilterCheckboxGroup
        label={tgc.filterCategory}
        options={categoryConfig.map((category) => ({
          value: category.value,
          label: category.label,
          icon: (
            <span className="flex h-6 w-6 items-center justify-center rounded-md text-white" style={{ backgroundColor: category.hex }}>
              <category.icon className="h-3.5 w-3.5" />
            </span>
          ),
        }))}
        selected={selectedCategories}
        onChange={(next) => setSelectedCategories(next.length === categoryConfig.length ? [] : next as CostResourceCategory[])}
      />
      <FilterCheckboxGroup
        label={tgc.filterStatus}
        options={[
          { value: 'active', label: tgc.badgeActive, color: '#16a34a' },
          { value: 'inactive', label: tgc.badgeInactive, color: '#475569' },
        ]}
        selected={selectedStatuses}
        onChange={(next) => setSelectedStatuses(next.length === 2 ? [] : next as ResourceStatusFilter[])}
      />
    </FilterButton>
  );

  const renderDetail = () => {
    if (!selectedResource) {
      return (
        <div className="flex min-h-[24rem] items-center justify-center rounded-xl border border-dashed">
          <EmptyState
            icon={<DollarSign className="h-12 w-12" />}
            title={tgc.selectTitle}
            description={tgc.selectDescription}
            size="compact"
          />
        </div>
      );
    }

    const category = categoryByValue.get(selectedResource.category)!;
    const totalMonthly = Number(selectedResource.total_monthly_cost ?? 0);
    const hourlyRate = Number(selectedResource.hourly_rate ?? 0);
    const isGift = selectedResource.category === 'gift';
    return (
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="border-b p-4 sm:p-5">
          <Button type="button" variant="ghost" size="sm" className="mb-3 -ml-2 lg:hidden" onClick={() => setMobileDetailOpen(false)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tgc.backToList}
          </Button>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <ResourceAvatar resource={selectedResource} className="h-14 w-14" />
              <div className="min-w-0">
                <h2 className="break-words text-lg font-bold text-foreground">{selectedResource.name}</h2>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge className="border-0 text-white" style={{ backgroundColor: category.hex }}>{category.label}</Badge>
                  <Badge className={cn('border-0 text-white', selectedResource.is_active ? 'bg-green-600' : 'bg-slate-600')}>
                    {selectedResource.is_active ? tgc.badgeActive : tgc.badgeInactive}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleOpenEdit(selectedResource)}>
                <Pencil className="mr-2 h-4 w-4" />{tgc.actionEdit}
              </Button>
              <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setPendingDelete(selectedResource)}>
                <Trash2 className="mr-2 h-4 w-4" />{tgc.actionDelete}
              </Button>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-1 border-b sm:grid-cols-3 sm:divide-x">
          <div className="border-b p-4 sm:border-b-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{isGift ? tgc.unitCost : tgc.monthlyCost}</dt>
            <dd className="mt-1 whitespace-nowrap text-xl font-bold tabular-nums text-foreground">{fmt(totalMonthly)}</dd>
          </div>
          <div className="border-b p-4 sm:border-b-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tgc.monthlyHours}</dt>
            <dd className="mt-1 whitespace-nowrap text-xl font-bold tabular-nums text-foreground">{isGift ? '—' : formatNumber(selectedResource.monthly_hours, locale)}</dd>
          </div>
          <div className="p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tgc.hourlyCost}</dt>
            <dd className="mt-1 whitespace-nowrap text-xl font-bold tabular-nums text-foreground">{isGift ? '—' : fmt(hourlyRate)}</dd>
          </div>
        </dl>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,1fr)] lg:divide-x">
          <div className="p-4 sm:p-5">
            <h3 className="text-sm font-bold text-foreground">{tgc.costItemsTitle}</h3>
            {isLoadingItems ? (
              <div className="mt-3 space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-10 w-full" />)}</div>
            ) : selectedItems && selectedItems.length > 0 ? (
              <div className="mt-3 divide-y rounded-lg border">
                {selectedItems.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-foreground">{item.name}</p>
                      {!isGift && !item.is_monthly && item.annual_value != null && (
                        <p className="text-xs text-muted-foreground">{tgc.annualValue}: {fmt(Number(item.annual_value))}</p>
                      )}
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{fmt(Number(item.value ?? 0))}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-muted-foreground">{tgc.noCostItems}</p>}
          </div>
          <div className="border-t p-4 sm:p-5 lg:border-t-0">
            <h3 className="text-sm font-bold text-foreground">{tgc.notesTitle}</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{selectedResource.notes || tgc.noNotes}</p>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className={cn('space-y-4', isMobile && 'pb-24')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground">{tgc.title}</h1>
          <p className="text-sm text-muted-foreground">{tgc.subtitle}</p>
        </div>
        {!isMobile && (
          <Button type="button" className="shrink-0" onClick={() => setCategoryPickerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />{tgc.newResource}
          </Button>
        )}
      </div>

      {isMobile ? <StatCarousel items={statItems} loading={isLoading} /> : (
        <div className="grid overflow-hidden rounded-xl border bg-muted/10 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x">
          {[
            { icon: Car, label: tgc.kpiVehicleLabel, value: `${fmt(kpis.vehicleHourlyCost)}${tgc.perHour}` },
            { icon: Wrench, label: tgc.kpiToolLabel, value: `${fmt(kpis.toolHourlyCost)}${tgc.perHour}` },
            { icon: HardHat, label: tgc.kpiEpiLabel, value: `${fmt(kpis.epiHourlyCost)}${tgc.perHour}` },
            { icon: Gift, label: tgc.kpiGiftLabel, value: fmt(kpis.giftCostPerUnit) },
          ].map((stat, index) => (
            <div key={stat.label} className={cn('p-3 sm:p-4', index < 2 && 'border-b xl:border-b-0')}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><stat.icon className="h-4 w-4" /><span>{stat.label}</span></div>
              {isLoading ? <Skeleton className="mt-2 h-6 w-24" /> : <p className="mt-1 whitespace-nowrap text-lg font-bold tabular-nums text-foreground">{stat.value}</p>}
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]">
          <Skeleton className="h-[30rem] w-full" />
          <Skeleton className="h-[24rem] w-full" />
        </div>
      ) : (
        <ListDetailLayout
          items={listItems}
          selectedId={selectedId ?? undefined}
          listTitle={tgc.listTitle}
          listFilters={listFilters}
          sortOptions={sortOptions}
          pageSize={25}
          storageKey="global-costs-list-detail"
          searchPlaceholder={tgc.searchPlaceholder}
          emptyLabel={resources.length === 0 ? tgc.emptyAll : tgc.emptyFiltered}
          mobileDetailOpen={mobileDetailOpen}
          onSelect={(id) => {
            setSelectedId(id);
            setMobileDetailOpen(true);
          }}
        >
          {renderDetail()}
        </ListDetailLayout>
      )}

      {isMobile && <FABButton icon={<Plus className="h-5 w-5" />} label={tgc.newResource} onClick={() => setCategoryPickerOpen(true)} />}

      <ResponsiveModal
        open={categoryPickerOpen}
        onOpenChange={setCategoryPickerOpen}
        title={tgc.chooseCategoryTitle}
        description={tgc.chooseCategoryDescription}
        className="sm:max-w-md"
      >
        <div className="grid gap-2 py-1">
          {categoryConfig.map((category) => {
            const Icon = category.icon;
            return (
              <button
                key={category.value}
                type="button"
                onClick={() => handleChooseCategory(category.value)}
                className="flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: category.hex }}><Icon className="h-4 w-4" /></span>
                <span className="font-medium text-foreground">{category.label}</span>
              </button>
            );
          })}
        </div>
      </ResponsiveModal>

      <CostResourceFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        resource={editingResource}
        category={editingResource?.category ?? createCategory}
        onSave={handleSave}
        isPending={createResource.isPending || updateResource.isPending}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelete?.category === 'gift' ? tgc.deleteGiftTitle : tgc.deleteResourceTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (pendingDelete.category === 'gift'
                ? tgc.deleteDescGift.replace('{name}', pendingDelete.name)
                : tgc.deleteDescResource.replace('{name}', pendingDelete.name))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tgc.deleteCancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>{tgc.deleteConfirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
