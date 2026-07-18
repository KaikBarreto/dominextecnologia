import { Users, DollarSign, TrendingUp, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Employee } from '@/hooks/useEmployees';
import { BalanceSummary } from '@/utils/employeeCalculations';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';

interface EmployeesDashboardProps {
  employees: Employee[];
  balances: Map<string, BalanceSummary>;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function EmployeesDashboard({ employees, balances }: EmployeesDashboardProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const active = employees.filter(e => e.is_active);
  const totalPayroll = active.reduce((s, e) => s + (e.salary || 0), 0);
  const avgSalary = active.length ? totalPayroll / active.length : 0;
  const totalBalance = Array.from(balances.values()).reduce((s, b) => s + b.currentBalance, 0);

  // Position distribution
  const positionMap = new Map<string, number>();
  active.forEach(e => {
    const pos = e.position || t.dashboard.chart.noPosition;
    positionMap.set(pos, (positionMap.get(pos) || 0) + 1);
  });
  const positionData = Array.from(positionMap.entries()).map(([name, value]) => ({ name, value }));

  const stats = [
    { label: t.dashboard.kpi.totalEmployees, value: active.length, icon: Users },
    { label: t.dashboard.kpi.payroll, value: fmt(totalPayroll), icon: DollarSign },
    { label: t.dashboard.kpi.avgSalary, value: fmt(avgSalary), icon: TrendingUp },
    { label: t.dashboard.kpi.totalBalance, value: fmt(totalBalance), icon: Wallet, color: totalBalance >= 0 ? 'text-green-600' : 'text-destructive' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 w-full">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-lg font-bold truncate ${s.color || ''}`}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {positionData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t.dashboard.chart.byPosition}</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    {/* Gradient diagonal por slice (100% → 55%). Token semântico em cada cor. */}
                    {positionData.map((_, i) => {
                      const color = COLORS[i % COLORS.length];
                      return (
                        <linearGradient
                          key={`empdash-pie-grad-${i}`}
                          id={`empdash-pie-grad-${i}`}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={color} stopOpacity={1} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <Pie data={positionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                    {positionData.map((_, i) => <Cell key={i} fill={`url(#empdash-pie-grad-${i})`} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
