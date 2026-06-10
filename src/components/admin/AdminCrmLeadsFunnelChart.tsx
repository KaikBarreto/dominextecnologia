import { useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildFunnelData,
  type FunnelLead,
  type FunnelStage,
  type FunnelOrigin,
} from '@/lib/adminCrmFunnel';

interface AdminCrmLeadsFunnelChartProps {
  startDate: Date;
  endDate: Date;
}

// ---------------------------------------------------------------------------
// Formatação BR
// ---------------------------------------------------------------------------
const fmtInt = (n: number) => n.toLocaleString('pt-BR');
const fmtPct = (frac: number) =>
  `${(frac * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;

// ---------------------------------------------------------------------------
// Helpers de cor (puros) — gradiente horizontal por faixa
// ---------------------------------------------------------------------------

/** "#RRGGBB" | "#RGB" -> {r,g,b} (0..255). Fallback cinza se inválido. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = (hex || '').trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) {
    return { r: 156, g: 163, b: 175 }; // #9CA3AF
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToCss(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));
  return `hsl(${hh.toFixed(1)}, ${(ss * 100).toFixed(1)}%, ${(ll * 100).toFixed(1)}%)`;
}

/**
 * Cor inicial (esquerda) do gradiente horizontal de uma faixa, derivada da
 * cor base (que fica na direita). Rotaciona o matiz ~ -22° e clareia ~12% —
 * dá o efeito "esquenta na esquerda, satura na direita" da referência.
 * Puro e determinístico.
 */
export function deriveGradientStart(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const newH = h - 22;
  const newL = Math.min(0.92, l + 0.12);
  // leve boost de saturação pra não lavar demais
  const newS = Math.min(1, s + 0.04);
  return hslToCss(newH, newS, newL);
}

// ---------------------------------------------------------------------------
// Geometria do SVG (coordenadas internas; o viewBox escala pra largura real)
// ---------------------------------------------------------------------------
const VB_WIDTH = 960;
const VB_HEIGHT = 380;
const PAD_TOP = 92; // espaço pros rótulos (número / etapa / %)
const PAD_BOTTOM = 16;
const SIDE_PAD = 28;
const TAIL_FRAC = 0.13; // fração da largura reservada pra cauda reta à direita
const BAND_MAX_FRAC = 0.82; // fração da área vertical usada pela maior pilha

// Cores fixas do painel (NÃO seguem o tema)
const PANEL_BG = '#2E2D4D';
const TOOLTIP_BG = '#1F1E38';
const C_NUMBER = '#FFFFFF';
const C_STAGE = '#3DDC97'; // verde-menta
const C_PCT = '#9B93E8'; // lavanda
const C_LEGEND = '#E5E7EB';
const C_GRID = 'rgba(255,255,255,0.10)';

interface TooltipState {
  originName: string;
  color: string;
  x: number; // clientX
  y: number; // clientY
}

export function AdminCrmLeadsFunnelChart({ startDate, endDate }: AdminCrmLeadsFunnelChartProps) {
  const [allTime, setAllTime] = useState(false);
  const [hoveredOrigin, setHoveredOrigin] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // Etapas do CRM admin
  const stagesQuery = useQuery({
    queryKey: ['admin-crm-stages-funnel'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('admin_crm_stages')
        .select('id, name, color, position, is_won, is_lost')
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as FunnelStage[];
    },
    staleTime: 60 * 1000,
  });

  // Leads (slim): só os campos necessários
  const leadsQuery = useQuery({
    queryKey: ['admin-crm-leads-funnel'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('admin_leads')
        .select('stage_id, source, created_at');
      if (error) throw error;
      return (data || []) as FunnelLead[];
    },
    staleTime: 30 * 1000,
  });

  // Origens cadastradas (cores) — mesma queryKey usada no AdminDashboardCharts
  const originsQuery = useQuery({
    queryKey: ['admin-company-origins-colors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_origins')
        .select('name, color');
      if (error) throw error;
      return (data || []) as FunnelOrigin[];
    },
    staleTime: 0,
  });

  const isLoading =
    stagesQuery.isLoading || leadsQuery.isLoading || originsQuery.isLoading;

  const data = useMemo(() => {
    return buildFunnelData(
      leadsQuery.data || [],
      stagesQuery.data || [],
      originsQuery.data || [],
      { startDate, endDate, allTime },
    );
  }, [leadsQuery.data, stagesQuery.data, originsQuery.data, startDate, endDate, allTime]);

  const firstStageCount = data.stages[0]?.count ?? 0;
  const isEmpty = !isLoading && firstStageCount === 0;

  // ----- Cálculo de geometria do streamgraph -----
  const geom = useMemo(() => {
    const n = data.stages.length;
    if (n === 0 || firstStageCount === 0) return null;

    const maxBand = (VB_HEIGHT - PAD_TOP - PAD_BOTTOM) * BAND_MAX_FRAC;
    const midY = PAD_TOP + (VB_HEIGHT - PAD_TOP - PAD_BOTTOM) / 2;

    const usableWidth = VB_WIDTH - SIDE_PAD * 2;
    const tailWidth = usableWidth * TAIL_FRAC;
    const flowWidth = usableWidth - tailWidth;

    // x de cada etapa: distribuído da esquerda pra direita dentro de flowWidth.
    // n=1 -> única etapa na esquerda. n>1 -> espalha de 0 a flowWidth.
    const stageX = (i: number) =>
      SIDE_PAD + (n === 1 ? 0 : (i / (n - 1)) * flowWidth);
    const tailX = SIDE_PAD + flowWidth + tailWidth; // borda direita (após cauda)

    // Para cada etapa: altura total da pilha + segments com yTop/yBottom,
    // empilhamento CENTRADO na linha média.
    const cols = data.stages.map((stage, i) => {
      const ratio = stage.count / firstStageCount;
      const bandHeight = ratio * maxBand;
      const top = midY - bandHeight / 2;

      let cursor = top;
      const segs = stage.segments.map((seg) => {
        const segH = stage.count > 0 ? (seg.count / stage.count) * bandHeight : 0;
        const out = {
          originName: seg.originName,
          color: seg.color,
          count: seg.count,
          pct: stage.pct,
          yTop: cursor,
          yBottom: cursor + segH,
        };
        cursor += segH;
        return out;
      });

      return { stage, i, x: stageX(i), top, bandHeight, segs };
    });

    // Ordem estável de origens (a mesma de data.origins) -> índice de empilhamento.
    const originIndex = new Map<string, number>();
    data.origins.forEach((o, idx) => originIndex.set(o.name, idx));

    // Monta, por ORIGEM, a sequência de pontos (yTop_i, yBottom_i) em cada etapa.
    // Se a origem não tiver segment numa etapa, espessura 0 centrada na pilha.
    const bands = data.origins.map((origin) => {
      const pts = cols.map((col) => {
        const seg = col.segs.find((s) => s.originName === origin.name);
        if (seg) {
          return { x: col.x, yTop: seg.yTop, yBottom: seg.yBottom };
        }
        // espessura 0 — afina suavemente; ancora no centro da pilha da etapa
        const mid = col.top + col.bandHeight / 2;
        return { x: col.x, yTop: mid, yBottom: mid };
      });

      // Ponto da cauda: mesma espessura/posição do último ponto, estendido reto.
      const last = pts[pts.length - 1];
      const tailPt = { x: tailX, yTop: last.yTop, yBottom: last.yBottom };

      const allPts = [...pts, tailPt];

      // --- Path: borda superior (esq->dir) com cubic bezier horizontal, depois
      // borda inferior (dir->esq). Controles no x médio entre pontos adjacentes,
      // mesmo y dos extremos -> curva S suave estilo "flow".
      const d: string[] = [];
      // borda superior
      d.push(`M ${allPts[0].x} ${allPts[0].yTop}`);
      for (let k = 1; k < allPts.length; k++) {
        const a = allPts[k - 1];
        const b = allPts[k];
        // cauda (último segmento) é reta
        if (k === allPts.length - 1) {
          d.push(`L ${b.x} ${b.yTop}`);
        } else {
          const cx = (a.x + b.x) / 2;
          d.push(`C ${cx} ${a.yTop} ${cx} ${b.yTop} ${b.x} ${b.yTop}`);
        }
      }
      // desce na direita
      d.push(`L ${allPts[allPts.length - 1].x} ${allPts[allPts.length - 1].yBottom}`);
      // borda inferior (dir->esq)
      for (let k = allPts.length - 1; k > 0; k--) {
        const a = allPts[k];
        const b = allPts[k - 1];
        if (k === allPts.length - 1) {
          d.push(`L ${b.x} ${b.yBottom}`);
        } else {
          const cx = (a.x + b.x) / 2;
          d.push(`C ${cx} ${a.yBottom} ${cx} ${b.yBottom} ${b.x} ${b.yBottom}`);
        }
      }
      d.push('Z');

      return {
        originName: origin.name,
        baseColor: origin.color,
        gradId: `adminFunnelBandGrad-${originIndex.get(origin.name) ?? 0}`,
        d: d.join(' '),
      };
    });

    return { cols, bands, midY, tailX };
  }, [data.stages, data.origins, firstStageCount]);

  // Por origem: contagem/pct em cada etapa (pro tooltip).
  const perOriginByStage = useMemo(() => {
    const map = new Map<
      string,
      { stageName: string; count: number; pct: number }[]
    >();
    data.origins.forEach((o) => {
      const rows = data.stages.map((st) => {
        const seg = st.segments.find((s) => s.originName === o.name);
        return { stageName: st.name, count: seg?.count ?? 0, pct: st.pct };
      });
      map.set(o.name, rows);
    });
    return map;
  }, [data.origins, data.stages]);

  // ----- Hover handlers -----
  const handleBandEnter = (originName: string, color: string, e: React.MouseEvent) => {
    setHoveredOrigin(originName);
    setTooltip({ originName, color, x: e.clientX, y: e.clientY });
  };
  const handleBandMove = (originName: string, color: string, e: React.MouseEvent) => {
    setTooltip({ originName, color, x: e.clientX, y: e.clientY });
  };
  const handleBandLeave = () => {
    setHoveredOrigin(null);
    setTooltip(null);
  };

  // Posição clampada do tooltip na viewport.
  const tooltipPos = useMemo(() => {
    if (!tooltip) return null;
    const W = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const H = typeof window !== 'undefined' ? window.innerHeight : 768;
    const TT_W = 220;
    const TT_H = 24 + (data.stages.length + 1) * 20;
    let left = tooltip.x + 16;
    let top = tooltip.y + 16;
    if (left + TT_W > W - 8) left = tooltip.x - TT_W - 16;
    if (left < 8) left = 8;
    if (top + TT_H > H - 8) top = tooltip.y - TT_H - 16;
    if (top < 8) top = 8;
    return { left, top };
  }, [tooltip, data.stages.length]);

  const bandOpacity = (originName: string) =>
    !hoveredOrigin || hoveredOrigin === originName ? 1 : 0.25;

  return (
    <Card
      className="border-0 rounded-xl overflow-hidden"
      style={{ backgroundColor: PANEL_BG }}
    >
      <CardContent className="p-4 sm:p-6">
        {/* Header dentro do painel escuro */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <span className="text-sm font-medium text-white/80">
            Funil de Leads por Origem
          </span>
          <Tabs
            value={allTime ? 'all' : 'period'}
            onValueChange={(v) => setAllTime(v === 'all')}
          >
            <TabsList className="h-8 bg-white/10 border border-white/10">
              <TabsTrigger
                value="period"
                className="text-xs px-3 h-7 text-white/70 data-[state=active]:bg-white/90 data-[state=active]:text-[#2E2D4D]"
              >
                No período
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="text-xs px-3 h-7 text-white/70 data-[state=active]:bg-white/90 data-[state=active]:text-[#2E2D4D]"
              >
                Todos
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-[300px] text-white/60">
            Carregando…
          </div>
        ) : isEmpty || !geom ? (
          <div className="flex items-center justify-center h-[300px] text-white/60">
            Nenhum lead no período
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
                className="w-full"
                style={{ minWidth: 720 }}
                role="img"
                aria-label="Funil de leads por origem"
              >
                <defs>
                  {geom.bands.map((band) => {
                    const start = deriveGradientStart(band.baseColor);
                    return (
                      <linearGradient
                        key={band.gradId}
                        id={band.gradId}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                      >
                        <stop offset="0%" stopColor={start} />
                        <stop offset="100%" stopColor={band.baseColor} />
                      </linearGradient>
                    );
                  })}
                </defs>

                {/* Linhas verticais sutis em cada x de etapa */}
                {geom.cols.map((col) => (
                  <line
                    key={`grid-${col.stage.id}`}
                    x1={col.x}
                    x2={col.x}
                    y1={PAD_TOP - 8}
                    y2={VB_HEIGHT - PAD_BOTTOM}
                    stroke={C_GRID}
                    strokeWidth={1}
                  />
                ))}

                {/* Faixas (streamgraph) — uma por origem */}
                <g>
                  {geom.bands.map((band) => (
                    <g key={`band-${band.originName}`}>
                      <path
                        d={band.d}
                        fill={`url(#${band.gradId})`}
                        opacity={bandOpacity(band.originName)}
                        className="transition-opacity duration-200"
                      />
                      {/* hit-area transparente mais larga (mesmo path) p/ facilitar hover */}
                      <path
                        d={band.d}
                        fill="transparent"
                        stroke="transparent"
                        strokeWidth={10}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) =>
                          handleBandEnter(band.originName, band.baseColor, e)
                        }
                        onMouseMove={(e) =>
                          handleBandMove(band.originName, band.baseColor, e)
                        }
                        onMouseLeave={handleBandLeave}
                      />
                    </g>
                  ))}
                </g>

                {/* Rótulos no topo — alinhados à esquerda no x da etapa */}
                {geom.cols.map((col) => {
                  const anchor =
                    col.i === geom.cols.length - 1 && geom.cols.length > 1
                      ? 'end'
                      : 'start';
                  // última etapa pode estourar à direita -> ancora no fim
                  const labelX = anchor === 'end' ? col.x + 0 : col.x;
                  return (
                    <g key={`labels-${col.stage.id}`}>
                      <text
                        x={labelX}
                        y={PAD_TOP - 46}
                        textAnchor={anchor}
                        style={{ fontSize: 30, fontWeight: 700, fill: C_NUMBER }}
                      >
                        {fmtInt(col.stage.count)}
                      </text>
                      <text
                        x={labelX}
                        y={PAD_TOP - 26}
                        textAnchor={anchor}
                        style={{ fontSize: 13, fontWeight: 700, fill: C_STAGE }}
                      >
                        {col.stage.name}
                      </text>
                      {col.i > 0 && (
                        <text
                          x={labelX}
                          y={PAD_TOP - 9}
                          textAnchor={anchor}
                          style={{ fontSize: 13, fontWeight: 700, fill: C_PCT }}
                        >
                          {fmtPct(col.stage.pct)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legenda de origens — centralizada */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-1">
              {data.origins.map((o) => (
                <div
                  key={o.name}
                  className="flex items-center gap-2 text-xs cursor-pointer transition-opacity duration-200"
                  style={{ opacity: bandOpacity(o.name) }}
                  onMouseEnter={(e) => handleBandEnter(o.name, o.color, e)}
                  onMouseMove={(e) => handleBandMove(o.name, o.color, e)}
                  onMouseLeave={handleBandLeave}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: o.color }}
                  />
                  <span style={{ color: C_LEGEND }}>{o.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Tooltip flutuante seguindo o cursor */}
      {tooltip && tooltipPos && (
        <div
          ref={tooltipRef}
          className="fixed z-50 pointer-events-none rounded-lg border shadow-xl px-3 py-2.5"
          style={{
            left: tooltipPos.left,
            top: tooltipPos.top,
            backgroundColor: TOOLTIP_BG,
            borderColor: 'rgba(255,255,255,0.12)',
            minWidth: 200,
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: tooltip.color }}
            />
            <span className="text-sm font-bold text-white">
              {tooltip.originName}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {(perOriginByStage.get(tooltip.originName) ?? []).map((row, idx) => (
              <div
                key={`${row.stageName}-${idx}`}
                className="flex items-center justify-between gap-4 text-xs"
              >
                <span className="text-white/60">{row.stageName}</span>
                <span className="text-white/90 font-medium tabular-nums">
                  {fmtInt(row.count)}
                  {idx > 0 && (
                    <span className="text-white/40">
                      {' '}
                      ({fmtPct(row.pct)})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
