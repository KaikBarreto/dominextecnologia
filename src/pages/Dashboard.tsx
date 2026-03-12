import { useMemo, lazy, Suspense } from 'react';
import {
  ClipboardList,
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { osStatusLabels, osTypeLabels } from '@/types/database';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Pie,
  Cell,
  Area,
  Legend,
} from 'recharts';

// Lazy load heavy chart components
const LazyBarChart = lazy(() => import('recharts').then(m => ({ default: m.BarChart })));
const LazyPieChart = lazy(() => import('recharts').then(m => ({ default: m.PieChart })));
const LazyAreaChart = lazy(() => import('recharts').then(m => ({ default: m.AreaChart })));

const ChartLoadingFallback = () => (
  <div className="flex items-center justify-center h-[250px]">
    <div className="animate-pulse bg-muted rounded w-full h-full" />
  </div>
);

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

const statusConfig = {
  agendada: {
    label: 'Agendada',
    icon: CalendarClock,
    color: 'text-white',
    bgColor: 'bg-violet-500',
  },
  pendente: {
    label: 'Pendente',
    icon: Clock,
    color: 'text-white',
    bgColor: 'bg-warning',
  },
  em_andamento: {
    label: 'Em Andamento',
    icon: AlertCircle,
    color: 'text-white',
    bgColor: 'bg-info',
  },
  concluida: {
    label: 'Concluída',
    icon: CheckCircle2,
    color: 'text-white',
    bgColor: 'bg-success',
  },
  cancelada: {
    label: 'Cancelada',
    icon: XCircle,
    color: 'text-white',
    bgColor: 'bg-destructive',
  },
};

const PIE_COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6'];

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  color: 'hsl(var(--foreground))',
};

