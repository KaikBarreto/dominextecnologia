import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatNumber, toBcp47 } from '@/lib/format';

interface CashFlowData {
  data: Array<{ label: string; entradas: number; saidas: number }>;
  totalEntradas: number;
  totalSaidas: number;
}

/** Símbolo da moeda no locale (ex.: 'R$', '$', '€') — pro eixo Y compacto. */
function currencySymbol(currency: string, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '10px',
  color: 'hsl(var(--foreground))',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  padding: '8px 12px',
};

export function DashboardCashFlow({ data, isLoading }: { data: CashFlowData; isLoading: boolean }) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.dashboard.cashFlow;
  const bcp47 = toBcp47(locale);
  const symbol = currencySymbol(currency, bcp47);
  const saldo = data.totalEntradas - data.totalSaidas;

  const formatYAxis = (value: number) => {
    if (value === 0) return `${symbol} 0`;
    if (Math.abs(value) >= 1000000) return `${symbol} ${formatNumber(value / 1000000, locale, { maximumFractionDigits: 1 })}M`;
    if (Math.abs(value) >= 1000) return `${symbol} ${formatNumber(value / 1000, locale, { maximumFractionDigits: 0 })}k`;
    return `${symbol} ${formatNumber(value, locale)}`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
      <Card className="rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm lg:text-base font-semibold flex items-center gap-2 text-center lg:text-left justify-center lg:justify-start leading-tight">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            {t.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : data.data.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={data.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {/* Degradês sutis sob cada linha: cor cheia no topo (~0.25) → transparente na base. */}
                  <defs>
                    <linearGradient id="cashflow-entradas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cashflow-saidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {/* Grid clean: só horizontais, baixa opacidade. */}
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
                  {/* preserveStartEnd + minTickGap evita labels sobrepostos em períodos longos (dia-a-dia). */}
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={formatYAxis}
                    width={60}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => formatMoney(value, currency, locale)}
                    contentStyle={tooltipStyle}
                    cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
                  />
                  {/* Receita é SEMPRE verde semântico (--success), nunca a cor de
                      white-label (--primary) — espelha o FinanceOverview.
                      Area só pinta o degradê (stroke none); a Line por cima dá a linha nítida. */}
                  <Area
                    type="monotone"
                    dataKey="entradas"
                    stroke="none"
                    fill="url(#cashflow-entradas)"
                    fillOpacity={1}
                    activeDot={false}
                    tooltipType="none"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="saidas"
                    stroke="none"
                    fill="url(#cashflow-saidas)"
                    fillOpacity={1}
                    activeDot={false}
                    tooltipType="none"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="entradas"
                    name={t.inflows}
                    stroke="hsl(var(--success))"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="saidas"
                    name={t.outflows}
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border text-sm justify-center">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'hsl(var(--success))' }} />
                  <span className="text-muted-foreground">{t.inflowsLabel}</span>
                  <span className="font-semibold text-foreground">{formatMoney(data.totalEntradas, currency, locale)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
                  <span className="text-muted-foreground">{t.outflowsLabel}</span>
                  <span className="font-semibold text-foreground">{formatMoney(data.totalSaidas, currency, locale)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${saldo >= 0 ? 'bg-success' : 'bg-destructive'}`} />
                  <span className="text-muted-foreground">{t.balanceLabel}</span>
                  <span className={`font-semibold ${saldo >= 0 ? 'text-success' : 'text-destructive'}`}>{formatMoney(saldo, currency, locale)}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground text-sm">{t.empty}</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}