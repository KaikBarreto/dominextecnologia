// ─────────────────────────────────────────────────────────────────────────────
// DISC — Radar do Perfil Emocional (8 dimensoes).
//
// Exibe um spider chart com 8 vertices derivados de computeEmotional().
// Cor violeta fixa (#7C3AED) para diferenciar visualmente do radar de
// competencias (vermelho #E5484D). Rotulos via t.emotional[key] (i18n, 4 idiomas).
//
// Espelho de DiscRadar.tsx — mesmos cuidados de recharts (largura definida,
// rotulos horizontais upright, nomes longos quebrando em 2 linhas).
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
import type { DiscFactor } from '@/lib/disc/questions';
import type { DiscScores } from '@/lib/disc/scoring';
import { computeEmotional } from '@/lib/disc/emotional';
import type { EmotionalKey } from '@/lib/disc/emotional';
import type { LocaleCode } from '@/lib/i18n/locales';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDiscMessages } from './useDiscMessages';

// Violeta fixo — distingue do radar de competencias (vermelho).
const RADAR_VIOLET = '#7C3AED';

export interface DiscEmotionalRadarProps {
  scores: DiscScores;
  /** Fator primario — mantido por compatibilidade de assinatura, nao afeta cor. */
  primary?: DiscFactor;
  /** Idioma; se ausente, cai no contexto (pt-br fora do provider). */
  locale?: LocaleCode;
  className?: string;
  /**
   * Controla o layout no desktop (lg+).
   * - 'radar' (padrao): spider chart em largura total.
   * - 'bars': mantido por compat, tambem renderiza radar.
   */
  desktopLayout?: 'radar' | 'bars';
}

// Nomes com mais de 11 chars quebram em 2 linhas para nao sobrepor vizinhos.
const LONG_LABEL_THRESHOLD = 11;

function splitLabel(label: string): [string, string | null] {
  if (label.length <= LONG_LABEL_THRESHOLD) return [label, null];
  const mid = Math.floor(label.length / 2);
  let breakAt = label.indexOf(' ', mid);
  if (breakAt === -1) breakAt = label.lastIndexOf(' ', mid);
  if (breakAt === -1) return [label, null];
  return [label.slice(0, breakAt), label.slice(breakAt + 1)];
}

/**
 * Tick HORIZONTAL para o PolarAngleAxis (sem rotacao radial).
 * Identico ao de DiscRadar.
 */
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

  const anchor: 'start' | 'middle' | 'end' =
    dx > 5 ? 'start' : dx < -5 ? 'end' : 'middle';

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

/**
 * Tooltip customizado para o RadarChart.
 * Mostra o nome da dimensao emocional e o valor (0-100) ao hover.
 */
function RadarTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const name: string = (entry.payload as { label?: string }).label ?? entry.name ?? '';
  const value = entry.value as number;

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
        minWidth: 120,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{name}</div>
      <div style={{ color: RADAR_VIOLET, fontWeight: 700, fontSize: 14 }}>{value}</div>
    </div>
  );
}

export function DiscEmotionalRadar({ scores, locale, className }: DiscEmotionalRadarProps) {
  const { t } = useDiscMessages(locale);
  const isMobile = useIsMobile();

  const emotional = computeEmotional(scores);
  const data = emotional.map(({ key, value }) => ({
    label: t.emotional[key as EmotionalKey],
    value,
  }));

  return (
    <div className={`w-full min-w-0 ${className ?? ''}`}>
      <div className="h-[340px] sm:h-[420px] w-full min-w-0 text-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={data}
            outerRadius={isMobile ? '84%' : '72%'}
            margin={
              isMobile
                ? { top: 12, right: 76, bottom: 12, left: 76 }
                : { top: 24, right: 84, bottom: 24, left: 84 }
            }
          >
            <PolarGrid stroke="rgba(148,163,184,0.45)" />
            <PolarAngleAxis
              dataKey="label"
              tick={CustomAngleTick as any}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
              stroke="transparent"
            />
            <Tooltip
              content={RadarTooltip}
              cursor={false}
            />
            <Radar
              dataKey="value"
              stroke={RADAR_VIOLET}
              strokeWidth={2.5}
              strokeOpacity={1}
              fill={RADAR_VIOLET}
              fillOpacity={0.18}
              dot={{ r: 3, fill: RADAR_VIOLET, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
