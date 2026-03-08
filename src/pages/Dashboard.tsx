import { useMemo } from 'react';
import {
  ClipboardList,
  Users,
  DollarSign,
  TrendingUp,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { osStatusLabels, osTypeLabels } from '@/types/database';
import { DateRangeFilter, useDateRangeFilter } from '@/components/ui/DateRangeFilter';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

const statusConfig = {
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
};

const PIE_COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#8b5cf6'];

export default function Dashboard() {
  const { profile } = useAuth();
  const { data: stats, isLoading } = useDashboardStats();
  const { preset, range, setPreset, setRange, filterByDate } = useDateRangeFilter('this_month');

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

  // Filtered monthly chart
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

  const filteredOsAbertas = filteredOsByStatus.pendente + filteredOsByStatus.em_andamento;
  const totalFilteredOS = filteredOsByStatus.pendente + filteredOsByStatus.em_andamento + filteredOsByStatus.concluida;
  const filteredTaxaConclusao = totalFilteredOS > 0 ? Math.round((filteredOsByStatus.concluida / totalFilteredOS) * 100) : 0;

  const pieData = Object.entries(filteredOsByType)
    .filter(([_, count]) => count > 0)
    .map(([type, count]) => ({
      name: osTypeLabels[type as keyof typeof osTypeLabels],
      value: count,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          Olá, {profile?.full_name?.split(' ')[0] || 'Usuário'}! 👋
        </h1>
        <p className="text-muted-foreground">Aqui está o resumo do seu dia</p>
      </div>

      <DateRangeFilter
        value={range}
        preset={preset}
        onPresetChange={setPreset}
        onRangeChange={setRange}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">OS Abertas</p>
                    <p className="text-2xl font-bold">{filteredOsAbertas}</p>
                    <p className="text-xs text-muted-foreground">{filteredOsByStatus.pendente} pendentes</p>
                  </div>
                  <div className="rounded-full bg-primary p-3"><ClipboardList className="h-6 w-6 text-white" /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Clientes Ativos</p>
                    <p className="text-2xl font-bold">{stats?.clientesAtivos ?? 0}</p>
                    <p className="text-xs text-muted-foreground">cadastrados</p>
                  </div>
                  <div className="rounded-full bg-success p-3"><Users className="h-6 w-6 text-white" /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Faturamento</p>
                    <p className="text-2xl font-bold">{formatCurrency(filteredFinancial.faturamento)}</p>
                    <p className="text-xs text-muted-foreground">No período</p>
                  </div>
                  <div className="rounded-full bg-warning p-3"><DollarSign className="h-6 w-6 text-white" /></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Taxa de Conclusão</p>
                    <p className="text-2xl font-bold">{filteredTaxaConclusao}%</p>
                    <p className="text-xs text-muted-foreground">{filteredOsByStatus.concluida} concluídas</p>
                  </div>
                  <div className="rounded-full bg-info p-3"><TrendingUp className="h-6 w-6 text-white" /></div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground/70">
              <DollarSign className="h-5 w-5" /> Fluxo de Caixa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : filteredMonthlyChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={filteredMonthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" tickFormatter={(v) => new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short' }).format(v)} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} labelClassName="font-medium" />
                  <Bar dataKey="entradas" name="Entradas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saidas" name="Saídas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">Sem dados para exibir</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground/70">
              <ClipboardList className="h-5 w-5" /> OS por Tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} fill="#8884d8" paddingAngle={2} dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                    {pieData.map((_, index) => (<Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">Sem OS no período</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent OS and Status */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground/70">
              <ClipboardList className="h-5 w-5" /> Ordens de Serviço Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">{[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-16 w-full" />))}</div>
            ) : filteredRecentOS.length > 0 ? (
              <div className="space-y-4">
                {filteredRecentOS.slice(0, 5).map((os: any) => {
                  const statusInfo = statusConfig[os.status as keyof typeof statusConfig] || statusConfig.pendente;
                  return (
                    <div key={os.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">#{String(os.order_number).padStart(4, '0')}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${statusInfo.bgColor} ${statusInfo.color}`}>
                            <statusInfo.icon className="h-3 w-3" />{statusInfo.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{os.customer?.name || 'Cliente não informado'}</p>
                        <p className="text-xs text-muted-foreground">{osTypeLabels[os.os_type as keyof typeof osTypeLabels]}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhuma OS no período</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground/70">
              <Calendar className="h-5 w-5" /> Resumo por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">{[...Array(3)].map((_, i) => (<Skeleton key={i} className="h-16 w-full" />))}</div>
            ) : (
              <div className="space-y-4">
                {Object.entries(statusConfig).map(([status, config]) => {
                  const count = filteredOsByStatus[status as keyof typeof filteredOsByStatus] || 0;
                  const total = Object.values(filteredOsByStatus).reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={status} className="flex items-center gap-4 rounded-lg border p-4">
                      <div className={`rounded-full p-3 ${config.bgColor}`}>
                        <config.icon className={`h-5 w-5 ${config.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{config.label}</p>
                          <span className="text-lg font-bold">{count}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${config.bgColor}`} style={{ width: `${percentage}%` }} />
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
    </div>
  );
}
