// ─────────────────────────────────────────────────────────────────────────────
// DISC — roda de estilo (combinação de características). SVG custom.
//
// Círculo dividido nos 4 estilos posicionados pela convenção SVG do scoring:
//   D=270° (topo), I=0° (direita), S=90° (baixo), C=180° (esquerda).
// Cada quadrante ocupa 90° (±45° em torno do ângulo do fator) e é tingido na cor
// do fator, dividido em 3 sub-regiões concêntricas (12 no total) da mais clara
// (centro/adaptável) à mais forte (borda/marcante).
//
// Um MARCADOR é posicionado por:
//   • blendAngle  → direção (mistura dos fatores, o "estilo" resultante)
//   • intensity   → raio (0 = centro/adaptável, 1 = borda/marcante)
// Determinístico a partir de classify(). Tela-documento: cores claras hardcoded.
// ─────────────────────────────────────────────────────────────────────────────

import { DISC_FACTORS, type DiscFactor } from '@/lib/disc/questions';
import { FACTOR_ANGLE } from '@/lib/disc/scoring';
import { FACTOR_COLOR } from '@/lib/disc/profiles';
import type { LocaleCode } from '@/lib/i18n/locales';
import { useDiscMessages } from './useDiscMessages';

export interface DiscWheelProps {
  /** Ângulo do vetor-soma (graus SVG) vindo de classify(). */
  blendAngle: number;
  /** Intensidade 0–1 (raio do marcador). */
  intensity: number;
  /** Fator primário; destaca o rótulo correspondente. */
  primary: DiscFactor;
  /** Idioma; se ausente, cai no contexto (pt-br fora do provider). */
  locale?: LocaleCode;
  className?: string;
}

const SIZE = 240;
const CENTER = SIZE / 2;
const OUTER_R = 108;
const RING_COUNT = 3;
const DEG2RAD = Math.PI / 180;

/** Ponto na circunferência de raio r no ângulo (graus SVG, y pra baixo). */
function polar(r: number, deg: number): { x: number; y: number } {
  const rad = deg * DEG2RAD;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

/** Path de um "setor de anel" (donut wedge) entre dois raios e dois ângulos. */
function wedgePath(rInner: number, rOuter: number, aStart: number, aEnd: number): string {
  const p0 = polar(rInner, aStart);
  const p1 = polar(rOuter, aStart);
  const p2 = polar(rOuter, aEnd);
  const p3 = polar(rInner, aEnd);
  const largeArc = aEnd - aStart > 180 ? 1 : 0;
  return [
    `M ${p0.x} ${p0.y}`,
    `L ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p0.x} ${p0.y}`,
    'Z',
  ].join(' ');
}

/** Opacidade da sub-região por anel: centro claro → borda forte. */
const RING_OPACITY = [0.18, 0.4, 0.72];

export function DiscWheel({
  blendAngle,
  intensity,
  primary,
  locale,
  className,
}: DiscWheelProps) {
  const { t } = useDiscMessages(locale);

  // Marcador: raio proporcional à intensidade (com piso pra não colar no centro).
  const clampedIntensity = Math.min(1, Math.max(0, intensity));
  const markerR = (0.12 + 0.86 * clampedIntensity) * OUTER_R;
  const marker = polar(markerR, blendAngle);

  return (
    <div className={className}>
      <svg
        viewBox={`-22 -22 ${SIZE + 44} ${SIZE + 44}`}
        className="mx-auto block h-auto w-full max-w-[260px]"
        role="img"
      >
        {/* Anel de fundo */}
        <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="#F8FAFC" stroke="#E2E8F0" />

        {/* 12 sub-regiões: 4 quadrantes × 3 anéis */}
        {DISC_FACTORS.map((factor) => {
          const center = FACTOR_ANGLE[factor];
          const aStart = center - 45;
          const aEnd = center + 45;
          const color = FACTOR_COLOR[factor];
          return Array.from({ length: RING_COUNT }).map((_, ring) => {
            const rInner = (OUTER_R * ring) / RING_COUNT;
            const rOuter = (OUTER_R * (ring + 1)) / RING_COUNT;
            return (
              <path
                key={`${factor}-${ring}`}
                d={wedgePath(rInner, rOuter, aStart, aEnd)}
                fill={color}
                fillOpacity={RING_OPACITY[ring]}
                stroke="#FFFFFF"
                strokeWidth={1}
              />
            );
          });
        })}

        {/* Divisórias diagonais entre quadrantes (a 315/45/135/225) */}
        {[315, 45, 135, 225].map((deg) => {
          const p = polar(OUTER_R, deg);
          return (
            <line
              key={deg}
              x1={CENTER}
              y1={CENTER}
              x2={p.x}
              y2={p.y}
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Rótulos dos 4 fatores nas bordas */}
        {DISC_FACTORS.map((factor) => {
          const p = polar(OUTER_R + 14, FACTOR_ANGLE[factor]);
          const isPrimary = factor === primary;
          return (
            <text
              key={`label-${factor}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={isPrimary ? 16 : 13}
              fontWeight={isPrimary ? 800 : 600}
              fill={FACTOR_COLOR[factor]}
            >
              {t.factors[factor].short}
            </text>
          );
        })}

        {/* Marcador do perfil */}
        <circle cx={marker.x} cy={marker.y} r={9} fill="#FFFFFF" opacity={0.9} />
        <circle
          cx={marker.x}
          cy={marker.y}
          r={7}
          fill={FACTOR_COLOR[primary]}
          stroke="#FFFFFF"
          strokeWidth={2}
        />
      </svg>

      {/* Legenda: centro = adaptável, borda = marcante */}
      <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
          {t.charts.wheelCenter}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-500" />
          {t.charts.wheelEdge}
        </span>
      </div>
    </div>
  );
}
