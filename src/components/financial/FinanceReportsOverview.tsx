import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, CircleDollarSign, Gauge, ReceiptText, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useCostCenters } from '@/hooks/useCostCenters';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatMoney } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import {
  buildFinanceReportOverview,
  type FinanceReportCategoryRow,
} from '@/lib/finance-report-overview';
import type { DreRegime } from '@/lib/dre-regime';
import type { FinancialTransaction } from '@/types/database';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { cn } from '@/lib/utils';

interface FinanceReportsOverviewProps {
  transactions: (FinancialTransaction & { customer?: unknown })[];
  range?: DateRange;
  isLoading?: boolean;
}

const CHART_COLORS = [
  '#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#64748b',
];

function limitRows(rows: FinanceReportCategoryRow[], limit: number): FinanceReportCategoryRow[] {
  if (rows.length <= limit) return rows;
  const visible = rows.slice(0, limit);
  const otherValue = rows.slice(limit).reduce((total, row) => total + row.value, 0);
  return [...visible, { name: 'Outras', value: Number(otherValue.toFixed(2)) }];
}

export function FinanceReportsOverview({
  transactions,
  range,
  isLoading = false,
}: FinanceReportsOverviewProps) {
  const [regime, setRegime] = useState<DreRegime>('caixa');
  const { categories, isLoading: isLoadingCategories } = useFinancialCategories();
  const { costCenters, isLoading: isLoadingCostCenters } = useCostCenters();
  const { settings, isLoading: isLoadingSettings } = useCompanySettings();
  const { locale, currency, timezone } = useAppLocaleContext();
  const isMobile = useIsMobile();
  const money = (value: number) => formatMoney(value, currency, locale);
  const compactMoney = (value: number) => new Intl.NumberFormat(
    locale === 'pt-br' ? 'pt-BR' : locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : 'fr-FR',
    { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 },
  ).format(value);

  const categoryDreGroups = useMemo(
    () => new Map(categories.map((category) => [category.name, category.dre_group])),
    [categories],
  );
  const costCenterOrder = useMemo(
    () => costCenters.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((center) => center.id),
    [costCenters],
  );
  const costCenterMeta = useMemo(
    () => new Map(costCenters.map((center) => [center.id, center])),
    [costCenters],
  );
  const report = useMemo(
    () => buildFinanceReportOverview({
      transactions,
      range,
      regime,
      today: todayInTz(timezone),
      dreStartDate: (settings as { dre_start_date?: string | null } | null)?.dre_start_date,
      categoryDreGroups,
      costCenterOrder,
    }),
    [categoryDreGroups, costCenterOrder, range, regime, settings, timezone, transactions],
  );

  const categoryLimit = isMobile ? 5 : 7;
  const revenueCategories = limitRows(report.revenueCategories, categoryLimit);
  const expenseCategories = limitRows(report.expenseCategories, categoryLimit);
  const monthlyData = (isMobile ? report.monthly.slice(-6) : report.monthly).map((row) => ({
    ...row,
    month: `${row.key.slice(5, 7)}/${row.key.slice(2, 4)}`,
  }));
  const costCenterRows = report.costCenters
    .map((row) => ({
      ...row,
      name: row.id
        ? (costCenterMeta.get(row.id)?.name ?? 'Centro não encontrado')
        : 'Sem centro de custo',
    }))
    .sort((a, b) => (b.revenue + b.expense) - (a.revenue + a.expense));
  const visibleCostCenters = costCenterRows.slice(0, isMobile ? 5 : 8);
  const omittedCostCenters = costCenterRows.slice(visibleCostCenters.length);
  if (omittedCostCenters.length > 0) {
    visibleCostCenters.push({
      id: '__others__',
      name: `Outros centros (${omittedCostCenters.length})`,
      revenue: Number(omittedCostCenters.reduce((total, row) => total + row.revenue, 0).toFixed(2)),
      expense: Number(omittedCostCenters.reduce((total, row) => total + row.expense, 0).toFixed(2)),
      result: Number(omittedCostCenters.reduce((total, row) => total + row.result, 0).toFixed(2)),
    });
  }

  if (isLoading || isLoadingCategories || isLoadingCostCenters || isLoadingSettings) {
    return <FinanceReportsOverviewLoading />;
  }

  return (
    <section className="space-y-5 sm:space-y-6" aria-labelledby="finance-reports-overview-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="finance-reports-overview-title" className="text-lg font-semibold">Visão geral dos relatórios</h2>
          <p className="text-sm text-muted-foreground">
            Usa os regimes e o corte histórico do DRE, sem incluir projeções de assinaturas.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Regime da visão geral"
          className="grid w-full grid-cols-2 rounded-lg bg-muted p-1 sm:w-auto"
        >
          {(['caixa', 'competencia'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={regime === value}
              onClick={() => setRegime(value)}
              className={cn(
                'rounded-md px-3 py-2 text-xs font-medium transition-colors',
                regime === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value === 'caixa' ? 'Regime de Caixa' : 'Regime de Competência'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InsightKpi
          label="Margem"
          value={`${report.totals.margin.toFixed(1)}%`}
          icon={Gauge}
          className={report.totals.margin >= 0 ? 'bg-success' : 'bg-destructive'}
        />
        <InsightKpi
          label="Receita líquida"
          value={isMobile ? compactMoney(report.totals.netRevenue) : money(report.totals.netRevenue)}
          fullValue={money(report.totals.netRevenue)}
          icon={CircleDollarSign}
          className="bg-info"
        />
        <InsightKpi
          label="Resultado (EBITDA)"
          value={isMobile ? compactMoney(report.totals.result) : money(report.totals.result)}
          fullValue={money(report.totals.result)}
          icon={report.totals.result >= 0 ? TrendingUp : ReceiptText}
          className={report.totals.result >= 0 ? 'bg-success' : 'bg-destructive'}
        />
      </div>

      <Card className="border-0 bg-muted/20 shadow-none">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
            Receita × despesa{isMobile && report.monthly.length > 6 ? ' · últimos 6 meses' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-6 sm:pt-2">
          {monthlyData.length === 0 ? (
            <ReportsEmpty description="Registre receitas ou despesas para acompanhar a evolução do período." />
          ) : (
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="reports-revenue-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="reports-expense-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: isMobile ? 10 : 11 }} />
                <YAxis width={isMobile ? 50 : 72} tick={{ fontSize: isMobile ? 10 : 11 }} tickFormatter={compactMoney} />
                <Tooltip formatter={(value: number) => money(value)} />
                <Legend wrapperStyle={isMobile ? { fontSize: 11 } : undefined} />
                <Area type="monotone" dataKey="revenue" name="Receitas" stroke="hsl(var(--success))" strokeWidth={2} fill="url(#reports-revenue-gradient)" />
                <Area type="monotone" dataKey="expense" name="Despesas" stroke="hsl(var(--destructive))" strokeWidth={2} fill="url(#reports-expense-gradient)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <CategoryDistribution title="Receitas por categoria" rows={revenueCategories} money={money} />
        <CategoryDistribution title="Despesas por categoria" rows={expenseCategories} money={money} />
      </div>

      <Card className="border-0 bg-muted/20 shadow-none">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
            Receita e despesa por centro de custo
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-6 sm:pt-2">
          {visibleCostCenters.length === 0 ? (
            <ReportsEmpty description="Os centros de custo usados nos lançamentos aparecerão aqui." />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(230, visibleCostCenters.length * 46)}>
              <BarChart data={visibleCostCenters} layout="vertical" margin={{ left: isMobile ? 0 : 18, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: isMobile ? 9 : 11 }} />
                <YAxis type="category" dataKey="name" width={isMobile ? 92 : 150} tick={{ fontSize: isMobile ? 9 : 11 }} />
                <Tooltip formatter={(value: number) => money(value)} />
                <Legend wrapperStyle={isMobile ? { fontSize: 11 } : undefined} />
                <Bar dataKey="revenue" name="Receitas" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="expense" name="Despesas" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        {regime === 'caixa'
          ? 'Caixa considera somente valores realizados pela data da baixa.'
          : 'Competência considera a data em que a receita ou despesa aconteceu, mesmo sem baixa.'}
      </p>
    </section>
  );
}

function InsightKpi({
  label,
  value,
  fullValue,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  fullValue?: string;
  icon: typeof Gauge;
  className: string;
}) {
  return (
    <Card className={cn('border-0 text-white shadow-sm', className)}>
      <CardContent className="min-w-0 p-4 sm:p-5">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-white/80 sm:text-xs">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {label}
        </p>
        <p className="mt-1 truncate text-xl font-bold tabular-nums sm:text-3xl" title={fullValue ?? value}>{value}</p>
      </CardContent>
    </Card>
  );
}

function CategoryDistribution({
  title,
  rows,
  money,
}: {
  title: string;
  rows: FinanceReportCategoryRow[];
  money: (value: number) => string;
}) {
  return (
    <Card className="border-0 bg-muted/20 shadow-none">
      <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-5 sm:pt-2">
        {rows.length === 0 ? (
          <ReportsEmpty description="Nenhum lançamento desta natureza no período selecionado." />
        ) : (
          <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={rows} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                  {rows.map((row, index) => <Cell key={row.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value: number) => money(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={row.name} className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                    <span className="truncate text-muted-foreground">{row.name}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{money(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReportsEmpty({ description }: { description: string }) {
  return (
    <EmptyState
      size="compact"
      icon={<BarChart3 className="h-9 w-9" />}
      title="Sem dados no período"
      description={description}
    />
  );
}

function FinanceReportsOverviewLoading() {
  return (
    <section className="space-y-5 sm:space-y-6" aria-label="Carregando visão geral dos relatórios" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2"><Skeleton className="h-6 w-52" /><Skeleton className="h-4 w-72 max-w-full" /></div>
        <Skeleton className="hidden h-9 w-60 sm:block" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-24" />)}
      </div>
      <Skeleton className="h-72 w-full" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-72" /><Skeleton className="h-72" />
      </div>
    </section>
  );
}
