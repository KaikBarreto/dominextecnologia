/**
 * HelperLines — overlay canvas que desenha as guias de alinhamento (snap guides)
 * sobre o React Flow durante o arrasto de um nó.
 *
 * DEVE ser renderizado como filho direto do <ReactFlow> para ter acesso ao
 * store do @xyflow/react via `useStore`.
 *
 * A guia HORIZONTAL é uma linha na coordenada Y informada (em flow-space).
 * A guia VERTICAL é uma linha na coordenada X informada (em flow-space).
 * Some automaticamente quando `horizontal` e `vertical` ficam `undefined`.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '@xyflow/react';
import { HELPER_LINE_COLOR } from './helperLines';

interface HelperLinesProps {
  /** Coordenada Y em flow-space da linha guia horizontal (undefined = oculta). */
  horizontal?: number;
  /** Coordenada X em flow-space da linha guia vertical (undefined = oculta). */
  vertical?: number;
}

export function HelperLines({ horizontal, vertical }: HelperLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Lê o transform (tx, ty, zoom) e as dimensões do viewport do store do React Flow.
  const transform = useStore((s) => s.transform);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajusta o tamanho do canvas ao viewport do React Flow.
    canvas.width = width;
    canvas.height = height;

    // Limpa antes de desenhar.
    ctx.clearRect(0, 0, width, height);

    // Nada a desenhar.
    if (horizontal === undefined && vertical === undefined) return;

    const [tx, ty, zoom] = transform;

    ctx.strokeStyle = HELPER_LINE_COLOR;
    ctx.lineWidth = 1.5;
    // Linha tracejada sutil — reforça que é uma guia, não uma borda de elemento.
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = 0;

    // Linha guia HORIZONTAL: y em flow-space → y em screen-space = y * zoom + ty
    if (horizontal !== undefined) {
      const yScreen = horizontal * zoom + ty;
      ctx.beginPath();
      ctx.moveTo(0, yScreen);
      ctx.lineTo(width, yScreen);
      ctx.stroke();
    }

    // Linha guia VERTICAL: x em flow-space → x em screen-space = x * zoom + tx
    if (vertical !== undefined) {
      const xScreen = vertical * zoom + tx;
      ctx.beginPath();
      ctx.moveTo(xScreen, 0);
      ctx.lineTo(xScreen, height);
      ctx.stroke();
    }
  }, [horizontal, vertical, transform, width, height]);

  // Não renderiza nada se não há guia ativa (evita canvas transparente desnecessário).
  if (horizontal === undefined && vertical === undefined) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  );
}
