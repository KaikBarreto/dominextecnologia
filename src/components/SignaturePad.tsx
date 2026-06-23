import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Eraser, Maximize2, RefreshCw, Check, X, Smartphone } from 'lucide-react';

interface SignaturePadProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Captura de assinatura. Mostra um CAMPO BRANCO inline assinável direto ("Assine
 * aqui") + um botão "Ver em tela cheia" que abre o MESMO pad num MODAL FULLSCREEN
 * claro com paisagem no mobile. Assinar inline ou no fullscreen escreve no MESMO
 * `value`/`onChange` (sincronizam entre si). O fullscreen é renderizado via
 * createPortal no body pra escapar de ancestrais com `transform` (RouteTransition
 * da OS vira containing block e quebraria `position: fixed`).
 *
 * Contrato preservado: `value` é dataURL PNG, `onChange(dataUrl | null)`.
 */
export function SignaturePad({ value, onChange, label, disabled }: SignaturePadProps) {
  const [fullscreen, setFullscreen] = useState(false);

  const openFullscreen = () => {
    if (disabled) return;
    setFullscreen(true);
  };

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}

      {value ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-muted-foreground/20 bg-white p-2">
            <img
              src={value}
              alt="Assinatura"
              className="mx-auto h-20 w-auto max-w-full object-contain"
            />
          </div>
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={openFullscreen}>
                <Maximize2 className="mr-1 h-3.5 w-3.5" /> Ver em tela cheia
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={openFullscreen}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refazer
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange(null)}
              >
                <Eraser className="mr-1 h-3.5 w-3.5" /> Limpar
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Pad inline branco — assinável direto ali. */}
          <InlineSignaturePad value={value} onChange={onChange} disabled={disabled} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openFullscreen}
              disabled={disabled}
            >
              <Maximize2 className="mr-1 h-3.5 w-3.5" /> Ver em tela cheia
            </Button>
          </div>
        </div>
      )}

      {fullscreen && (
        <SignatureFullscreen
          value={value}
          onConfirm={(dataUrl) => {
            onChange(dataUrl);
            setFullscreen(false);
          }}
          onCancel={() => setFullscreen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pad inline branco — canvas assinável dentro do fluxo da página.    */
/* ------------------------------------------------------------------ */

interface InlinePadProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}

function InlineSignaturePad({ value, onChange, disabled }: InlinePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  // (Re)calcula a resolução do canvas após o layout, preservando o traço atual.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const prev = hasDrawnRef.current ? canvas.toDataURL('image/png') : value ?? null;

    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#000000';

    if (prev) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = prev;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(setupCanvas);
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => setupCanvas());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    };
  }, [setupCanvas]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    isDrawingRef.current = true;
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawingRef.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    hasDrawnRef.current = true;
  };

  const endDraw = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    // Persiste a assinatura no value ao soltar o traço.
    const canvas = canvasRef.current;
    if (canvas && hasDrawnRef.current) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    hasDrawnRef.current = false;
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="h-36 w-full touch-none rounded-lg border-2 border-dashed border-black/20 bg-white"
          style={{ cursor: disabled ? 'not-allowed' : 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-black/30">
          Assine aqui
        </p>
      </div>
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="mr-1 h-3.5 w-3.5" /> Limpar
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fullscreen — pad grande em paisagem.                               */
/* ------------------------------------------------------------------ */

interface FullscreenProps {
  value?: string | null;
  onConfirm: (dataUrl: string | null) => void;
  onCancel: () => void;
}

function SignatureFullscreen({ value, onConfirm, onCancel }: FullscreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const initialValueRef = useRef(value);
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false,
  );

  // Best-effort: fullscreen nativo + trava de orientação paisagem. iOS Safari
  // não suporta — tudo em try/catch, qualquer rejeição é IGNORADA.
  useEffect(() => {
    const tryLock = async () => {
      try {
        await document.documentElement.requestFullscreen?.();
      } catch {
        /* ignore */
      }
      try {
        await (screen.orientation as any)?.lock?.('landscape');
      } catch {
        /* ignore */
      }
    };
    void tryLock();

    const releaseAll = () => {
      try {
        (screen.orientation as any)?.unlock?.();
      } catch {
        /* ignore */
      }
      try {
        if (document.fullscreenElement) void document.exitFullscreen?.();
      } catch {
        /* ignore */
      }
    };
    // Cleanup ao desmontar (inclui desmonte com modal aberto).
    return releaseAll;
  }, []);

  // (Re)calcula a resolução do canvas DEPOIS do layout/rotação acontecer, pra o
  // traço casar com o tamanho real. Redesenha o value existente se houver.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Preserva o conteúdo atual antes de redimensionar (resize limpa o canvas).
    const prev = hasDrawnRef.current ? canvas.toDataURL('image/png') : initialValueRef.current;

    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#000000';

    if (prev) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = prev;
    }
  }, []);

  useEffect(() => {
    // Primeiro setup após montar (e após o fullscreen request começar).
    const raf = requestAnimationFrame(setupCanvas);

    const onResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
      setupCanvas();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    const ro = new ResizeObserver(() => setupCanvas());
    if (canvasRef.current) ro.observe(canvasRef.current);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      ro.disconnect();
    };
  }, [setupCanvas]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    isDrawingRef.current = true;
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    hasDrawnRef.current = true;
  };

  const endDraw = () => {
    isDrawingRef.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    hasDrawnRef.current = false;
    initialValueRef.current = null;
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    // Se nada foi desenhado e não havia valor inicial → confirma como vazio.
    if (!canvas || (!hasDrawnRef.current && !initialValueRef.current)) {
      onConfirm(null);
      return;
    }
    onConfirm(canvas.toDataURL('image/png'));
  };

  const overlay = (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* Cabeçalho compacto */}
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
        <span className="text-sm font-semibold text-black">Assinatura</span>
        <button
          type="button"
          aria-label="Cancelar"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-full text-black/70 active:bg-black/5"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isPortrait && (
        <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
          <Smartphone className="h-4 w-4 shrink-0" />
          Vire o celular na horizontal para assinar com mais espaço
        </div>
      )}

      {/* Área do pad — ocupa quase toda a tela */}
      <div className="relative flex-1 p-3">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none rounded-lg border-2 border-dashed border-black/20 bg-white cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-black/30">
          Assine aqui
        </p>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-2 border-t border-black/10 px-4 py-3">
        <Button
          type="button"
          variant="outline"
          onClick={clear}
          className="h-12 flex-1 border-black/20 text-black hover:bg-black/5"
        >
          <Eraser className="mr-1.5 h-4 w-4" /> Limpar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="h-12 flex-1 border-black/20 text-black hover:bg-black/5"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={confirm}
          className="h-12 flex-[1.4] bg-primary text-primary-foreground"
        >
          <Check className="mr-1.5 h-4 w-4" /> Confirmar
        </Button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
