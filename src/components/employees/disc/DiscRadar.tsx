// ─────────────────────────────────────────────────────────────────────────────
// DISC — Radar das Competencias Comportamentais (13 competencias).
//
// Exibe um spider chart com 13 vertices derivados de computeCompetencies().
// Cor vermelha fixa (#E5484D) conforme print do CEO — nao depende de `primary`.
// Rotulos via t.competencies[key] (i18n, 4 idiomas).
//
// Layout: largura total, radar em TODAS as larguras (mobile e desktop).
//
// Rotulos HORIZONTAIS (CustomAngleTick):
//   - Todos os rotulos ficam upright (sem rotacao radial).
//   - textAnchor por posicao: dx>5 => start, dx<-5 => end, senao middle.
//   - Nomes longos (>11 chars) quebram em 2 linhas com <tspan>.
//   - Offset radial de 14px para afastar do poligono.
//
// Dimensoes:
//   - outerRadius 62%: poligono grande com margem para rotulos horizontais.
//   - margin: top/bottom 52, left/right 88 (mais espaco lateral para rotulos).
//   - altura do container: 460px (funciona bem de ~360px a 1440px).
//   - fontSize 10.
//
// Props mantidas (primary ignorado internamente — cor e vermelha fixa).
// Legivel em fundo claro (publico) e fundo escuro (modal RH):
//   - rotulos usam currentColor (herda text-foreground do wrapper)
//   - grade do radar usa variavel CSS para adaptar ao tema
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
import { computeCompetencies } from '@/lib/disc/competencies';
import type { CompetencyKey } from '@/lib/disc/competencies';
import type { LocaleCode } from '@/lib/i18n/locales';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDiscMessages } from './useDiscMessages';

// Vermelho fixo conforme print do CEO
const RADAR_RED = '#E5484D';

export interface DiscRadarProps {
  scores: DiscScores;
  /** Fator primario — mantido por compatibilidade de assinatura, nao afeta cor. */
  primary?: DiscFactor;
  /** Idioma; se ausente, cai no contexto (pt-br fora do provider). */
  locale?: LocaleCode;
  className?: string;
  /**
   * Controla o layout no desktop (lg+).
   * - 'radar' (padrao): spider chart em largura total.
   * - 'bars': barras horizontais — mantido por compat, agora tambem renderiza radar.
   */
  desktopLayout?: 'radar' | 'bars';
}

// Nomes com mais de 11 chars que devem quebrar em 2 linhas para nao sobrepor vizinhos.
// A quebra e feita no primeiro espaco apos o meio do texto.
const LONG_LABEL_THRESHOLD = 11;

/**
 * Parte o label em [linha1, linha2] no melhor ponto de quebra (primeiro espaco
 * apos o meio). Se nao ha espaco ou e curto, retorna [label, null].
 */
function splitLabel(label: string): [string, string | null] {
  if (label.length <= LONG_LABEL_THRESHOLD) return [label, null];
  const mid = Math.floor(label.length / 2);
  // Procura espaco a partir do meio pra frente
  let breakAt = label.indexOf(' ', mid);
  // Se nao achar, procura antes do meio
  if (breakAt === -1) breakAt = label.lastIndexOf(' ', mid);
  if (breakAt === -1) return [label, null];
  return [label.slice(0, breakAt), label.slice(breakAt + 1)];
}

/**
 * Tick HORIZONTAL para o PolarAngleAxis (sem rotacao radial).
 *
 * Logica:
 *   1. Calcula dx = x - cx para determinar a posicao horizontal relativa ao centro.
 *   2. textAnchor: dx > 5 => 'start' (direita), dx < -5 => 'end' (esquerda),
 *      senao 'middle' (topo/base).
 *   3. Offset radial de 14px para afastar o texto da borda do poligono.
 *   4. Nomes longos (>11 chars) quebram em 2 linhas com <tspan>.
 *   5. Sem nenhum transform rotate — todos os rotulos ficam horizontais/upright.
 *   6. Usa currentColor para adaptar ao tema claro/escuro.
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

  // Vetor do centro ao ponto do tick
  const dx = x - cx;
  const dy = y - cy;

  // Offset radial: afasta o texto 14px da borda do eixo (na direcao do raio)
  const LABEL_OFFSET = 14;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const scale = dist > 0 ? (dist + LABEL_OFFSET) / dist : 1;
  const tx = cx + dx * scale;
  const ty = cy + dy * scale;

  // textAnchor pelo lado horizontal: direita=start, esquerda=end, meio=middle
  const anchor: 'start' | 'middle' | 'end' =
    dx > 5 ? 'start' : dx < -5 ? 'end' : 'middle';

  const [line1, line2] = splitLabel(label);
  const LINE_HEIGHT = 12; // px entre as duas linhas do tspan

  return (
    // Sem transform rotate — rotulos sempre horizontais
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
 * Mostra o nome da competencia e o valor (0-100) ao hover num ponto.
 * Usa variaveis CSS para adaptar ao tema claro/escuro.
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
      <div style={{ color: RADAR_RED, fontWeight: 700, fontSize: 14 }}>{value}</div>
    </div>
  );
}

export function DiscRadar({ scores, locale, className }: DiscRadarProps) {
  const { t } = useDiscMessages(locale);
  const isMobile = useIsMobile();

  const competencies = computeCompetencies(scores);
  const data = competencies.map(({ key, value }) => ({
    label: t.competencies[key as CompetencyKey],
    value,
  }));

  return (
    <div className={`w-full min-w-0 ${className ?? ''}`}>
      {/*
       * Radar em TODAS as larguras (mobile e desktop).
       *
       * outerRadius 62%: poligono grande com espaco generoso para os rotulos
       *   horizontais nas laterais nao cortarem. Cresce bem na coluna direita
       *   do desktop (~700px) e permanece visivel no mobile (~360px).
       * margin: top/bottom 52, left/right 88 — margem lateral extra necessaria
       *   para os rotulos horizontais das pontas (esquerda/direita) nao cortarem.
       * height 460px: altura adequada de ~360px a 1440px.
       *
       * w-full min-w-0: garante que o ResponsiveContainer mede 100% do pai
       *   (flex-1), evitando radar minusculo. NUNCA usar grid pra este wrapper.
       *
       * Rotulos via CustomAngleTick (horizontais, sem rotacao, com quebra de linha).
       * Preenchimento vermelho com fillOpacity 0.18 + borda opaca + tooltip.
       *
       * text-foreground no wrapper: CustomAngleTick usa currentColor e
       * herda a cor do tema — legivel em claro E escuro.
       */}
      {/*
       * Mobile: menos altura/padding vertical e roda MAIOR (outerRadius 84% +
       * margens top/bottom pequenas), mantendo margem lateral para os rótulos.
       * Desktop (>=768px): mantém 420px / outerRadius 72% / margens 24.
       */}
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
            {/*
             * Grade cinza suave (slate-400 translucido) — visivel de leve
             * nos dois temas sem competir com o traco vermelho.
             */}
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
              stroke={RADAR_RED}
              strokeWidth={2.5}
              strokeOpacity={1}
              fill={RADAR_RED}
              fillOpacity={0.18}
              dot={{ r: 3, fill: RADAR_RED, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
