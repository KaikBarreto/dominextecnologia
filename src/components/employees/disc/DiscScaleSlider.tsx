// ─────────────────────────────────────────────────────────────────────────────
// DiscScaleSlider — barra arrastável de resposta Likert (1..5) do teste DISC.
//
// Substitui os 5 botões da tela pública por um slider horizontal com snap em 5
// níveis. Mapeamento: ESQUERDA = 1 ("Nada a ver comigo"), CENTRO = 3 ("Neutro"),
// DIREITA = 5 ("Tudo a ver comigo").
//
// Cor por intensidade: centro neutro (slate); à direita o trilho preenchido fica
// verde e satura conforme se aproxima de 5; à esquerda fica vermelho e satura
// conforme se aproxima de 1. O thumb herda a cor do nível atual.
//
// Estado "não respondido": NÃO existe mais estado apagado — o consumidor deve
// sempre passar um valor (1..5). O default neutro (3) é responsabilidade do
// consumidor (DiscAssessmentPublic aplica via useEffect ao entrar na pergunta).
//
// Inset do trilho: o elemento interativo tem px-4 de padding lateral + overflow-
// visible, de modo que o thumb nos extremos (left:0% / left:100%) fique sempre
// inteiro dentro da área visível. O getBoundingClientRect() retorna o rect COM o
// padding, então a aritmética de levelFromClientX está correta automaticamente.
//
// Interação mobile-first: Pointer Events (touch + mouse), clique no trilho move
// pro nível mais próximo, setas ←/→ mudam de nível. touch-action:none durante o
// drag pra não rolar a página. a11y: role="slider" + aria-value*.
//
// NÃO altera o formato do valor (continua 1..5) nem a pontuação.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { ThumbsDown, ThumbsUp, Meh } from 'lucide-react';
import { cn } from '@/lib/utils';

const MIN = 1;
const MAX = 5;
const STEPS = MAX - MIN; // 4 intervalos entre 5 níveis

// Cores da casa (mesmas do arquivo original).
const RED = { r: 0xdc, g: 0x26, b: 0x26 }; // #DC2626
const GREEN = { r: 0x16, g: 0xa3, b: 0x4a }; // #16A34A
const NEUTRAL = { r: 0x64, g: 0x74, b: 0x8b }; // #64748B (slate)

