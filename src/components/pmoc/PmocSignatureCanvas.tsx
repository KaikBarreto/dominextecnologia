import * as React from 'react';
import { Eraser, Save, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Canvas de assinatura/carimbo desenhado pelo usuário (Onda UI-1.2).
 *
 * Implementação nativa via `<canvas>` (sem dep externa) — pointer events
 * unificam mouse + touch + stylus em um único handler. Output é PNG dataURL.
 *
 * NÃO é a fonte preferida pra PMOC: foto/scan da assinatura no papel tem
 * peso jurídico maior. Usar canvas só quando o usuário não tem como digitalizar.
 * O componente pai (`ResponsibleTechnicianFormDialog`) já mostra warning nesse sentido.
 *
 * API:
 *   - `value`: dataURL inicial (pra hidratar quando edita). Vazio = começar limpo.
 *   - `onChange`: chamado com dataURL atual no `Salvar como imagem` (botão interno).
 *     Se o usuário "limpa" e sai sem salvar, devolve string vazia.
 *
 * Tamanho: 400×120 desktop / full-width × 140 mobile. Tela toda do canvas é
 * `touch-action: none` pra não scrollar a página enquanto desenha.
 */
interface PmocSignatureCanvasProps {
  value?: string | null;
  onChange: (dataUrl: string) => void;
  className?: string;
  /** Altura do canvas em px. Default 140 mobile, 120 desktop. */
  height?: number;
}

export function PmocSignatureCanvas({ value, onChange, className, height = 140 }: PmocSignatureCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const drawingRef = React.useRef(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const [hasContent, setHasContent] = React.useState(false);

  // Configura canvas com DPR pra ficar nítido em telas retina.
  const setupCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = Math.floor(rect.width);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a'; // slate-900 — tinta azul-escura, contrastante e legível
    ctx.lineWidth = 2;

    // Fundo branco (importante: PNG transparente fica ruim em assinatura impressa).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Re-hidrata `value` se existir.
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        setHasContent(true);
      };
      img.src = value;
    } else {
      setHasContent(false);
    }
  }, [value, height]);

  React.useEffect(() => {
    setupCanvas();
    // Re-render canvas em resize (rotação mobile, abrir devtools, etc.).
    const observer = new ResizeObserver(() => setupCanvas());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [setupCanvas]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPos(e);
    // Captura pra continuar recebendo eventos mesmo se sair do elemento.
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pos = getPos(e);
    const last = lastPointRef.current ?? pos;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
    if (!hasContent) setHasContent(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const handleClear = () => {
    setupCanvas();
    setHasContent(false);
    onChange('');
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onChange(dataUrl);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        ref={containerRef}
        className="rounded-lg border-2 border-dashed border-border bg-white"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="block w-full cursor-crosshair touch-none rounded-md"
          style={{ touchAction: 'none' }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Desenhe acima usando o dedo, mouse ou caneta.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!hasContent}
          >
            <Eraser className="mr-1.5 h-3.5 w-3.5" />
            Limpar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!hasContent}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Salvar imagem
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2 text-xs text-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <span>
          Assinatura desenhada pode ser questionada em auditoria. Prefira upload de imagem
          real quando possível.
        </span>
      </div>
    </div>
  );
}

/**
 * Helper: converte data URL (`data:image/png;base64,...`) em `File` pra reuso do
 * fluxo de upload existente (`uploadResponsibleTechnicianMedia`).
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch?.[1] ?? 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}
