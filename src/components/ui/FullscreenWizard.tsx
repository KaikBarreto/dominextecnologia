import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  ResponsiveModal,
  type ResponsiveModalProps,
} from "@/components/ui/ResponsiveModal";
import { cn } from "@/lib/utils";

/**
 * Padrão de fluxos longos: viewport inteira, Sair no cabeçalho, corpo com
 * rolagem única e rodapé fixo. Use FormWizardStepper no conteúdo e
 * FullscreenWizardAction nas ações. Avisos secundários usam floatingNotice:
 * não criam backdrop, não prendem foco e respeitam a altura real do rodapé.
 * Ação principal preta com texto/ícone branco; negativos vermelhos
 * no hover; títulos grandes e layout próprio para celular.
 */
export function FullscreenWizard({
  floatingNotice,
  className,
  ...props
}: Omit<ResponsiveModalProps, "fullScreen" | "floatingContent"> & {
  floatingNotice?: React.ReactNode;
}) {
  return (
    <ResponsiveModal
      {...props}
      fullScreen
      floatingContent={floatingNotice}
      className={cn(
        "min-w-0 overflow-x-hidden [&_button]:focus-visible:ring-black dark:[&_button]:focus-visible:ring-white [&_input:not([type=checkbox]):not([type=radio])]:min-h-12 [&_input]:text-base [&_textarea]:text-base [&_[role=combobox]]:min-h-12 [&_label]:text-base",
        className,
      )}
    />
  );
}

export const FullscreenWizardAction = React.forwardRef<
  HTMLButtonElement,
  ButtonProps
>(({ className, variant = "default", ...props }, ref) => (
  <Button
    ref={ref}
    {...props}
    type={props.type ?? "button"}
    variant={variant}
    className={cn(
      "h-[3.25rem] px-5 text-base font-bold sm:h-14",
      variant === "default" &&
        "bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85",
      className,
    )}
  />
));
FullscreenWizardAction.displayName = "FullscreenWizardAction";

export function FullscreenWizardNotice({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const titleId = React.useId();
  return (
    <section
      aria-labelledby={titleId}
      className="grid items-center gap-4 rounded-2xl border border-primary/15 bg-background p-4 text-foreground shadow-[0_12px_48px_rgba(0,0,0,0.18)] sm:grid-cols-[minmax(0,1fr)_auto] sm:p-5"
    >
      <div className="flex min-w-0 items-start gap-3" role="status">
        {icon && (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground [&_svg]:h-5 [&_svg]:w-5"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold sm:text-lg">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">{actions}</div>
    </section>
  );
}
