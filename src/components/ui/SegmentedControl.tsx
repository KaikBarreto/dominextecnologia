import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  /** 2 ou mais opções, seleção única. */
  options: SegmentedControlOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Desabilita o controle inteiro (além do `disabled` por opção). */
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
}

/**
 * Controle segmentado (grid de N botões, seleção única) com o estado ATIVO
 * SATURADO: `border-primary bg-primary text-primary-foreground`, igual ao
 * padrão de abas/badges do sistema (nunca tint translúcido tipo
 * `bg-primary/10` — fica lavado e com baixo contraste, regra do CEO).
 *
 * Semântica de radiogroup nativa (`role="radiogroup"` + `role="radio"`) com
 * roving tabindex e navegação por setas (Home/End também funcionam).
 *
 * Não hardcoda cor de marca: usa só os tokens `primary`/`primary-foreground`/
 * `muted`/`input`, então branding do tenant (white-label) é herdado de graça.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  disabled = false,
  className,
  size = "default",
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const isOptionDisabled = (index: number) => disabled || !!options[index]?.disabled;

  const findEnabled = (from: number, dir: 1 | -1): number | null => {
    const len = options.length;
    if (len === 0) return null;
    let i = from;
    for (let step = 0; step < len; step++) {
      i = (i + dir + len) % len;
      if (!isOptionDisabled(i)) return i;
    }
    return null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;

    let targetIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      targetIndex = findEnabled(index, 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      targetIndex = findEnabled(index, -1);
    } else if (e.key === "Home") {
      targetIndex = findEnabled(-1, 1);
    } else if (e.key === "End") {
      targetIndex = findEnabled(options.length, -1);
    }

    if (targetIndex !== null) {
      e.preventDefault();
      itemRefs.current[targetIndex]?.focus();
      onValueChange(options[targetIndex].value);
    }
  };

  const activeIndex = options.findIndex((opt) => opt.value === value);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, index) => {
        const isActive = index === activeIndex;
        const isDisabled = isOptionDisabled(index);
        // Roving tabindex: o item ativo (ou o primeiro habilitado, se nada
        // estiver selecionado ainda) é o único parável por Tab.
        const isTabStop = isActive || (activeIndex === -1 && index === findEnabled(-1, 1));

        return (
          <button
            key={option.value}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={isDisabled}
            tabIndex={isTabStop ? 0 : -1}
            onClick={() => {
              if (isDisabled) return;
              onValueChange(option.value);
            }}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
              isDisabled
                ? "opacity-50 cursor-not-allowed border-input bg-background text-muted-foreground"
                : isActive
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-input bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
