import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useIsCompact } from "@/hooks/use-mobile";

/**
 * Modo de renderização do `AlertDialog` propagado via contexto. Em mobile,
 * troca automaticamente Radix AlertDialog por vaul Drawer com semântica
 * `role="alertdialog"` preservada pra a11y (VoiceOver/TalkBack).
 *
 * Override por consumer via prop `disableMobileDrawer` em `<AlertDialog>`.
 */
type AlertDialogMode = "dialog" | "drawer";
const AlertDialogModeContext = React.createContext<AlertDialogMode>("dialog");
const useAlertDialogMode = (): AlertDialogMode =>
  React.useContext(AlertDialogModeContext);

export interface AlertDialogProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Root> {
  /**
   * Se true, mantém AlertDialog centralizado (Radix) mesmo no mobile.
   * Default false.
   */
  disableMobileDrawer?: boolean;
}

function AlertDialog({
  disableMobileDrawer = false,
  children,
  open,
  onOpenChange,
  defaultOpen,
  ...props
}: AlertDialogProps) {
  const isCompact = useIsCompact();
  const mode: AlertDialogMode =
    isCompact && !disableMobileDrawer ? "drawer" : "dialog";

  if (mode === "drawer") {
    return (
      <AlertDialogModeContext.Provider value="drawer">
        <DrawerPrimitive.Root
          open={open}
          onOpenChange={onOpenChange}
          defaultOpen={defaultOpen}
          shouldScaleBackground
          repositionInputs={false}
          // dismissible=false não rola — AlertDialog é modal por contrato.
          // Mantemos drawer dismissible mas Action/Cancel são quem fecham.
        >
          {children}
        </DrawerPrimitive.Root>
      </AlertDialogModeContext.Provider>
    );
  }

  return (
    <AlertDialogModeContext.Provider value="dialog">
      <AlertDialogPrimitive.Root
        open={open}
        onOpenChange={onOpenChange}
        defaultOpen={defaultOpen}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Root>
    </AlertDialogModeContext.Provider>
  );
}

const AlertDialogTrigger = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Trigger>
>((props, ref) => {
  const mode = useAlertDialogMode();
  if (mode === "drawer") {
    return <DrawerPrimitive.Trigger ref={ref} {...(props as unknown as React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Trigger>)} />;
  }
  return <AlertDialogPrimitive.Trigger ref={ref} {...props} />;
});
AlertDialogTrigger.displayName = "AlertDialogTrigger";

const AlertDialogPortal = ({
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) => {
  const mode = useAlertDialogMode();
  if (mode === "drawer") return <>{children}</>;
  return (
    <AlertDialogPrimitive.Portal {...props}>{children}</AlertDialogPrimitive.Portal>
  );
};
AlertDialogPortal.displayName = "AlertDialogPortal";

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const mode = useAlertDialogMode();
  if (mode === "drawer") return null;
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
      ref={ref}
    />
  );
});
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const AlertDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const mode = useAlertDialogMode();

  if (mode === "drawer") {
    return (
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DrawerPrimitive.Content
          ref={ref as React.Ref<HTMLDivElement>}
          // role="alertdialog" garante semântica pra leitores de tela (regra a11y)
          role="alertdialog"
          aria-modal="true"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-2xl border bg-background",
            className,
          )}
          style={{ maxHeight: "90dvh" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          {...(props as unknown as React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>)}
        >
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted shrink-0" />
          <div className="flex flex-col flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2">
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    );
  }

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
});
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const mode = useAlertDialogMode();
  if (mode === "drawer") {
    return (
      <div
        className={cn("flex flex-col space-y-2 text-left pt-2 pb-3", className)}
        {...props}
      />
    );
  }
  return (
    <div
      className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
      {...props}
    />
  );
};
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const mode = useAlertDialogMode();
  if (mode === "drawer") {
    // Convenção Android-friendly: Action embaixo, Cancel em cima (flex-col-reverse
    // inverte a ordem do JSX que sempre tem Cancel antes de Action em shadcn).
    return (
      <div
        className={cn(
          "flex flex-col-reverse gap-2 border-t bg-background pt-3 mt-3 -mx-4 px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sticky bottom-0",
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
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const mode = useAlertDialogMode();
  if (mode === "drawer") {
    return (
      <DrawerPrimitive.Title
        ref={ref as React.Ref<HTMLHeadingElement>}
        className={cn("text-lg font-semibold", className)}
        {...(props as unknown as React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>)}
      />
    );
  }
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
});
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const mode = useAlertDialogMode();
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
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});
AlertDialogDescription.displayName = "AlertDialogDescription";

/**
 * Em modo drawer, embrulhamos com `DrawerClose` pra preservar o contrato do
 * Radix AlertDialog: Action sempre fecha após o onClick. Largura cheia +
 * altura grande pra alcance fácil com polegar.
 */
const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => {
  const mode = useAlertDialogMode();
  if (mode === "drawer") {
    return (
      <DrawerPrimitive.Close asChild>
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          className={cn(buttonVariants(), "w-full h-11", className)}
          {...(props as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        />
      </DrawerPrimitive.Close>
    );
  }
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={cn(buttonVariants(), className)}
      {...props}
    />
  );
});
AlertDialogAction.displayName = "AlertDialogAction";

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => {
  const mode = useAlertDialogMode();
  if (mode === "drawer") {
    return (
      <DrawerPrimitive.Close asChild>
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          className={cn(buttonVariants({ variant: "outline" }), "w-full h-11", className)}
          {...(props as unknown as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        />
      </DrawerPrimitive.Close>
    );
  }
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={cn(buttonVariants({ variant: "outline" }), "mt-2 sm:mt-0", className)}
      {...props}
    />
  );
});
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
