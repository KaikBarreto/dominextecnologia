import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface LabeledSwitchOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

interface LabeledSwitchProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  /** Lado esquerdo = estado "desligado" do switch. */
  off: LabeledSwitchOption<T>;
  /** Lado direito = estado "ligado" do switch. */
  on: LabeledSwitchOption<T>;
  className?: string;
  /** Tamanho dos rótulos. 'default' = text-base, 'lg' = text-lg. */
  size?: "default" | "lg";
  /** Desabilita a alavanca e os rótulos clicáveis. */
  disabled?: boolean;
  "aria-label"?: string;
}

export function LabeledSwitch<T extends string>({
  value,
  onChange,
  off,
  on,
  className,
  size = "default",
  disabled = false,
  "aria-label": ariaLabel,
}: LabeledSwitchProps<T>) {
  const isOn = value === on.value;
  const textSize = size === "lg" ? "text-lg" : "text-base";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5",
        disabled && "opacity-50",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(off.value)}
        className={cn(
          textSize,
          "font-semibold transition-colors disabled:cursor-not-allowed",
          !isOn ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {off.label}
      </button>
      <Switch
        checked={isOn}
        disabled={disabled}
        onCheckedChange={(c) => onChange(c ? on.value : off.value)}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(on.value)}
        className={cn(
          textSize,
          "font-semibold transition-colors disabled:cursor-not-allowed",
          isOn ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {on.label}
      </button>
    </div>
  );
}
