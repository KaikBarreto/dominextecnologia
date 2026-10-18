import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, ChevronDown, ChevronRight, FileDown, FileSpreadsheet, FileText,
  PackageCheck, RefreshCw, Search, ShoppingCart, TrendingUp, WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { FilterButton } from '@/components/ui/FilterButton';
import { useMaterialPurchaseReport, type MaterialPurchaseReportRow } from '@/hooks/useMaterialPurchaseReport';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useStocks } from '@/hooks/useStocks';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useUsers } from '@/hooks/useUsers';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { MESSAGES } from '@/lib/i18n/messages';
import { fuzzyIncludes } from '@/lib/utils';
import { todayInTz } from '@/lib/timezone';
import { normalizePaymentMethod } from '@/lib/finance-payment-methods';
import type { SortConfig } from '@/hooks/useTableSort';
import {
  buildPaymentBreakdown,
  groupMaterialPurchaseRows,
  sortMaterialPurchaseRows,
  summarizeMaterialPurchases,
  toMaterialDisplayRows,
  type MaterialPurchaseDisplayRow,
  type MaterialPurchaseReportView,
  type PurchaseReportSortKey,
} from '@/lib/material-purchase-report';
import {
  generateMaterialPurchaseReportExcel,
  generateMaterialPurchaseReportPdf,
  type MaterialPurchaseReportExportData,
} from '@/utils/materialPurchaseReportExport';

type PeriodPreset = '30d' | '90d' | 'year' | 'all' | 'custom';
type ExpandedKpi = 'purchased' | 'projection' | null;

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  colorClass,
  expanded,
  disabled,
  badge,
  onClick,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof ShoppingCart;
  colorClass: string;
  expanded?: boolean;
  disabled?: boolean;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-expanded={disabled ? undefined : expanded}
      className="min-w-0 text-left disabled:cursor-default"
    >
      <Card className={`h-full overflow-hidden transition-colors ${expanded ? 'border-primary ring-1 ring-primary' : ''} ${disabled ? 'opacity-65' : 'hover:border-primary/50'}`}>
        <CardContent className="flex h-full items-start gap-3 p-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white ${colorClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
              {badge && <Badge variant={disabled ? 'muted' : 'warning'} className="text-[10px]">{badge}</Badge>}
            </div>
            <p className="mt-1 truncate text-xl font-bold tabular-nums">{value}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
          </div>
          {!disabled && (expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
        </CardContent>
      </Card>
    </button>
  );
}

