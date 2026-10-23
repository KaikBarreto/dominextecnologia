import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowUpRight,
  ArrowRightLeft,
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
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, getCurrencySymbol } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import type { FinancialTransaction } from '@/types/database';

interface FinanceOverviewProps {
  transactions: (FinancialTransaction & { customer?: unknown })[];
  projectionTransactions: (FinancialTransaction & { customer?: unknown })[];
  dateRange: DateRange;
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
  onTransfer: () => void;
  canTransfer: boolean;
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
  projectionTransactions,
  dateRange,
  summary,
  isLoading = false,
  onNavigate,
  onNewMovement,
  onTransfer,
  canTransfer,
}: FinanceOverviewProps) {
  const {
    accounts,
    balances,
    cardBillTotals,
    isLoading: isLoadingAccounts,
    isLoadingBalances,
  } = useFinancialAccounts();
  const isMobile = useIsMobile();
  const { locale, currency, timezone } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const ov = fin.overview;

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);
  const formatCurrencyShort = (value: number) => {
    const abs = Math.abs(value);
    if (abs < 1_000) return formatCurrency(value);
    const symbol = getCurrencySymbol(currency, locale);
    const numberLocale = locale === 'pt-br' ? 'pt-BR' : locale;
    const compactValue = new Intl.NumberFormat(numberLocale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
    return `${symbol} ${compactValue}`;
  };

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.is_active),
    [accounts],
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
    () => transactions.filter((transaction) => !transaction.transfer_pair_id && !transaction.cancelled_at),
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
    const sorted = Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const visibleCount = isMobile ? 4 : 6;
    const visible = sorted.slice(0, visibleCount);
    const remainingValue = sorted
      .slice(visibleCount)
      .reduce((total, item) => total + item.value, 0);
    const rows = remainingValue > 0
      ? [...visible, { name: 'Outras categorias', value: remainingValue }]
      : visible;
    const total = sorted.reduce((sum, item) => sum + item.value, 0);

    return rows.map((item) => ({
      ...item,
      share: total > 0 ? (item.value / total) * 100 : 0,
    }));
  }, [isMobile, realizedTransactions]);

  const useWeeklyCashFlow = Boolean(
    dateRange.from
    && dateRange.to
    && differenceInCalendarDays(dateRange.to, dateRange.from) <= 75,
  );

  const cashFlowData = useMemo(() => {
    const from = dateRange.from ? new Date(dateRange.from.getTime()) : undefined;
    const to = dateRange.to ? new Date(dateRange.to.getTime()) : undefined;
    const buckets = new Map<string, { period: string; sortKey: string; entradas: number; saidas: number; resultado: number }>();

    if (from && to) {
      let cursor = useWeeklyCashFlow
        ? startOfWeek(from, { weekStartsOn: 1 })
        : startOfMonth(from);
      const boundary = useWeeklyCashFlow
        ? startOfWeek(to, { weekStartsOn: 1 })
        : startOfMonth(to);

      while (cursor <= boundary) {
        const sortKey = format(cursor, 'yyyy-MM-dd');
        const periodEnd = useWeeklyCashFlow
          ? endOfWeek(cursor, { weekStartsOn: 1 })
          : endOfMonth(cursor);
        buckets.set(sortKey, {
          period: useWeeklyCashFlow
            ? `${format(cursor, 'dd/MM')}–${format(periodEnd, 'dd/MM')}`
            : format(cursor, 'MM/yy'),
          sortKey,
          entradas: 0,
          saidas: 0,
          resultado: 0,
        });
        cursor = useWeeklyCashFlow ? addWeeks(cursor, 1) : addMonths(cursor, 1);
      }
    }

    realizedTransactions.forEach((transaction) => {
      const rawDate = transaction.transaction_date?.substring(0, 10);
      if (!rawDate) return;
      const transactionDate = parseISO(rawDate);
      const periodStart = useWeeklyCashFlow
        ? startOfWeek(transactionDate, { weekStartsOn: 1 })
        : startOfMonth(transactionDate);
      const key = format(periodStart, 'yyyy-MM-dd');
      if (!buckets.has(key)) {
        const periodEnd = useWeeklyCashFlow
          ? endOfWeek(periodStart, { weekStartsOn: 1 })
          : endOfMonth(periodStart);
        buckets.set(key, {
          period: useWeeklyCashFlow
            ? `${format(periodStart, 'dd/MM')}–${format(periodEnd, 'dd/MM')}`
            : format(periodStart, 'MM/yy'),
          sortKey: key,
          entradas: 0,
          saidas: 0,
          resultado: 0,
        });
      }
      const item = buckets.get(key)!;
      if (transaction.transaction_type === 'entrada') item.entradas += Number(transaction.amount);
      else item.saidas += Number(transaction.amount);
      item.resultado = item.entradas - item.saidas;
    });
    const all = Array.from(buckets.values())
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
    return isMobile ? all.slice(-6) : all.slice(-12);
  }, [dateRange.from, dateRange.to, isMobile, realizedTransactions, useWeeklyCashFlow]);

  const pendingTransactions = useMemo(
    () => projectionTransactions.filter((transaction) => (
      !transaction.is_paid
      && !transaction.transfer_pair_id
      && !transaction.cancelled_at
    )),
    [projectionTransactions],
  );

  const pendingFinancials = useMemo(() => pendingTransactions.map((transaction) => {
    const originalAmount = Number(transaction.amount) || 0;
    const alreadyReceived = transaction.transaction_type === 'entrada'
      ? Number(transaction.amount_received ?? 0)
      : 0;
    return {
      type: transaction.transaction_type,
      // Compra no cartão pressiona o caixa na data da fatura, não no dia da
      // compra/parcela. É a mesma régua temporal usada pelos filtros do
      // Financeiro e evita antecipar artificialmente o risco no gráfico.
      dueDate: (
        transaction.credit_card_bill_date
        || transaction.due_date
        || transaction.transaction_date
      ).substring(0, 10),
      amount: Math.max(0, originalAmount - alreadyReceived),
    };
  }).filter((transaction) => transaction.amount > 0), [pendingTransactions]);

  const todayKey = todayInTz(timezone);
  const cashProjectionData = useMemo(() => {
    const changes = new Map<string, { receber: number; pagar: number; overdue: boolean }>();
    pendingFinancials.forEach((transaction) => {
      const overdue = transaction.dueDate < todayKey;
      const key = overdue ? todayKey : transaction.dueDate;
      const item = changes.get(key) ?? { receber: 0, pagar: 0, overdue: false };
      if (transaction.type === 'entrada') item.receber += transaction.amount;
      else item.pagar += transaction.amount;
      item.overdue ||= overdue;
      changes.set(key, item);
    });

    let projectedBalance = availableBalance;
    const points = [{
      key: 'saldo-atual',
      date: todayKey,
      label: 'Agora',
      saldo: projectedBalance,
      receber: 0,
      pagar: 0,
    }];
    Array.from(changes.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([date, change]) => {
        projectedBalance += change.receber - change.pagar;
        points.push({
          key: `${date}-${change.overdue ? 'overdue' : 'due'}`,
          date,
          label: change.overdue ? 'Vencidos' : format(parseISO(date), 'dd/MM'),
          saldo: projectedBalance,
          receber: change.receber,
          pagar: change.pagar,
        });
      });
    return points;
  }, [availableBalance, pendingFinancials, todayKey]);

  const dueRiskData = useMemo(() => {
    const buckets = [
      { key: 'overdue', label: 'Vencido', receber: 0, pagar: 0, receberPlot: 0, pagarPlot: 0 },
      { key: 'week', label: 'Até 7 d', receber: 0, pagar: 0, receberPlot: 0, pagarPlot: 0 },
      { key: 'month', label: '8–30 d', receber: 0, pagar: 0, receberPlot: 0, pagarPlot: 0 },
      { key: 'later', label: '+30 d', receber: 0, pagar: 0, receberPlot: 0, pagarPlot: 0 },
    ];
    pendingFinancials.forEach((transaction) => {
      const days = differenceInCalendarDays(parseISO(transaction.dueDate), parseISO(todayKey));
      const bucket = days < 0 ? buckets[0] : days <= 7 ? buckets[1] : days <= 30 ? buckets[2] : buckets[3];
      if (transaction.type === 'entrada') bucket.receber += transaction.amount;
      else bucket.pagar += transaction.amount;
    });
    return buckets.map((bucket) => ({
      ...bucket,
      receberPlot: bucket.receber,
      pagarPlot: -bucket.pagar,
    }));
  }, [pendingFinancials, todayKey]);

  const pendingTotals = useMemo(() => pendingFinancials.reduce(
    (totals, transaction) => ({
      receber: totals.receber + (transaction.type === 'entrada' ? transaction.amount : 0),
      pagar: totals.pagar + (transaction.type === 'saida' ? transaction.amount : 0),
    }),
    { receber: 0, pagar: 0 },
  ), [pendingFinancials]);

  const projectedEndBalance = cashProjectionData.at(-1)?.saldo ?? availableBalance;
  const projectedMinimumBalance = Math.min(...cashProjectionData.map((point) => point.saldo));
  const cashFlowHasMovements = cashFlowData.some((point) => point.entradas > 0 || point.saidas > 0);
  const coverageRatio = pendingTotals.pagar > 0
    ? (availableBalance + pendingTotals.receber) / pendingTotals.pagar
    : null;
  const topExpenseShare = expenseCategoryData
    .filter((item) => item.name !== 'Outras categorias')
    .slice(0, 3)
    .reduce((total, item) => total + item.share, 0);

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
        className="group flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onNavigate('historico')}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: account.color }}
        >
          <Icon className="h-4 w-4 text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-muted-foreground transition-colors group-hover:text-foreground">{account.name}</span>
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
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-12 xl:grid-flow-row-dense" aria-label="Resumo financeiro">
        <Card className="relative overflow-hidden border-0 bg-foreground text-background shadow-sm md:col-span-2 xl:col-span-5 xl:row-span-2">
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

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                onClick={onNewMovement}
                className="min-w-0 gap-2 bg-background px-3 text-foreground hover:bg-background/90"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="truncate">{ov.actions.newMovement}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onTransfer}
                disabled={!canTransfer}
                title={!canTransfer ? fin.newMovement.transferDisabled : undefined}
                className="min-w-0 gap-2 border-background/25 bg-transparent px-3 text-background hover:bg-background/10 hover:text-background disabled:border-background/10 disabled:text-background/45"
              >
                <ArrowRightLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">{ov.actions.transfer}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <button
          type="button"
          onClick={() => onNavigate('contas')}
          className="group min-h-32 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:col-span-3"
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
          className="group min-h-32 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:col-span-4"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive text-white"><Clock className="h-4 w-4" /></span>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
          <span className="mt-5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{ov.kpi.payable}</span>
          <span className="mt-1 block truncate text-xl font-bold tabular-nums text-destructive" title={formatCurrency(summary.aPagar)}>{formatCurrency(summary.aPagar)}</span>
        </button>

        <Card className="border bg-card shadow-sm md:col-span-2 xl:col-span-7">
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
                    <div className="grid max-h-44 grid-cols-1 gap-x-4 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2">
                      {group.accounts.map(renderAccountCard)}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-12" aria-label="Indicadores e gráficos financeiros">
        <Card className="border bg-card shadow-sm md:col-span-2 xl:col-span-7">
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-base font-semibold">Fluxo realizado e resultado</CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Compara entradas, saídas e o resultado líquido por {useWeeklyCashFlow ? 'semana' : 'mês'}.
            </p>
          </CardHeader>
          <CardContent className="p-2 pt-0 sm:p-4 sm:pt-0">
            {!cashFlowHasMovements ? (
              <EmptyState size="compact" icon={<BarChart3 className="h-10 w-10" />} title={ov.empty.noMovements} description={ov.empty.noMovementsDescription} />
            ) : (
              <ResponsiveContainer width="100%" height={isMobile ? 280 : 310}>
                <ComposedChart data={cashFlowData} margin={{ top: 20, right: 8, left: isMobile ? -18 : 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="finance-revenue-bars" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.95} /><stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.35} /></linearGradient>
                    <linearGradient id="finance-expense-bars" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.95} /><stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.45} />
                  <XAxis dataKey="period" axisLine={false} tickLine={false} minTickGap={isMobile ? 26 : 18} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} width={isMobile ? 52 : 66} tickFormatter={(value: number) => formatCurrencyShort(value)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} cursor={{ fill: 'hsl(var(--muted) / 0.45)' }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="entradas" name={ov.charts.revenueBar} fill="url(#finance-revenue-bars)" radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  <Bar dataKey="saidas" name={ov.charts.expenseBar} fill="url(#finance-expense-bars)" radius={[5, 5, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  <Line type="monotone" dataKey="resultado" name="Resultado" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 3, fill: 'hsl(var(--background))', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm md:col-span-2 xl:col-span-5">
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold">Projeção do caixa</CardTitle>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Saldo disponível após aplicar os vencimentos pendentes do período.
                </p>
              </div>
              <Badge className={cn('border-0 text-white', projectedEndBalance >= 0 ? 'bg-success' : 'bg-destructive')}>
                Final {formatCurrencyShort(projectedEndBalance)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-2 pt-0 sm:p-4 sm:pt-0">
            {pendingFinancials.length === 0 ? (
              <EmptyState size="compact" icon={<Wallet className="h-10 w-10" />} title="Sem vencimentos pendentes" description="O saldo atual já representa todo o período selecionado." />
            ) : (
              <ResponsiveContainer width="100%" height={isMobile ? 280 : 310}>
                <AreaChart data={cashProjectionData} margin={{ top: 24, right: 12, left: isMobile ? -18 : 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="finance-projection-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={projectedMinimumBalance >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={projectedMinimumBalance >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="5 4" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} padding={{ left: 6, right: 10 }} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} width={isMobile ? 52 : 66} tickFormatter={(value: number) => formatCurrencyShort(value)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]?.payload) return null;
                      const point = payload[0].payload as (typeof cashProjectionData)[number];
                      return (
                        <div className="min-w-44 rounded-xl border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
                          <p className="font-semibold">{point.label === 'Agora' ? 'Saldo atual' : format(parseISO(point.date), 'dd/MM/yyyy')}</p>
                          <p className="mt-2 flex justify-between gap-4"><span className="text-muted-foreground">Saldo projetado</span><strong className="tabular-nums">{formatCurrency(point.saldo)}</strong></p>
                          {point.receber > 0 && <p className="mt-1 flex justify-between gap-4 text-success"><span>A receber</span><strong className="tabular-nums">+ {formatCurrency(point.receber)}</strong></p>}
                          {point.pagar > 0 && <p className="mt-1 flex justify-between gap-4 text-destructive"><span>A pagar</span><strong className="tabular-nums">− {formatCurrency(point.pagar)}</strong></p>}
                        </div>
                      );
                    }}
                  />
                  <Area type="stepAfter" dataKey="saldo" name="saldo" stroke={projectedMinimumBalance >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} strokeWidth={3} fill="url(#finance-projection-area)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {pendingFinancials.length > 0 && (
              <div className="mx-2 mb-2 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs sm:mx-1">
                <span className="text-muted-foreground">Menor saldo projetado</span>
                <strong className={cn('tabular-nums', projectedMinimumBalance >= 0 ? 'text-success' : 'text-destructive')}>
                  {formatCurrency(projectedMinimumBalance)}
                </strong>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm xl:col-span-5">
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold">Agenda de vencimentos</CardTitle>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Mostra em qual horizonte o caixa será pressionado.</p>
              </div>
              {coverageRatio !== null && (
                <Badge className={cn('border-0 text-white', coverageRatio >= 1 ? 'bg-success' : 'bg-destructive')}>
                  Cobertura {coverageRatio.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-2 pt-0 sm:p-4 sm:pt-0">
            {pendingFinancials.length === 0 ? (
              <EmptyState size="compact" icon={<Clock className="h-10 w-10" />} title="Sem valores em aberto" description="Novas contas a pagar ou receber aparecem aqui por vencimento." />
            ) : (
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={dueRiskData} layout="vertical" margin={{ top: 10, right: isMobile ? 8 : 18, left: isMobile ? 0 : 8, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                  <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeOpacity={0.45} />
                  <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(value: number) => formatCurrencyShort(Math.abs(value))} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} minTickGap={18} />
                  <YAxis dataKey="label" type="category" width={isMobile ? 64 : 76} axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }} />
                  <Tooltip formatter={(value: number, name: string) => [formatCurrency(Math.abs(value)), name]} cursor={{ fill: 'hsl(var(--muted) / 0.45)' }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                  <Bar dataKey="pagarPlot" name="A pagar" fill="hsl(var(--destructive))" radius={[5, 0, 0, 5]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="receberPlot" name="A receber" fill="hsl(var(--success))" radius={[0, 5, 5, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm xl:col-span-7">
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base font-semibold">Concentração das despesas</CardTitle>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Ranking real para identificar dependência e oportunidades de redução.</p>
              </div>
              {expenseCategoryData.length > 0 && (
                <Badge variant="secondary" className="tabular-nums">Top 3 · {topExpenseShare.toLocaleString(locale, { maximumFractionDigits: 0 })}%</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
            {expenseCategoryData.length === 0 ? (
              <EmptyState size="compact" icon={<BarChart3 className="h-10 w-10" />} title={ov.empty.noCategoryData} description={ov.empty.noCategoryDescription} />
            ) : (
              <div className="grid items-center gap-2 sm:grid-cols-[minmax(220px,0.9fr)_minmax(0,1.1fr)]">
                <div className="relative mx-auto w-full max-w-[300px]">
                  <ResponsiveContainer width="100%" height={isMobile ? 230 : 270}>
                    <PieChart>
                      <Pie
                        data={expenseCategoryData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={isMobile ? 92 : 108}
                        paddingAngle={1.5}
                        stroke="hsl(var(--card))"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {expenseCategoryData.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value: number, _name: string, item) => [
                        `${formatCurrency(value)} · ${Number(item.payload.share).toLocaleString(locale, { maximumFractionDigits: 1 })}%`,
                        item.payload.name,
                      ]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid gap-1.5" aria-label="Legenda das despesas por categoria">
                  {expenseCategoryData.map((item, index) => (
                    <div key={item.name} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/40">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                      <span className="truncate text-muted-foreground" title={item.name}>{item.name}</span>
                      <span className="text-right tabular-nums">
                        <strong>{item.share.toLocaleString(locale, { maximumFractionDigits: 1 })}%</strong>
                        <span className="ml-1 hidden text-muted-foreground lg:inline">· {formatCurrencyShort(item.value)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm xl:col-span-5">
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-2">
            <CardTitle className="text-base font-semibold">Evolução do resultado</CardTitle>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Acumulado diário das movimentações realizadas no período.</p>
          </CardHeader>
          <CardContent className="p-2 pt-0 sm:p-4 sm:pt-0">
            {balanceEvolutionData.length === 0 ? (
              <EmptyState size="compact" icon={<TrendingUp className="h-10 w-10" />} title={ov.empty.noMovements} description={ov.empty.noMovementsDescription} />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={balanceEvolutionData} margin={{ top: 16, right: 8, left: isMobile ? -18 : 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="finance-result-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.04} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 4" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} minTickGap={28} />
                  <YAxis axisLine={false} tickLine={false} width={isMobile ? 52 : 66} tickFormatter={(value: number) => formatCurrencyShort(value)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? format(new Date(`${payload[0].payload.date}T12:00:00`), 'dd/MM/yyyy') : ''} formatter={(value: number) => [formatCurrency(value), 'Resultado acumulado']} />
                  <Area type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#finance-result-area)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border bg-card shadow-sm xl:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
            <div>
              <CardTitle className="text-base font-semibold">{ov.charts.recentMovements}</CardTitle>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Últimos lançamentos dentro do recorte atual.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate('historico')} className="shrink-0 gap-1">
              Ver todas <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <Skeleton className="min-h-[17rem] md:col-span-2 xl:col-span-5 xl:row-span-2" />
        <Skeleton className="h-32 xl:col-span-3" />
        <Skeleton className="h-32 xl:col-span-4" />
        <Skeleton className="h-36 md:col-span-2 xl:col-span-7" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <Skeleton className="h-80 md:col-span-2 xl:col-span-7" />
        <Skeleton className="h-80 md:col-span-2 xl:col-span-5" />
        <Skeleton className="h-72 xl:col-span-5" />
        <Skeleton className="h-72 xl:col-span-7" />
        <Skeleton className="h-72 xl:col-span-5" />
        <Skeleton className="h-72 xl:col-span-7" />
      </div>
    </div>
  );
}
