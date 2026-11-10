import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, BarChart3, Info, RefreshCw, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { formatMoney } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import { buildFinanceAnalysis, type AnalysisPeriodMode } from '@/lib/finance-analysis';
import type { DreRegime } from '@/lib/dre-regime';
import type { FinancialTransaction } from '@/types/database';
import { cn } from '@/lib/utils';

interface FinanceAnalysisProps {
  transactions: (FinancialTransaction & { customer?: unknown })[];
  isLoading?: boolean;
}

/** Quantidades oferecidas por modo. A primeira é o padrão. */
const QUANTIDADES: Record<AnalysisPeriodMode, number[]> = {
  mes: [3, 6, 12],
  trimestre: [4, 8],
  ano: [2, 3, 5],
};

const MODOS: Array<{ value: AnalysisPeriodMode; label: string }> = [
  { value: 'mes', label: 'Mês a mês' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'ano', label: 'Ano' },
];

function sufixo(mode: AnalysisPeriodMode, count: number): string {
  if (mode === 'ano') return count === 1 ? 'último ano' : `últimos ${count} anos`;
  if (mode === 'trimestre') return `últimos ${count} trimestres`;
  return `últimos ${count} meses`;
}

/**
 * Aba Análise: comparação entre períodos e desempenho por cliente.
 *
 * Diferente das outras abas de Relatórios, esta IGNORA o filtro de período da
 * tela: a pergunta aqui é justamente "como este mês se compara com os
 * anteriores", e um filtro por fora recortaria a própria comparação.
 */
