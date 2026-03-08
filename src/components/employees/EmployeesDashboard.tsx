import { Users, DollarSign, TrendingUp, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Employee } from '@/hooks/useEmployees';
import { BalanceSummary } from '@/utils/employeeCalculations';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface EmployeesDashboardProps {
  employees: Employee[];
  balances: Map<string, BalanceSummary>;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export function EmployeesDashboard({ employees, balances }: EmployeesDashboardProps) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const active = employees.filter(e => e.is_active);
  const totalPayroll = active.reduce((s, e) => s + (e.salary || 0), 0);
  const avgSalary = active.length ? totalPayroll / active.length : 0;
  const totalBalance = Array.from(balances.values()).reduce((s, b) => s + b.currentBalance, 0);

  // Position distribution
  const positionMap = new Map<string, number>();
  active.forEach(e => {
    const pos = e.position || 'Sem cargo';
    positionMap.set(pos, (positionMap.get(pos) || 0) + 1);
  });
  const positionData = Array.from(positionMap.entries()).map(([name, value]) => ({ name, value }));

  const stats = [
    { label: 'Total Funcionários', value: active.length, icon: Users },
    { label: 'Folha Salarial', value: fmt(totalPayroll), icon: DollarSign },
    { label: 'Salário Médio', value: fmt(avgSalary), icon: TrendingUp },
    { label: 'Saldo Total', value: fmt(totalBalance), icon: Wallet, color: totalBalance >= 0 ? 'text-green-600' : 'text-destructive' },
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
          <CardHeader><CardTitle className="text-base">Distribuição por Cargo</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={positionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                    {positionData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
