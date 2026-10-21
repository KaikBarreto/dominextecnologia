import { useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowDownToLine,
  ArrowUpCircle,
  Banknote,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  PiggyBank,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CashFlowForecast } from './CashFlowForecast';
import { DfcHierarchyTable, type DfcHierarchyRow, type DfcHierarchySection } from './DfcHierarchyTable';
import { FilterCheckboxDropdown } from './FilterCheckboxDropdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useCostCenters } from '@/hooks/useCostCenters';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import type { FinancialTransaction } from '@/types/database';
import {
  calculateDfc,
  DFC_GROUP_KEYS,
  DFC_UNCLASSIFIED_FALLBACK,
  type DfcCategoryLine,
  type DfcGroupKey,
} from '@/lib/dfc';
import { buildCategoryTree, groupDreRowsByParent } from '@/lib/category-tree';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { toBcp47 } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errorMessages';
import {
  exportDfcCsv,
  exportDfcExcel,
  exportDfcPdf,
  type DfcExportData,
} from '@/utils/dfcExport';
import { getCategoryIcon } from './categoryIcons';
import dominexLogoUrl from '@/assets/logo-white-horizontal.png';

type DfcTransaction = FinancialTransaction & {
  dfc_group?: DfcGroupKey | null;
};

type DfcUiCategory = DfcCategoryLine<DfcTransaction> & {
  key: string;
  value: number;
};

interface FinanceDFCProps {
  /**
   * Lista crua do histórico disponível, não apenas os itens já cortados pelo
   * seletor. O motor usa as baixas anteriores a `range.from` no saldo inicial.
   */
  transactions: FinancialTransaction[];
  /** Período herdado do filtro da página. Limites ausentes = todo o histórico. */
  range?: DateRange;
  /** Permite que a página mantenha o skeleton enquanto carrega os lançamentos. */
  isLoading?: boolean;
}

const FALLBACK_CATEGORY_COLOR = '#6b7280';

