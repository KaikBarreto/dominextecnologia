import { useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  SlidersHorizontal,
  ArrowRightLeft,
  RotateCcw,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterButton } from '@/components/ui/FilterButton';
import { FilterSheet } from '@/components/mobile/FilterSheet';
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
import { MESSAGES } from '@/lib/i18n/messages';

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
  ajuste: { badgeClass: 'bg-purple-600 hover:bg-purple-600 text-white border-transparent', icon: SlidersHorizontal },
  transferencia: { badgeClass: 'bg-amber-600 hover:bg-amber-600 text-white border-transparent', icon: ArrowRightLeft },
  estorno: { badgeClass: 'bg-red-600 hover:bg-red-600 text-white border-transparent', icon: RotateCcw },
};

const TYPE_ORDER: MovementType[] = ['entrada', 'saida', 'ajuste', 'transferencia', 'estorno'];

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

/** dd/MM/yyyy HH:mm no fuso de Brasília. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

/** Texto curto de origem: OS > Fornecedor > notes. */
function originLabel(
  m: InventoryMovementWithRelations,
  tOrigin: { os: string; supplier: string },
): string {
  if (m.service_order_id) {
    return m.orderNumber != null
      ? `${tOrigin.os} #${String(m.orderNumber).padStart(6, '0')}`
      : tOrigin.os;
  }
  if (m.supplier_id) {
    return tOrigin.supplier.replace('{name}', m.supplier?.name ?? '—');
  }
  return m.notes || '—';
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
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const tInv = MESSAGES[locale].app.inventory;
  const t = tInv.kardex;
  const { movements, isLoading } = useInventoryMovements();
  const { items } = useInventory();

  // Período: default "este mês". Filtra por created_at.
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

  // Material (multi) + Tipo (multi). Vazio = mostra tudo.
  // Fonte = TODOS os materiais do estoque (não só os que têm movimentação),
  // pra o gestor poder filtrar mesmo item que ainda não movimentou.
  const materialOptions = useMemo(
    () =>
      items
        .map((item) => ({
          value: item.id,
          label: item.sku ? `${item.name} (${item.sku})` : item.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [items],
  );

  const typeOptions = useMemo(() => {
    const present = new Set(movements.map((m) => m.movement_type));
    return TYPE_ORDER.filter((type) => present.has(type)).map((type) => ({
      value: type,
      label: (t.movementTypes as Record<string, string>)[type] ?? type,
    }));
  }, [movements, t.movementTypes]);

  const [materialFilter, setMaterialFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const byDate = filterByDate(movements, 'created_at');
    return byDate.filter((m) => {
      const matchesMaterial = materialFilter.length === 0 || materialFilter.includes(m.inventory_id);
      const matchesType = typeFilter.length === 0 || typeFilter.includes(m.movement_type);
      return matchesMaterial && matchesType;
    });
  }, [movements, filterByDate, materialFilter, typeFilter]);

  const pagination = useDataPagination(filtered);

  const activeFilterCount =
    (preset !== 'this_month' ? 1 : 0) +
    (materialFilter.length > 0 ? 1 : 0) +
    (typeFilter.length > 0 ? 1 : 0);

  const clearFilters = () => {
    setPreset('this_month');
    setMaterialFilter([]);
    setTypeFilter([]);
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
      {materialOptions.length > 0 && (
        <FilterCheckboxGroup
          label={t.filters.material}
          options={materialOptions}
          selected={materialFilter}
          onChange={setMaterialFilter}
          emptyLabel={t.filters.materialEmpty}
        />
      )}
      {typeOptions.length > 0 && (
        <FilterCheckboxGroup
          label={t.filters.type}
          options={typeOptions}
          selected={typeFilter}
          onChange={setTypeFilter}
          emptyLabel={t.filters.typeEmpty}
        />
      )}
    </div>
  );

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

  const isEmpty = movements.length === 0;
  const isFilteredEmpty = !isEmpty && filtered.length === 0;

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="flex items-center justify-end gap-2">
        {isMobile ? (
          <FilterSheet
            triggerLabel={tInv.filters.button}
            activeCount={activeFilterCount}
            onClear={clearFilters}
          >
            {filterControls}
          </FilterSheet>
        ) : (
          <FilterButton activeCount={activeFilterCount} onClear={clearFilters}>
            {filterControls}
          </FilterButton>
        )}
      </div>

      {isEmpty ? (
        <EmptyState
          size="compact"
          icon={<History className="h-10 w-10" />}
          title={t.empty.noneTitle}
          description={t.empty.noneDescription}
        />
      ) : isFilteredEmpty ? (
        <EmptyState
          size="compact"
          icon={<History className="h-10 w-10" />}
          title={t.empty.noneFoundTitle}
          description={t.empty.noneFoundDescription}
        />
      ) : isMobile ? (
        // -------------------- Mobile: cards --------------------
        <>
          <div className="space-y-2">
            {pagination.paginatedItems.map((m) => (
              <div key={m.id} className="rounded-xl border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <TypeBadge
                    type={m.movement_type}
                    label={(t.movementTypes as Record<string, string>)[m.movement_type] ?? m.movement_type}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(m.created_at)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{m.material?.name ?? t.materialRemoved}</p>
                  {m.material?.sku && (
                    <p className="font-mono text-[11px] text-muted-foreground">{m.material.sku}</p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">{originLabel(m, t.origin)}</p>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm tabular-nums">
                  <span className="text-muted-foreground">{fmtQty(m.stock_before ?? 0)}</span>
                  <span
                    className={cn(
                      'font-semibold',
                      m.quantity >= 0 ? 'text-emerald-600' : 'text-red-600',
                    )}
                  >
                    {m.quantity >= 0 ? '+' : ''}{fmtQty(m.quantity)}
                  </span>
                  <span className="font-semibold">{fmtQty(m.stock_after ?? 0)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    {m.creator?.avatar_url && <AvatarImage src={m.creator.avatar_url} />}
                    <AvatarFallback className="text-[10px]">
                      {initials(m.creator?.full_name ?? null, m.creator?.email ?? null)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground truncate">
                    {m.creator?.full_name || m.creator?.email || t.system}
                  </span>
                </div>
              </div>
            ))}
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
      ) : (
        // -------------------- Desktop: tabela --------------------
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {t.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.table.user}</TableHead>
                    <TableHead>{t.table.dateTime}</TableHead>
                    <TableHead>{t.table.type}</TableHead>
                    <TableHead>{t.table.origin}</TableHead>
                    <TableHead>{t.table.material}</TableHead>
                    <TableHead className="text-right">{t.table.stockBefore}</TableHead>
                    <TableHead className="text-right">{t.table.movement}</TableHead>
                    <TableHead className="text-right">{t.table.stockAfter}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-7 w-7">
                            {m.creator?.avatar_url && <AvatarImage src={m.creator.avatar_url} />}
                            <AvatarFallback className="text-[10px]">
                              {initials(m.creator?.full_name ?? null, m.creator?.email ?? null)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate max-w-[140px]">
                            {m.creator?.full_name || m.creator?.email || t.system}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(m.created_at)}
                      </TableCell>
                      <TableCell>
                        <TypeBadge
                          type={m.movement_type}
                          label={(t.movementTypes as Record<string, string>)[m.movement_type] ?? m.movement_type}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {originLabel(m, t.origin)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">
                            {m.material?.name ?? t.materialRemoved}
                          </span>
                          {m.material?.sku && (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {m.material.sku}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtQty(m.stock_before ?? 0)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums font-semibold',
                          m.quantity >= 0 ? 'text-emerald-600' : 'text-red-600',
                        )}
                      >
                        {m.quantity >= 0 ? '+' : ''}{fmtQty(m.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