export function MaterialPurchaseReportTab() {
  const isMobile = useIsMobile();
  const { locale, currency, timezone } = useAppLocaleContext();
  const { money, date, number } = useLocaleFormatters();
  const t = MESSAGES[locale].app.inventory.purchaseReport;
  const { toast } = useToast();
  const { stocks } = useStocks();
  const { suppliers } = useSuppliers();
  const { groups } = useMaterialGroups();
  const { users } = useUsers();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();

  const today = todayInTz(timezone);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [stockIds, setStockIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [createdByIds, setCreatedByIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = usePersistedState<MaterialPurchaseReportView>('inventory-purchase-report-view', 'material');
  const [hideZero, setHideZero] = usePersistedState('inventory-purchase-report-hide-zero', true);
  const [pageSize, setPageSize] = usePersistedState('inventory-purchase-report-page-size', 10);
  const [sortConfig, setSortConfig] = usePersistedState<SortConfig>('inventory-purchase-report-sort', { key: 'label', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedKpi, setExpandedKpi] = useState<ExpandedKpi>('purchased');

  const report = useMaterialPurchaseReport({
    startDate,
    endDate,
    stockIds,
    supplierIds,
    groupIds,
    createdByIds,
  });
  const rows = useMemo(() => report.data ?? [], [report.data]);

  const applyPeriod = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === 'all') { setStartDate(''); setEndDate(''); }
    if (preset === '30d') { setStartDate(shiftDate(today, -29)); setEndDate(today); }
    if (preset === '90d') { setStartDate(shiftDate(today, -89)); setEndDate(today); }
    if (preset === 'year') { setStartDate(`${today.slice(0, 4)}-01-01`); setEndDate(today); }
  };

  const materialOptions = useMemo(() => rows.map((row) => ({
    value: row.inventory_id,
    label: row.material_name,
    keywords: [row.sku],
  })), [rows]);

  const filteredMaterialRows = useMemo(() => rows.filter((row) => {
    if (materialIds.length > 0 && !materialIds.includes(row.inventory_id)) return false;
    if (hideZero && row.purchased_quantity === 0) return false;
    return !search || fuzzyIncludes(row.material_name, search) || fuzzyIncludes(row.sku, search) || fuzzyIncludes(row.group_name ?? '', search);
  }), [rows, materialIds, hideZero, search]);

  const summary = useMemo(() => summarizeMaterialPurchases(filteredMaterialRows), [filteredMaterialRows]);
  const paymentBreakdown = useMemo(() => buildPaymentBreakdown(filteredMaterialRows), [filteredMaterialRows]);
  const displayRows = useMemo(() => (
    viewMode === 'group'
      ? groupMaterialPurchaseRows(filteredMaterialRows, t.ungrouped)
      : toMaterialDisplayRows(filteredMaterialRows)
  ), [filteredMaterialRows, viewMode, t.ungrouped]);
  const sortedRows = useMemo(() => sortMaterialPurchaseRows(
    displayRows,
    (sortConfig.key || 'label') as PurchaseReportSortKey,
    sortConfig.direction === 'desc' ? 'desc' : 'asc',
  ), [displayRows, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const visibleTotal = pageRows.reduce((sum, row) => sum + row.purchased_total, 0);
  const activeFilterCount = [materialIds, supplierIds, stockIds, groupIds, createdByIds]
    .filter((value) => value.length > 0).length;
  const units = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of filteredMaterialRows) {
      if (row.purchased_quantity > 0) map.set(row.unit, (map.get(row.unit) ?? 0) + row.purchased_quantity);
    }
    return [...map.entries()];
  }, [filteredMaterialRows]);
  const pricedCoverage = summary.purchasedQuantity > 0
    ? (filteredMaterialRows.reduce((sum, row) => sum + row.priced_quantity, 0) / summary.purchasedQuantity) * 100
    : 100;

  useEffect(() => { setPage(1); }, [search, materialIds, supplierIds, stockIds, groupIds, createdByIds, hideZero, viewMode, pageSize, sortConfig]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleRow = (id: string) => setExpandedRows((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSort = (key: string) => setSortConfig((current) => {
    if (current.key !== key) return { key, direction: 'asc' };
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  });

  const paymentLabel = (key: string) => {
    if (key === 'pending') return t.payments.pending;
    if (key === 'not_informed') return t.payments.notLinked;
    const normalized = normalizePaymentMethod(key);
    return normalized ? t.payments.methods[normalized] : key;
  };

  const clearFilters = () => {
    setMaterialIds([]); setSupplierIds([]); setStockIds([]); setGroupIds([]); setCreatedByIds([]);
  };

  const filterLabels = {
    period: startDate || endDate ? `${startDate || '…'} — ${endDate || '…'}` : t.periods.all,
    materials: materialOptions.filter((item) => materialIds.includes(item.value)).map((item) => item.label),
    suppliers: suppliers.filter((item) => supplierIds.includes(item.id)).map((item) => item.name),
    stocks: stocks.filter((item) => stockIds.includes(item.id)).map((item) => item.name),
    groups: groups.filter((item) => groupIds.includes(item.id)).map((item) => item.name),
    users: users.filter((item) => createdByIds.includes(item.user_id)).map((item) => item.full_name),
    hideZero,
    search,
  };

  const exportData: MaterialPurchaseReportExportData = {
    company: companySettings,
    whiteLabel: whiteLabelEnabled,
    materialRows: filteredMaterialRows,
    displayRows: sortedRows,
    viewMode,
    summary,
    filters: filterLabels,
    locale,
    currency,
    timezone,
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      if (format === 'pdf') await generateMaterialPurchaseReportPdf(exportData);
      else await generateMaterialPurchaseReportExcel(exportData);
    } catch {
      toast({ variant: 'destructive', title: t.exportError });
    }
  };

  const filters = (
    <>
      <FilterCheckboxGroup label={t.filters.materials} options={materialOptions} selected={materialIds} onChange={setMaterialIds} emptyLabel={t.filters.allMaterials} />
      <FilterCheckboxGroup label={t.filters.suppliers} options={suppliers.map((item) => ({ value: item.id, label: item.name }))} selected={supplierIds} onChange={setSupplierIds} emptyLabel={t.filters.allSuppliers} />
      <FilterCheckboxGroup label={t.filters.stocks} options={stocks.map((item) => ({ value: item.id, label: item.name }))} selected={stockIds} onChange={setStockIds} emptyLabel={t.filters.allStocks} />
      <FilterCheckboxGroup label={t.filters.groups} options={groups.map((item) => ({ value: item.id, label: item.name, color: item.color }))} selected={groupIds} onChange={setGroupIds} emptyLabel={t.filters.allGroups} />
      <FilterCheckboxGroup label={t.filters.users} options={users.map((item) => ({ value: item.user_id, label: item.full_name }))} selected={createdByIds} onChange={setCreatedByIds} emptyLabel={t.filters.allUsers} />
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t.filters.customers}:</span> {t.filters.customersPdv}
      </div>
      <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
        <Checkbox checked={hideZero} onCheckedChange={(checked) => setHideZero(checked === true)} />
        <span>{t.filters.hideZero}</span>
      </label>
    </>
  );

  const renderHistory = (row: MaterialPurchaseDisplayRow) => (
    <div className="space-y-2">
      {row.materials && row.materials.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {row.materials.map((material) => (
            <div key={material.inventory_id} className="rounded-md border bg-background p-2 text-xs">
              <div className="font-medium">{material.material_name}</div>
              <div className="mt-1 flex justify-between text-muted-foreground"><span>{number(material.purchased_quantity)} {material.unit}</span><span>{money(material.purchased_total)}</span></div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.history.title}</p>
      {row.history.length === 0 ? <p className="text-xs text-muted-foreground">{t.history.empty}</p> : row.history.map((item, index) => (
        <div key={`${item.order_id}-${item.date}-${index}`} className="grid gap-1 rounded-md border bg-background p-2 text-xs md:grid-cols-[95px_1fr_1fr_1fr_auto_auto] md:items-center">
          <span>{date(item.date)}</span>
          <span className="font-medium">{item.supplier_name}</span>
          <span className="text-muted-foreground">{item.stock_name} · O.C. #{item.order_number}</span>
          <span className="text-muted-foreground">{item.created_by_name} · {paymentLabel(item.payment_status === 'pendente' ? 'pending' : item.payment_status === 'pago' ? item.payment_method || 'not_informed' : 'not_informed')}</span>
          <span>{number(item.quantity)} {item.unit || row.unit || ''} × {item.unit_price == null ? t.notInformed : money(item.unit_price)}</span>
          <span className="font-semibold">{item.total == null ? t.notInformed : money(item.total)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold sm:text-xl">{t.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodPreset} onValueChange={(value) => applyPeriod(value as PeriodPreset)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">{t.periods.last30}</SelectItem><SelectItem value="90d">{t.periods.last90}</SelectItem>
              <SelectItem value="year">{t.periods.year}</SelectItem><SelectItem value="all">{t.periods.all}</SelectItem><SelectItem value="custom">{t.periods.custom}</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="gap-2"><FileDown className="h-4 w-4" />{t.export}</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleExport('pdf')} className="gap-2"><FileText className="h-4 w-4" />PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleExport('excel')} className="gap-2"><FileSpreadsheet className="h-4 w-4" />Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="icon" onClick={() => void report.refetch()} aria-label={t.refresh}><RefreshCw className={`h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} /></Button>
        </div>
      </div>

      {(periodPreset === 'custom' || startDate || endDate) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Par de filtros sem `<Label>` visível: quem nomeia os dois campos
              pro leitor de tela é o `ariaLabel`. */}
          <DatePicker
            value={startDate}
            onValueChange={(value) => { setPeriodPreset('custom'); setStartDate(value); }}
            max={endDate || today}
            placeholder={MESSAGES[locale].app.common.datePicker.placeholder}
            ariaLabel={t.startDate}
            clearable
            clearLabel={MESSAGES[locale].app.common.clear}
          />
          <span className="hidden text-muted-foreground sm:inline">—</span>
          <DatePicker
            value={endDate}
            onValueChange={(value) => { setPeriodPreset('custom'); setEndDate(value); }}
            min={startDate || undefined}
            max={today}
            placeholder={MESSAGES[locale].app.common.datePicker.placeholder}
            ariaLabel={t.endDate}
            clearable
            clearLabel={MESSAGES[locale].app.common.clear}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title={t.kpis.purchased} value={money(summary.purchasedTotal)} description={t.kpis.purchaseCount.replace('{count}', number(summary.purchaseCount))} icon={ShoppingCart} colorClass="bg-primary" expanded={expandedKpi === 'purchased'} onClick={() => setExpandedKpi((value) => value === 'purchased' ? null : 'purchased')} />
        <MetricCard title={t.kpis.sold} value="—" description={t.kpis.pdvDescription} icon={WalletCards} colorClass="bg-info" disabled badge={t.kpis.pdv} />
        <MetricCard title={t.kpis.grossProfit} value="—" description={t.kpis.pdvDescription} icon={TrendingUp} colorClass="bg-success" disabled badge={t.kpis.pdv} />
        <MetricCard title={t.kpis.projection} value={money(summary.projectedProfit)} description={t.kpis.projectionDescription} icon={BarChart3} colorClass="bg-warning" badge={t.estimate} expanded={expandedKpi === 'projection'} onClick={() => setExpandedKpi((value) => value === 'projection' ? null : 'projection')} />
      </div>

      {expandedKpi === 'purchased' && (
        <Card><CardContent className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">{t.details.averageTicket}</p><p className="font-semibold tabular-nums">{money(summary.averagePurchaseTicket)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t.details.materials}</p><p className="font-semibold tabular-nums">{number(summary.materialCount)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t.details.topMaterial}</p><p className="truncate font-semibold">{summary.topMaterial?.material_name ?? '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">{t.details.priceCoverage}</p><p className="font-semibold tabular-nums">{number(pricedCoverage, { maximumFractionDigits: 1 })}%</p></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.details.quantityByUnit}</p><div className="flex flex-wrap gap-2">{units.map(([unit, value]) => <Badge key={unit} variant="outline">{number(value)} {unit}</Badge>)}</div></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.details.payments}</p><div className="space-y-2">{paymentBreakdown.length === 0 ? <p className="text-xs text-muted-foreground">{t.details.noPayments}</p> : paymentBreakdown.map((item) => <div key={item.key}><div className="flex justify-between gap-2 text-xs"><span>{paymentLabel(item.key)} · {item.purchaseCount}</span><span className="font-medium">{money(item.amount)} · {number(item.percentage, { maximumFractionDigits: 1 })}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, item.percentage)}%` }} /></div></div>)}</div></div>
          </div>
        </CardContent></Card>
      )}

      {expandedKpi === 'projection' && (
        <NoticeBanner variant="warning" title={t.details.projectionTitle}>{t.details.projectionExplanation.replace('{value}', money(summary.projectedSaleTotal)).replace('{margin}', `${number(summary.projectedMargin, { maximumFractionDigits: 1 })}%`)}</NoticeBanner>
      )}

      {pricedCoverage < 100 && <NoticeBanner variant="warning">{t.priceCoverageWarning.replace('{coverage}', `${number(pricedCoverage, { maximumFractionDigits: 1 })}%`)}</NoticeBanner>}
      {report.error && <NoticeBanner variant="destructive" action={t.retry} onClick={() => void report.refetch()}>{t.loadError}</NoticeBanner>}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlaceholder} className="pl-9" /></div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterButton activeCount={activeFilterCount} onClear={clearFilters}>{filters}</FilterButton>
          <SegmentedControl value={viewMode} onValueChange={(value) => setViewMode(value as MaterialPurchaseReportView)} size="sm" aria-label={t.view.label} className="min-w-[210px]" options={[{ value: 'material', label: t.view.material }, { value: 'group', label: t.view.group }]} />
        </div>
      </div>

      {report.isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div>
      ) : sortedRows.length === 0 ? (
        <EmptyState size="compact" icon={<BarChart3 className="h-10 w-10" />} title={t.emptyTitle} description={hideZero ? t.emptyDescriptionHidden : t.emptyDescription} />
      ) : isMobile ? (
        <div className="space-y-2">
          {pageRows.map((row) => <Card key={row.id}><CardContent className="p-0"><button type="button" className="flex w-full items-start gap-3 p-3 text-left" onClick={() => toggleRow(row.id)}><div className="mt-0.5">{expandedRows.has(row.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate font-medium">{row.label}</span>{row.group_color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.group_color }} />}</div><p className="text-xs text-muted-foreground">{viewMode === 'group' ? t.materialCount.replace('{count}', number(row.material_count)) : `${row.sku || '—'} · ${row.unit}`}</p><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><span className="text-muted-foreground">{t.table.quantity}</span><p className="font-medium">{viewMode === 'group' && !row.unit ? '—' : `${number(row.purchased_quantity)} ${row.unit}`}</p></div><div><span className="text-muted-foreground">{t.table.total}</span><p className="font-medium">{money(row.purchased_total)}</p></div><div><span className="text-muted-foreground">{t.table.average}</span><p className="font-medium">{row.average_paid == null ? t.notInformed : money(row.average_paid)}</p></div></div></div></button>{expandedRows.has(row.id) && <div className="border-t p-3">{renderHistory(row)}</div>}</CardContent></Card>)}
        </div>
      ) : (
        <Card className="overflow-hidden"><CardContent className="p-0"><div className="max-h-[65vh] overflow-auto"><Table className="min-w-[1320px]"><TableHeader className="sticky top-0 z-10 bg-background shadow-sm"><TableRow><TableHead className="w-8" /><SortableTableHead sortKey="label" sortConfig={sortConfig} onSort={handleSort}>{viewMode === 'group' ? t.table.group : t.table.material}</SortableTableHead><SortableTableHead sortKey="last_purchase_date" sortConfig={sortConfig} onSort={handleSort}>{t.table.lastPurchase}</SortableTableHead><SortableTableHead sortKey="purchase_count" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.purchases}</SortableTableHead><SortableTableHead sortKey="purchased_quantity" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.quantity}</SortableTableHead><SortableTableHead sortKey="purchased_total" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.total}</SortableTableHead><SortableTableHead sortKey="average_paid" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.average}</SortableTableHead><SortableTableHead sortKey="current_balance" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.balance}</SortableTableHead><TableHead className="text-right">{t.table.soldQuantity}</TableHead><TableHead className="text-right">{t.table.soldTotal}</TableHead><SortableTableHead sortKey="projected_profit" sortConfig={sortConfig} onSort={handleSort} className="text-right">{t.table.projection}</SortableTableHead></TableRow></TableHeader><TableBody>
          {pageRows.flatMap((row) => [<TableRow key={row.id} className="cursor-pointer" onClick={() => toggleRow(row.id)}><TableCell>{expandedRows.has(row.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell><TableCell><div className="flex items-center gap-2 font-medium">{row.group_color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.group_color }} />}{row.label}</div><div className="text-xs text-muted-foreground">{viewMode === 'group' ? t.materialCount.replace('{count}', number(row.material_count)) : `${row.sku || '—'} · ${row.group_name || t.ungrouped}`}</div></TableCell><TableCell>{row.last_purchase_date ? date(row.last_purchase_date) : '—'}</TableCell><TableCell className="text-right tabular-nums">{number(row.purchase_count)}</TableCell><TableCell className="text-right tabular-nums">{viewMode === 'group' && !row.unit ? '—' : <>{number(row.purchased_quantity)} {row.unit}</>}</TableCell><TableCell className="text-right font-medium tabular-nums">{money(row.purchased_total)}</TableCell><TableCell className="text-right tabular-nums">{row.average_paid == null ? t.notInformed : money(row.average_paid)}</TableCell><TableCell className="text-right tabular-nums">{viewMode === 'group' && !row.unit ? '—' : number(row.current_balance)}</TableCell><TableCell className="text-right text-muted-foreground">— <Badge variant="muted" className="ml-1 text-[9px]">PDV</Badge></TableCell><TableCell className="text-right text-muted-foreground">—</TableCell><TableCell className="text-right font-medium tabular-nums">{money(row.projected_profit)}</TableCell></TableRow>, expandedRows.has(row.id) ? <TableRow key={`${row.id}-details`} className="bg-muted/20"><TableCell colSpan={11} className="p-4">{renderHistory(row)}</TableCell></TableRow> : null])}
          <TableRow className="bg-muted/40 font-semibold"><TableCell colSpan={5}>{t.visibleTotal}</TableCell><TableCell className="text-right">{money(visibleTotal)}</TableCell><TableCell colSpan={5} /></TableRow>
        </TableBody></Table></div></CardContent></Card>
      )}

      {sortedRows.length > 0 && <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">{t.pagination.showing.replace('{from}', number((page - 1) * pageSize + 1)).replace('{to}', number(Math.min(page * pageSize, sortedRows.length))).replace('{total}', number(sortedRows.length))}</p><div className="flex items-center gap-2"><Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}><SelectTrigger className="w-[105px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10 / pág.</SelectItem><SelectItem value="25">25 / pág.</SelectItem><SelectItem value="50">50 / pág.</SelectItem></SelectContent></Select><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t.pagination.previous}</Button><span className="text-xs tabular-nums">{page}/{totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>{t.pagination.next}</Button></div></div>}
    </div>
  );
}
