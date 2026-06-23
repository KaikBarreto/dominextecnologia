import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Eraser, Maximize2, Check, X, PenTool, Undo2, Redo2 } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Histórico de traços (undo/redo) por SNAPSHOT de canvas.            */
/* Reutilizado pelos dois pads (inline + fullscreen) pra não duplicar  */
/* a lógica. Cada traço completo empilha um dataURL do estado atual;   */
/* desfazer/refazer redesenha o snapshot apropriado respeitando o      */
/* scale 2x. O redesenho é DELEGADO ao chamador (redrawFn) que sabe    */
/* lidar com a orientação/rotação específica de cada pad.              */
/* ------------------------------------------------------------------ */

interface SignatureHistory {
  /**
   * Empilha o estado ATUAL do canvas como um novo passo e limpa o redo.
   * Chamado ao FECHAR um traço (endDraw).
   */
  pushSnapshot: () => void;
  /** Desfaz o último traço (redesenha o estado anterior, ou vazio). */
  undo: () => void;
  /** Refaz o traço desfeito mais recente. */
  redo: () => void;
  /** Zera as duas pilhas (usado pelo "Limpar"). */
  reset: () => void;
  /**
   * Define o snapshot-BASE (primeiro estado já presente, ex.: seed do fullscreen)
   * sem mexer no redo. Idempotente: só semeia se a pilha estiver vazia.
   */
  seedBase: (dataUrl: string) => void;
  /** Snapshot do estado atual exibido (topo da pilha) ou null se vazio. */
  current: () => string | null;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Histórico de assinatura compartilhado pelos dois pads.
 *
 * - `captureFn()` deve retornar o dataURL PNG do canvas como está agora.
 * - `redrawFn(dataUrl | null)` deve repintar o canvas com o snapshot dado
 *   (ou limpá-lo se null), respeitando scale 2x e rotação.
 * - `onAfterChange(hasContent)` é chamado após undo/redo/reset pra o pad
 *   ressincronizar dirty / getDataUrl / hasDrawn.
 *
 * Modelo da pilha: `undoStack` guarda os snapshots de TODOS os estados já
 * desenhados (1 entrada por traço fechado). O topo é o estado visível.
 * Desfazer move o topo pro `redoStack` e redesenha o novo topo (ou vazio).
 */
function useSignatureHistory(
  captureFn: () => string | null,
  redrawFn: (dataUrl: string | null) => void,
  onAfterChange?: (hasContent: boolean) => void,
): SignatureHistory {
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const pushSnapshot = useCallback(() => {
    const snap = captureFn();
    if (!snap) return;
    undoStackRef.current.push(snap);
    redoStackRef.current = [];
    sync();
  }, [captureFn, sync]);

  const undo = useCallback(() => {
    const undoStack = undoStackRef.current;
    if (undoStack.length === 0) return;
    const popped = undoStack.pop()!;
    redoStackRef.current.push(popped);
    const prev = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
    redrawFn(prev);
    sync();
    onAfterChange?.(prev != null);
  }, [redrawFn, sync, onAfterChange]);

  const redo = useCallback(() => {
    const redoStack = redoStackRef.current;
    if (redoStack.length === 0) return;
    const snap = redoStack.pop()!;
    undoStackRef.current.push(snap);
    redrawFn(snap);
    sync();
    onAfterChange?.(true);
  }, [redrawFn, sync, onAfterChange]);

  const reset = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    sync();
  }, [sync]);

  const seedBase = useCallback(
    (dataUrl: string) => {
      if (undoStackRef.current.length > 0) return;
      undoStackRef.current.push(dataUrl);
      sync();
    },
    [sync],
  );

  const current = useCallback(
    () =>
      undoStackRef.current.length > 0 ? undoStackRef.current[undoStackRef.current.length - 1] : null,
    [],
  );

  return { pushSnapshot, undo, redo, reset, seedBase, current, canUndo, canRedo };
}

/* ------------------------------------------------------------------ */
/* Botõezinhos de Desfazer/Refazer sobrepostos no canto sup. direito. */
/* Contraste garantido sobre o canvas BRANCO; não disparam desenho.   */
/* ------------------------------------------------------------------ */

function UndoRedoControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  className,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Posicionamento (ex.: `absolute right-2 top-2`). Default canto sup. direito. */
  className?: string;
}) {
  // stopPropagation no mouse/touch down impede que o clique no botão comece um
  // traço no canvas por trás.
  const swallow = (e: React.SyntheticEvent) => e.stopPropagation();
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-black/5 text-slate-700 transition active:bg-black/10 disabled:opacity-30 disabled:active:bg-black/5';
  return (
    <div className={className ?? 'absolute right-2 top-2 z-[1] flex gap-1.5'}>
      <button
        type="button"
        aria-label="Desfazer"
        disabled={!canUndo}
        onClick={onUndo}
        onMouseDown={swallow}
        onTouchStart={swallow}
        className={btn}
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Refazer"
        disabled={!canRedo}
        onClick={onRedo}
        onMouseDown={swallow}
        onTouchStart={swallow}
        className={btn}
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}

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
  const [inlineDirty, setInlineDirty] = useState(false);
  // DRAFT compartilhado = desenho EM ANDAMENTO (ainda não confirmado), como
  // dataURL PNG. É a fonte ÚNICA de conteúdo entre o inline e o fullscreen: os
  // dois LEEM e ESCREVEM nele, então o que se desenha num reflete no outro ao
  // ENTRAR e ao SAIR do fullscreen. Só vira assinatura "de verdade" via onChange
  // no Confirmar; Limpar zera. No estado PREVIEW (value preenchido) o draft fica
  // null — abrir o fullscreen ali parte do `value`.
  const [draft, setDraft] = useState<string | null>(null);
  // Chave de RE-SEED do inline. Bumpada quando o fullscreen FECHA pra forçar o
  // inline a remontar partindo do `draft` atualizado (que pode ter ganhado
  // traços no fullscreen). O inline mantém estado interno do canvas, então a
  // forma confiável de "puxar" o desenho do fullscreen de volta é remontá-lo.
  const [inlineSeedKey, setInlineSeedKey] = useState(0);
  const inlinePadRef = useRef<InlineSignaturePadHandle>(null);

  const openFullscreen = () => {
    if (disabled) return;
    setFullscreen(true);
  };

  // Seed do fullscreen: draft em andamento (inclui o que foi desenhado inline)
  // ou, no estado PREVIEW, a assinatura já confirmada. Calculado na abertura.
  const fullscreenSeed = draft ?? value ?? null;

  // Fecha o fullscreen sincronizando o draft de volta pro inline (re-seed).
  const closeFullscreen = () => {
    setFullscreen(false);
    setInlineSeedKey((k) => k + 1);
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
          {/* Pad inline branco — assinável direto ali. Só COMITA no Confirmar.
              `key` força remontar quando o fullscreen fecha, pra puxar o desenho
              feito lá pro `seed`. `seed` = draft compartilhado (o que já existe). */}
          <InlineSignaturePad
            key={inlineSeedKey}
            ref={inlinePadRef}
            seed={draft ?? value ?? null}
            onChange={onChange}
            onDirtyChange={setInlineDirty}
            onDraftChange={setDraft}
            disabled={disabled}
          />
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
                onClick={() => {
                  inlinePadRef.current?.clear();
                  setDraft(null);
                }}
                disabled={disabled}
                className="min-w-0 flex-1 gap-1.5 px-2"
              >
                <Eraser className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Limpar</span>
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const url = inlinePadRef.current?.getDataUrl() ?? draft;
                  if (url) {
                    onChange(url);
                    setDraft(null);
                  }
                }}
                disabled={disabled || !inlineDirty}
                className="min-w-0 flex-1 gap-1.5 px-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Confirmar</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {fullscreen && (
        <SignatureFullscreen
          value={fullscreenSeed}
          onDraftChange={setDraft}
          onConfirm={(dataUrl) => {
            onChange(dataUrl);
            setDraft(null);
            // Confirmou → vai pro estado PREVIEW; sem re-seed do inline (que nem
            // é renderizado nesse estado). Só fecha.
            setFullscreen(false);
          }}
          onCancel={closeFullscreen}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pad inline branco — canvas assinável dentro do fluxo da página.    */
