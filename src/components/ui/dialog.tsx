import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsCompact } from "@/hooks/use-mobile";

/**
 * Botão "FECHAR" rotulado, canto superior direito do header do modal.
 *
 * Estado normal: discreto (só texto/ícone muted, sem fundo). Em hover E
 * active/pressed (pra funcionar também no toque), vira vermelho destrutivo com
 * ícone e texto brancos. Close rotulado — útil em qualquer dialog, inclusive
 * nos de formulário (ResponsiveModal) onde o clique-fora não fecha.
 *
 * `asChild` permite embrulhar num `DialogPrimitive.Close` (desktop) mantendo o
 * fechamento nativo do Radix; no drawer usamos `onClick` direto.
 */
const modalCloseButtonClass =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-destructive hover:text-white active:bg-destructive active:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none";

const ModalCloseButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label="Fechar"
    className={cn(modalCloseButtonClass, className)}
    {...props}
  >
    <X className="h-4 w-4" aria-hidden="true" />
    <span>FECHAR</span>
  </button>
));
ModalCloseButton.displayName = "ModalCloseButton";

/**
 * Modo de renderização do `Dialog` propagado via contexto. Em mobile, troca
 * automaticamente Radix Dialog por vaul Drawer (bottom sheet, app-like).
 *
 * Esta é a base do invariante "modais no mobile são drawer" — qualquer
 * `<Dialog>` (existente ou futuro) vira drawer sem o consumer tocar nada.
 * Override por consumer via prop `disableMobileDrawer` em `<Dialog>`.
 */
type DialogMode = "dialog" | "drawer";
const DialogModeContext = React.createContext<DialogMode>("dialog");
const useDialogMode = (): DialogMode => React.useContext(DialogModeContext);

export interface DialogProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root> {
  /**
   * Se true, mantém Dialog centralizado (Radix) mesmo no mobile. Use só quando
   * o conteúdo já é responsivo e drawer atrapalha (raro). Default false.
   */
  disableMobileDrawer?: boolean;
}

function Dialog({
  disableMobileDrawer = false,
  children,
  open,
  onOpenChange,
  defaultOpen,
  modal,
  ...props
}: DialogProps) {
  const isCompact = useIsCompact();
  const mode: DialogMode =
    isCompact && !disableMobileDrawer ? "drawer" : "dialog";

  if (mode === "drawer") {
    return (
      <DialogModeContext.Provider value="drawer">
        <DrawerPrimitive.Root
          open={open}
          onOpenChange={onOpenChange}
          defaultOpen={defaultOpen}
          shouldScaleBackground
          repositionInputs={false}
        >
          {children}
        </DrawerPrimitive.Root>
      </DialogModeContext.Provider>
    );
  }

  return (
    <DialogModeContext.Provider value="dialog">
      <DialogPrimitive.Root
        open={open}
        onOpenChange={onOpenChange}
        defaultOpen={defaultOpen}
        modal={modal}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogModeContext.Provider>
  );
}

const DialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>((props, ref) => {
  const mode = useDialogMode();
  if (mode === "drawer") {
    return <DrawerPrimitive.Trigger ref={ref} {...(props as unknown as React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Trigger>)} />;
  }
  return <DialogPrimitive.Trigger ref={ref} {...props} />;
});
DialogTrigger.displayName = "DialogTrigger";

/**
 * Em modo drawer, vaul gerencia portal+overlay internamente dentro do
 * `DrawerContent`. Renderizar `DialogPortal` ou `DialogOverlay` separados
 * vira no-op pra evitar overlays duplicados.
 */
const DialogPortal = ({
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) => {
  const mode = useDialogMode();
  if (mode === "drawer") {
    return <>{children}</>;
  }
  return <DialogPrimitive.Portal {...props}>{children}</DialogPrimitive.Portal>;
};
DialogPortal.displayName = "DialogPortal";

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>((props, ref) => {
  const mode = useDialogMode();
  if (mode === "drawer") {
    return <DrawerPrimitive.Close ref={ref} {...(props as unknown as React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Close>)} />;
  }
  return <DialogPrimitive.Close ref={ref} {...props} />;
});
DialogClose.displayName = "DialogClose";

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const mode = useDialogMode();
  if (mode === "drawer") {
    // Drawer já renderiza overlay próprio dentro do DrawerContent
    return null;
  }
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
});
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Conteúdo do diálogo. Em modo drawer, vira um bottom sheet com handle visual,
 * `max-h-[90dvh]` e cantos superiores arredondados. O `aria-describedby` é
 * preservado em ambos os modos pela passagem via `...props`.
 */
const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const mode = useDialogMode();
  const innerRef = React.useRef<HTMLDivElement>(null);

  // No drawer, ao focar um input/textarea/select, rolar pra view (teclado mobile)
  React.useEffect(() => {
    if (mode !== "drawer") return;
    const el = innerRef.current;
    if (!el) return;
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.matches("input, textarea, select")) return;
      window.setTimeout(() => {
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }, 180);
    };
    el.addEventListener("focusin", handleFocusIn);
    return () => el.removeEventListener("focusin", handleFocusIn);
  }, [mode]);

  if (mode === "drawer") {
    return (
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DrawerPrimitive.Content
          ref={ref as React.Ref<HTMLDivElement>}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-2xl border bg-background",
            className,
          )}
          style={{ maxHeight: "90dvh" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          {...(props as unknown as React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>)}
        >
          {/* Handle visual do vaul. Tap-fora fecha por default; consumidor pode gate via props. */}
          <DrawerPrimitive.Handle className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted" />
          <DrawerPrimitive.Close asChild>
            <ModalCloseButton className="absolute right-3 top-3 z-10" />
          </DrawerPrimitive.Close>
          <div
            ref={innerRef}
            className="flex flex-col flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2"
          >
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    );
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <ModalCloseButton className="absolute right-4 top-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = "DialogContent";

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const mode = useDialogMode();
  if (mode === "drawer") {
    return (
      <div
        className={cn("flex flex-col space-y-1.5 text-left pt-2 pb-3", className)}
        {...props}
      />
    );
  }
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
};
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const mode = useDialogMode();
  if (mode === "drawer") {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 border-t bg-background pt-3 mt-3 -mx-4 px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sticky bottom-0",
          className,
        )}
        {...props}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className,
      )}
      {...props}
    />
  );
};
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const mode = useDialogMode();
  if (mode === "drawer") {
    return (
      <DrawerPrimitive.Title
        ref={ref as React.Ref<HTMLHeadingElement>}
        className={cn("text-lg font-semibold leading-none tracking-tight", className)}
        {...(props as unknown as React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>)}
      />
    );
  }
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
});
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const mode = useDialogMode();
  if (mode === "drawer") {
    return (
      <DrawerPrimitive.Description
        ref={ref as React.Ref<HTMLParagraphElement>}
        className={cn("text-sm text-muted-foreground", className)}
        {...(props as unknown as React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>)}
      />
    );
  }
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  ModalCloseButton,
};
