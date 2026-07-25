// ─────────────────────────────────────────────────────────────────────────────
// DiscEvolutionRadar — evolução do perfil ao longo do tempo.
//
// Radar dos 4 fatores DISC (D/I/S/C, 4 eixos) com UMA camada (polígono) por
// avaliação concluída, SOBREPOSTAS. A mais recente é forte/opaca (vermelho); as
// anteriores esmaecem (opacidade decrescente). A legenda lista a data de cada
// camada, na mesma cor/opacidade do polígono correspondente.
//
// Entrada: `assessments` já ordenadas por data DESC (mais recente primeiro), como
// vem de useEmployeeDiscHistory. Renderiza só quando há 2+ avaliações — caso
// contrário o chamador mostra o texto de "refaça com o tempo".
//
// TEMA: rótulos dos eixos usam currentColor (herda text-foreground do wrapper),
// legível em claro (público) e escuro (RH). Grade cinza translúcida adapta aos
// dois temas. Vermelho canônico do fator D como cor-base da evolução (#E5484D).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import { DISC_FACTORS } from '@/lib/disc/questions';
import type { DiscScores } from '@/lib/disc/scoring';
import { formatDate } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';

/** Cor-base da evolução: vermelho canônico do DISC (fator D). */
const EVO_RED = '#E5484D';

export interface DiscEvolutionLayer {
  /** Escores 0-100 por fator daquela avaliação. */
  scores: DiscScores;
  /** Data de conclusão (ISO) — usada no rótulo da legenda. */
  completedAt: string | null;
}

export interface DiscEvolutionRadarProps {
  /** Avaliações concluídas, ordenadas por data DESC (recente → antiga). */
  layers: DiscEvolutionLayer[];
  locale: LocaleCode;
  timezone: string;
  /** Rótulo de fallback quando não há data (ex: "Sem data"). */
  noDateLabel: string;
  className?: string;
}

/**
 * Opacidade de traço/preenchimento por posição na lista (0 = mais recente).
 * A recente fica cheia; as anteriores caem em degraus, com piso pra não sumir.
 */
function layerOpacity(index: number, total: number): number {
  if (index === 0) return 1;
  // Distribui as antigas entre 0.5 e 0.18 conforme a idade relativa.
  const step = total > 1 ? (0.5 - 0.18) / (total - 1) : 0;
  return Math.max(0.18, 0.5 - step * (index - 1));
}

export function DiscEvolutionRadar({
  layers,
  locale,
  timezone,
  noDateLabel,
  className,
}: DiscEvolutionRadarProps) {
  // Monta o dataset do recharts: 1 linha por FATOR, 1 coluna por avaliação.
  // dataKey de cada camada = `v{index}` (0 = mais recente).
  const data = useMemo(
    () =>
      DISC_FACTORS.map((factor) => {
        const row: Record<string, number | string> = { factor };
        layers.forEach((layer, i) => {
          row[`v${i}`] = Math.round(layer.scores[factor] ?? 0);
        });
        return row;
      }),
    [layers],
  );

  // Rótulo de cada camada = data formatada (mês/ano curto pra caber na legenda).
  const legend = useMemo(
    () =>
      layers.map((layer, i) => ({
        key: `v${i}`,
        label: layer.completedAt
          ? formatDate(layer.completedAt, locale, timezone, {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : noDateLabel,
        opacity: layerOpacity(i, layers.length),
        isLatest: i === 0,
      })),
    [layers, locale, timezone, noDateLabel],
  );

  return (
    <div className={className}>
      {/* Radar — camadas antigas primeiro (fundo), recente por último (topo). */}
      <div className="h-[320px] w-full text-foreground">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%" margin={{ top: 16, right: 32, bottom: 16, left: 32 }}>
            <PolarGrid stroke="rgba(148,163,184,0.45)" />
            <PolarAngleAxis
              dataKey="factor"
              tick={{ fill: 'currentColor', fontSize: 13, fontWeight: 700 }}
            />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} stroke="transparent" />
            {/*
             * Renderiza da MAIS ANTIGA pra MAIS RECENTE para a recente ficar por
             * cima (z-order = ordem de render). legend está em DESC, então
             * invertemos aqui.
             */}
            {[...legend].reverse().map((entry) => (
              <Radar
                key={entry.key}
                dataKey={entry.key}
                stroke={EVO_RED}
                strokeWidth={entry.isLatest ? 2.5 : 1.5}
                strokeOpacity={entry.opacity}
                fill={EVO_RED}
                fillOpacity={entry.isLatest ? 0.18 : 0.06 * entry.opacity}
                dot={entry.isLatest ? { r: 3, fill: EVO_RED, strokeWidth: 0 } : false}
                isAnimationActive={false}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda: data de cada camada, na mesma cor/opacidade do polígono. */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {legend.map((entry) => (
          <span key={entry.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: EVO_RED, opacity: entry.opacity }}
            />
            <span className={entry.isLatest ? 'font-semibold text-foreground' : ''}>{entry.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