/* ------------------------------------------------------------------ */

interface InlinePadProps {
  /** Desenho inicial (draft compartilhado): semeia o canvas ao montar. */
  seed?: string | null;
  onChange: (dataUrl: string | null) => void;
  /** Avisa o pai quando o canvas passa a ter (ou deixa de ter) traço pendente. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Reporta o conteúdo atual (dataURL ou null) pro draft compartilhado. */
  onDraftChange?: (dataUrl: string | null) => void;
  disabled?: boolean;
}

export interface InlineSignaturePadHandle {
  clear: () => void;
  /** Retorna o dataURL atual do canvas (PNG) ou null se vazio. */
  getDataUrl: () => string | null;
  hasDrawing: () => boolean;
}

const InlineSignaturePad = forwardRef<InlineSignaturePadHandle, InlinePadProps>(function InlineSignaturePad(
  { seed, onChange, onDirtyChange, onDraftChange, disabled },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  // Snapshot inicial (draft compartilhado) com que o canvas é semeado UMA vez.
  // Capturado na montagem pra não reagir a mudanças de prop durante o desenho —
  // o pai remonta (via key) quando precisa re-semear de fato.
  const seedRef = useRef(seed ?? null);

  // Captura o estado atual do canvas (PNG) ou null se nada desenhado.
  const capture = useCallback(
    () => (hasDrawnRef.current && canvasRef.current ? canvasRef.current.toDataURL('image/png') : null),
    [],
  );

  // Repinta o canvas a partir de um snapshot (ou limpa se null), respeitando o
  // scale 2x. Usado por undo/redo. O ctx já está com scale(2,2) aplicado, então
  // desenhamos em coordenadas LÓGICAS (largura/altura CSS do elemento).
  const redraw = useCallback((dataUrl: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width / 2;
    const h = canvas.height / 2;
    ctx.clearRect(0, 0, w, h);
    if (dataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = dataUrl;
    }
  }, []);

  const history = useSignatureHistory(capture, redraw, (hasContent) => {
    hasDrawnRef.current = hasContent;
    onDirtyChange?.(hasContent);
    // undo/redo mudam o conteúdo → ressincroniza o draft compartilhado.
    onDraftChange?.(hasContent ? capture() : null);
  });

  // Semeia o histórico com o draft inicial UMA vez (snapshot-base). Assim o
  // Desfazer volta a ele e o getDataUrl/draft já refletem o que veio do inline
  // anterior/fullscreen mesmo antes de o usuário desenhar. seedBase mexe só em
  // estado LOCAL do histórico (ok em render); o aviso de dirty pro PAI vai num
  // efeito pra não atualizar o pai durante o render deste filho.
  const seededRef = useRef(false);
  if (!seededRef.current && seedRef.current) {
    seededRef.current = true;
    hasDrawnRef.current = true;
    history.seedBase(seedRef.current);
  }
  useEffect(() => {
    if (seedRef.current) onDirtyChange?.(true);
    // Só na montagem (seed é capturado uma vez).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)calcula a resolução do canvas após o layout, preservando o traço atual.
  // Usa o ESTADO ATUAL do histórico (não o `seed` antigo) quando já há desenho,
  // pra não perder o que o usuário fez ao redimensionar.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const prev = hasDrawnRef.current ? history.current() ?? canvas.toDataURL('image/png') : seedRef.current;

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
  }, [history]);

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
    if (!hasDrawnRef.current) {
      // Primeira marca do traço atual → avisa o pai pra habilitar o Confirmar.
      hasDrawnRef.current = true;
      onDirtyChange?.(true);
    }
  };

  const endDraw = () => {
    if (!isDrawingRef.current) return;
    // NÃO comita aqui — o desenho fica só no canvas local até "Confirmar".
    isDrawingRef.current = false;
    // Fecha o traço → empilha o estado atual no histórico (habilita Desfazer).
    history.pushSnapshot();
    // Eleva o traço fechado pro draft compartilhado (reflete no fullscreen).
    onDraftChange?.(capture());
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    hasDrawnRef.current = false;
    seedRef.current = null;
    onDraftChange?.(null);
    history.reset();
    onDirtyChange?.(false);
    // value já é null no estado não-assinado; manter por segurança (idempotente).
    onChange(null);
  };

  useImperativeHandle(
    ref,
    () => ({
      clear,
      getDataUrl: () =>
        hasDrawnRef.current && canvasRef.current ? canvasRef.current.toDataURL('image/png') : null,
      hasDrawing: () => hasDrawnRef.current,
    }),
    [],
  );

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
        <UndoRedoControls
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.undo}
          onRedo={history.redo}
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
  /** Reporta o conteúdo atual (dataURL ou null) pro draft compartilhado. */
  onDraftChange?: (dataUrl: string | null) => void;
  onConfirm: (dataUrl: string | null) => void;
  onCancel: () => void;
}

