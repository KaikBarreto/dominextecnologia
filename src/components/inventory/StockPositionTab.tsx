import { useState, useMemo } from 'react';
import {
  BarChart3,
  RefreshCw,
  FileDown,
  FileText,
  FileSpreadsheet,
  Search,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { FilterButton } from '@/components/ui/FilterButton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useStockPosition } from '@/hooks/useStockPosition';
import { useStocks } from '@/hooks/useStocks';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useToast } from '@/hooks/use-toast';
import { generateStockPositionPdf } from '@/utils/stockPositionPdfGenerator';
import { generateStockPositionExcel } from '@/utils/stockPositionExcelGenerator';
import { fuzzyIncludes } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

/** Formata timestamp local para o input datetime-local */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converte valor do input datetime-local para ISO (UTC) */
function localInputToIso(val: string): string {
  // val está no fuso local do navegador; toISOString() converte pra UTC
  return new Date(val).toISOString();
}

export function StockPositionTab() {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.stockPosition;
  const { stocks } = useStocks();
  const { groups } = useMaterialGroups();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();
  const { toast } = useToast();

  // Filtro de data (default = agora)
  const [atInput, setAtInput] = useState(() => toLocalInputValue(new Date()));
  const [stockFilter, setStockFilter] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const atIso = localInputToIso(atInput);

  const { rows, isLoading, refetch } = useStockPosition({
    at: atIso,
    stockIds: stockFilter.length > 0 ? stockFilter : null,
  });

  // Filtro client-side por grupo e busca
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (groupFilter.length > 0) {
        // A RPC não retorna group_id — filtramos por material_name/sku já que
        // não temos o group no retorno. Client-side filtra por stockFilter já vai
        // pra RPC; groupFilter só filtra no resultado.
        return true; // sem group_id na resposta, skip group filter silenciosamente
      }
      if (searchQuery) {
        return (
          fuzzyIncludes(r.name, searchQuery) ||
          fuzzyIncludes(r.sku, searchQuery) ||
          fuzzyIncludes(r.stock_name, searchQuery)
        );
      }
      return true;
    }).filter((r) => {
      if (searchQuery) {
        return (
          fuzzyIncludes(r.name, searchQuery) ||
          fuzzyIncludes(r.sku, searchQuery) ||
          fuzzyIncludes(r.stock_name, searchQuery)
        );
      }
      return true;
    });
  }, [rows, searchQuery]);

  const totalValor = filteredRows.reduce((acc, r) => acc + (r.valor ?? 0), 0);
  const totalProjecao = filteredRows.reduce((acc, r) => acc + (r.projecao ?? 0), 0);

  // Usa a moeda do contexto (currency) via formatMoney — não cravar BRL.
  const formatCurrency = (v: number) => formatMoney(v, currency, locale);
  const formatNum = (v: number) =>
    new Intl.NumberFormat(locale === 'pt-br' ? 'pt-BR' : locale, { maximumFractionDigits: 2 }).format(v);

  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      const commonParams = { atDate: atIso, rows: filteredRows, locale, currency };
      if (format === 'pdf') {
        await generateStockPositionPdf({ company: companySettings, whiteLabel: whiteLabelEnabled, ...commonParams });
      } else {
        await generateStockPositionExcel(commonParams);
      }
    } catch {
      toast({ variant: 'destructive', title: t.errorExport });
    }
  };

  const exportDropdown = (compact = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl" aria-label={t.exportLabel}>
            <FileDown className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 min-h-11 rounded-xl">
            <FileDown className="h-4 w-4" /> {t.exportLabel} <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => handleExport('pdf')}
          className="gap-2 cursor-pointer focus:bg-info focus:text-white hover:bg-info hover:text-white"
        >
          <FileText className="h-4 w-4" /> PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('excel')}
          className="gap-2 cursor-pointer focus:bg-success focus:text-white hover:bg-success hover:text-white"
        >
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const hasActiveFilter = stockFilter.length > 0 || searchQuery.length > 0;
  const activeFilterCount = (stockFilter.length > 0 ? 1 : 0) + (searchQuery.length > 0 ? 1 : 0);

  const filterContent = (
    <>
      {stocks.length > 1 && (
        <FilterCheckboxGroup
          label={t.filterStocks}
          options={stocks.map((s) => ({ value: s.id, label: s.name }))}
          selected={stockFilter}
          onChange={setStockFilter}
          emptyLabel={t.filterStocksEmpty}
        />
      )}
    </>
  );

  return (
    <div className="space-y-4">
      {/* Controles de filtro */}
      {isMobile ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t.searchPlaceholder}
                className="pl-10 h-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {stocks.length > 1 && (
              <FilterSheet
                triggerLabel={t.filters}
                activeCount={activeFilterCount}
                onClear={() => { setStockFilter([]); setSearchQuery(''); }}
              >
                {filterContent}
              </FilterSheet>
            )}
            {exportDropdown(true)}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl"
              onClick={() => refetch()}
              aria-label={t.refresh}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <input
            type="datetime-local"
            value={atInput}
            onChange={(e) => setAtInput(e.target.value)}
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative sm:max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t.searchPlaceholder}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <input
            type="datetime-local"
            value={atInput}
            onChange={(e) => setAtInput(e.target.value)}
            className="rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary h-10"
          />
          {stocks.length > 1 && (
            <FilterButton activeCount={activeFilterCount} onClear={() => setStockFilter([])}>
              {filterContent}
            </FilterButton>
          )}
          <div className="ml-auto flex items-center gap-2">
            {exportDropdown()}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 min-h-11 rounded-xl"
              onClick={() => refetch()}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {t.refresh}
            </Button>
          </div>
        </div>
      )}

      {/* Totais */}
      {filteredRows.length > 0 && !isLoading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{t.totalCost}</p>
            <p className="text-base font-bold mt-0.5">{formatCurrency(totalValor)}</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{t.totalSale}</p>
            <p className="text-base font-bold mt-0.5">{formatCurrency(totalProjecao)}</p>
          </div>
        </div>
      )}

      {/* Lista */}
      {isMobile ? (
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filteredRows.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<BarChart3 className="h-10 w-10" />}
              title={hasActiveFilter ? t.empty.noneFoundTitle : t.empty.noneTitle}
              description={hasActiveFilter ? t.empty.noneFoundDescription : t.empty.noneDescription}
            />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              {filteredRows.map((r, i) => (
                <MobileListItem
                  key={`${r.stock_id}-${r.inventory_id}-${i}`}
                  leading={
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                  }
                  title={
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{r.name}</span>
                      {r.sku && (
                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{r.sku}</span>
                      )}
                    </div>
                  }
                  subtitle={`${r.stock_name} · ${formatNum(r.saldo)} ${r.unit}`}
                  trailing={
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(r.valor)}</p>
                      <p className="text-[10px] text-muted-foreground">{t.projLabel}: {formatCurrency(r.projecao)}</p>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {t.cardTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : filteredRows.length === 0 ? (
              <EmptyState
                size="compact"
                icon={<BarChart3 className="h-10 w-10" />}
                title={hasActiveFilter ? t.empty.noneFoundTitle : t.empty.noneTitle}
                description={hasActiveFilter ? t.empty.noneFoundDescription : t.empty.noneDescription}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.colStock}</TableHead>
                      <TableHead>{t.colSku}</TableHead>
                      <TableHead>{t.colMaterial}</TableHead>
                      <TableHead>{t.colUnit}</TableHead>
                      <TableHead className="text-right">{t.colBalance}</TableHead>
                      <TableHead className="text-right">{t.colValue}</TableHead>
                      <TableHead className="text-right">{t.colProjection}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((r, i) => (
                      <TableRow key={`${r.stock_id}-${r.inventory_id}-${i}`}>
                        <TableCell className="text-sm">{r.stock_name}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{r.sku || '—'}</TableCell>
                        <TableCell className="font-medium text-sm">{r.name}</TableCell>
                        <TableCell className="text-sm text-center">{r.unit}</TableCell>
                        <TableCell className="text-right text-sm">{formatNum(r.saldo)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(r.valor)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(r.projecao)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell colSpan={5}>{t.footerTotal}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totalValor)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(totalProjecao)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
