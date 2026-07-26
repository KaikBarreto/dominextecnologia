// ─────────────────────────────────────────────────────────────────────────────
// DISC — Radar do Perfil Emocional CRUZADO (2 pessoas sobrepostas).
//
// Variante de comparacao do DiscEmotionalRadar: plota DUAS series no mesmo
// radar (8 dimensoes emocionais), cada pessoa com sua COR (via prop) e legenda
// de nomes. Cada vertice recebe valueA/valueB.
//
// Espelho de DiscCompareRadar.tsx — cores vem por prop (A/B), nao fixas.
//
// ⚠️ Largura: o ResponsiveContainer do recharts so mede certo com largura
// DEFINIDA. Este wrapper usa w-full; nunca colocar em container flex-1/grid-1fr
// de largura flexivel, senao o radar renderiza minusculo.
// ─────────────────────────────────────────────────────────────────────────────

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { DiscScores } from '@/lib/disc/scoring';
import { computeEmotional } from '@/lib/disc/emotional';
import type { EmotionalKey } from '@/lib/disc/emotional';
import type { LocaleCode } from '@/lib/i18n/locales';
import { useDiscMessages } from './useDiscMessages';

export interface DiscEmotionalCompareRadarProps {
  scoresA: DiscScores;
  scoresB: DiscScores;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  /** Par DISC opcional (ex.: "DI") — se presente, aparece " (XX)" apos o nome na legenda. */
  codeA?: string;
  codeB?: string;
  locale?: LocaleCode;
  className?: string;
}

const LONG_LABEL_THRESHOLD = 11;

function splitLabel(label: string): [string, string | null] {
  if (label.length <= LONG_LABEL_THRESHOLD) return [label, null];
  const mid = Math.floor(label.length / 2);
  let breakAt = label.indexOf(' ', mid);
  if (breakAt === -1) breakAt = label.lastIndexOf(' ', mid);
  if (breakAt === -1) return [label, null];
  return [label.slice(0, breakAt), label.slice(breakAt + 1)];
}

function CustomAngleTick(props: {
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  payload?: { value: string };
}) {
  const { x = 0, y = 0, cx = 0, cy = 0, payload } = props;
  if (!payload) return null;

  const label = payload.value;
  const dx = x - cx;
  const dy = y - cy;

  const LABEL_OFFSET = 14;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const scale = dist > 0 ? (dist + LABEL_OFFSET) / dist : 1;
  const tx = cx + dx * scale;
  const ty = cy + dy * scale;

  const anchor: 'start' | 'middle' | 'end' = dx > 5 ? 'start' : dx < -5 ? 'end' : 'middle';

  const [line1, line2] = splitLabel(label);
  const LINE_HEIGHT = 12;

  return (
    <text
      x={tx}
      y={ty}
      textAnchor={anchor}
      dominantBaseline="middle"
      fontSize={10}
      fontWeight={600}
      fill="currentColor"
      fontFamily="system-ui, sans-serif"
    >
      {line2 ? (
        <>
          <tspan x={tx} dy={-LINE_HEIGHT / 2}>{line1}</tspan>
          <tspan x={tx} dy={LINE_HEIGHT}>{line2}</tspan>
        </>
      ) : (
        label
      )}
    </text>
  );
}

interface CompareTooltipContext {
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
}

function makeRadarTooltip(ctx: CompareTooltipContext) {
  return function RadarTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload || payload.length === 0) return null;
    const label: string = (payload[0].payload as { label?: string }).label ?? '';
    const valueA = (payload[0].payload as { valueA?: number }).valueA ?? 0;
    const valueB = (payload[0].payload as { valueB?: number }).valueB ?? 0;

    return (
      <div
        style={{
          background: 'hsl(var(--popover))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 8,
          padding: '6px 10px',
          color: 'hsl(var(--popover-foreground))',
          fontSize: 12,
          fontFamily: 'system-ui, sans-serif',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          pointerEvents: 'none',
          minWidth: 140,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: ctx.colorA, fontWeight: 600 }}>{ctx.nameA}</span>
          <span style={{ color: ctx.colorA, fontWeight: 700 }}>{valueA}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: ctx.colorB, fontWeight: 600 }}>{ctx.nameB}</span>
          <span style={{ color: ctx.colorB, fontWeight: 700 }}>{valueB}</span>
        </div>
      </div>
    );
  };
}

export function DiscEmotionalCompareRadar({
  scoresA,
  scoresB,
  nameA,
  nameB,
  colorA,
  colorB,
  codeA,
  codeB,
  locale,
  className,
}: DiscEmotionalCompareRadarProps) {
  const { t } = useDiscMessages(locale);

  const emoA = computeEmotional(scoresA);
  const emoB = computeEmotional(scoresB);

  const data = emoA.map((c, i) => ({
    label: t.emotional[c.key as EmotionalKey],
    valueA: c.value,
    valueB: emoB[i]?.value ?? 0,
  }));

  const RadarTooltip = makeRadarTooltip({ nameA, nameB, colorA, colorB });

  return (
    <div className={`w-full min-w-0 lg:h-full lg:flex lg:flex-col ${className ?? ''}`}>
      {/* Área do gráfico: altura fixa no mobile, flex-1 no desktop (pai tem 440px fixos) */}
      <div className="h-[320px] lg:h-auto lg:flex-1 lg:min-h-[320px] min-h-0 w-full min-w-0 text-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={data}
            outerRadius="66%"
            margin={{ top: 28, right: 84, bottom: 28, left: 84 }}
          >
            <PolarGrid stroke="rgba(148,163,184,0.45)" />
            <PolarAngleAxis dataKey="label" tick={CustomAngleTick as any} />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
              stroke="transparent"
            />
            <Tooltip content={RadarTooltip} cursor={false} />
            {/* B primeiro (atrás), A por cima */}
            <Radar
              name={nameB}
              dataKey="valueB"
              stroke={colorB}
              strokeWidth={2.5}
              strokeOpacity={1}
              fill={colorB}
              fillOpacity={0.16}
              dot={{ r: 2.5, fill: colorB, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Radar
              name={nameA}
              dataKey="valueA"
              stroke={colorA}
              strokeWidth={2.5}
              strokeOpacity={1}
              fill={colorA}
              fillOpacity={0.16}
              dot={{ r: 2.5, fill: colorA, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda de nomes: shrink-0 fixa no rodapé do bloco no desktop */}
      <div className="mt-3 shrink-0 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colorA }} />
          <span className="truncate text-xs font-medium text-foreground max-w-[11rem]">
            {nameA}
            {codeA ? <span className="ml-1 font-bold tracking-wide">({codeA})</span> : null}
          </span>
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colorB }} />
          <span className="truncate text-xs font-medium text-foreground max-w-[11rem]">
            {nameB}
            {codeB ? <span className="ml-1 font-bold tracking-wide">({codeB})</span> : null}
          </span>
        </span>
      </div>
    </div>
  );
}