/** Interpola entre a cor neutra e a cor-alvo por um fator 0..1. */
function mix(
  target: { r: number; g: number; b: number },
  t: number,
): string {
  const r = Math.round(NEUTRAL.r + (target.r - NEUTRAL.r) * t);
  const g = Math.round(NEUTRAL.g + (target.g - NEUTRAL.g) * t);
  const b = Math.round(NEUTRAL.b + (target.b - NEUTRAL.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Cor do nível (1..5): quanto mais longe do centro, mais saturado. */
function colorForLevel(level: number): string {
  const center = (MIN + MAX) / 2; // 3
  const dist = Math.abs(level - center); // 0..2
  const t = dist / (STEPS / 2); // 0..1
  if (level > center) return mix(GREEN, t);
  if (level < center) return mix(RED, t);
  return `rgb(${NEUTRAL.r}, ${NEUTRAL.g}, ${NEUTRAL.b})`;
}

export interface DiscScaleSliderProps {
  /** Valor atual 1..5, ou undefined enquanto não respondido. */
  value: number | undefined;
  /** Grava o nível escolhido (1..5). */
  onChange: (value: number) => void;
  /** Rótulos i18n da escala: { 1..5, lowAnchor, highAnchor }. */
  labels: {
    1: string;
    2: string;
    3: string;
    4: string;
    5: string;
    lowAnchor: string;
    highAnchor: string;
  };
  /** Enunciado da afirmação (a11y aria-label). */
  ariaLabel?: string;
}

export function DiscScaleSlider({
  value,
  onChange,
  labels,
  ariaLabel,
}: DiscScaleSliderProps) {
  // trackRef aponta para o elemento INTERNO do trilho (sem padding).
  // O wrapper externo tem px-4 + overflow-visible para dar folga ao thumb.
  // getBoundingClientRect() no trackRef retorna a largura sem o padding do
  // wrapper, então left:0%=início do trilho e left:100%=fim do trilho.
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Após o Ajuste 2, o consumidor garante que value nunca é undefined ao
  // renderizar o slider. Mantemos o fallback defensivo para 3 por segurança.
  const answered = value !== undefined;
  const displayLevel = answered ? (value as number) : 3;
  const pct = ((displayLevel - MIN) / STEPS) * 100; // 0..100

  // Converte uma coordenada X (px, absoluta) no nível 1..5 mais próximo.
  // Usa o rect do trackRef (área interna, sem padding do wrapper).
  const levelFromClientX = useCallback((clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 3;
    const rect = el.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const clamped = Math.min(1, Math.max(0, ratio));
    return Math.round(MIN + clamped * STEPS); // snap ao nível mais próximo
  }, []);

  const commitFromClientX = useCallback(
    (clientX: number) => {
      const level = levelFromClientX(clientX);
      if (level !== value) onChange(level);
    },
    [levelFromClientX, onChange, value],
  );

  // ── Pointer (touch + mouse) ──────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    commitFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    commitFromClientX(e.clientX);
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  // ── Teclado (a11y) ───────────────────────────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    let next: number | null = null;
    const base = answered ? (value as number) : 3;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(MAX, base + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(MIN, base - 1);
    else if (e.key === 'Home') next = MIN;
    else if (e.key === 'End') next = MAX;
    else if (e.key >= '1' && e.key <= '5') next = Number(e.key);
    if (next !== null) {
      e.preventDefault();
      if (next !== value) onChange(next);
    }
  };

  // Evita scroll da página quando o dedo arrasta o trilho.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const prevent = (ev: TouchEvent) => {
      if (dragging) ev.preventDefault();
    };
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, [dragging]);

  // Cor do thumb: colorida conforme o nível (o consumidor garante value≠undefined
  // para o nível neutro 3, que retorna a cor slate — visualmente igual ao estado
  // "apagado" anterior, mas sem opacity-60).
  const thumbColor = colorForLevel(displayLevel);

  // Preenchimento colorido do centro até o thumb (gradiente de intensidade).
  const centerPct = 50;
  const fillLeft = Math.min(centerPct, pct);
  const fillWidth = Math.abs(pct - centerPct);
  // No nível 3 (neutro) fillWidth=0, então o fill não aparece mesmo que answered.
  const fillColor = answered ? colorForLevel(value as number) : 'transparent';

  const currentLabel = labels[displayLevel as 1 | 2 | 3 | 4 | 5];

  return (
    <div className="flex flex-col gap-4 select-none">
      {/* Rótulo do nível atual, acima da barra */}
      <div className="flex min-h-[2rem] items-center justify-center">
        <span
          className="rounded-full px-4 py-1 text-sm font-semibold text-white shadow-sm transition-all"
          style={{ backgroundColor: thumbColor }}
          aria-hidden
        >
          {currentLabel}
        </span>
      </div>

      {/* Wrapper externo: recebe eventos de pointer/teclado + a11y.
          px-4 dá folga lateral equivalente ao raio do thumb (h-8 → raio=16px).
          overflow-visible permite que o thumb nos extremos apareça inteiro fora
          do content-box do wrapper mas dentro do espaço visual do px-4. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={answered ? (value as number) : undefined}
        aria-valuetext={currentLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          'relative h-12 cursor-pointer outline-none overflow-visible px-4',
          'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400 rounded-full',
        )}
        style={{ touchAction: dragging ? 'none' : 'pan-y' }}
      >
        {/* Área interna do trilho: referência para getBoundingClientRect e
            posicionamento proporcional do thumb, fill e ticks.
            Ocupa 100% do content-box do wrapper (descontados os px-4). */}
        <div ref={trackRef} className="absolute inset-x-4 top-0 bottom-0">
          {/* Trilho base */}
          <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-slate-200" />

          {/* Marca do centro (neutro) */}
          <div className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300" />

          {/* Preenchimento colorido do centro até o thumb */}
          {answered && (
            <div
              className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full transition-all"
              style={{
                left: `${fillLeft}%`,
                width: `${fillWidth}%`,
                backgroundColor: fillColor,
              }}
            />
          )}

          {/* Ticks dos 5 níveis */}
          {[1, 2, 3, 4, 5].map((lvl) => {
            const tickPct = ((lvl - MIN) / STEPS) * 100;
            return (
              <div
                key={lvl}
                className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70"
                style={{ left: `${tickPct}%` }}
                aria-hidden
              />
            );
          })}

          {/* Thumb — left:0%=extremo esquerdo do trilho, left:100%=extremo
              direito. O translate(-50%) centra o thumb no nível. overflow-
              visible do wrapper garante que o thumb apareça inteiro. */}
          <div
            className={cn(
              'absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white shadow-md transition-all',
              dragging ? 'scale-110' : '',
            )}
            style={{ left: `${pct}%`, backgroundColor: thumbColor }}
            aria-hidden
          >
            <span className="h-2 w-2 rounded-full bg-white/90" />
          </div>
        </div>
      </div>

      {/* Pontas: rótulos + microícones */}
      <div className="flex items-start justify-between gap-3 px-1 text-xs">
        <div className="flex max-w-[42%] flex-col items-start gap-1">
          <ThumbsDown className="h-4 w-4 shrink-0" style={{ color: '#DC2626' }} aria-hidden />
          <span className="font-medium leading-tight" style={{ color: '#DC2626' }}>
            {labels.lowAnchor}
          </span>
        </div>
        <Meh className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <div className="flex max-w-[42%] flex-col items-end gap-1 text-right">
          <ThumbsUp className="h-4 w-4 shrink-0" style={{ color: '#16A34A' }} aria-hidden />
          <span className="font-medium leading-tight" style={{ color: '#16A34A' }}>
            {labels.highAnchor}
          </span>
        </div>
      </div>
    </div>
  );
}
