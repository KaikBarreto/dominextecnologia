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
  "aria-label"?: string;
}

export function LabeledSwitch<T extends string>({
  value,
  onChange,
  off,
  on,
  className,
  "aria-label": ariaLabel,
}: LabeledSwitchProps<T>) {
  const isOn = value === on.value;
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)}>
      <button
        type="button"
        onClick={() => onChange(off.value)}
        className={cn(
          "text-sm font-semibold transition-colors",
          !isOn ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {off.label}
      </button>
      <Switch
        checked={isOn}
        onCheckedChange={(c) => onChange(c ? on.value : off.value)}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        onClick={() => onChange(on.value)}
        className={cn(
          "text-sm font-semibold transition-colors",
          isOn ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {on.label}
      </button>
    </div>
  );
}
