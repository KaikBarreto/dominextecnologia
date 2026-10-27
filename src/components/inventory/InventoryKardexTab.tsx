import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  SlidersHorizontal,
  ArrowRightLeft,
  RotateCcw,
  Wrench,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterButton } from '@/components/ui/FilterButton';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import {
  DateRangeFilter,
  useDateRangeFilter,
} from '@/components/ui/DateRangeFilter';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import {
  useInventoryMovements,
  type InventoryMovementWithRelations,
  type MovementType,
} from '@/hooks/useInventoryMovements';
import { useInventory } from '@/hooks/useInventory';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { dateInTz, timeInTz } from '@/lib/timezone';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatOSNumber } from '@/lib/osNumber';
import {
  ListDetailLayout,
  type ListDetailItem,
  type ListDetailSortOption,
} from '@/components/ui/ListDetailLayout';

// --------------------------------------------------------------------------
// Config visual por tipo de movimento. Badge SATURADA com texto branco
// (régua do projeto: nada de tint pastel /10). Label é resolvido via i18n
// no componente — aqui ficam apenas ícone e classe de badge.
// --------------------------------------------------------------------------
const TYPE_CONFIG: Record<
  string,
  { badgeClass: string; icon: typeof ArrowUpCircle }
> = {
  entrada: { badgeClass: 'bg-emerald-600 hover:bg-emerald-600 text-white border-transparent', icon: ArrowUpCircle },
  saida: { badgeClass: 'bg-blue-600 hover:bg-blue-600 text-white border-transparent', icon: ArrowDownCircle },
  consumo: { badgeClass: 'bg-orange-600 hover:bg-orange-600 text-white border-transparent', icon: Wrench },
  ajuste: { badgeClass: 'bg-purple-600 hover:bg-purple-600 text-white border-transparent', icon: SlidersHorizontal },
  transferencia: { badgeClass: 'bg-amber-600 hover:bg-amber-600 text-white border-transparent', icon: ArrowRightLeft },
  estorno: { badgeClass: 'bg-red-600 hover:bg-red-600 text-white border-transparent', icon: RotateCcw },
};

const TYPE_ORDER: MovementType[] = ['entrada', 'saida', 'consumo', 'ajuste', 'transferencia', 'estorno'];

function getTypeConfig(type: string) {
  return (
    TYPE_CONFIG[type] ?? {
      badgeClass: 'bg-muted text-foreground border-transparent',
      icon: History,
    }
  );
}

