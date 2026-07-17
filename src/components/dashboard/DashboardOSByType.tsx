import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Layers } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion } from 'framer-motion';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--info))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--success))',
];

/**
 * IDs únicos de gradient — cada slice tem o seu, com a cor base do `CHART_COLORS`
 * indo de saturado (100%) a translúcido (55%) num degradê diagonal.
 * Regra sistema-wide CEO 2026-05-23: gráficos com degradê em vez de cor sólida.
 */
const GRADIENT_IDS = CHART_COLORS.map((_, i) => `gradOsByType${i}`);

interface TypeData {
  name: string;
  value: number;
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
};

export function DashboardOSByType({ data, isLoading }: { data: TypeData[]; isLoading: boolean }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.dashboard.osByType;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }}>
      <Card className="rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2 text-center lg:text-left justify-center lg:justify-start leading-tight">
            <Layers className="h-5 w-5 text-muted-foreground" />
            {t.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : data.length > 0 ? (
            <div className="flex flex-col lg:flex-row items-center gap-4">
              <div className="relative w-[180px] h-[180px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {CHART_COLORS.map((color, i) => (
                        <linearGradient key={GRADIENT_IDS[i]} id={GRADIENT_IDS[i]} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={1} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={data}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                      animationDuration={1000}
                    >
                      {data.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#${GRADIENT_IDS[index % GRADIENT_IDS.length]})`} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-foreground">{total}</span>
                  <span className="text-[10px] text-muted-foreground">{t.total}</span>
                </div>
              </div>
              <div className="flex-1 w-full space-y-2">
                {data.map((entry, index) => {
                  const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
                  return (
                    <div key={entry.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span className="truncate text-muted-foreground">{entry.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-medium text-foreground">{entry.value}</span>
                        <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-muted-foreground text-sm">{t.empty}</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}