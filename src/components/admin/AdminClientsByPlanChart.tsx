import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { LayoutGrid, DollarSign } from 'lucide-react';

const PLAN_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const PLAN_LABELS: Record<string, string> = {
  start: 'Start', basico: 'Básico', avancado: 'Avançado', master: 'Master', personalizado: 'Personalizado',
};

interface Props {
  companies: any[];
}

export function AdminClientsByPlanChart({ companies }: Props) {
  const active = companies.filter((c) => c.subscription_status === 'active');
  const planCount: Record<string, number> = {};
  const planRev: Record<string, number> = {};
  active.forEach((c) => {
    const raw = c.subscription_plan || 'Não informado';
    const label = PLAN_LABELS[raw] || raw;
    planCount[label] = (planCount[label] || 0) + 1;
    planRev[label] = (planRev[label] || 0) + Number(c.subscription_value || 0);
  });

  const clientData = Object.entries(planCount).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const revData = Object.entries(planRev).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const totalC = clientData.reduce((s, d) => s + d.value, 0);
  const totalR = revData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-indigo-500 to-blue-500 pb-3 px-4 sm:px-6">
          <CardTitle className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />Clientes por Plano
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={clientData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                {clientData.map((_, i) => <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />)}
              </Pie>
              <Tooltip
                formatter={(v: number, n: string) => [`${totalC ? ((v / totalC) * 100).toFixed(1) : 0}%`, n]}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
            {clientData.map((it, i) => (
              <div key={it.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                <span className="text-[11px] text-muted-foreground">{it.name}: <span className="font-semibold text-foreground">{it.value}</span></span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-emerald-500 to-teal-500 pb-3 px-4 sm:px-6">
          <CardTitle className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
            <DollarSign className="h-4 w-4" />Receita Mensal por Plano
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={revData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                {revData.map((_, i) => <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />)}
              </Pie>
              <Tooltip
                formatter={(v: number, n: string) => [`${totalR ? ((v / totalR) * 100).toFixed(1) : 0}%`, n]}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
            {revData.map((it, i) => (
              <div key={it.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PLAN_COLORS[i % PLAN_COLORS.length] }} />
                <span className="text-[11px] text-muted-foreground">{it.name}: <span className="font-semibold text-foreground">{fmt(it.value)}</span></span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
