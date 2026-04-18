import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  AreaChart, Area, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import type { Salesperson, SalespersonSale } from '@/hooks/useSalespersonData';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  salesperson: Salesperson;
  allSales: SalespersonSale[];
  currentMonthSales: SalespersonSale[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function SalespersonDetailCharts({ salesperson, allSales, currentMonthSales }: Props) {
  const goal = salesperson.monthly_goal || 30;

  const monthlyPerformance: { month: string; vendas: number; meta: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const month = subMonths(new Date(), i);
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const ms = allSales.filter((s) => {
      const d = new Date(s.created_at);
      return d >= start && d <= end;
    });
    monthlyPerformance.push({ month: format(month, 'MMM', { locale: ptBR }), vendas: ms.length, meta: goal });
  }

  const originCounts: Record<string, number> = {};
  currentMonthSales.forEach((s) => {
    const o = s.customer_origin || 'Não informado';
    originCounts[o] = (originCounts[o] || 0) + 1;
  });
  const originData = Object.entries(originCounts).map(([name, value]) => ({ name, value }));

  const now = new Date();
  const days = eachDayOfInterval({ start: subMonths(now, 1), end: now });
  const dailySales = days.map((d) => ({
    date: format(d, 'dd/MM'),
    vendas: allSales.filter((s) => isSameDay(new Date(s.created_at), d)).length,
  }));
  const weeklySales: { week: string; vendas: number }[] = [];
  for (let i = 0; i < dailySales.length; i += 7) {
    const w = dailySales.slice(i, i + 7);
    if (w.length) weeklySales.push({ week: w[0].date, vendas: w.reduce((s, x) => s + x.vendas, 0) });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-2"><CardTitle className="text-base">Vendas vs Meta (6 meses)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyPerformance}>
              <defs>
                <linearGradient id="cv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={1} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="vendas" fill="url(#cv)" name="Vendas" radius={[4, 4, 0, 0]} />
              <ReferenceLine y={goal} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Meta', position: 'right', fill: '#ef4444', fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-2"><CardTitle className="text-base">Origem dos Clientes</CardTitle></CardHeader>
        <CardContent>
          {originData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={originData} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                  label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}>
                  {originData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">Sem dados de vendas</div>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2 border-0 shadow-lg">
        <CardHeader className="pb-2"><CardTitle className="text-base">Evolução de Vendas (Últimas Semanas)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={weeklySales}>
              <defs>
                <linearGradient id="cws" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
              <Legend />
              <Area type="monotone" dataKey="vendas" stroke="#10b981" fillOpacity={1} fill="url(#cws)" name="Vendas" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
