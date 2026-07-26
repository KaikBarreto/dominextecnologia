// ─────────────────────────────────────────────────────────────────────────────
// DISC — gráfico dos 4 fatores CRUZADO (2 pessoas no mesmo painel).
//
// Variante de comparação do DiscLineChart: plota DUAS séries (A e B) no mesmo
// painel azul clássico, cada uma na COR da pessoa (A / B), com legenda de nomes.
// Diferente do DiscLineChart de perfil único (pontos brancos), aqui cada série
// tem cor própria para distinguir as pessoas.
//
// Tela-documento: fundo/bandas hardcoded (não segue tema do usuário). As cores
// das séries vêm por prop (seriesColorA/seriesColorB).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { DISC_FACTORS } from '@/lib/disc/questions';
import type { DiscScores } from '@/lib/disc/scoring';
import type { LocaleCode } from '@/lib/i18n/locales';
import { useDiscMessages } from './useDiscMessages';

export interface DiscCompareLineChartProps {
  scoresA: DiscScores;
  scoresB: DiscScores;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  locale?: LocaleCode;
  className?: string;
}

// ── Dimensões do SVG (coordenadas internas) ──────────────────────────────────
const SVG_W = 320;

const PANEL_X = 0;
const PANEL_Y = 0;
const PANEL_W = SVG_W;

const INNER_PAD_TOP = 12;
const INNER_PAD_BOTTOM = 32;

const PLOT_X = PANEL_X;
const PLOT_Y = PANEL_Y + INNER_PAD_TOP;
const PLOT_W = PANEL_W;
const PLOT_H = 180;

const PANEL_H = INNER_PAD_TOP + PLOT_H + INNER_PAD_BOTTOM;

const NUM_FACTORS = 4;
const COL_W = PLOT_W / NUM_FACTORS;

const BAND_COLORS = [
  '#D6E8F9',
  '#C2DAEF',
  '#AECCE5',
  '#96B9D8',
  '#7EA6CC',
  '#6793BF',
];
const NUM_BANDS = BAND_COLORS.length;
const BAND_H = PLOT_H / NUM_BANDS;

function scoreToY(score: number): number {
  return PLOT_Y + PLOT_H * (1 - score / 100);
}

function colCenterX(i: number): number {
  return PLOT_X + COL_W * i + COL_W / 2;
}

// Uma série (linha + pontos) de uma pessoa, na cor dela.
function Series({
  scores,
  color,
}: {
  scores: DiscScores;
  color: string;
}) {
  const pts = DISC_FACTORS.map((factor, i) => ({
    cx: colCenterX(i),
    cy: scoreToY(scores[factor]),
  }));
  const polyline = pts.map((p) => `${p.cx},${p.cy}`).join(' ');
  return (
    <g>
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {pts.map((p, i) => (
        <g key={i}>
          {/* halo branco para o ponto colorido destacar do fundo azul */}
          <circle cx={p.cx} cy={p.cy} r={6.5} fill="#FFFFFF" />
          <circle cx={p.cx} cy={p.cy} r={5} fill={color} />
        </g>
      ))}
    </g>
  );
}

