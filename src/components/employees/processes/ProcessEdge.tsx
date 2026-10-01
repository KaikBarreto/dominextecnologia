// ─────────────────────────────────────────────────────────────────────────────
// ProcessFlowEdge — a seta do fluxograma, com HALO.
//
// O problema que isto resolve: num processo com retrabalho, as linhas se cruzam.
// Sem tratamento, dois traços da mesma cor se encontram e viram um borrão — não
// dá pra saber qual vem de onde. A técnica clássica de fluxograma é abrir um
// VÃO na linha que passa por baixo.
//
// Fazemos isso com um traço grosso na cor do FUNDO desenhado logo antes da
// linha de verdade: cada aresta "apaga" um pedacinho das que foram desenhadas
// antes dela, e o cruzamento passa a ler como uma passando sobre a outra.
//
// O rótulo continua sendo o do React Flow (SVG, via BaseEdge) de propósito: a
// exportação de imagem lê `.react-flow__edge-textwrapper` do DOM pra redesenhar
// os selos no PNG. Trocar por `EdgeLabelRenderer` (HTML) quebraria o export.
// ─────────────────────────────────────────────────────────────────────────────

import { BaseEdge, getBezierPath, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

/** Espessura do vão. Precisa ser bem maior que a linha pra o corte se ver. */
const HALO_WIDTH = 7;

export function ProcessFlowEdge(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius,
    style, markerEnd, data,
  } = props;

  const curved = (data as { curved?: boolean } | undefined)?.curved === true;
  const common = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, labelX, labelY] = curved
    ? getBezierPath(common)
    : getSmoothStepPath({ ...common, borderRadius: 10 });

  return (
    <>
      {/* O vão. `pointer-events: none` pra não roubar o clique da aresta. */}
      <path
        d={path}
        fill="none"
        stroke="hsl(var(--background))"
        strokeWidth={HALO_WIDTH}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd}
        label={label}
        labelX={labelX}
        labelY={labelY}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
      />
    </>
  );
}
