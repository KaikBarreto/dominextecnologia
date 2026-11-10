import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleCheck, CircleX, X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      // `app-toast-viewport` é o gancho ESTÁVEL de seletor pro CSS global que
      // tira o toast da frente de modal/drawer (ver `src/index.css`, bloco
      // "Toast nunca cobre modal/drawer"). NÃO remover nem trocar por classe
      // utilitária do Tailwind — utilitária muda, esta é o contrato.
      "app-toast-viewport",
      // Container não intercepta toque: quando não há toast, o <ol> ainda é uma
      // faixa de ~104px colada no rodapé (p-4 + pb da bottom nav) e comeria o
      // tap de tudo que estivesse embaixo. Cada toast tem `pointer-events-auto`
      // em `toastVariants`, então botão/X/swipe do toast continuam funcionando.
      "pointer-events-none",
      // Mobile/tablet: sobe o rodapé pra ficar ACIMA da MobileBottomNav (~4rem +
      // safe-area), senão o toast cobre o menu enquanto não some. Desktop (lg):
      // não tem bottom nav, volta pra margem curta no canto inferior direito.
      "fixed bottom-0 left-0 right-0 top-auto z-[100] flex max-h-screen w-full flex-col gap-2 p-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:right-0 sm:left-auto md:max-w-[420px] lg:pb-[max(1rem,env(safe-area-inset-bottom))]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  "group pointer-events-auto relative flex min-h-[4.5rem] w-full items-stretch justify-between space-x-0 overflow-hidden rounded-md border p-0 pr-10 shadow-lg transition-all [&>div]:min-w-0 [&>div]:self-center [&>div]:px-4 [&>div]:py-3.5 data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive: "destructive group border-border bg-background text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, children, ...props }, ref) => {
  const destructive = variant === "destructive";
  return (
    <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props}>
      <span className={cn("flex w-[4.5rem] shrink-0 items-center justify-center text-white", destructive ? "bg-red-600" : "bg-emerald-600")} aria-hidden="true">
        {destructive ? <CircleX className="h-6 w-6" /> : <CircleCheck className="h-6 w-6" />}
      </span>
      {children}
    </ToastPrimitives.Root>
  );
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "mr-1 inline-flex h-8 shrink-0 self-center items-center justify-center rounded-md border-0 bg-transparent px-3 text-sm font-semibold ring-offset-background transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground opacity-100 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn("text-sm font-semibold", className)} {...props} />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description ref={ref} className={cn("text-sm opacity-90", className)} {...props} />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
