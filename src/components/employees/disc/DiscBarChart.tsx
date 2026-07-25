// ─────────────────────────────────────────────────────────────────────────────
// DISC — gráfico de barras dos 4 fatores (D, I, S, C).
//
// 4 barras verticais na ordem canônica D→I→S→C, cada uma na cor do fator
// (FACTOR_COLOR), eixo 0–100, linha de referência na média 50, valor numérico
// rotulado no topo de cada barra. Rótulos vêm do i18n (factors[X].short).
//
// Tela-documento: cores hardcoded claras (não segue tema do usuário).
// ─────────────────────────────────────────────────────────────────────────────

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { DISC_FACTORS, type DiscFactor } from '@/lib/disc/questions';
import { FACTOR_COLOR } from '@/lib/disc/profiles';
import type { DiscScores } from '@/lib/disc/scoring';
import type { LocaleCode } from '@/lib/i18n/locales';
import { useDiscMessages } from './useDiscMessages';

export interface DiscBarChartProps {
  scores: DiscScores;
  /** Idioma; se ausente, cai no contexto (pt-br fora do provider). */
  locale?: LocaleCode;
  className?: string;
}

export function DiscBarChart({ scores, locale, className }: DiscBarChartProps) {
  const { t } = useDiscMessages(locale);

  const data = DISC_FACTORS.map((factor) => ({
    factor,
    label: t.factors[factor].short,
    value: scores[factor],
  }));

  return (
    <div className={className}>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#334155', fontSize: 13, fontWeight: 600 }}
              axisLine={{ stroke: '#CBD5E1' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <ReferenceLine
              y={50}
              stroke="#94A3B8"
              strokeDasharray="4 4"
              label={{
                value: t.charts.average,
                position: 'right',
                fill: '#64748B',
                fontSize: 11,
              }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {data.map((entry) => (
                <Cell key={entry.factor} fill={FACTOR_COLOR[entry.factor as DiscFactor]} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                fill="#0F172A"
                fontSize={13}
                fontWeight={700}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
