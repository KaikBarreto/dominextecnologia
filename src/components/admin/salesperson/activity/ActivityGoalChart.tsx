import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActivitySeriesPoint } from '@/utils/salespersonActivityStats';
import { axisTickInterval, formatShortDateBR, shouldRotateAxisLabels } from './activityChartFormat';

interface Props {
  title: string;
  series: readonly ActivitySeriesPoint[];
  metricKey: 'contacts' | 'meetings_scheduled';
  /** Meta DIÁRIA (já soma manhã+tarde — `buildDailySeries` entrega o total do dia). */
  goal: number;
  color: string;
}

/** Altura fixa das DUAS instâncias (contatos/reuniões), de propósito: é o que
 * garante que a área de plotagem fique alinhada lado a lado no desktop — se
 * cada gráfico tivesse sua própria altura "natural", a comparação visual
 * enganaria (régua de UI: `alinhar_dois_graficos_lado_a_lado_legenda`). */
const CHART_HEIGHT = 260;

/**
 * Barra = realizado por dia útil, linha tracejada = meta diária travada pelo
 * CEO (200 contatos / 5 reuniões, por padrão — pode variar por vendedor
 * quando o gráfico é renderizado para 1 vendedor só). Barra que bate a meta
 * ganha a cor de destaque (verde Dominex); as demais ficam na cor da métrica.
 */
export function ActivityGoalChart({ title, series, metricKey, goal, color }: Props) {
  const rotate = shouldRotateAxisLabels(series.length);
  const interval = axisTickInterval(series.length);

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        {series.length === 0 ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height: CHART_HEIGHT }}
          >
            Sem dias úteis no período selecionado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={series as ActivitySeriesPoint[]} margin={{ top: 8, right: 8, left: 0, bottom: rotate ? 28 : 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDateBR}
                interval={interval}
                tick={{ fontSize: 11 }}
                angle={rotate ? -35 : 0}
                textAnchor={rotate ? 'end' : 'middle'}
                height={rotate ? 40 : 24}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                labelFormatter={(value) => formatShortDateBR(String(value))}
                formatter={(value: number) => [value, title]}
              />
              <Bar dataKey={metricKey} radius={[4, 4, 0, 0]} maxBarSize={28}>
                {series.map((point) => (
                  <Cell key={point.date} fill={point[metricKey] >= goal && goal > 0 ? '#00C597' : color} />
                ))}
              </Bar>
              {goal > 0 && (
                <ReferenceLine
                  y={goal}
                  stroke="#F97316"
                  strokeDasharray="4 4"
                  label={{ value: `Meta: ${goal}`, position: 'right', fill: '#F97316', fontSize: 11 }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
