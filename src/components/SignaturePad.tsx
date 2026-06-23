import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Eraser, Maximize2, RefreshCw, Check, X } from 'lucide-react';

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
  const inlinePadRef = useRef<InlineSignaturePadHandle>(null);

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
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openFullscreen}
                className="min-w-0 flex-1 gap-1.5 px-2"
              >
                <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Tela cheia</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openFullscreen}
                className="min-w-0 flex-1 gap-1.5 px-2"
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Refazer</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange(null)}
                className="min-w-0 flex-1 gap-1.5 px-2"
              >
                <Eraser className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Limpar</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Pad inline branco — assinável direto ali. */}
          <InlineSignaturePad ref={inlinePadRef} value={value} onChange={onChange} disabled={disabled} />
          {!disabled && (
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openFullscreen}
                disabled={disabled}
                className="min-w-0 flex-1 gap-1.5 px-2"
              >
                <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Tela cheia</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inlinePadRef.current?.clear()}
                disabled={disabled}
                className="min-w-0 flex-1 gap-1.5 px-2"
              >
                <Eraser className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Limpar</span>
              </Button>
            </div>
          )}
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

export interface InlineSignaturePadHandle {
  clear: () => void;
}

const InlineSignaturePad = forwardRef<InlineSignaturePadHandle, InlinePadProps>(function InlineSignaturePad(
  { value, onChange, disabled },
  ref,
) {
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

  useImperativeHandle(ref, () => ({ clear }), []);

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
    </div>
  );
});

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
  const stageRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const initialValueRef = useRef(value);
  // RETRATO = precisamos forçar paisagem via rotação CSS (lock nativo não pegou).
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false,
  );
  // Mantém o flag de rotação acessível dentro dos handlers de ponteiro sem
  // recriá-los (ref espelha o state).
  const isPortraitRef = useRef(isPortrait);
  isPortraitRef.current = isPortrait;

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
    // clientWidth/clientHeight = caixa de LAYOUT do elemento (NÃO afetada pelo
    // transform: rotate do palco), ao contrário de getBoundingClientRect que
    // devolve a caixa axis-aligned já rotacionada. Como o getPos assume que
    // canvas.width/2 é a largura lógica (pré-rotação), precisamos das medidas
    // de layout aqui pra o mapeamento de ponteiro casar.
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;

    // Preserva o conteúdo atual antes de redimensionar (resize limpa o canvas).
    const prev = hasDrawnRef.current ? canvas.toDataURL('image/png') : initialValueRef.current;

    canvas.width = w * 2;
    canvas.height = h * 2;
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
        ctx.drawImage(img, 0, 0, w, h);
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

    let clientX: number;
    let clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const rect = canvas.getBoundingClientRect();
    // Centro visual do canvas (rect já é a caixa axis-aligned, mesmo rotacionado:
    // como rotacionamos exatamente 90°, a caixa coincide com o canvas e o centro
    // é o mesmo ponto físico do centro lógico).
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Vetor do centro até o ponteiro, em coordenadas de tela.
    const dx = clientX - cx;
    const dy = clientY - cy;

    // Dimensões LÓGICAS do canvas em CSS px (largura/altura do elemento canvas,
    // ANTES da rotação). canvas.width/height são 2x (devicePixel), por isso /2.
    const logicalW = canvas.width / 2;
    const logicalH = canvas.height / 2;

    if (isPortraitRef.current) {
      // Stage rotacionado +90° (sentido horário). Para voltar ao espaço lógico
      // do canvas aplicamos a rotação inversa (-90°) no vetor da tela:
      //   localX =  dy
      //   localY = -dx
      return {
        x: dy + logicalW / 2,
        y: -dx + logicalH / 2,
      };
    }

    // Sem rotação: mapeamento direto.
    return { x: dx + logicalW / 2, y: dy + logicalH / 2 };
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

  // Quando RETRATO, o palco inteiro (cabeçalho + pad + controles) é rotacionado
  // +90° e tem dimensões TROCADAS (largura = altura da viewport, altura =
  // largura da viewport), centralizado, pra preencher a tela SEMPRE em paisagem.
  // Em PAISAGEM nativa (lock pegou ou usuário girou), o palco preenche normal.
  const stageStyle: React.CSSProperties = isPortrait
    ? {
        // Trava de paisagem por CSS: largura = altura da viewport (100vh) e
        // altura = largura da viewport (100vw), ancorado no canto superior
        // esquerdo e rotacionado 90° pra preencher EXATAMENTE a tela retrato.
        // (transform: rotate(90deg) translateY(-100%) com origin top-left é a
        // combinação que assenta a caixa em [0,0]→[innerW,innerH] — validado no
        // browser; centralizar com translate(-50%) quebra por causa da base %.)
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vh',
        height: '100vw',
        transform: 'rotate(90deg) translateY(-100%)',
        transformOrigin: 'top left',
      }
    : {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
      };

  const overlay = (
    // CHROME do modal segue o TEMA (dark/light) via tokens. SÓ a área de
    // assinatura (canvas) é sempre branca pra legibilidade do traço.
    <div className="fixed inset-0 z-[60] overflow-hidden bg-background">
      <div ref={stageRef} style={stageStyle} className="flex flex-col bg-card text-foreground">
        {/* Cabeçalho limpo */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-xl font-bold text-foreground">Assinatura</span>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onCancel}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Área do pad — ocupa quase toda a tela em paisagem. min-h-0/min-w-0
            são obrigatórios: sem eles o flex-child estoura sob a rotação e o
            canvas cresce pra milhares de px (validado no browser).
            O canvas em si é SEMPRE branco (independente do tema). */}
        <div className="relative min-h-0 min-w-0 flex-1 p-3">
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

        {/* Controles — Limpar (sutil) + Confirmar (destaque). O X do cabeçalho
            já fecha sem salvar, então não há "Cancelar" redundante aqui. */}
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={clear}
            className="h-12 flex-1"
          >
            <Eraser className="mr-1.5 h-4 w-4" /> Limpar
          </Button>
          <Button
            type="button"
            onClick={confirm}
            className="h-12 flex-[1.6] bg-success text-success-foreground hover:bg-success/90"
          >
            <Check className="mr-1.5 h-4 w-4" /> Confirmar
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
