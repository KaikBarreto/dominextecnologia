// =============================================================================
// docArt/DocArtSvgRenderer.tsx — Desenha uma spec de arte como SVG.
// =============================================================================
// É o renderizador de TELA: alimenta o preview ao vivo do editor e o portal do
// cliente. O renderizador de PDF (`_shared/doc-art/spec-pdf.ts`) desenha a
// MESMA spec com pdf-lib — por isso o que o gestor vê aqui é o que sai
// impresso.
//
// Este arquivo NÃO é compartilhado com o Deno (é React). A regra de quebra de
// linha, as cores e a geometria vêm todas dos módulos compartilhados; o que
// mora aqui é só "como se desenha isso em SVG".
// =============================================================================

import { forwardRef, useEffect, useMemo, useState } from 'react';
import { loadDocArtFonts } from './fonts/load';
import type { MeasureFn } from './inline';
import { layoutParagraphs } from './inline';
import {
  alignOffsetMm,
  lineBaselineMm,
  ptToMm,
  resolveDocArt,
  type ResolveOptions,
} from './resolve';
import type {
  DocArtConfig,
  DocArtImageRef,
  DocArtTemplate,
  ResolvedShape,
  ResolvedTextShape,
} from './types';

// -----------------------------------------------------------------------------
// Fontes e medição
// -----------------------------------------------------------------------------

/**
 * As MESMAS faces embutidas no PDF, carregadas no navegador a partir do mesmo
 * base64 (`fonts/data.ts`). Não é "uma fonte parecida": é o mesmo arquivo, e é
 * por isso que a linha quebra no mesmo lugar na tela e no PDF.
 *
 * Os nomes levam sufixo próprio pra não colidir com uma Playfair/Montserrat
 * que o usuário tenha instalada no sistema, que poderia ter outras métricas.
 */
const FONT_STACK = {
  sans: '"DocArt Sans", Helvetica, Arial, sans-serif',
  display: '"DocArt Display", Georgia, "Times New Roman", serif',
} as const;

/** Larguras médias usadas só quando não há canvas (ex: jsdom nos testes). */
const FALLBACK_RATIO = { sans: 0.55, display: 0.48 } as const;

let sharedCanvas: HTMLCanvasElement | null = null;

function getContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  try {
    if (!sharedCanvas) sharedCanvas = document.createElement('canvas');
    return sharedCanvas.getContext('2d');
  } catch {
    return null;
  }
}

function makeMeasure(family: 'sans' | 'display'): MeasureFn {
  const ctx = getContext();
  return (text, { bold, italic, size }) => {
    if (!ctx) return text.length * size * FALLBACK_RATIO[family];
    const style = italic ? 'italic ' : '';
    const weight = bold ? '700 ' : '400 ';
    // Medir com `size` em px devolve a largura na mesma escala do corpo em pt.
    ctx.font = `${style}${weight}${size}px ${FONT_STACK[family]}`;
    // Sem kerning, igual ao PDF (ver o `makeMeasure` do `spec-pdf.ts`): é o que
    // mantém a quebra de linha da tela idêntica à do arquivo gerado.
    ctx.fontKerning = 'none';
    const width = ctx.measureText(text).width;
    return Number.isFinite(width) && width > 0
      ? width
      : text.length * size * FALLBACK_RATIO[family];
  };
}

// -----------------------------------------------------------------------------
// Imagens
// -----------------------------------------------------------------------------

/** URLs das imagens que a arte posiciona. Ausente = o shape não é desenhado. */
export type DocArtImageUrls = Partial<Record<DocArtImageRef, string | null>>;

const PRESERVE_X = { left: 'xMin', center: 'xMid', right: 'xMax' } as const;
const PRESERVE_Y = { top: 'YMin', middle: 'YMid', bottom: 'YMax' } as const;

// -----------------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------------

export interface DocArtSvgRendererProps {
  template: DocArtTemplate;
  config?: DocArtConfig;
  /** Substituição das variáveis `data-pmoc-var` — ver `ResolveOptions`. */
  substitute?: ResolveOptions['substitute'];
  /** Cor da marca do tenant; vira o default do tema. Ver `resolveTheme`. */
  brand?: ResolveOptions['brand'];
  images?: DocArtImageUrls;
  className?: string;
  /** `aria-label` da folha. Default descreve a arte. */
  title?: string;
}

/**
 * Renderiza a arte como um SVG com `viewBox` em MILÍMETROS — o mesmo sistema
 * de coordenadas da spec. Assim a spec entra sem conversão e o SVG escala pra
 * qualquer tamanho sem perder fidelidade.
 */
