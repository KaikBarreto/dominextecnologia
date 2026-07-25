// ─────────────────────────────────────────────────────────────────────────────
// DISC — gráfico clássico dos 4 fatores (D, I, S, C).
//
// Visual clássico DISC: painel azul com faixas horizontais (gradiente de tons
// de azul, claro no topo → mais saturado embaixo), 4 colunas separadas por
// divisórias verticais brancas semitransparentes, pontos BRANCOS (sem anel
// colorido) ligados por linha branca em zig-zag, rótulos D I S C na base.
// Valores numéricos ficam ABAIXO do painel (fora da área azul), um por coluna.
//
// Tela-documento: cores hardcoded (não segue tema do usuário).
// ─────────────────────────────────────────────────────────────────────────────

import { DISC_FACTORS } from '@/lib/disc/questions';
import type { DiscScores } from '@/lib/disc/scoring';
import type { LocaleCode } from '@/lib/i18n/locales';
import { useDiscMessages } from './useDiscMessages';

export interface DiscLineChartProps {
  scores: DiscScores;
  /** Idioma; se ausente, cai no contexto (pt-br fora do provider). */
  locale?: LocaleCode;
  className?: string;
}

// ── Dimensões do SVG (coordenadas internas) ──────────────────────────────────
const SVG_W = 320;
const PANEL_PAD_X = 0;   // o painel ocupa toda a largura
const PANEL_PAD_TOP = 0;
const PANEL_PAD_BOTTOM = 0;

// Área do painel azul
const PANEL_X = PANEL_PAD_X;
const PANEL_Y = PANEL_PAD_TOP;
const PANEL_W = SVG_W - PANEL_PAD_X * 2;

// Área interna de plotagem (dentro do painel, com padding)
const INNER_PAD_X = 0;
const INNER_PAD_TOP = 12;   // topo: espaço p/ respirar antes das bandas
const INNER_PAD_BOTTOM = 32; // base: espaço p/ rótulos D I S C

const PLOT_X = PANEL_X + INNER_PAD_X;
const PLOT_Y = PANEL_Y + INNER_PAD_TOP;
const PLOT_W = PANEL_W - INNER_PAD_X * 2;

// Altura da área de plotagem (onde os pontos são posicionados)
const PLOT_H = 180;

const PANEL_H = INNER_PAD_TOP + PLOT_H + INNER_PAD_BOTTOM + PANEL_PAD_BOTTOM;

// Linha de números abaixo do painel (fora da área azul)
const NUMBERS_GAP = 10;  // espaço entre base do painel e os números
const NUMBERS_H = 22;    // altura reservada para a linha de números
const SVG_H = PANEL_H + NUMBERS_GAP + NUMBERS_H;

const NUM_FACTORS = 4;
const COL_W = PLOT_W / NUM_FACTORS;

// ── Bandas horizontais (claro → escuro, de cima pra baixo) ───────────────────
// 6 bandas cobrindo PLOT_H, da mais clara no topo à mais saturada embaixo.
const BAND_COLORS = [
  '#D6E8F9', // banda 1 — topo, azul muito suave
  '#C2DAEF', // banda 2
  '#AECCE5', // banda 3
  '#96B9D8', // banda 4
  '#7EA6CC', // banda 5
  '#6793BF', // banda 6 — base, azul mais saturado
];
const NUM_BANDS = BAND_COLORS.length;
const BAND_H = PLOT_H / NUM_BANDS;

// ── Conversão de score para Y ─────────────────────────────────────────────────
function scoreToY(score: number): number {
  // score 100 → topo da área de plotagem; score 0 → base
  return PLOT_Y + PLOT_H * (1 - score / 100);
}

// ── X central de cada coluna ─────────────────────────────────────────────────
function colCenterX(i: number): number {
  return PLOT_X + COL_W * i + COL_W / 2;
}

