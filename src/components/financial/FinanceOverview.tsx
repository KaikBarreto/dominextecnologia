import { useEffect, useMemo, useState } from 'react';
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
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowUpRight,
  BarChart3,
  Clock,
  CreditCard,
  HelpCircle,
  Landmark,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, getCurrencySymbol } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { FinancialTransaction } from '@/types/database';

interface FinanceOverviewProps {
  transactions: (FinancialTransaction & { customer?: unknown })[];
  summary: {
    totalEntradas: number;
    totalSaidas: number;
    saldo: number;
    aPagar: number;
    aReceber: number;
  };
  isLoading?: boolean;
  onNavigate: (tab: string) => void;
  onNewMovement: () => void;
}

const CHART_COLORS = [
  'hsl(210, 79%, 42%)',
  'hsl(145, 65%, 42%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)',
  'hsl(200, 85%, 45%)',
  'hsl(280, 60%, 50%)',
  'hsl(160, 60%, 45%)',
  'hsl(30, 80%, 55%)',
];

export function FinanceOverview({
  transactions,
  summary,
  isLoading = false,
  onNavigate,
  onNewMovement,
}: FinanceOverviewProps) {
  const {
    accounts,
    balances,
    cardBillTotals,
    isLoading: isLoadingAccounts,
    isLoadingBalances,
  } = useFinancialAccounts();
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const ov = MESSAGES[locale].app.finance.overview;

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);
  const formatCurrencyShort = (value: number) => {
    const abs = Math.abs(value);
    if (abs < 1_000) return formatCurrency(value);
    const sign = value < 0 ? '-' : '';
    const symbol = getCurrencySymbol(currency, locale);
    if (abs >= 1_000_000) return `${sign}${symbol} ${(abs / 1_000_000).toFixed(1)}M`;
    return `${sign}${symbol} ${(abs / 1_000).toFixed(1)}k`;
  };

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.is_active),
    [accounts],
  );
  const accountGroups = useMemo(
    () => [
      {
        value: 'banco',
        label: 'Contas bancárias',
        accounts: activeAccounts.filter((account) => account.type === 'banco'),
      },
      {
        value: 'caixa',
        label: 'Caixas',
        accounts: activeAccounts.filter((account) => account.type === 'caixa'),
      },
      {
        value: 'cartao',
        label: 'Cartões',
        accounts: activeAccounts.filter((account) => account.type === 'cartao'),
      },
    ].filter((group) => group.accounts.length > 0),
    [activeAccounts],
  );
  const [activeAccountGroup, setActiveAccountGroup] = useState('banco');

  useEffect(() => {
    if (accountGroups.length > 0 && !accountGroups.some((group) => group.value === activeAccountGroup)) {
      setActiveAccountGroup(accountGroups[0].value);
    }
  }, [accountGroups, activeAccountGroup]);

  const resultTransactions = useMemo(
    () => transactions.filter((transaction) => !transaction.transfer_pair_id),
    [transactions],
  );
  const realizedTransactions = useMemo(
    () => resultTransactions.filter((transaction) => transaction.is_paid),
    [resultTransactions],
  );

  const expenseCategoryData = useMemo(() => {
    const categoryMap = new Map<string, number>();
    realizedTransactions.forEach((transaction) => {
      if (transaction.transaction_type !== 'saida') return;
      const category = transaction.category || 'Sem categoria';
      categoryMap.set(category, (categoryMap.get(category) || 0) + Number(transaction.amount));
    });
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, isMobile ? 5 : 8);
  }, [isMobile, realizedTransactions]);

  const cashFlowData = useMemo(() => {
    const monthly = new Map<string, { month: string; entradas: number; saidas: number }>();
    realizedTransactions.forEach((transaction) => {
      const key = transaction.transaction_date?.substring(0, 7);
      if (!key) return;
      if (!monthly.has(key)) {
        const [year, month] = key.split('-');
        monthly.set(key, { month: `${month}/${year.slice(2)}`, entradas: 0, saidas: 0 });
      }
      const item = monthly.get(key)!;
      if (transaction.transaction_type === 'entrada') item.entradas += Number(transaction.amount);
      else item.saidas += Number(transaction.amount);
    });
    const all = Array.from(monthly.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value);
    return isMobile ? all.slice(-3) : all;
  }, [isMobile, realizedTransactions]);

  const balanceEvolutionData = useMemo(() => {
    const daily = new Map<string, number>();
    realizedTransactions.forEach((transaction) => {
      const date = transaction.transaction_date?.substring(0, 10);
      if (!date) return;
      const signedAmount = Number(transaction.amount) * (transaction.transaction_type === 'entrada' ? 1 : -1);
      daily.set(date, (daily.get(date) || 0) + signedAmount);
    });
    let cumulative = 0;
    const all = Array.from(daily.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, value]) => {
        cumulative += value;
        return { date, label: format(new Date(`${date}T12:00:00`), 'dd/MM'), saldo: cumulative };
      });
    return isMobile ? all.slice(-10) : all.slice(-20);
  }, [isMobile, realizedTransactions]);

  const recentTransactions = useMemo(
    () => [...resultTransactions]
      .sort((left, right) => right.transaction_date.localeCompare(left.transaction_date))
      .slice(0, 6),
    [resultTransactions],
  );

  const availableBalance = useMemo(
    () => activeAccounts
      .filter((account) => account.type !== 'cartao')
      .reduce((total, account) => total + (balances[account.id] ?? Number(account.initial_balance ?? 0)), 0),
    [activeAccounts, balances],
  );
  const cardDebt = useMemo(
    () => activeAccounts
      .filter((account) => account.type === 'cartao')
      .reduce((total, account) => total + (cardBillTotals[account.id] ?? 0), 0),
    [activeAccounts, cardBillTotals],
  );
  const projectedCommitments = summary.aReceber - summary.aPagar;

  const getTypeIcon = (type: string) => {
    if (type === 'caixa') return Wallet;
    if (type === 'cartao') return CreditCard;
    return Landmark;
  };

  const renderAccountCard = (account: (typeof activeAccounts)[number]) => {
    const Icon = getTypeIcon(account.type);
    const isCard = account.type === 'cartao';
    const balance = isCard
      ? (cardBillTotals[account.id] ?? 0)
      : (balances[account.id] ?? Number(account.initial_balance ?? 0));
    const valueClass = isCard
      ? (balance > 0 ? 'text-destructive' : 'text-muted-foreground')
      : (balance >= 0 ? 'text-success' : 'text-destructive');

    return (
      <button
        key={account.id}
        type="button"
        className="flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onNavigate('historico')}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: account.color }}
        >
          <Icon className="h-4 w-4 text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-muted-foreground">{account.name}</span>
          <span className={cn('block truncate text-sm font-bold tabular-nums', valueClass)} title={formatCurrency(balance)}>
            {formatCurrency(balance)}
          </span>
          {isCard && (
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {ov.accounts.invoiceSuffix}
            </span>
          )}
        </span>
      </button>
    );
  };

  if (isLoading || isLoadingAccounts || isLoadingBalances) {
    return <FinanceOverviewLoading />;
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-12 lg:grid-flow-row-dense" aria-label="Resumo financeiro">
        <Card className="relative overflow-hidden border-0 bg-foreground text-background shadow-sm lg:col-span-5 lg:row-span-2">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-background/5" />
          <div className="pointer-events-none absolute -bottom-28 left-10 h-52 w-52 rounded-full bg-background/5" />
          <CardContent className="relative flex h-full min-h-[17rem] flex-col justify-between p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-background/65">
                    {ov.kpi.balance}
                  </p>
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-background/60 transition-colors hover:text-background" aria-label={ov.kpi.balanceAriaLabel}>
                        <HelpCircle className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[260px]">{ov.kpi.balanceTooltip}</TooltipContent>
                  </UiTooltip>
                </div>
                <p className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl">
                  {formatCurrency(summary.saldo)}
                </p>
                <p className="mt-1 text-xs text-background/55">{ov.kpi.balanceFormula}</p>
              </div>
              <span className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white',
                summary.saldo >= 0 ? 'bg-success' : 'bg-destructive',
              )}>
                {summary.saldo >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              </span>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => onNavigate('historico')} className="rounded-xl bg-background/10 p-3 text-left transition-colors hover:bg-background/15">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-background/60">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> {ov.kpi.revenue}
                </span>
                <span className="mt-1 block truncate text-sm font-semibold tabular-nums text-background sm:text-base" title={formatCurrency(summary.totalEntradas)}>
                  {formatCurrency(summary.totalEntradas)}
                </span>
              </button>
              <button type="button" onClick={() => onNavigate('historico')} className="rounded-xl bg-background/10 p-3 text-left transition-colors hover:bg-background/15">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-background/60">
                  <TrendingDown className="h-3.5 w-3.5 text-red-400" /> {ov.kpi.expenses}
                </span>
                <span className="mt-1 block truncate text-sm font-semibold tabular-nums text-background sm:text-base" title={formatCurrency(summary.totalSaidas)}>
                  {formatCurrency(summary.totalSaidas)}
                </span>
              </button>
            </div>

            <Button
              type="button"
              onClick={onNewMovement}
              className="mt-4 w-full gap-2 bg-background text-foreground hover:bg-background/90"
            >
              <Plus className="h-4 w-4" />
              {ov.actions.newMovement}
            </Button>
          </CardContent>
        </Card>

        <button
          type="button"
          onClick={() => onNavigate('contas')}
          className="group min-h-32 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:col-span-3"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success text-white"><Clock className="h-4 w-4" /></span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
          <span className="mt-5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{ov.kpi.receivable}</span>
          <span className="mt-1 block truncate text-xl font-bold tabular-nums text-success" title={formatCurrency(summary.aReceber)}>{formatCurrency(summary.aReceber)}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('contas')}
          className="group min-h-32 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:col-span-4"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive text-white"><Clock className="h-4 w-4" /></span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
          <span className="mt-5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{ov.kpi.payable}</span>
          <span className="mt-1 block truncate text-xl font-bold tabular-nums text-destructive" title={formatCurrency(summary.aPagar)}>{formatCurrency(summary.aPagar)}</span>
        </button>

        <Card className="border bg-card shadow-sm lg:col-span-7">
          <CardHeader className="space-y-0 p-4 pb-2 sm:px-5 sm:pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm font-semibold">{ov.accounts.sectionTitle}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Disponível {formatCurrency(availableBalance)}{cardDebt > 0 ? ` · Faturas ${formatCurrency(cardDebt)}` : ''}</p>
              </div>
              <Badge className={cn('border-0 text-white', projectedCommitments >= 0 ? 'bg-success' : 'bg-destructive')}>
                Projeção {projectedCommitments >= 0 ? '+' : ''}{formatCurrency(projectedCommitments)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-1 sm:px-5 sm:pb-5">
            {accountGroups.length === 0 ? (
              <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed text-center text-sm text-muted-foreground">
                Cadastre uma conta para acompanhar seus saldos aqui.
              </div>
            ) : (
              <Tabs value={activeAccountGroup} onValueChange={setActiveAccountGroup}>
                <TabsList variant="underline" className="w-full justify-start overflow-x-auto">
                  {accountGroups.map((group) => (
                    <TabsTrigger key={group.value} value={group.value} variant="underline" className="gap-1.5 px-3 text-xs">
                      {group.label}
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{group.accounts.length}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {accountGroups.map((group) => (
                  <TabsContent key={group.value} value={group.value} className="mt-3">
                    <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                      {group.accounts.map(renderAccountCard)}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-12" aria-label="Indicadores e gráficos financeiros">
        <Card className="border bg-card shadow-sm lg:col-span-8">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-semibold">{isMobile && cashFlowData.length > 3 ? ov.charts.cashFlowShort : ov.charts.cashFlow}</CardTitle>
            <p className="text-xs text-muted-foreground">Entradas e saídas realizadas, sem transferências internas.</p>
          </CardHeader>
          <CardContent className="p-2 pt-0 sm:p-4 sm:pt-0">
            {cashFlowData.length === 0 ? (
              <EmptyState size="compact" icon={<BarChart3 className="h-10 w-10" />} title={ov.empty.noMovements} description={ov.empty.noMovementsDescription} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={cashFlowData} margin={{ top: 16, right: 8, left: isMobile ? -20 : 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="finance-revenue-bars" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.95} /><stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.35} /></linearGradient>
                    <linearGradient id="finance-expense-bars" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.95} /><stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value: number) => formatCurrencyShort(value)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="entradas" name={ov.charts.revenueBar} fill="url(#finance-revenue-bars)" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="saidas" name={ov.charts.expenseBar} fill="url(#finance-expense-bars)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm lg:col-span-4">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-semibold">Despesas por categoria</CardTitle>
            <p className="text-xs text-muted-foreground">Onde o dinheiro saiu no período.</p>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {expenseCategoryData.length === 0 ? (
              <EmptyState size="compact" icon={<BarChart3 className="h-10 w-10" />} title={ov.empty.noCategoryData} description={ov.empty.noCategoryDescription} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={expenseCategoryData} cx="50%" cy="50%" innerRadius={54} outerRadius={78} paddingAngle={2} dataKey="value">
                      {expenseCategoryData.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-2 pb-2">
                  {expenseCategoryData.map((item, index) => (
                    <div key={item.name} className="flex min-w-0 items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                      <span className="truncate text-muted-foreground" title={item.name}>{item.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm lg:col-span-5">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-semibold">Evolução do resultado</CardTitle>
            <p className="text-xs text-muted-foreground">Acumulado das movimentações realizadas no período.</p>
          </CardHeader>
          <CardContent className="p-2 pt-0 sm:p-4 sm:pt-0">
            {balanceEvolutionData.length === 0 ? (
              <EmptyState size="compact" icon={<TrendingUp className="h-10 w-10" />} title={ov.empty.noMovements} description={ov.empty.noMovementsDescription} />
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={balanceEvolutionData} margin={{ top: 16, right: 8, left: isMobile ? -20 : 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="finance-result-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.04} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} minTickGap={24} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value: number) => formatCurrencyShort(value)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? format(new Date(`${payload[0].payload.date}T12:00:00`), 'dd/MM/yyyy') : ''} formatter={(value: number) => [formatCurrency(value), 'Resultado acumulado']} />
                  <Area type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#finance-result-area)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between gap-3 p-5 pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">{ov.charts.recentMovements}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Últimos lançamentos dentro do recorte atual.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate('historico')} className="shrink-0 gap-1">
              Ver todas <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {recentTransactions.length === 0 ? (
              <EmptyState size="compact" icon={<Wallet className="h-10 w-10" />} title={ov.empty.noMovements} description={ov.empty.noMovementsDescription} />
            ) : (
              <div>
                {recentTransactions.map((transaction) => (
                  <button
                    key={transaction.id}
                    type="button"
                    onClick={() => onNavigate('historico')}
                    className="flex w-full items-center justify-between gap-3 border-b py-3 text-left transition-colors last:border-0 hover:bg-muted/30"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white', transaction.transaction_type === 'entrada' ? 'bg-success' : 'bg-destructive')}>
                        {transaction.transaction_type === 'entrada' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{transaction.description}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {format(new Date(`${transaction.transaction_date.substring(0, 10)}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })}
                          {transaction.category ? ` • ${transaction.category}` : ''}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cn('block text-sm font-semibold tabular-nums', transaction.transaction_type === 'entrada' ? 'text-success' : 'text-destructive')}>
                        {transaction.transaction_type === 'entrada' ? '+' : '-'} {formatCurrency(transaction.amount)}
                      </span>
                      <Badge variant={transaction.is_paid ? 'default' : 'secondary'} className={cn('mt-1 text-[10px]', transaction.is_paid && 'bg-primary text-primary-foreground')}>
                        {transaction.is_paid ? ov.status.paid : ov.status.pending}
                      </Badge>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function FinanceOverviewLoading() {
  return (
    <div className="space-y-4" aria-label="Carregando visão geral financeira" aria-busy="true">
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="min-h-[17rem] lg:col-span-5 lg:row-span-2" />
        <Skeleton className="h-32 lg:col-span-3" />
        <Skeleton className="h-32 lg:col-span-4" />
        <Skeleton className="h-36 lg:col-span-7" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-80 lg:col-span-8" />
        <Skeleton className="h-80 lg:col-span-4" />
        <Skeleton className="h-72 lg:col-span-5" />
        <Skeleton className="h-72 lg:col-span-7" />
      </div>
    </div>
  );
}
