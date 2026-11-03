import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Boxes, PackageSearch, RefreshCw, ShoppingCart, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { SearchField } from '@/components/ui/search-field-actions';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { EmptyState } from '@/components/mobile/EmptyState';
import { InventoryItemThumbnail } from '@/components/inventory/InventoryItemThumbnail';
import { useInventoryAbcReport } from '@/hooks/useInventoryAbcReport';
import { useStocks } from '@/hooks/useStocks';
import { useDataPagination } from '@/hooks/useDataPagination';
import { useTableSort } from '@/hooks/useTableSort';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { fuzzyIncludesAny, cn } from '@/lib/utils';
import {
  classifyInventoryAbc,
  summarizeInventoryAbc,
  type InventoryAbcClass,
  type InventoryAbcRow,
  type InventoryAbcView,
} from '@/lib/inventory-abc';

const CLASS_STYLE: Record<InventoryAbcClass, string> = {
  A: 'bg-emerald-600 text-white hover:bg-emerald-600',
  B: 'bg-amber-500 text-white hover:bg-amber-500',
  C: 'bg-slate-600 text-white hover:bg-slate-600',
};

const VIEW_COPY: Record<InventoryAbcView, {
  metric: string;
  quantity: string;
}> = {
  usage: {
    metric: 'Custo consumido',
    quantity: 'Quantidade usada',
  },
  pdv: {
    metric: 'Faturamento PDV',
    quantity: 'Quantidade vendida',
  },
  stock: {
    metric: 'Capital imobilizado',
    quantity: 'Saldo atual',
  },
};

function classExplanation(abcClass: InventoryAbcClass): string {
  if (abcClass === 'A') return 'Itens que concentram aproximadamente os primeiros 80% do valor.';
  if (abcClass === 'B') return 'Faixa intermediária, aproximadamente entre 80% e 95% acumulados.';
  return 'Itens de menor participação, após aproximadamente 95% acumulados.';
}

function rowInsight(row: InventoryAbcRow, view: InventoryAbcView): { text: string; warning?: boolean } {
  const lowStock = row.minimum_balance > 0 && row.current_balance <= row.minimum_balance;
  if (view === 'pdv') {
    if (row.pdv_margin < 0) return { text: 'Margem negativa: revisar preço e custo', warning: true };
    if (row.abcClass === 'A' && lowStock) return { text: 'Alta venda e risco de ruptura', warning: true };
    if (row.abcClass === 'A') return { text: 'Priorizar disponibilidade no PDV' };
    if (row.abcClass === 'C' && row.current_balance > 0) return { text: 'Revisar espaço e giro no catálogo' };
  }
  if (view === 'usage') {
    if (row.abcClass === 'A' && lowStock) return { text: 'Consumo alto e reposição urgente', warning: true };
    if (row.abcClass === 'A') return { text: 'Planejar compra e estoque de segurança' };
    if (row.abcClass === 'C' && row.current_balance > 0) return { text: 'Verificar excesso ou baixa utilização' };
  }
  if (view === 'stock') {
    if (row.abcClass === 'A' && row.usage_quantity === 0 && row.pdv_quantity === 0) {
      return { text: 'Capital alto sem giro no período', warning: true };
    }
    if (row.abcClass === 'A') return { text: 'Maior impacto no capital imobilizado' };
    if (row.abcClass === 'C' && lowStock) return { text: 'Baixo impacto financeiro; repor por necessidade' };
  }
  return { text: 'Monitoramento periódico' };
}

function AbcClassBadge({ value }: { value: InventoryAbcClass }) {
  return <Badge className={cn('min-w-8 justify-center border-0 font-bold', CLASS_STYLE[value])}>{value}</Badge>;
}