export function DiscLineChart({ scores, locale, className }: DiscLineChartProps) {
  const { t } = useDiscMessages(locale);

  const data = DISC_FACTORS.map((factor) => ({
    factor,
    label: t.factors[factor].short,
    value: scores[factor],
  }));

  // Pontos para a linha zig-zag
  const points = data.map((d, i) => ({
    cx: colCenterX(i),
    cy: scoreToY(d.value),
    value: d.value,
    label: d.label,
  }));

  const polylinePoints = points.map((p) => `${p.cx},${p.cy}`).join(' ');

  // Rótulos D I S C na base de cada coluna (dentro do painel azul)
  const LABEL_Y = PLOT_Y + PLOT_H + 20;

  // Linha de valores numéricos abaixo do painel (fora)
  const NUMBERS_Y = PANEL_H + NUMBERS_GAP + NUMBERS_H / 2;

  return (
    <div className={`mx-auto w-full max-w-[400px] text-foreground ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        aria-hidden
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* ── Painel azul de fundo com cantos arredondados ── */}
        <rect
          x={PANEL_X}
          y={PANEL_Y}
          width={PANEL_W}
          height={PANEL_H}
          rx={10}
          ry={10}
          fill={BAND_COLORS[BAND_COLORS.length - 1]}
        />

        {/* ── Máscara arredondada para as bandas e conteúdo ── */}
        <clipPath id="disc-panel-clip">
          <rect
            x={PANEL_X}
            y={PANEL_Y}
            width={PANEL_W}
            height={PANEL_H}
            rx={10}
            ry={10}
          />
        </clipPath>

        <g clipPath="url(#disc-panel-clip)">
          {/* ── Faixas horizontais (bandas de azul, claro → escuro de cima p/ baixo) ── */}
          {BAND_COLORS.map((color, bandIdx) => (
            <rect
              key={bandIdx}
              x={PLOT_X}
              y={PLOT_Y + bandIdx * BAND_H}
              width={PLOT_W}
              height={BAND_H + 0.5} /* +0.5 evita gap de subpixel */
              fill={color}
            />
          ))}

          {/* ── Área da base (abaixo das bandas, fundo do painel p/ rótulos) ── */}
          <rect
            x={PANEL_X}
            y={PLOT_Y + PLOT_H}
            width={PANEL_W}
            height={INNER_PAD_BOTTOM + PANEL_PAD_BOTTOM}
            fill="#1E4D8C"
          />

          {/* ── Divisórias verticais entre colunas ── */}
          {[1, 2, 3].map((i) => {
            const x = PLOT_X + COL_W * i;
            return (
              <line
                key={i}
                x1={x}
                y1={PANEL_Y}
                x2={x}
                y2={PANEL_Y + PANEL_H}
                stroke="rgba(255,255,255,0.40)"
                strokeWidth={1.5}
              />
            );
          })}

          {/* ── Linha zig-zag conectando os pontos ── */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="rgba(255,255,255,0.90)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* ── Pontos brancos (sem anel colorido) com leve sombra ── */}
          {points.map((p, i) => (
            <g key={i}>
              {/* Sombra sutil */}
              <circle
                cx={p.cx}
                cy={p.cy}
                r={9}
                fill="rgba(0,0,0,0.18)"
                transform="translate(0,1.5)"
              />
              {/* Círculo branco com contorno branco suave */}
              <circle
                cx={p.cx}
                cy={p.cy}
                r={9}
                fill="#FFFFFF"
                stroke="rgba(255,255,255,0.60)"
                strokeWidth={1.5}
              />
            </g>
          ))}

          {/* ── Rótulos D I S C na base de cada coluna ── */}
          {points.map((p, i) => (
            <text
              key={`label-${i}`}
              x={p.cx}
              y={LABEL_Y}
              textAnchor="middle"
              fontSize={15}
              fontWeight={800}
              fill="#FFFFFF"
              fontFamily="system-ui, -apple-system, sans-serif"
              letterSpacing="0.5"
            >
              {p.label}
            </text>
          ))}
        </g>

        {/* ── Valores numéricos abaixo do painel (fora da área azul) ── */}
        {points.map((p, i) => (
          <text
            key={`value-${i}`}
            x={p.cx}
            y={NUMBERS_Y}
            textAnchor="middle"
            fontSize={14}
            fontWeight={700}
            fill="currentColor"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {Math.round(p.value)}
          </text>
        ))}
      </svg>
    </div>
  );
}