export function DiscCompareLineChart({
  scoresA,
  scoresB,
  nameA,
  nameB,
  colorA,
  colorB,
  locale,
  className,
}: DiscCompareLineChartProps) {
  const { t } = useDiscMessages(locale);
  const [hovered, setHovered] = useState<number | null>(null);

  const labels = DISC_FACTORS.map((factor, i) => ({
    label: t.factors[factor].short,
    cx: colCenterX(i),
  }));

  const LABEL_Y = PLOT_Y + PLOT_H + 20;

  return (
    <div className={`mx-auto w-full max-w-[400px] text-foreground lg:h-full lg:flex lg:flex-col lg:max-w-none ${className ?? ''}`}>
      {/* Área do gráfico: ocupa o espaço disponível no desktop, altura natural no mobile */}
      <div className="relative lg:flex-1 lg:min-h-0 lg:flex lg:items-center lg:justify-center">
        <svg
          viewBox={`0 0 ${SVG_W} ${PANEL_H}`}
          width="100%"
          aria-hidden
          style={{ display: 'block', overflow: 'visible' }}
        >
          <rect
            x={PANEL_X}
            y={PANEL_Y}
            width={PANEL_W}
            height={PANEL_H}
            rx={10}
            ry={10}
            fill={BAND_COLORS[BAND_COLORS.length - 1]}
          />

          <clipPath id="disc-compare-clip">
            <rect x={PANEL_X} y={PANEL_Y} width={PANEL_W} height={PANEL_H} rx={10} ry={10} />
          </clipPath>

          <g clipPath="url(#disc-compare-clip)">
            {BAND_COLORS.map((color, bandIdx) => (
              <rect
                key={bandIdx}
                x={PLOT_X}
                y={PLOT_Y + bandIdx * BAND_H}
                width={PLOT_W}
                height={BAND_H + 0.5}
                fill={color}
              />
            ))}

            <rect
              x={PANEL_X}
              y={PLOT_Y + PLOT_H}
              width={PANEL_W}
              height={INNER_PAD_BOTTOM}
              fill="#1E4D8C"
            />

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

            {/* Série B primeiro (fica atrás), depois A */}
            <Series scores={scoresB} color={colorB} />
            <Series scores={scoresA} color={colorA} />

            {labels.map((l, i) => (
              <text
                key={`label-${i}`}
                x={l.cx}
                y={LABEL_Y}
                textAnchor="middle"
                fontSize={15}
                fontWeight={800}
                fill="#FFFFFF"
                fontFamily="system-ui, -apple-system, sans-serif"
                letterSpacing="0.5"
              >
                {l.label}
              </text>
            ))}

            {/* Rects transparentes de hover — ficam por cima de tudo, recebem mouse events */}
            {DISC_FACTORS.map((_, i) => (
              <rect
                key={`hover-${i}`}
                x={PLOT_X + COL_W * i}
                y={PLOT_Y}
                width={COL_W}
                height={PLOT_H}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </g>
        </svg>

        {/* Tooltip HTML absolutamente posicionado dentro do container relative.
            Alem das 2 pontuacoes coloridas por pessoa, mostra a descricao do
            fator e a figura famosa (example). Ancoragem clampada nas pontas
            (D/C) pra o tooltip nao vazar do container. */}
        {hovered !== null && (() => {
          const factor = DISC_FACTORS[hovered];
          const ff = t.factors[factor];
          const valA = scoresA[factor];
          const valB = scoresB[factor];
          const centerPct = ((hovered + 0.5) / NUM_FACTORS) * 100;
          const isFirst = hovered === 0;
          const isLast = hovered === NUM_FACTORS - 1;
          const translateX = isFirst ? '0%' : isLast ? '-100%' : '-50%';
          return (
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: `${centerPct}%`,
                transform: `translateX(${translateX})`,
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                padding: '8px 10px',
                color: 'hsl(var(--popover-foreground))',
                fontSize: 12,
                fontFamily: 'system-ui, sans-serif',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                pointerEvents: 'none',
                maxWidth: 220,
                zIndex: 10,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{ff.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: colorA, fontWeight: 600 }}>{nameA}</span>
                <span style={{ color: colorA, fontWeight: 700 }}>{valA}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: colorB, fontWeight: 600 }}>{nameB}</span>
                <span style={{ color: colorB, fontWeight: 700 }}>{valB}</span>
              </div>
              <div style={{ marginTop: 6, lineHeight: 1.45, color: 'hsl(var(--muted-foreground))' }}>{ff.description}</div>
              <div style={{ marginTop: 6, lineHeight: 1.45, fontStyle: 'italic', color: 'hsl(var(--muted-foreground))' }}>{ff.example}</div>
            </div>
          );
        })()}
      </div>

      {/* Legenda de nomes: shrink-0 fixa no rodapé do bloco no desktop */}
      <div className="mt-3 shrink-0 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
        <LegendItem color={colorA} name={nameA} />
        <LegendItem color={colorB} name={nameB} />
      </div>
    </div>
  );
}

function LegendItem({ color, name }: { color: string; name: string }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate text-xs font-medium text-foreground max-w-[9rem]">{name}</span>
    </span>
  );
}