export function InventoryAbcReport() {
  const isMobile = useIsMobile();
  const { money, number } = useLocaleFormatters();
  const { stocks } = useStocks();
  const [view, setView] = useState<InventoryAbcView>('usage');
  const [stockId, setStockId] = useState('all');
  const [search, setSearch] = useState('');
  const [hideZero, setHideZero] = useState(true);
  const dateFilter = useDateRangeFilter('last30');
  const startDate = dateFilter.range.from ? format(dateFilter.range.from, 'yyyy-MM-dd') : undefined;
  const endDate = dateFilter.range.to ? format(dateFilter.range.to, 'yyyy-MM-dd') : undefined;
  const report = useInventoryAbcReport({
    startDate,
    endDate,
    stockIds: stockId === 'all' ? undefined : [stockId],
  });

  const classified = useMemo(
    () => classifyInventoryAbc(report.data ?? [], view),
    [report.data, view],
  );
  const filtered = useMemo(() => classified.filter((row) => {
    if (hideZero && row.metricValue <= 0) return false;
    return !search || fuzzyIncludesAny([row.material_name, row.sku, row.group_name], search);
  }), [classified, hideZero, search]);
  const { sortedItems, sortConfig, handleSort } = useTableSort(filtered, 'metricValue', 'desc');
  const pagination = useDataPagination(sortedItems, 25, `inventory-abc:${view}`);
  const setAbcPage = pagination.setPage;
  const summary = useMemo(() => summarizeInventoryAbc(classified.filter((row) => row.metricValue > 0)), [classified]);
  const totalValue = classified.reduce((sum, row) => sum + row.metricValue, 0);
  const riskCount = classified.filter((row) => rowInsight(row, view).warning).length;

  useEffect(() => setAbcPage(1), [view, stockId, search, hideZero, setAbcPage]);

  const metricCopy = VIEW_COPY[view];
  const secondaryValueLabel = view === 'stock' ? 'Custo unit.' : 'Saldo atual';
  const tertiaryValueLabel = view === 'pdv' ? 'Margem PDV' : view === 'usage' ? 'Custo unit.' : 'Preço de venda';
  const formatPercent = (value: number) => `${number(value * 100, { maximumFractionDigits: 1 })}%`;
  const quantityText = (row: InventoryAbcRow) => `${number(row.quantityValue, { maximumFractionDigits: 3 })} ${row.unit || 'un'}`;

  const rowCells = (row: InventoryAbcRow) => {
    const insight = rowInsight(row, view);
    return {
      insight,
      secondaryValue: view === 'stock' ? money(row.unit_cost) : `${number(row.current_balance, { maximumFractionDigits: 3 })} ${row.unit || 'un'}`,
      tertiaryValue: view === 'pdv' ? money(row.pdv_margin) : view === 'usage' ? money(row.unit_cost) : money(row.sale_price),
    };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold sm:text-xl">Curva ABC do estoque</h2>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap">
          <DateRangeFilter
            value={dateFilter.range}
            preset={dateFilter.preset}
            onPresetChange={dateFilter.setPreset}
            onRangeChange={dateFilter.setRange}
          />
          <Select value={stockId} onValueChange={setStockId}>
            <SelectTrigger className="h-9 w-full sm:w-[190px]" aria-label="Local de estoque">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os locais acessíveis</SelectItem>
              {stocks.map((stock) => <SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void report.refetch()} aria-label="Atualizar Curva ABC">
            <RefreshCw className={cn('h-4 w-4', report.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedControl<InventoryAbcView>
          value={view}
          onValueChange={setView}
          aria-label="Base da Curva ABC"
          size="sm"
          className="w-full lg:max-w-xl"
          options={[
            { value: 'usage', label: 'Saídas e consumo', icon: <Wrench className="h-4 w-4" /> },
            { value: 'pdv', label: 'Vendas PDV', icon: <ShoppingCart className="h-4 w-4" /> },
            { value: 'stock', label: 'Capital em estoque', icon: <Boxes className="h-4 w-4" /> },
          ]}
        />
        {view === 'stock' && (
          <span className="text-xs text-muted-foreground">Saldo atual · período usado apenas para analisar giro</span>
        )}
      </div>

      <div className="flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-[12rem] sm:pr-4">
          <p className="text-xs font-medium text-muted-foreground">{metricCopy.metric}</p>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-xl font-bold tabular-nums">{money(totalValue)}</p>
            <span className="text-xs text-muted-foreground">
              {number(classified.filter((row) => row.metricValue > 0).length)} materiais
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 sm:border-l sm:border-border sm:pl-4">
          {summary.map((item) => (
            <div
              key={item.abcClass}
              className="flex items-center gap-2"
              title={classExplanation(item.abcClass)}
            >
              <AbcClassBadge value={item.abcClass} />
              <span className="font-semibold tabular-nums">{formatPercent(item.share)}</span>
              <span className="text-xs text-muted-foreground">{number(item.itemCount)} itens</span>
            </div>
          ))}
          {riskCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {number(riskCount)} {riskCount === 1 ? 'alerta' : 'alertas'} na lista
            </span>
          )}
        </div>
      </div>

      {report.error && (
        <NoticeBanner variant="destructive" action="Tentar novamente" onClick={() => void report.refetch()}>
          Não foi possível carregar a Curva ABC agora. Tente novamente em instantes.
        </NoticeBanner>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchField
          containerClassName="min-w-0 flex-1 sm:max-w-sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar material, SKU ou grupo"
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={hideZero} onCheckedChange={(value) => setHideZero(value === true)} />
          Ocultar itens sem valor nesta análise
        </label>
      </div>

      {report.isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div>
      ) : !report.error && sortedItems.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<PackageSearch className="h-10 w-10" />}
          title="Nenhum material nesta análise"
          description="Mude o período, o local ou exiba os itens com valor zero."
        />
      ) : isMobile ? (
        <div className="space-y-2">
          {pagination.paginatedItems.map((row) => {
            const cells = rowCells(row);
            return (
              <Card key={row.inventory_id}>
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-start gap-3">
                    <InventoryItemThumbnail name={row.material_name} imageUrl={row.image_url} accentColor={row.group_color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="font-medium">{row.material_name}</p><p className="text-xs text-muted-foreground">{row.sku || 'Sem SKU'} · {row.group_name || 'Sem grupo'}</p></div>
                        <AbcClassBadge value={row.abcClass} />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><span className="text-muted-foreground">{metricCopy.metric}</span><p className="font-semibold">{money(row.metricValue)}</p></div>
                    <div><span className="text-muted-foreground">Participação</span><p className="font-semibold">{formatPercent(row.share)}</p></div>
                    <div><span className="text-muted-foreground">{metricCopy.quantity}</span><p className="font-semibold">{quantityText(row)}</p></div>
                  </div>
                  <p className={cn('flex items-center gap-1.5 text-xs', cells.insight.warning ? 'font-medium text-warning' : 'text-muted-foreground')}>
                    {cells.insight.warning && <AlertTriangle className="h-3.5 w-3.5" />}{cells.insight.text}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="max-h-[65vh] overflow-auto">
              <Table className="min-w-[1120px]">
                <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
                  <TableRow>
                    <SortableTableHead sortKey="material_name" sortConfig={sortConfig} onSort={handleSort}>Material</SortableTableHead>
                    <SortableTableHead sortKey="abcClass" sortConfig={sortConfig} onSort={handleSort}>Classe</SortableTableHead>
                    <SortableTableHead sortKey="metricValue" sortConfig={sortConfig} onSort={handleSort} className="text-right">{metricCopy.metric}</SortableTableHead>
                    <SortableTableHead sortKey="share" sortConfig={sortConfig} onSort={handleSort} className="text-right">Participação</SortableTableHead>
                    <SortableTableHead sortKey="cumulativeShare" sortConfig={sortConfig} onSort={handleSort} className="text-right">Acumulado</SortableTableHead>
                    <SortableTableHead sortKey="quantityValue" sortConfig={sortConfig} onSort={handleSort} className="text-right">{metricCopy.quantity}</SortableTableHead>
                    <SortableTableHead sortKey={view === 'stock' ? 'unit_cost' : 'current_balance'} sortConfig={sortConfig} onSort={handleSort} className="text-right">{secondaryValueLabel}</SortableTableHead>
                    <SortableTableHead sortKey={view === 'pdv' ? 'pdv_margin' : view === 'usage' ? 'unit_cost' : 'sale_price'} sortConfig={sortConfig} onSort={handleSort} className="text-right">{tertiaryValueLabel}</SortableTableHead>
                    <SortableTableHead sortKey="rank" sortConfig={sortConfig} onSort={handleSort}>Leitura recomendada</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((row) => {
                    const cells = rowCells(row);
                    return (
                      <TableRow key={row.inventory_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <InventoryItemThumbnail name={row.material_name} imageUrl={row.image_url} accentColor={row.group_color} className="h-9 w-9" />
                            <div className="min-w-0"><p className="font-medium">{row.material_name}</p><p className="text-xs text-muted-foreground">{row.sku || 'Sem SKU'} · {row.group_name || 'Sem grupo'}</p></div>
                          </div>
                        </TableCell>
                        <TableCell><AbcClassBadge value={row.abcClass} /></TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{money(row.metricValue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(row.share)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatPercent(row.cumulativeShare)}</TableCell>
                        <TableCell className="text-right tabular-nums">{quantityText(row)}</TableCell>
                        <TableCell className="text-right tabular-nums">{cells.secondaryValue}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', view === 'pdv' && row.pdv_margin < 0 && 'font-semibold text-destructive')}>{cells.tertiaryValue}</TableCell>
                        <TableCell><span className={cn('inline-flex items-center gap-1.5 text-xs', cells.insight.warning && 'font-medium text-warning')}>{cells.insight.warning && <AlertTriangle className="h-3.5 w-3.5" />}{cells.insight.text}</span></TableCell>
                      </TableRow>
                    );
                  })}
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

      {isMobile && sortedItems.length > 0 && (
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
      )}
    </div>
  );
}
