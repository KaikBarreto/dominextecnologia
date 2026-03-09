import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { format, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

interface AdminDashboardChartsProps {
  companies: any[];
  transactions: any[];
  startDate: Date;
  endDate: Date;
}

export function AdminDashboardCharts({ companies, transactions, startDate, endDate }: AdminDashboardChartsProps) {
  // Origem dos clientes (filtered by period)
  const filteredCompanies = companies.filter((c: any) => {
    const createdAt = new Date(c.created_at);
    return createdAt >= startDate && createdAt <= endDate;
  });

  const originData = filteredCompanies.reduce((acc: any[], company: any) => {
    const origin = company.origin || 'Não informado';
    const existing = acc.find((item) => item.name === origin);
    if (existing) existing.value += 1;
    else acc.push({ name: origin, value: 1 });
    return acc;
  }, []);

  // Monthly revenue chart
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthlyRevenueData = Array.from({ length: 12 }, (_, month) => {
    const monthDate = new Date(currentYear, month, 1);
    const mStart = startOfMonth(monthDate);
    const mEnd = endOfMonth(monthDate);
    const isFuture = mStart > now;

    const totalRevenue = isFuture
      ? null
      : (transactions || [])
          .filter((t: any) => {
            if (t.type !== 'income') return false;
            const d = new Date(t.transaction_date);
            return d >= mStart && d <= mEnd;
          })
          .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

    return {
      month: format(monthDate, 'MMM/yy', { locale: ptBR }),
      receita: totalRevenue,
    };
  });

  // Churn rate
  const churnRateData = Array.from({ length: 12 }, (_, month) => {
    const monthDate = new Date(currentYear, month, 1);
    const mStart = startOfMonth(monthDate);
    const mEnd = endOfMonth(monthDate);
    const isFuture = mStart > now;

    if (isFuture) return { month: format(monthDate, 'MMM/yy', { locale: ptBR }), churn: null };

    const activeAtStart = companies.filter((c: any) => new Date(c.created_at) < mStart).length;
    const lostDuringMonth = companies.filter((c: any) => {
      if (!c.subscription_expires_at) return false;
      const exp = new Date(c.subscription_expires_at);
      return exp >= mStart && exp <= mEnd && new Date(c.created_at) < mStart && c.subscription_status === 'inactive';
    }).length;

    const churnRate = activeAtStart > 0 ? (lostDuringMonth / activeAtStart) * 100 : 0;
    return { month: format(monthDate, 'MMM/yy', { locale: ptBR }), churn: Math.min(churnRate, 100) };
  });

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Origem */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Origem dos Novos Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            {originData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={originData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {originData.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Nenhuma empresa cadastrada no período
              </div>
            )}
          </CardContent>
        </Card>

        {/* Receita Mensal */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Receita Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={monthlyRevenueData}>
                <defs>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Area
                  type="monotone"
                  dataKey="receita"
                  stroke="#10B981"
                  fill="url(#colorReceita)"
                  strokeWidth={2}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Churn Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Taxa de Churn Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={churnRateData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} className="text-xs" />
              <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
              <Line type="monotone" dataKey="churn" stroke="#EF4444" strokeWidth={2} dot={{ fill: '#EF4444' }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
