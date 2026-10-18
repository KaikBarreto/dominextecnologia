import { useCallback, useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

export interface TimeWheelProps {
  /** Hora no formato 24h "HH:mm". "" ou undefined = vazio. */
  value: string | undefined;
  /** Devolve a hora escolhida como "HH:mm". */
  onChange: (value: string) => void;
  /** Passo dos minutos. default 1 (00..59); se 5, gera 00,05,...,55. */
  minuteStep?: number;
  disabled?: boolean;
  className?: string;
  /**
   * Rótulos de leitor de tela das duas colunas. Entram por prop porque este
   * componente é puro (não lê contexto de idioma) e o app é 4 idiomas — quem
   * usa passa já traduzido. Default em pt-br pra chamada antiga não quebrar.
   */
  hoursLabel?: string;
  minutesLabel?: string;
  /**
   * Quantas linhas a coluna mostra (sempre ÍMPAR, pra haver um centro). 5 é o
   * padrão; 3 existe pro mobile, onde a roleta divide um popover baixo com o
   * calendário e as 5 linhas empurravam as ações pra fora da área visível.
   */
  visibleItems?: 3 | 5;
}

const ITEM_HEIGHT = 40; // h-10
const DEFAULT_VISIBLE_ITEMS = 5; // container mostra ~5 linhas
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Seletor de HORA no estilo "roleta" (wheel/roller iOS): duas colunas roláveis
 * lado a lado — HORAS (00–23) e MINUTOS (00–59, ou passo `minuteStep`). O item
 * CENTRAL de cada coluna é o selecionado.
 *
 * Detecção do selecionado: cada coluna é um container `overflow-y-auto snap-y
 * snap-mandatory` com padding de 2 itens em cima/embaixo. Ao rolar, num rAF
 * debounced, o índice central sai de `Math.round(scrollTop / ITEM_HEIGHT)` e a
 * hora "HH:mm" é recomposta. Um overlay `pointer-events-none` marca a faixa do
 * meio. Clicar num número o rola até o centro (que dispara o mesmo onChange).
 *
 * CONTRATO: hora é string pura "HH:mm" (24h). NÃO usa `new Date`/fuso.
 *
 * Anti-loop: posicionamento programático do scroll (montagem, mudança externa
 * de `value`, clique) seta `programmaticRef`, e o `onScroll` disparado por ele é
 * ignorado — onChange só sai de interação real do usuário.
 */
export function TimeWheel({
  value,
  onChange,
  minuteStep = 1,
  disabled,
  className,
  hoursLabel = 'Horas',
  minutesLabel = 'Minutos',
  visibleItems = DEFAULT_VISIBLE_ITEMS,
}: TimeWheelProps) {
  // Spacers de topo/base: metade das linhas visíveis de cada lado, pra o 1º e o
  // último item conseguirem chegar ao CENTRO (é o centro que vale como
  // selecionado). Com 5 linhas são 2; com 3, apenas 1.
  const padItems = Math.floor(visibleItems / 2);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => {
    const step = minuteStep > 0 ? minuteStep : 1;
    const out: number[] = [];
    for (let m = 0; m < 60; m += step) out.push(m);
    return out;
  }, [minuteStep]);

  // Valor atual parseado; se vazio, coluna posiciona no 0 mas NÃO emite sozinha.
  const [curH, curM] = useMemo(() => {
    if (!value) return [undefined, undefined] as const;
    const [h, m] = value.split(":").map((n) => parseInt(n, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return [undefined, undefined] as const;
    return [h, m] as const;
  }, [value]);

  // Índice do minuto mais próximo respeitando o passo (ex.: 07 com step 5 → 05).
  const minuteIndex = useMemo(() => {
    if (curM == null) return 0;
    let best = 0;
    let bestDist = Infinity;
    minutes.forEach((m, i) => {
      const d = Math.abs(m - curM);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }, [curM, minutes]);

  const hourIndex = curH != null ? curH : 0;

  const emit = useCallback(
    (h: number, m: number) => {
      onChange(`${pad2(h)}:${pad2(m)}`);
    },
    [onChange],
  );

  return (
    <div
      className={cn(
        "relative flex select-none items-stretch justify-center gap-2",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {/* Faixa central de realce (cobre as duas colunas). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 rounded-md border-y border-border bg-muted-foreground/10"
        style={{ height: ITEM_HEIGHT }}
      />
      <WheelColumn
        ariaLabel={hoursLabel}
        items={hours}
        selectedIndex={hourIndex}
        active={curH != null}
        disabled={disabled}
        visibleItems={visibleItems}
        padItems={padItems}
        onSelect={(idx) => emit(hours[idx], curM ?? 0)}
      />
      <span className="z-10 flex items-center text-lg font-semibold text-muted-foreground">
        :
      </span>
      <WheelColumn
        ariaLabel={minutesLabel}
        items={minutes}
        selectedIndex={minuteIndex}
        active={curM != null}
        disabled={disabled}
        visibleItems={visibleItems}
        padItems={padItems}
        onSelect={(idx) => emit(curH ?? 0, minutes[idx])}
      />
    </div>
  );
}

interface WheelColumnProps {
  ariaLabel: string;
  items: number[];
  selectedIndex: number;
  /** true quando há valor real (destaca item central mais forte). */
  active: boolean;
  disabled?: boolean;
  onSelect: (index: number) => void;
  visibleItems: number;
  padItems: number;
}

function WheelColumn({
  ariaLabel,
  items,
  selectedIndex,
  active,
  disabled,
  onSelect,
  visibleItems,
  padItems,
}: WheelColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const programmaticRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Índice mostrado como "centro" durante o scroll (só p/ estilo/opacidade).
  const centerIndexRef = useRef(selectedIndex);

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    programmaticRef.current = true;
    el.scrollTo({ top: index * ITEM_HEIGHT, behavior: smooth ? "smooth" : "auto" });
    // Libera a flag depois do scroll assentar (smooth demora mais).
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(
      () => {
        programmaticRef.current = false;
      },
      smooth ? 320 : 60,
    );
  }, []);

  // Posiciona (sem animação) ao montar e quando o valor muda por fora.
  useEffect(() => {
    centerIndexRef.current = selectedIndex;
    scrollToIndex(selectedIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  const applyStyles = useCallback((centerIndex: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const options = el.querySelectorAll<HTMLElement>("[data-wheel-option]");
    options.forEach((opt) => {
      const idx = Number(opt.dataset.index);
      const dist = Math.abs(idx - centerIndex);
      opt.setAttribute("aria-selected", dist === 0 ? "true" : "false");
      opt.classList.remove(
        "text-foreground",
        "font-semibold",
        "text-muted-foreground",
        "opacity-100",
        "opacity-60",
        "opacity-30",
      );
      if (dist === 0) {
        opt.classList.add("text-foreground", "font-semibold", "opacity-100");
      } else if (dist === 1) {
        opt.classList.add("text-muted-foreground", "opacity-60");
      } else {
        opt.classList.add("text-muted-foreground", "opacity-30");
      }
    });
  }, []);

  // Estilo inicial + reaplica quando o índice selecionado muda por fora.
  useEffect(() => {
    applyStyles(selectedIndex);
  }, [selectedIndex, applyStyles]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Atualiza o estilo continuamente (mesmo em scroll programático).
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const raw = el.scrollTop / ITEM_HEIGHT;
      const center = Math.round(raw);
      if (center !== centerIndexRef.current) {
        centerIndexRef.current = center;
        applyStyles(center);
      }
    });

    if (programmaticRef.current) return;

    // Debounce até o scroll do usuário assentar, então emite.
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      const idx = Math.max(
        0,
        Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)),
      );
      // Snap fino: garante que fica exatamente centralizado.
      if (Math.abs(el.scrollTop - idx * ITEM_HEIGHT) > 1) {
        scrollToIndex(idx, true);
      }
      onSelect(idx);
    }, 120);
  }, [applyStyles, items.length, onSelect, scrollToIndex]);

  const handleOptionClick = useCallback(
    (index: number) => {
      if (disabled) return;
      scrollToIndex(index, true);
      onSelect(index);
    },
    [disabled, onSelect, scrollToIndex],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(0, (active ? selectedIndex : 0) - 1);
        scrollToIndex(next, true);
        onSelect(next);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(items.length - 1, (active ? selectedIndex : 0) + 1);
        scrollToIndex(next, true);
        onSelect(next);
      }
    },
    [active, disabled, items.length, onSelect, scrollToIndex, selectedIndex],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (settleRef.current) clearTimeout(settleRef.current);
    };
  }, []);

  return (
    <div
      ref={scrollRef}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={disabled ? -1 : 0}
      onScroll={handleScroll}
      // Impede o react-remove-scroll do Dialog/Drawer (onde a roleta abre) de
      // engolir o wheel — sem isto, rolar com o mouse não muda o valor quando a
      // roleta está dentro de um modal. O scroll nativo (overflow-y-auto) + o
      // onScroll acima cuidam da seleção. Mesma técnica do CstCombobox/CFOP.
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      className="scrollbar-hide relative snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        height: ITEM_HEIGHT * visibleItems,
        scrollbarWidth: "none",
      }}
    >
      {/* Spacer superior: permite o 1º item centralizar. */}
      <div style={{ height: ITEM_HEIGHT * padItems }} aria-hidden />
      {items.map((n, idx) => {
        const dist = Math.abs(idx - selectedIndex);
        const isCenter = active && dist === 0;
        return (
          <button
            key={n}
            type="button"
            data-wheel-option
            data-index={idx}
            role="option"
            aria-selected={isCenter}
            tabIndex={-1}
            onClick={() => handleOptionClick(idx)}
            className={cn(
              "flex w-12 shrink-0 snap-center items-center justify-center text-lg tabular-nums transition-colors",
              isCenter
                ? "text-foreground font-semibold opacity-100"
                : dist === 1
                  ? "text-muted-foreground opacity-60"
                  : "text-muted-foreground opacity-30",
            )}
            style={{ height: ITEM_HEIGHT }}
          >
            {pad2(n)}
          </button>
        );
      })}
      {/* Spacer inferior. */}
      <div style={{ height: ITEM_HEIGHT * padItems }} aria-hidden />
    </div>
  );
}
