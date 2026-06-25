import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { motion } from 'framer-motion';

interface CashFlowData {
  monthlyData: Array<{ month: string; entradas: number; saidas: number }>;
  totalEntradas: number;
  totalSaidas: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const formatYAxis = (value: number) => {
  if (value === 0) return 'R$ 0';
  if (Math.abs(value) >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
  return `R$ ${value}`;
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
};

export function DashboardCashFlow({ data, isLoading }: { data: CashFlowData; isLoading: boolean }) {
  const saldo = data.totalEntradas - data.totalSaidas;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
      <Card className="rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2 text-center lg:text-left justify-center lg:justify-start leading-tight">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            Fluxo de Caixa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : data.monthlyData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.monthlyData} barGap={4}>
                  {/* Degradê vertical nas barras — regra sistema-wide CEO 2026-05-23.
                      Topo saturado (90%), base translúcida (40%) pra dar leveza. */}
                  <defs>
                    <linearGradient id="gradCashEntradas" x1="0" y1="0" x2="0" y2="1">
                      {/* Receita é SEMPRE verde semântico (--success), nunca a cor de
                          white-label (--primary) — espelha o FinanceOverview. */}
                      <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                    </linearGradient>
                    <linearGradient id="gradCashSaidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={formatYAxis} width={60} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px' }}
                    formatter={(value: string) => <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>}
                  />
                  <Bar dataKey="entradas" name="Entradas" fill="url(#gradCashEntradas)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saidas" name="Saídas" fill="url(#gradCashSaidas)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border text-sm justify-center lg:justify-start">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'hsl(var(--success))' }} />
                  <span className="text-muted-foreground">Entradas:</span>
                  <span className="font-semibold text-foreground">{formatCurrency(data.totalEntradas)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
                  <span className="text-muted-foreground">Saídas:</span>
                  <span className="font-semibold text-foreground">{formatCurrency(data.totalSaidas)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${saldo >= 0 ? 'bg-success' : 'bg-destructive'}`} />
                  <span className="text-muted-foreground">Saldo:</span>
                  <span className={`font-semibold ${saldo >= 0 ? 'text-success' : 'text-destructive'}`}>{formatCurrency(saldo)}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">Sem dados para exibir</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}