export function FinanceAnalysis({ transactions, isLoading = false }: FinanceAnalysisProps) {
  const [regime, setRegime] = useState<DreRegime>('caixa');
  const [periodMode, setPeriodMode] = useState<AnalysisPeriodMode>('mes');
  const [periodCount, setPeriodCount] = useState<number>(QUANTIDADES.mes[0]);
  const [topN, setTopN] = useState<number>(5);
  const [ordem, setOrdem] = useState<'faturamento' | 'margem'>('faturamento');

  const {
    categories,
    isLoading: isLoadingCategories,
    isError: isErrorCategories,
    refetch: refetchCategories,
  } = useFinancialCategories();
  const {
    settings,
    isLoading: isLoadingSettings,
    isError: isErrorSettings,
    refetch: refetchSettings,
  } = useCompanySettings();
  const { locale, currency, timezone } = useAppLocaleContext();
  const isMobile = useIsMobile();

  const intlLocale = locale === 'pt-br' ? 'pt-BR' : locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : 'fr-FR';
  const money = (value: number) => formatMoney(value, currency, locale);
  const compactMoney = (value: number) => new Intl.NumberFormat(
    intlLocale,
    { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 },
  ).format(value);
  // `toFixed` imprime ponto decimal; num relatório em PT-BR a vírgula é o
  // separador esperado (27,5% e não 27.5%).
  const pct = (value: number, signed = false) => {
    const texto = new Intl.NumberFormat(intlLocale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: signed ? 'exceptZero' : 'auto',
    }).format(value);
    return `${texto}%`;
  };

  const categoryDreGroups = useMemo(
    () => new Map(categories.map((category) => [category.name, category.dre_group])),
    [categories],
  );

  const data = useMemo(
    () => buildFinanceAnalysis({
      transactions,
      regime,
      today: todayInTz(timezone),
      periodMode,
      periodCount,
      categoryDreGroups,
      dreStartDate: (settings as { dre_start_date?: string | null } | null)?.dre_start_date,
    }),
    [categoryDreGroups, periodCount, periodMode, regime, settings, timezone, transactions],
  );

  const chartData = data.periods.map((p) => ({
    label: p.label,
    Receitas: p.revenue,
    Despesas: p.expense,
    Resultado: p.result,
  }));

  const clientes = useMemo(() => {
    const lista = ordem === 'margem'
      // Cliente sem faturamento não tem margem definida; vai para o fim em vez
      // de virar o "melhor" da lista por acidente de ordenação.
      ? data.customers.slice().sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity))
      : data.customers;
    return lista.slice(0, topN);
  }, [data.customers, ordem, topN]);

  const totalPeriodo = data.periods.reduce(
    (acc, p) => ({ revenue: acc.revenue + p.revenue, expense: acc.expense + p.expense }),
    { revenue: 0, expense: 0 },
  );

  if (isLoading || isLoadingCategories || isLoadingSettings) {
    return <FinanceAnalysisLoading />;
  }

  if (isErrorCategories || isErrorSettings) {
    return (
      <FinanceAnalysisError
        onRetry={() => {
          void refetchCategories();
          void refetchSettings();
        }}
      />
    );
  }

  return (
    <section className="space-y-5 sm:space-y-6" aria-labelledby="finance-analysis-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="finance-analysis-title" className="text-lg font-semibold">Análise</h2>
          <p className="text-sm text-muted-foreground">
            Compara períodos e mostra quem fatura mais e quem realmente sobra no fim.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            A comparação usa os períodos escolhidos nesta análise.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Regime da análise"
          className="grid w-full grid-cols-2 border-b border-border bg-transparent sm:flex sm:w-auto"
        >
          {(['caixa', 'competencia'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={regime === value}
              onClick={() => setRegime(value)}
              className={cn(
                '-mb-px min-h-10 whitespace-nowrap border-b-2 border-transparent bg-transparent px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                regime === value
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value === 'caixa' ? 'Regime de Caixa' : 'Regime de Competência'}
            </button>
          ))}
        </div>
      </div>

      <Card className="border-0 bg-muted/20 shadow-none">
        <CardHeader className="flex flex-col gap-3 p-4 pb-2 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-foreground/70">
            Receita × despesa · {sufixo(periodMode, periodCount)}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={periodMode}
              onValueChange={(value) => {
                const modo = value as AnalysisPeriodMode;
                setPeriodMode(modo);
                setPeriodCount(QUANTIDADES[modo][0]);
              }}
            >
              <SelectTrigger className="h-9 w-[138px] text-xs" aria-label="Agrupamento dos períodos">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODOS.map((modo) => (
                  <SelectItem key={modo.value} value={modo.value}>{modo.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(periodCount)} onValueChange={(value) => setPeriodCount(Number(value))}>
              <SelectTrigger className="h-9 w-[118px] text-xs" aria-label="Quantos períodos comparar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUANTIDADES[periodMode].map((quantidade) => (
                  <SelectItem key={quantidade} value={String(quantidade)}>
                    {quantidade} {periodMode === 'ano' ? 'anos' : periodMode === 'trimestre' ? 'trimestres' : 'meses'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-2 sm:p-6 sm:pt-2">
          {totalPeriodo.revenue === 0 && totalPeriodo.expense === 0 ? (
            <AnalysisEmpty description="Registre receitas ou despesas para comparar os períodos." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: isMobile ? 11 : 12 }} />
                  <YAxis width={isMobile ? 58 : 76} tick={{ fontSize: isMobile ? 11 : 12 }} tickFormatter={compactMoney} />
                  <Tooltip formatter={(value: number) => money(value)} />
                  <Legend wrapperStyle={isMobile ? { fontSize: 11 } : undefined} />
                  <Bar dataKey="Receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="Resultado" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Período</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Receitas</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Despesas</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Resultado</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Variação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.periods.map((p, index) => {
                      const anterior = index > 0 ? data.periods[index - 1] : null;
                      // Variação só existe com base positiva: de 0 para 500 não é
                      // "aumento de infinito por cento", é simplesmente novo.
                      const variacao = anterior && anterior.revenue > 0
                        ? ((p.revenue - anterior.revenue) / anterior.revenue) * 100
                        : null;
                      return (
                        <TableRow key={p.key}>
                          <TableCell className="whitespace-nowrap font-medium">{p.label}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{money(p.revenue)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{money(p.expense)}</TableCell>
                          <TableCell
                            className={cn(
                              'whitespace-nowrap text-right font-semibold tabular-nums',
                              p.result >= 0 ? 'text-success' : 'text-destructive',
                            )}
                          >
                            {money(p.result)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                            {variacao === null ? '—' : (
                              <span className={cn('inline-flex items-center gap-1', variacao >= 0 ? 'text-success' : 'text-destructive')}>
                                {variacao >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {pct(variacao, true)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 bg-muted/20 shadow-none">
        <CardHeader className="flex flex-col gap-3 p-4 pb-2 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground/70">
            <Users className="h-4 w-4" aria-hidden="true" />
            Clientes · {sufixo(periodMode, periodCount)}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={ordem} onValueChange={(value) => setOrdem(value as 'faturamento' | 'margem')}>
              <SelectTrigger className="h-9 w-[160px] text-xs" aria-label="Ordenar clientes por">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="faturamento">Maior faturamento</SelectItem>
                <SelectItem value="margem">Melhor margem</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(topN)} onValueChange={(value) => setTopN(Number(value))}>
              <SelectTrigger className="h-9 w-[100px] text-xs" aria-label="Quantos clientes mostrar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Top 5</SelectItem>
                <SelectItem value="10">Top 10</SelectItem>
                <SelectItem value="25">Top 25</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-2 sm:p-6 sm:pt-2">
          {clientes.length === 0 ? (
            <AnalysisEmpty description="Vincule o cliente nas receitas para ver o ranking e a margem de cada um." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Cliente</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Faturamento</TableHead>
                      <TableHead className="whitespace-nowrap text-right">% do total</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Custo direto</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Sobra</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Margem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientes.map((cliente) => (
                      <TableRow key={cliente.customerId}>
                        <TableCell className="min-w-[150px] max-w-[240px] whitespace-normal break-words font-medium leading-snug" title={cliente.name}>
                          {cliente.name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{money(cliente.revenue)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
                          {data.totalRevenue > 0 ? pct((cliente.revenue / data.totalRevenue) * 100) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">{money(cliente.expense)}</TableCell>
                        <TableCell
                          className={cn(
                            'whitespace-nowrap text-right tabular-nums',
                            cliente.result >= 0 ? 'text-success' : 'text-destructive',
                          )}
                        >
                          {money(cliente.result)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'whitespace-nowrap text-right font-semibold tabular-nums',
                            cliente.margin === null ? 'text-muted-foreground'
                              : cliente.margin >= 0 ? 'text-success' : 'text-destructive',
                          )}
                        >
                          {cliente.margin === null ? '—' : pct(cliente.margin)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ResponsiveContainer width="100%" height={Math.max(200, clientes.length * 42)}>
                <BarChart data={clientes} layout="vertical" margin={{ left: isMobile ? 0 : 12, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={isMobile ? 116 : 190}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: string) => abbreviateAxisLabel(value, isMobile ? 17 : 30)}
                  />
                  <Tooltip formatter={(value: number) => money(value)} />
                  <Legend wrapperStyle={isMobile ? { fontSize: 11 } : undefined} />
                  <Bar dataKey="revenue" name="Faturamento" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="expense" name="Custo direto" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <p className="flex items-start gap-2 rounded-lg bg-background/60 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  A margem por cliente usa só as despesas lançadas com aquele cliente.
                  {data.unattributedExpense > 0 ? (
                    <>
                      {' '}As despesas de estrutura do período, {money(data.unattributedExpense)}, não têm cliente
                      vinculado e ficam fora destas contas, então a soma das sobras acima não é o resultado da empresa.
                    </>
                  ) : null}
                </span>
              </p>
            </>
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

function abbreviateAxisLabel(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value;
}

function FinanceAnalysisError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Não foi possível carregar a análise financeira</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Os dados parciais foram ocultados para não apresentar indicadores incorretos.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="min-h-10 gap-2 border-destructive/40">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function AnalysisEmpty({ description }: { description: string }) {
  return (
    <EmptyState
      size="compact"
      icon={<BarChart3 className="h-9 w-9" />}
      title="Sem dados para comparar"
      description={description}
    />
  );
}

function FinanceAnalysisLoading() {
  return (
    <section className="space-y-5 sm:space-y-6" aria-label="Carregando análise" aria-busy="true">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-72 max-w-full" /></div>
        <Skeleton className="hidden h-9 w-60 sm:block" />
      </div>
      <Skeleton className="h-80 w-full" />
      <Skeleton className="h-80 w-full" />
    </section>
  );
}