export const DocArtSvgRenderer = forwardRef<SVGSVGElement, DocArtSvgRendererProps>(
  ({ template, config, substitute, brand, images, className, title }, ref) => {
    const art = useMemo(
      () => resolveDocArt(template, config, { substitute, brand }),
      [template, config, substitute, brand],
    );

    // As faces entram por import dinâmico; antes disso o canvas mediria com a
    // fonte de fallback e a quebra de linha sairia diferente da do PDF. Por
    // isso o preview só mede de novo (via `fontsReady`) quando elas chegam.
    const [fontsReady, setFontsReady] = useState(false);
    useEffect(() => {
      let alive = true;
      loadDocArtFonts().then((ok) => {
        if (alive && ok) setFontsReady(true);
      });
      return () => {
        alive = false;
      };
    }, []);

    const measures = useMemo(
      () => ({ sans: makeMeasure('sans'), display: makeMeasure('display') }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [fontsReady],
    );

    return (
      <svg
        ref={ref}
        className={className}
        viewBox={`0 0 ${art.page.w} ${art.page.h}`}
        width="100%"
        role="img"
        aria-label={title ?? `Pré-visualização do certificado (modelo ${template.name})`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {art.shapes.map((shape, i) => (
          <Shape key={i} shape={shape} images={images} measures={measures} />
        ))}
      </svg>
    );
  },
);

DocArtSvgRenderer.displayName = 'DocArtSvgRenderer';

// -----------------------------------------------------------------------------
// Primitivas
// -----------------------------------------------------------------------------

interface ShapeProps {
  shape: ResolvedShape;
  images?: DocArtImageUrls;
  measures: Record<'sans' | 'display', MeasureFn>;
}

function Shape({ shape, images, measures }: ShapeProps) {
  switch (shape.kind) {
    case 'rect':
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          fill={shape.fill ?? 'none'}
          stroke={shape.stroke ?? 'none'}
          strokeWidth={shape.strokeWidth ?? 0}
          opacity={shape.opacity ?? 1}
        />
      );

    case 'circle':
      return (
        <circle
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill={shape.fill ?? 'none'}
          stroke={shape.stroke ?? 'none'}
          strokeWidth={shape.strokeWidth ?? 0}
          opacity={shape.opacity ?? 1}
        />
      );

    case 'line':
      return (
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          strokeDasharray={shape.dash ? shape.dash.join(' ') : undefined}
          opacity={shape.opacity ?? 1}
          strokeLinecap="butt"
        />
      );

    case 'path':
      return (
        <path
          d={shape.d}
          fill={shape.fill ?? 'none'}
          stroke={shape.stroke ?? 'none'}
          strokeWidth={shape.strokeWidth ?? 0}
          opacity={shape.opacity ?? 1}
        />
      );

    case 'image': {
      const url = images?.[shape.src];
      if (!url) return null;
      const align = PRESERVE_X[shape.align ?? 'center'];
      const valign = PRESERVE_Y[shape.valign ?? 'middle'];
      const pad = shape.platePadding ?? 3;
      return (
        <>
          {shape.plate ? (
            <rect
              x={shape.x - pad}
              y={shape.y - pad}
              width={shape.w + pad * 2}
              height={shape.h + pad * 2}
              fill={shape.plate}
            />
          ) : null}
          <image
          href={url}
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
            preserveAspectRatio={`${align}${valign} meet`}
            opacity={shape.opacity ?? 1}
          />
        </>
      );
    }

    case 'text':
      return <TextBlock shape={shape} measure={measures[shape.font]} />;

    default:
      return null;
  }
}

function TextBlock({ shape, measure }: { shape: ResolvedTextShape; measure: MeasureFn }) {
  const lines = layoutParagraphs(shape.paragraphs, {
    // A caixa é em mm, a medição em pt — converte a largura disponível.
    maxWidth: shape.w * (72 / 25.4),
    size: shape.size,
    letterSpacing: shape.letterSpacing,
    maxLines: shape.maxLines,
    measure,
  });

  // Cada palavra é um `<text>` com `x` próprio, na posição que o layout já
  // calculou. Nada de emendar `<tspan>`s e torcer pro navegador pôr o espaço
  // no mesmo lugar que o pdf-lib põe.
  const content = lines.map((line, i) => {
    if (line.pieces.length === 0) return null;

    const y = lineBaselineMm(
      shape.y,
      shape.lineHeight,
      shape.size,
      i,
      (shape.paragraphSpacing ?? 0) * line.paragraphIndex,
    );
    const originX = shape.x + alignOffsetMm(shape.align, shape.w, line.width);

    return line.pieces.map((piece, j) => (
      <text
        key={`${i}-${j}`}
        x={originX + ptToMm(piece.x)}
        y={y}
        fill={shape.color}
        fontFamily={FONT_STACK[shape.font]}
        fontSize={ptToMm(shape.size)}
        fontWeight={piece.bold ? 700 : 400}
        fontStyle={piece.italic ? 'italic' : undefined}
        style={{ fontKerning: 'none' }}
        letterSpacing={shape.letterSpacing ? ptToMm(shape.letterSpacing) : undefined}
      >
        {piece.text}
      </text>
    ));
  });

  if (!shape.rotate) return <g opacity={shape.opacity ?? 1}>{content}</g>;

  return (
    <g
      opacity={shape.opacity ?? 1}
      transform={`rotate(${shape.rotate} ${shape.x} ${shape.y})`}
    >
      {content}
    </g>
  );
}