function SignatureFullscreen({ value, onDraftChange, onConfirm, onCancel }: FullscreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const initialValueRef = useRef(value);

  // Captura o estado atual do canvas (PNG) ou null se nada desenhado e sem seed.
  const capture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!hasDrawnRef.current && !initialValueRef.current) return null;
    return canvas.toDataURL('image/png');
  }, []);

  // Repinta o canvas a partir de um snapshot (ou limpa). O snapshot já guarda os
  // pixels na orientação lógica do canvas (a rotação é só CSS no palco, não afeta
  // o buffer), então drawImage em coords lógicas (canvas.width/2 × height/2)
  // reproduz fielmente respeitando o scale 2x.
  const redraw = useCallback((dataUrl: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width / 2;
    const h = canvas.height / 2;
    ctx.clearRect(0, 0, w, h);
    if (dataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = dataUrl;
    }
  }, []);

  const history = useSignatureHistory(capture, redraw, (hasContent) => {
    hasDrawnRef.current = hasContent;
    // Quando o undo volta ao estado totalmente vazio, o "Confirmar" deve tratar
    // como vazio → zera também o seed inicial pra não reconfirmar o antigo.
    if (!hasContent) initialValueRef.current = null;
    // undo/redo no fullscreen → ressincroniza o draft compartilhado (reflete no
    // inline ao fechar).
    onDraftChange?.(hasContent ? capture() : null);
  });

  // Semeia o histórico com o valor inicial (traço em andamento vindo do inline,
  // ou assinatura já existente) UMA vez. Usa o dataURL do seed diretamente como
  // snapshot-base, então Desfazer volta a ele em vez de pular pro vazio. Não
  // depende do paint async do setupCanvas.
  const seededRef = useRef(false);
  if (!seededRef.current && initialValueRef.current) {
    seededRef.current = true;
    hasDrawnRef.current = true;
    history.seedBase(initialValueRef.current);
  }

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
    // Prioriza o ESTADO ATUAL do histórico (reflete undo/redo) sobre o pixel cru
    // do canvas; cai no seed inicial se nada foi desenhado ainda.
    const prev = hasDrawnRef.current
      ? history.current() ?? canvas.toDataURL('image/png')
      : initialValueRef.current;

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
  }, [history]);

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
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    // Fecha o traço → empilha no histórico (habilita Desfazer).
    history.pushSnapshot();
    // Eleva o traço fechado pro draft compartilhado (reflete no inline ao fechar).
    onDraftChange?.(capture());
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Limpa toda a área lógica (canvas.width/2 × height/2 já cobre o buffer
    // inteiro independente da rotação CSS do palco).
    ctx.clearRect(0, 0, canvas.width / 2, canvas.height / 2);
    hasDrawnRef.current = false;
    initialValueRef.current = null;
    history.reset();
    // Limpou no fullscreen → zera o draft compartilhado (some no inline também).
    onDraftChange?.(null);
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
          <span className="flex items-center gap-2 text-xl font-bold text-foreground">
            <PenTool className="h-5 w-5 text-primary" />
            Assinatura
          </span>
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
          {/* right-5/top-5 (12px do p-3 + ~8px) deixa os botões DENTRO da área
              branca do canvas, no canto superior direito. */}
          <UndoRedoControls
            className="absolute right-5 top-5 z-[1] flex gap-1.5"
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
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
            className="h-12 flex-[1.6] bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Check className="mr-1.5 h-4 w-4" /> Confirmar
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