function TypeBadge({ type, label }: { type: string; label: string }) {
  const cfg = getTypeConfig(type);
  const Icon = cfg.icon;
  return (
    <Badge className={cn('gap-1 whitespace-nowrap', cfg.badgeClass)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

/** dd/MM/yyyy HH:mm no fuso DA EMPRESA. Rótulo de exibição do kardex. */
function formatDateTime(iso: string, timezone: string | null | undefined): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const [year, month, day] = dateInTz(d, timezone).split('-');
  return `${day}/${month}/${year} ${timeInTz(d, timezone)}`;
}

/** Texto curto de origem: OS > Fornecedor > notes. */
function originLabel(
  m: InventoryMovementWithRelations,
  tOrigin: { os: string; supplier: string },
): string {
  if (m.service_order_id) {
    return m.orderNumber != null
      ? `${tOrigin.os} ${formatOSNumber(m.orderNumber)}`
      : tOrigin.os;
  }
  if (m.supplier_id) {
    return tOrigin.supplier.replace('{name}', m.supplier?.name ?? '—');
  }
  return m.notes || '—';
}

/**
 * Local de estoque do movimento. Em transferência, mostra o par
 * origem → destino (quem tem quantidade negativa é a origem; positiva é o
 * destino). Cai pro fallback quando um dos lados não é resolvível (ex.: a
 * contraparte não é visível pelo RLS do usuário).
 */
function stockLabel(
  m: InventoryMovementWithRelations,
  t: { stockTransfer: string; stockUnknown: string },
): string {
  const own = m.stock?.name ?? null;
  if (m.movement_type === 'transferencia') {
    const counterpart = m.counterpartStock?.name ?? null;
    if (own && counterpart) {
      const [from, to] = m.quantity < 0 ? [own, counterpart] : [counterpart, own];
      return t.stockTransfer.replace('{from}', from).replace('{to}', to);
    }
    return own ?? counterpart ?? t.stockUnknown;
  }
  return own ?? t.stockUnknown;
}

function stockTransferPair(
  m: InventoryMovementWithRelations,
): { from: string; to: string } | null {
  if (m.movement_type !== 'transferencia') return null;
  const own = m.stock?.name ?? null;
  const counterpart = m.counterpartStock?.name ?? null;
  if (!own || !counterpart) return null;
  const [from, to] = m.quantity < 0 ? [own, counterpart] : [counterpart, own];
  return { from, to };
}

function StockLocation({
  movement,
  fallback,
  fromLabel,
  toLabel,
}: {
  movement: InventoryMovementWithRelations;
  fallback: { stockTransfer: string; stockUnknown: string };
  fromLabel: string;
  toLabel: string;
}) {
  const transfer = stockTransferPair(movement);
  if (!transfer) return <>{stockLabel(movement, fallback)}</>;
  return (
    <span className="grid gap-0.5 leading-tight">
      <span className="truncate">
        <span className="font-semibold text-foreground/80">{fromLabel}:</span> {transfer.from}
      </span>
      <span className="truncate">
        <span className="font-semibold text-foreground/80">{toLabel}:</span> {transfer.to}
      </span>
    </span>
  );
}

function fmtQty(q: number): string {
  // Mostra inteiro limpo; mantém casas só quando houver fração.
  return Number.isInteger(q) ? String(q) : q.toLocaleString('pt-BR');
}

function initials(name: string | null, email: string | null): string {
  const base = (name || email || '?').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function InventoryKardexTab() {
  const { locale, timezone } = useAppLocaleContext();
  const tInv = MESSAGES[locale].app.inventory;
  const t = tInv.kardex;
  const tList = t.listDetail;
  const { movements, isLoading, error: movementsError } = useInventoryMovements();
  const { items, error: inventoryError } = useInventory();
  const [selectedMaterialId, setSelectedMaterialId] = useState('all');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // Período: default "este mês". Filtra por created_at.
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

  const typeOptions = useMemo(() => {
    const present = new Set(movements.map((m) => m.movement_type));
    return TYPE_ORDER.filter((type) => present.has(type)).map((type) => ({
      value: type,
      label: (t.movementTypes as Record<string, string>)[type] ?? type,
    }));
  }, [movements, t.movementTypes]);

  // Locais presentes nas movimentações já carregadas (sem query extra: o
  // hook já resolve `stock` em lote junto do material/criador/fornecedor).
  const stockOptions = useMemo(() => {
    const present = new Map<string, string>();
    movements.forEach((m) => {
      if (m.stock?.name) present.set(m.stock_id, m.stock.name);
    });
    return [...present.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [movements]);

  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [stockFilter, setStockFilter] = useState<string[]>([]);

  const globallyFiltered = useMemo(() => {
    const byDate = filterByDate(movements, 'created_at');
    return byDate.filter((m) => {
      const matchesType = typeFilter.length === 0 || typeFilter.includes(m.movement_type);
      const matchesStock = stockFilter.length === 0 || stockFilter.includes(m.stock_id);
      return matchesType && matchesStock;
    });
  }, [movements, filterByDate, typeFilter, stockFilter]);

  const filtered = useMemo(
    () => selectedMaterialId === 'all'
      ? globallyFiltered
      : globallyFiltered.filter((movement) => movement.inventory_id === selectedMaterialId),
    [globallyFiltered, selectedMaterialId],
  );

  const pagination = useDataPagination(filtered, 25, 'inventory-kardex-movements');
  const { setPage: setMovementPage } = pagination;

  useEffect(() => {
    setMovementPage(1);
  }, [selectedMaterialId, setMovementPage]);

  useEffect(() => {
    if (selectedMaterialId !== 'all' && !items.some((item) => item.id === selectedMaterialId)) {
      setSelectedMaterialId('all');
    }
  }, [items, selectedMaterialId]);

  const activeFilterCount =
    (preset !== 'this_month' ? 1 : 0) +
    (typeFilter.length > 0 ? 1 : 0) +
    (stockFilter.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setPreset('this_month');
    setTypeFilter([]);
    setStockFilter([]);
  };

  const filterControls = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">{t.filters.period}</p>
        <DateRangeFilter
          value={range}
          preset={preset}
          onPresetChange={setPreset}
          onRangeChange={setRange}
        />
      </div>
      {typeOptions.length > 0 && (
        <FilterCheckboxGroup
          label={t.filters.type}
          options={typeOptions}
          selected={typeFilter}
          onChange={setTypeFilter}
          emptyLabel={t.filters.typeEmpty}
        />
      )}
      {stockOptions.length > 0 && (
        <FilterCheckboxGroup
          label={t.filters.stock}
          options={stockOptions}
          selected={stockFilter}
          onChange={setStockFilter}
          emptyLabel={t.filters.stockEmpty}
        />
      )}
    </div>
  );

  const listFilters = (
    <FilterButton activeCount={activeFilterCount} onClear={clearFilters} embedded>
      {filterControls}
    </FilterButton>
  );

  const materialMetrics = useMemo(() => {
    const metrics = new Map<string, { count: number; latest: number }>();
    globallyFiltered.forEach((movement) => {
      const current = metrics.get(movement.inventory_id) ?? { count: 0, latest: 0 };
      metrics.set(movement.inventory_id, {
        count: current.count + 1,
        latest: Math.max(current.latest, new Date(movement.created_at).getTime() || 0),
      });
    });
    return metrics;
  }, [globallyFiltered]);

  const materialItems: ListDetailItem[] = useMemo(
    () => items.map((item) => {
      const count = materialMetrics.get(item.id)?.count ?? 0;
      const detail = [item.sku, item.category].filter(Boolean).join(' · ') || tList.noCode;
      return {
        id: item.id,
        title: item.name,
        subtitle: detail,
        searchText: `${item.sku ?? ''} ${item.category ?? ''}`,
        trailing: (
          <span className="min-w-6 rounded-full border px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        ),
      };
    }),
    [items, materialMetrics, tList.noCode],
  );

  const sortOptions: ListDetailSortOption[] = useMemo(() => {
    const byName = (a: ListDetailItem, b: ListDetailItem) =>
      a.title.localeCompare(b.title, locale, { sensitivity: 'base' });
    return [
      { value: 'name-asc', label: tList.sortNameAsc, shortLabel: 'A-Z', compare: byName },
      { value: 'name-desc', label: tList.sortNameDesc, shortLabel: 'Z-A', compare: (a, b) => byName(b, a) },
      {
        value: 'most-movements',
        label: tList.sortMostMoved,
        compare: (a, b) =>
          (materialMetrics.get(b.id)?.count ?? 0) - (materialMetrics.get(a.id)?.count ?? 0) || byName(a, b),
      },
      {
        value: 'latest',
        label: tList.sortRecent,
        compare: (a, b) =>
          (materialMetrics.get(b.id)?.latest ?? 0) - (materialMetrics.get(a.id)?.latest ?? 0) || byName(a, b),
      },
    ];
  }, [locale, materialMetrics, tList.sortMostMoved, tList.sortNameAsc, tList.sortNameDesc, tList.sortRecent]);

  const selectedMaterial = selectedMaterialId === 'all'
    ? null
    : items.find((item) => item.id === selectedMaterialId) ?? null;

  const generalItem: ListDetailItem = {
    id: 'all',
    title: tList.general,
    emphasized: true,
    subtitle: tList.movementsInPeriod.replace('{count}', String(globallyFiltered.length)),
    leading: (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <History className="h-4 w-4" />
      </span>
    ),
  };

  // ----- Loading -----
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (movementsError || inventoryError) {
    return (
      <EmptyState
        size="compact"
        icon={<History className="h-10 w-10" />}
        title={tList.errorTitle}
        description={tList.errorDescription}
      />
    );
  }

  const showMaterialColumn = selectedMaterialId === 'all';

  return (
    <ListDetailLayout
      items={materialItems}
      pinnedItems={[generalItem]}
      selectedId={selectedMaterialId}
      listTitle={tList.materials}
      listDescription={(items.length === 1 ? tList.materialCountOne : tList.materialCountMany).replace('{count}', String(items.length))}
      listFilters={listFilters}
      sortOptions={sortOptions}
      pageSize={25}
      storageKey="inventory-kardex-materials"
      searchPlaceholder={tList.searchPlaceholder}
      emptyLabel={tList.noMaterial}
      mobileDetailOpen={mobileDetailOpen}
      onSelect={(id) => {
        setSelectedMaterialId(id);
        setMobileDetailOpen(true);
      }}
    >
      <section className="min-w-0 space-y-4" aria-label={tList.detailAria}>
        <div className="flex flex-wrap items-center gap-3 border-b pb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1 lg:hidden"
            onClick={() => setMobileDetailOpen(false)}
          >
            <ArrowLeft className="h-4 w-4" />
            {tList.back}
          </Button>
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 shrink-0 text-primary" />
              <h2 className="truncate text-lg font-semibold">
                {selectedMaterial?.name ?? tList.generalTitle}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedMaterial
                ? [selectedMaterial.sku, selectedMaterial.category].filter(Boolean).join(' · ') || tList.materialDescription
                : tList.generalDescription}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 tabular-nums">
            {(filtered.length === 1 ? tList.movementCountOne : tList.movementCountMany).replace('{count}', String(filtered.length))}
          </Badge>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<History className="h-10 w-10" />}
            title={movements.length === 0 ? t.empty.noneTitle : t.empty.noneFoundTitle}
            description={movements.length === 0 ? t.empty.noneDescription : t.empty.noneFoundDescription}
          />
        ) : (
          <>
            <div className="space-y-2 xl:hidden">
              {pagination.paginatedItems.map((m) => (
                <article key={m.id} className="space-y-3 border-b py-3 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <TypeBadge
                      type={m.movement_type}
                      label={(t.movementTypes as Record<string, string>)[m.movement_type] ?? m.movement_type}
                    />
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(m.created_at, timezone)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    {showMaterialColumn && (
                      <p className="font-medium">{m.material?.name ?? t.materialRemoved}</p>
                    )}
                    {showMaterialColumn && m.material?.sku && (
                      <p className="font-mono text-[11px] text-muted-foreground">{m.material.sku}</p>
                    )}
                    <p className="text-sm text-muted-foreground">{originLabel(m, t.origin)}</p>
                    <div className="text-xs text-muted-foreground">
                      <StockLocation
                        movement={m}
                        fallback={t}
                        fromLabel={tList.from}
                        toLabel={tList.to}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 px-3 py-2 tabular-nums">
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-[10px] text-muted-foreground">{tList.openingBalance}</span>
                      <span className="text-sm text-muted-foreground">{fmtQty(m.stock_before ?? 0)}</span>
                    </span>
                    <span className="min-w-0 text-center">
                      <span className="block truncate text-[10px] text-muted-foreground">{tList.change}</span>
                      <span className={cn('text-sm font-semibold', m.quantity >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {m.quantity >= 0 ? '+' : ''}{fmtQty(m.quantity)}
                      </span>
                    </span>
                    <span className="min-w-0 text-right">
                      <span className="block truncate text-[10px] text-muted-foreground">{tList.closingBalance}</span>
                      <span className="text-sm font-semibold">{fmtQty(m.stock_after ?? 0)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      {m.creator?.avatar_url && <AvatarImage src={m.creator.avatar_url} />}
                      <AvatarFallback className="text-[10px]">
                        {initials(m.creator?.full_name ?? null, m.creator?.email ?? null)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-xs text-muted-foreground">
                      {m.creator?.full_name || m.creator?.email || t.system}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-xl border xl:block">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[14%]">{t.table.dateTime}</TableHead>
                    <TableHead className="w-[15%]">{t.table.type}</TableHead>
                    <TableHead className="w-[24%]">{showMaterialColumn ? tList.materialAndOrigin : t.table.origin}</TableHead>
                    <TableHead className="w-[17%]">{t.table.stock}</TableHead>
                    <TableHead className="w-[10%] text-right">{tList.openingBalance}</TableHead>
                    <TableHead className="w-[10%] text-right">{tList.change}</TableHead>
                    <TableHead className="w-[10%] text-right">{tList.closingBalance}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(m.created_at, timezone)}
                      </TableCell>
                      <TableCell>
                        <TypeBadge
                          type={m.movement_type}
                          label={(t.movementTypes as Record<string, string>)[m.movement_type] ?? m.movement_type}
                        />
                      </TableCell>
                      <TableCell className="min-w-0">
                        {showMaterialColumn && (
                          <p className="truncate text-sm font-medium">{m.material?.name ?? t.materialRemoved}</p>
                        )}
                        <p className={cn('truncate text-xs text-muted-foreground', !showMaterialColumn && 'text-sm text-foreground')}>
                          {originLabel(m, t.origin)}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Avatar className="h-5 w-5">
                            {m.creator?.avatar_url && <AvatarImage src={m.creator.avatar_url} />}
                            <AvatarFallback className="text-[9px]">
                              {initials(m.creator?.full_name ?? null, m.creator?.email ?? null)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{m.creator?.full_name || m.creator?.email || t.system}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <StockLocation
                          movement={m}
                          fallback={t}
                          fromLabel={tList.from}
                          toLabel={tList.to}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {fmtQty(m.stock_before ?? 0)}
                      </TableCell>
                      <TableCell className={cn('text-right text-sm font-semibold tabular-nums', m.quantity >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {m.quantity >= 0 ? '+' : ''}{fmtQty(m.quantity)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {fmtQty(m.stock_after ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

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
          </>
        )}
      </section>
    </ListDetailLayout>
  );
}