function toDateOnly(value?: Date): string | undefined {
  if (!value || Number.isNaN(value.getTime())) return undefined;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function signedTransactionAmount(transaction: FinancialTransaction): number {
  const amount = Math.abs(Number(transaction.amount) || 0);
  return transaction.transaction_type === 'entrada' ? amount : -amount;
}

function resolveDfcGroup(value: string | null | undefined): DfcGroupKey {
  return (DFC_GROUP_KEYS as readonly string[]).includes(value ?? '')
    ? value as DfcGroupKey
    : DFC_UNCLASSIFIED_FALLBACK;
}

export function FinanceDFC({ transactions, range, isLoading = false }: FinanceDFCProps) {
  /**
   * Duas lentes sobre o mesmo assunto, e as duas têm razão de existir:
   *
   * - **Previsto** é o que o dono olha todo dia: os próximos 15 dias, dia a
   *   dia, com o que vai entrar, o que vai sair e o que já venceu. É o padrão.
   * - **Realizado** é o demonstrativo contábil pelo método direto, agrupado
   *   por atividade. Não se joga fora: é o que o contador pede.
   *
   * Elas usam motores DIFERENTES de propósito (ver o aviso no topo de
   * `src/lib/cash-flow-forecast.ts`).
   */
  const [lente, setLente] = useState<'previsto' | 'realizado'>('previsto');
  const { categories, isLoading: isLoadingCategories } = useFinancialCategories();
  const { accounts, isLoading: isLoadingAccounts } = useFinancialAccounts();
  const { costCenters, isLoading: isLoadingCostCenters } = useCostCenters();
  const { settings, isLoading: isLoadingCompany } = useCompanySettings();
  const { money, date } = useLocaleFormatters();
  const { locale, currency } = useAppLocaleContext();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [selectedCostCenters, setSelectedCostCenters] = useState<string[]>([]);

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const categoryParentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((category) => {
      const parent = categoryTree.parentOf(category);
      if (parent) map.set(category.name, parent.name);
    });
    return map;
  }, [categories, categoryTree]);
  const categoryMetaMap = useMemo(
    () => new Map(categories.map((category) => [category.name, category])),
    [categories],
  );
  const costCenterMetaMap = useMemo(() => new Map(costCenters.map((center) => [center.id, center])), [costCenters]);

  // `financial_transactions.category` persiste o nome da folha. O grupo vem
  // da categoria do mesmo tenant já carregada pelo hook; o motor segue puro.
  const enrichedTransactions = useMemo<DfcTransaction[]>(() => {
    const groupByCategoryName = new Map(
      categories.map((category) => [category.name, category.dfc_group]),
    );
    return transactions.map((transaction) => ({
      ...transaction,
      dfc_group: groupByCategoryName.get(transaction.category ?? '') ?? null,
    })).filter((transaction) => selectedCostCenters.length === 0
      || selectedCostCenters.includes(transaction.cost_center_id ?? '__none__'));
  }, [categories, selectedCostCenters, transactions]);

  const normalizedRange = useMemo(
    () => ({ from: toDateOnly(range?.from), to: toDateOnly(range?.to) }),
    [range?.from, range?.to],
  );
  const baseBalance = useMemo(
    () => accounts
      .filter((account) => account.type !== 'cartao')
      .reduce((total, account) => total + Number(account.initial_balance || 0), 0),
    [accounts],
  );
  const report = useMemo(
    () => calculateDfc(enrichedTransactions, normalizedRange, baseBalance),
    [baseBalance, enrichedTransactions, normalizedRange],
  );

  const groupNodes = useMemo(() => {
    const nodes = new Map<DfcGroupKey, DreRowNode<DfcUiCategory>[]>();
    report.groups.forEach((group) => {
      const rows: DfcUiCategory[] = group.categories.map((category) => ({
        ...category,
        key: `${group.key}:${category.name}`,
        value: category.total,
      })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      nodes.set(group.key, groupDreRowsByParent(rows, {
        parentNameOf: (name) => categoryParentNameMap.get(name) ?? null,
        parentInSameGroup: (parentName) =>
          resolveDfcGroup(categoryMetaMap.get(parentName)?.dfc_group) === group.key,
        makeKey: (name) => `${group.key}:${name}`,
      }));
    });
    return nodes;
  }, [categoryMetaMap, categoryParentNameMap, report.groups]);

  const movementCount = useMemo(
    () => report.groups.reduce(
      (groupCount, group) => groupCount + group.categories.reduce(
        (categoryCount, category) => categoryCount + category.transactions.length,
        0,
      ),
      0,
    ),
    [report.groups],
  );

  const hierarchySections = useMemo<DfcHierarchySection[]>(() => {
    const valueOf = (items: DfcTransaction[]) => {
      let inflow = 0;
      let outflow = 0;
      items.forEach((transaction) => {
        const amount = Math.abs(Number(transaction.amount) || 0);
        if (transaction.transaction_type === 'entrada') inflow += amount;
        else outflow += amount;
      });
      return { inflow, outflow, net: inflow - outflow };
    };
    const rowOf = (row: DfcUiCategory, code: string): DfcHierarchyRow => {
      const meta = categoryMetaMap.get(row.name);
      return {
        id: row.key,
        code,
        label: row.name,
        ...valueOf(row.transactions),
        color: meta?.color || FALLBACK_CATEGORY_COLOR,
        icon: getCategoryIcon(meta?.icon),
      };
    };

    return report.groups.map((group, groupIndex) => {
      const nodes = groupNodes.get(group.key) ?? [];
      const rows = nodes.map((node, rowIndex): DfcHierarchyRow => {
        const rowCode = `${String(groupIndex + 1).padStart(2, '0')}.${String(rowIndex + 1).padStart(2, '0')}`;
        if (node.kind === 'leaf') return rowOf(node.row, rowCode);
        const allTransactions = [
          ...(node.own?.transactions ?? []),
          ...node.children.flatMap((child) => child.transactions),
        ];
        const meta = categoryMetaMap.get(node.name);
        return {
          id: node.key,
          code: rowCode,
          label: node.name,
          ...valueOf(allTransactions),
          color: meta?.color || FALLBACK_CATEGORY_COLOR,
          icon: getCategoryIcon(meta?.icon),
          children: [
            ...(node.own ? [rowOf(node.own, `${rowCode}.001`)] : []),
            ...node.children.map((child, childIndex) => rowOf(
              child,
              `${rowCode}.${String(childIndex + (node.own ? 2 : 1)).padStart(3, '0')}`,
            )),
          ],
        };
      });
      const allTransactions = group.categories.flatMap((category) => category.transactions);
      return {
        id: group.key,
        code: String(groupIndex + 1).padStart(2, '0'),
        label: group.label,
        ...valueOf(allTransactions),
        rows,
      };
    });
  }, [categoryMetaMap, groupNodes, report.groups]);
  const periodLabel = useMemo(() => {
    if (range?.from && range?.to) return `${date(range.from)} a ${date(range.to)}`;
    if (range?.from) return `A partir de ${date(range.from)}`;
    if (range?.to) return `Até ${date(range.to)}`;
    return 'Todo o histórico';
  }, [date, range?.from, range?.to]);

  const buildExportData = (): DfcExportData => {
    const movements: DfcExportData['movements'] = [];
    report.groups.forEach((group) => {
      group.categories.forEach((category) => {
        category.transactions.forEach((transaction) => {
          const center = transaction.cost_center_id
            ? costCenterMetaMap.get(transaction.cost_center_id)?.name ?? 'Centro de custo não encontrado'
            : 'Sem centro de custo';
          movements.push({
            activity: group.label,
            category: category.name,
            costCenter: center,
            paidDate: transaction.paid_date ?? '',
            description: transaction.description ?? '',
            type: transaction.transaction_type === 'entrada' ? 'Entrada' : 'Saída',
            amount: signedTransactionAmount(transaction),
          });
        });
      });
    });
    return {
      periodLabel,
      locale,
      currency,
      company: {
        name: settings?.name || 'Dominex',
        document: settings?.document,
        phone: settings?.phone,
        email: settings?.email,
        address: [settings?.address, settings?.address_number, settings?.city, settings?.state].filter(Boolean).join(', '),
      },
      brandName: 'Dominex',
      brandLogoUrl: dominexLogoUrl,
      openingBalance: report.openingBalance,
      totalInflow: report.totalInflow,
      totalOutflow: report.totalOutflow,
      netChange: report.netChange,
      closingBalance: report.closingBalance,
      rows: [
        ...hierarchySections.flatMap((section) => [
          { code: section.code, label: section.label, level: 'section' as const, inflow: section.inflow, outflow: section.outflow, net: section.net },
          ...section.rows.flatMap((row) => [
            { code: row.code, label: row.label, level: 'category' as const, inflow: row.inflow, outflow: row.outflow, net: row.net, color: row.color, icon: row.icon as LucideIcon | undefined },
            ...(row.children ?? []).map((child) => ({ code: child.code, label: child.label, level: 'subcategory' as const, inflow: child.inflow, outflow: child.outflow, net: child.net, color: child.color, icon: child.icon as LucideIcon | undefined })),
          ]),
        ]),
        { code: '04', label: 'Variação líquida de caixa', level: 'result' as const, inflow: report.totalInflow, outflow: Math.abs(report.totalOutflow), net: report.netChange },
      ],
      movements,
    };
  };

  const exportFilename = () => {
    const suffix = [normalizedRange.from, normalizedRange.to].filter(Boolean).join('_a_') || 'historico';
    return `dfc-gerencial_${suffix}`;
  };

  const handleExport = async (format: 'excel' | 'pdf' | 'csv') => {
    try {
      const data = buildExportData();
      const filename = exportFilename();
      if (format === 'excel') await exportDfcExcel(data, filename);
      else if (format === 'pdf') await exportDfcPdf(data, filename);
      else exportDfcCsv(data, filename);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível exportar o DFC',
        description: getErrorMessage(error),
      });
    }
  };

  if (isLoading || isLoadingCategories || isLoadingAccounts || isLoadingCostCenters || isLoadingCompany) {
    return <FinanceDFCLoading />;
  }

  const changeIsPositive = report.netChange > 0;
  const changeIsZero = report.netChange === 0;
  const ChangeIcon = changeIsPositive ? ArrowUpCircle : changeIsZero ? Banknote : ArrowDownCircle;
  const kpiMoney = (value: number) => {
    if (!isMobile || Math.abs(value) < 1_000) return money(value);
    const compactBase = (scaled: number) => new Intl.NumberFormat(toBcp47(locale), {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(scaled);
    if (Math.abs(value) >= 1_000_000) return `${compactBase(value / 1_000_000)} mi`;
    return `${compactBase(value / 1_000)} mil`;
  };

  const seletorDeLente = (
    <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1 w-fit">
      <Button
        size="sm"
        variant={lente === 'previsto' ? 'default' : 'ghost'}
        onClick={() => setLente('previsto')}
      >
        Previsto
      </Button>
      <Button
        size="sm"
        variant={lente === 'realizado' ? 'default' : 'ghost'}
        onClick={() => setLente('realizado')}
      >
        Realizado
      </Button>
    </div>
  );

  if (lente === 'previsto') {
    return (
      <section className="space-y-4" aria-labelledby="dfc-title">
        {seletorDeLente}
        <CashFlowForecast />
      </section>
    );
  }

  return (
    <section className="space-y-5 sm:space-y-6" aria-labelledby="dfc-title">
      {seletorDeLente}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <DfcKpi label="Saldo inicial" shortLabel="Inicial" value={kpiMoney(report.openingBalance)} fullValue={money(report.openingBalance)} icon={PiggyBank} className="bg-info" />
        <DfcKpi
          label="Variação líquida"
          shortLabel="Variação"
          value={kpiMoney(report.netChange)}
          fullValue={money(report.netChange)}
          icon={ChangeIcon}
          className={changeIsPositive ? 'bg-success' : changeIsZero ? 'bg-muted-foreground' : 'bg-destructive'}
        />
        <DfcKpi
          label="Saldo final"
          shortLabel="Final"
          value={kpiMoney(report.closingBalance)}
          fullValue={money(report.closingBalance)}
          icon={Landmark}
          className={report.closingBalance >= 0 ? 'bg-primary' : 'bg-destructive'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterCheckboxDropdown
          label="Filtros"
          contentLabel="Centros de custo"
          selected={selectedCostCenters}
          onChange={setSelectedCostCenters}
          options={[
            ...costCenters.map((center) => ({ value: center.id, label: center.name })),
            { value: '__none__', label: 'Sem centro de custo' },
          ]}
        />
        {selectedCostCenters.length > 0 && (
          <span className="text-xs text-muted-foreground">Filtro aplicado ao realizado e às exportações.</span>
        )}
      </div>

      <Card className="overflow-hidden border-0 bg-muted/15 shadow-none">
        <CardHeader className="bg-foreground pb-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle id="dfc-title" className="text-base font-semibold text-background sm:text-lg">
                  DFC Gerencial
                </CardTitle>
                <span className="rounded-full bg-success px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Somente realizado
                </span>
              </div>
              <p className="mt-1 text-xs text-background/70">Fluxo de caixa por atividade · {periodLabel}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={movementCount === 0}
                  className="w-full gap-2 border-background/20 bg-transparent text-xs text-background hover:bg-background/20 hover:text-background sm:w-auto"
                >
                  <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                  Exportar
                  <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-70 sm:ml-1" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => handleExport('excel')} className="cursor-pointer gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-success" aria-hidden="true" /> Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')} className="cursor-pointer gap-2">
                  <FileText className="h-4 w-4 text-destructive" aria-hidden="true" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('csv')} className="cursor-pointer gap-2">
                  <FileDown className="h-4 w-4 text-info" aria-hidden="true" /> CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {movementCount === 0 && (
            <div className="flex flex-col items-center border-b border-border/30 px-6 py-8 text-center">
              <ArrowDownToLine className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Nenhuma movimentação realizada no período</p>
              <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                O DFC considera somente lançamentos pagos, pela data da baixa. Valores previstos ou pendentes não entram.
              </p>
            </div>
          )}

          {movementCount > 0 && (
            <DfcHierarchyTable
              sections={hierarchySections}
              formatMoney={money}
              finalValue={{ inflow: report.totalInflow, outflow: Math.abs(report.totalOutflow), net: report.netChange }}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Método direto · somente valores realizados pela data da baixa.
      </p>
    </section>
  );
}

function DfcKpi({
  label,
  shortLabel,
  value,
  fullValue,
  icon: Icon,
  className,
}: {
  label: string;
  shortLabel: string;
  value: string;
  fullValue: string;
  icon: LucideIcon;
  className: string;
}) {
  return (
    <Card className={cn('border-0 text-white shadow-sm', className)}>
      <CardContent className="min-w-0 p-3 sm:p-5">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase leading-tight tracking-wider text-white/80 sm:text-xs">
          <Icon className="h-3 w-3 shrink-0 text-white sm:h-4 sm:w-4" />
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="mt-1 truncate whitespace-nowrap text-xs font-bold leading-tight tabular-nums text-white min-[380px]:text-sm sm:text-3xl" title={fullValue}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function FinanceDFCLoading() {
  return (
    <section className="space-y-5 sm:space-y-6" aria-label="Carregando DFC gerencial" aria-busy="true">
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-20 sm:h-28" />)}
      </div>
      <div className="space-y-3 rounded-lg bg-muted/15 p-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-6 w-44" />
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-[74px]" />)}
      </div>
    </section>
  );
}
