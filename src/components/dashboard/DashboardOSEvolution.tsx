import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { motion } from 'framer-motion';

type ViewMode = 'daily' | 'weekly' | 'monthly';

interface EvolutionData {
  daily: Array<{ period: string; total: number; concluidas: number }>;
  weekly: Array<{ period: string; total: number; concluidas: number }>;
  monthly: Array<{ period: string; total: number; concluidas: number }>;
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
};

const viewLabels: Record<ViewMode, string> = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };

export function DashboardOSEvolution({ data, isLoading }: { data: EvolutionData; isLoading: boolean }) {
  const [view, setView] = useState<ViewMode>('monthly');
  const chartData = data[view];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col items-center gap-2 lg:flex-row lg:justify-between">
            <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2 text-center lg:text-left">
              <Activity className="h-5 w-5 text-muted-foreground" />
              Evolução de OS
            </CardTitle>
            <div className="inline-flex rounded-lg border border-border bg-muted/50 p-1">
              {(['daily', 'weekly', 'monthly'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    view === v
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {viewLabels[v]}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradEvTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradEvConcluidas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={30} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  formatter={(value: string) => <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#gradEvTotal)"
                  dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                  name="Total"
                />
                <Area
                  type="monotone"
                  dataKey="concluidas"
                  stroke="hsl(var(--info))"
                  strokeWidth={2}
                  fill="url(#gradEvConcluidas)"
                  dot={{ r: 3, fill: 'hsl(var(--info))' }}
                  name="Concluídas"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}