export default function Dashboard() {
  const { profile } = useAuth();
  const { data: stats, isLoading } = useDashboardStats();
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');
  const isMobile = useIsMobile();

  const chartHeight = isMobile ? 220 : 280;

  // Filter OS data by scheduled_date
  const filteredRecentOS = useMemo(() => {
    if (!stats?.recentOS) return [];
    return filterByDate(stats.recentOS, 'scheduled_date');
  }, [stats?.recentOS, range]);

  // Filter OS status counts
  const filteredOsByStatus = useMemo(() => {
    if (!stats?.allOS) return { pendente: 0, em_andamento: 0, concluida: 0, cancelada: 0 };
    const filtered = filterByDate(stats.allOS, 'scheduled_date');
    const counts = { pendente: 0, em_andamento: 0, concluida: 0, cancelada: 0 };
    filtered.forEach((os: any) => {
      if (os.status in counts) counts[os.status as keyof typeof counts]++;
    });
    return counts;
  }, [stats?.allOS, range]);

  // Filter OS type counts
  const filteredOsByType = useMemo(() => {
    if (!stats?.allOS) return {};
    const filtered = filterByDate(stats.allOS, 'scheduled_date');
    const counts: Record<string, number> = {
      manutencao_preventiva: 0,
      manutencao_corretiva: 0,
      instalacao: 0,
      visita_tecnica: 0,
    };
    filtered.forEach((os: any) => {
      if (os.os_type in counts) counts[os.os_type]++;
    });
    return counts;
  }, [stats?.allOS, range]);

  // Filter financial data
  const filteredFinancial = useMemo(() => {
    if (!stats?.allFinancial) return { faturamento: 0, despesas: 0 };
    const filtered = filterByDate(stats.allFinancial, 'transaction_date');
    let faturamento = 0;
    let despesas = 0;
    filtered.forEach((t: any) => {
      if (t.transaction_type === 'entrada') faturamento += Number(t.amount);
      else despesas += Number(t.amount);
    });
    return { faturamento, despesas };
  }, [stats?.allFinancial, range]);

  // Monthly chart data
  const filteredMonthlyChart = useMemo(() => {
    if (!stats?.allFinancial) return [];
    const filtered = filterByDate(stats.allFinancial, 'transaction_date');
    const monthMap = new Map<string, { entradas: number; saidas: number }>();
    filtered.forEach((t: any) => {
      const date = new Date(t.transaction_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(monthKey)) monthMap.set(monthKey, { entradas: 0, saidas: 0 });
      const current = monthMap.get(monthKey)!;
      if (t.transaction_type === 'entrada') current.entradas += Number(t.amount);
      else current.saidas += Number(t.amount);
    });
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, values]) => ({
        month: monthNames[parseInt(key.split('-')[1]) - 1],
        entradas: values.entradas,
        saidas: values.saidas,
      }));
  }, [stats?.allFinancial, range]);

  // OS evolution monthly (for AreaChart)
  const osEvolutionChart = useMemo(() => {
    if (!stats?.allOS) return [];
    const filtered = filterByDate(stats.allOS, 'scheduled_date');
    const monthMap = new Map<string, { total: number; concluidas: number }>();
    filtered.forEach((os: any) => {
      if (!os.scheduled_date) return;
      const date = new Date(os.scheduled_date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(monthKey)) monthMap.set(monthKey, { total: 0, concluidas: 0 });
      const current = monthMap.get(monthKey)!;
      current.total++;
      if (os.status === 'concluida') current.concluidas++;
    });
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, values]) => ({
        month: monthNames[parseInt(key.split('-')[1]) - 1],
        total: values.total,
        concluidas: values.concluidas,
      }));
  }, [stats?.allOS, range]);

  const filteredOsAbertas = filteredOsByStatus.pendente + filteredOsByStatus.em_andamento;
  const totalFilteredOS = filteredOsByStatus.pendente + filteredOsByStatus.em_andamento + filteredOsByStatus.concluida;
  const filteredTaxaConclusao = totalFilteredOS > 0 ? Math.round((filteredOsByStatus.concluida / totalFilteredOS) * 100) : 0;

  const pieData = Object.entries(filteredOsByType)
    .filter(([_, count]) => count > 0)
    .map(([type, count]) => ({
      name: osTypeLabels[type as keyof typeof osTypeLabels],
      value: count,
    }));
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const formatYAxis = (value: number) => {
    if (value === 0) return 'R$ 0';
    if (Math.abs(value) >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
    if (Math.abs(value) >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
    return `R$ ${value}`;
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground lg:text-3xl flex items-center gap-2">
            Olá, {profile?.full_name?.split(' ')[0] || 'Usuário'}! 👋
          </h1>
          <p className="text-sm text-muted-foreground">Aqui está o resumo do seu dia</p>
        </div>
        <DateRangeFilter
          value={range}
          preset={preset}
          onPresetChange={setPreset}
          onRangeChange={setRange}
        />
      </div>

      {/* Stats Cards - EcoSistema style with solid colors */}
      {isLoading ? (
        <div className="grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4 lg:p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="relative overflow-hidden border-0 shadow-lg bg-[hsl(var(--primary))] text-white dark:bg-card dark:text-card-foreground dark:border dark:border-primary/30 dark:shadow-[0_0_15px_-3px_hsl(var(--primary)/0.15)]">
            <CardContent className="p-4 lg:p-6">
              <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
                <div className="p-2 rounded-xl bg-black/10 dark:bg-primary/15 mb-2 lg:mb-0 lg:order-2">
                  <ClipboardList className="h-4 w-4 text-white dark:text-primary" />
                </div>
                <div className="space-y-1 lg:order-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 dark:text-muted-foreground">OS Abertas</p>
                  <p className="text-xl lg:text-2xl font-bold dark:text-primary">{filteredOsAbertas}</p>
                  <p className="text-[10px] text-white/60 dark:text-muted-foreground">{filteredOsByStatus.pendente} pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 shadow-lg bg-[hsl(var(--success))] text-white dark:bg-card dark:text-card-foreground dark:border dark:border-success/30 dark:shadow-[0_0_15px_-3px_hsl(var(--success)/0.15)]">
            <CardContent className="p-4 lg:p-6">
              <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
                <div className="p-2 rounded-xl bg-black/10 dark:bg-success/15 mb-2 lg:mb-0 lg:order-2">
                  <Users className="h-4 w-4 text-white dark:text-success" />
                </div>
                <div className="space-y-1 lg:order-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 dark:text-muted-foreground">Clientes Ativos</p>
                  <p className="text-xl lg:text-2xl font-bold dark:text-success">{stats?.clientesAtivos ?? 0}</p>
                  <p className="text-[10px] text-white/60 dark:text-muted-foreground">cadastrados</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 shadow-lg bg-[hsl(var(--info))] text-white dark:bg-card dark:text-card-foreground dark:border dark:border-info/30 dark:shadow-[0_0_15px_-3px_hsl(var(--info)/0.15)]">
            <CardContent className="p-4 lg:p-6">
              <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
                <div className="p-2 rounded-xl bg-black/10 dark:bg-info/15 mb-2 lg:mb-0 lg:order-2">
                  <DollarSign className="h-4 w-4 text-white dark:text-info" />
                </div>
                <div className="space-y-1 lg:order-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 dark:text-muted-foreground">Faturamento</p>
                  <p className="text-lg lg:text-2xl font-bold truncate dark:text-info">{formatCurrency(filteredFinancial.faturamento)}</p>
                  <p className="text-[10px] text-white/60 dark:text-muted-foreground">No período</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 shadow-lg bg-[hsl(var(--warning))] text-white dark:bg-card dark:text-card-foreground dark:border dark:border-warning/30 dark:shadow-[0_0_15px_-3px_hsl(var(--warning)/0.15)]">
            <CardContent className="p-4 lg:p-6">
              <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
                <div className="p-2 rounded-xl bg-black/10 dark:bg-warning/15 mb-2 lg:mb-0 lg:order-2">
                  <TrendingUp className="h-4 w-4 text-white dark:text-warning" />
                </div>
                <div className="space-y-1 lg:order-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 dark:text-muted-foreground">Taxa de Conclusão</p>
                  <p className="text-xl lg:text-2xl font-bold dark:text-warning">{filteredTaxaConclusao}%</p>
                  <p className="text-[10px] text-white/60 dark:text-muted-foreground">{filteredOsByStatus.concluida} concluídas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bento Grid Row 1: Cash Flow + OS by Type */}
      {isLoading ? (
        <div className="grid gap-3 lg:gap-4 grid-cols-1 lg:grid-cols-2">
          <Card><CardContent className="p-6"><Skeleton className="h-[280px] w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-[280px] w-full" /></CardContent></Card>
        </div>
      ) : (
        <div className="grid gap-3 lg:gap-4 grid-cols-1 lg:grid-cols-2">
          {/* Cash Flow BarChart with gradients */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                Fluxo de Caixa
              </CardTitle>
            </CardHeader>
            <CardContent className="-mx-2 lg:mx-0">
              {filteredMonthlyChart.length > 0 ? (
                <Suspense fallback={<ChartLoadingFallback />}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <LazyBarChart data={filteredMonthlyChart}>
                      <defs>
                        <linearGradient id="gradEntradas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.9} />
                          <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                        </linearGradient>
                        <linearGradient id="gradSaidas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.9} />
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={formatYAxis} width={65} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar dataKey="entradas" name="Entradas" fill="url(#gradEntradas)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="saidas" name="Saídas" fill="url(#gradSaidas)" radius={[4, 4, 0, 0]} />
                    </LazyBarChart>
                  </ResponsiveContainer>
                </Suspense>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">Sem dados para exibir</div>
              )}
            </CardContent>
          </Card>

          {/* OS by Type — Donut + Legend list */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                OS por Tipo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length > 0 ? (
                <div className="flex flex-col items-center gap-4">
                  <Suspense fallback={<ChartLoadingFallback />}>
                    <ResponsiveContainer width="100%" height={isMobile ? 180 : 200}>
                      <LazyPieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={isMobile ? 45 : 55}
                          outerRadius={isMobile ? 75 : 85}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {pieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </LazyPieChart>
                    </ResponsiveContainer>
                  </Suspense>
                  {/* Legend list */}
                  <div className="w-full space-y-2">
                    {pieData.map((entry, index) => {
                      const pct = pieTotal > 0 ? Math.round((entry.value / pieTotal) * 100) : 0;
                      return (
                        <div key={entry.name} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                            <span className="truncate text-muted-foreground">{entry.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-medium">{entry.value}</span>
                            <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">Sem OS no período</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bento Grid Row 2: OS Evolution + Status Summary */}
      <div className="grid gap-3 lg:gap-4 grid-cols-1 lg:grid-cols-2">
        {/* OS Evolution AreaChart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              Evolução de OS
            </CardTitle>
          </CardHeader>
          <CardContent className="-mx-2 lg:mx-0">
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : osEvolutionChart.length > 0 ? (
              <Suspense fallback={<ChartLoadingFallback />}>
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <LazyAreaChart data={osEvolutionChart}>
                    <defs>
                      <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradConcluidas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 10 }} width={35} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#gradTotal)" name="Total" />
                    <Area type="monotone" dataKey="concluidas" stroke="hsl(var(--success))" strokeWidth={2} fillOpacity={1} fill="url(#gradConcluidas)" name="Concluídas" />
                  </LazyAreaChart>
                </ResponsiveContainer>
              </Suspense>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
            )}
          </CardContent>
        </Card>

        {/* Status Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              Resumo por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">{[...Array(3)].map((_, i) => (<Skeleton key={i} className="h-16 w-full" />))}</div>
            ) : (
              <div className="space-y-3">
                {Object.entries(statusConfig).map(([status, config]) => {
                  const count = filteredOsByStatus[status as keyof typeof filteredOsByStatus] || 0;
                  const total = Object.values(filteredOsByStatus).reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={status} className="flex items-center gap-3 rounded-lg border p-3">
                      {!isMobile && (
                        <div className={`rounded-full p-2.5 ${config.bgColor}`}>
                          <config.icon className={`h-4 w-4 ${config.color}`} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{config.label}</p>
                          <span className="text-lg font-bold">{count}</span>
                        </div>
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full transition-all ${config.bgColor}`} style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent OS — full width */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            Ordens de Serviço Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-14 w-full" />))}</div>
          ) : filteredRecentOS.length > 0 ? (
            <div className="space-y-2">
              {filteredRecentOS.slice(0, 5).map((os: any) => {
                const statusInfo = statusConfig[os.status as keyof typeof statusConfig] || statusConfig.pendente;
                return (
                  <div key={os.id} className="flex items-center justify-between rounded-lg border p-3 gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">#{String(os.order_number).padStart(4, '0')}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${statusInfo.bgColor} ${statusInfo.color}`}>
                          <statusInfo.icon className="h-3 w-3" />{statusInfo.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{os.customer?.name || 'Cliente não informado'}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {osTypeLabels[os.os_type as keyof typeof osTypeLabels]}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma OS no período</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
