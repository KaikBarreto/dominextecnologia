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
  Legend,
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

  const pieData = stats?.osByType
    ? Object.entries(stats.osByType)
        .filter(([_, count]) => count > 0)
        .map(([type, count]) => ({
          name: osTypeLabels[type as keyof typeof osTypeLabels],
          value: count,
        }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          Olá, {profile?.full_name?.split(' ')[0] || 'Usuário'}! 👋
        </h1>
        <p className="text-muted-foreground">
          Aqui está o resumo do seu dia
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">OS Abertas</p>
                    <p className="text-2xl font-bold">{stats?.osAbertas ?? 0}</p>
                    <p className="text-xs text-muted-foreground">
                      {stats?.osPendentes ?? 0} pendentes
                    </p>
                  </div>
                  <div className="rounded-full bg-primary p-3">
                    <ClipboardList className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Clientes Ativos</p>
                    <p className="text-2xl font-bold">{stats?.clientesAtivos ?? 0}</p>
                    <p className="text-xs text-muted-foreground">
                      cadastrados
                    </p>
                  </div>
                  <div className="rounded-full bg-success p-3">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Faturamento</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(stats?.faturamentoMes ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Este mês</p>
                  </div>
                  <div className="rounded-full bg-warning/10 p-3">
                    <DollarSign className="h-6 w-6 text-warning" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Taxa de Conclusão</p>
                    <p className="text-2xl font-bold">{stats?.taxaConclusao ?? 0}%</p>
                    <p className="text-xs text-muted-foreground">
                      {stats?.osConcluidas ?? 0} concluídas
                    </p>
                  </div>
                  <div className="rounded-full bg-info/10 p-3">
                    <TrendingUp className="h-6 w-6 text-info" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Financial Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Fluxo de Caixa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : stats?.monthlyChart && stats.monthlyChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis
                    className="text-xs"
                    tickFormatter={(value) =>
                      new Intl.NumberFormat('pt-BR', {
                        notation: 'compact',
                        compactDisplay: 'short',
                      }).format(value)
                    }
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelClassName="font-medium"
                  />
                  <Bar dataKey="entradas" name="Entradas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saidas" name="Saídas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>

        {/* OS by Type Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              OS por Tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Sem OS cadastradas
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent OS and Schedule */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent OS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Ordens de Serviço Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : stats?.recentOS && stats.recentOS.length > 0 ? (
              <div className="space-y-4">
                {stats.recentOS.map((os: any) => {
                  const statusInfo = statusConfig[os.status as keyof typeof statusConfig] || statusConfig.pendente;
                  return (
                    <div
                      key={os.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">
                            #{String(os.order_number).padStart(4, '0')}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${statusInfo.bgColor} ${statusInfo.color}`}
                          >
                            <statusInfo.icon className="h-3 w-3" />
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {os.customer?.name || 'Cliente não informado'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {osTypeLabels[os.os_type as keyof typeof osTypeLabels]}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">Nenhuma OS recente</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Resumo por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : stats?.osByStatus ? (
              <div className="space-y-4">
                {Object.entries(statusConfig).map(([status, config]) => {
                  const count = stats.osByStatus[status as keyof typeof stats.osByStatus] || 0;
                  const total = Object.values(stats.osByStatus).reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

                  return (
                    <div
                      key={status}
                      className="flex items-center gap-4 rounded-lg border p-4"
                    >
                      <div className={`rounded-full p-3 ${config.bgColor}`}>
                        <config.icon className={`h-5 w-5 ${config.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{config.label}</p>
                          <span className="text-lg font-bold">{count}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full ${config.bgColor.replace('/10', '')}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">Sem dados disponíveis</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
