import * as React from "react";
import { useIsCompact } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { cn } from "@/lib/utils";
import { OVERLAY_PRIORITY, useOverlaySlot } from "@/contexts/OverlayCoordinatorContext";

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  drawerClassName?: string;
  /**
   * Quando false, o drawer mobile não fecha ao arrastar pra baixo nem ao
   * clicar fora — só por botão explícito ou pela `onOpenChange` chamada
   * pelo próprio formulário. Default: true (comportamento padrão do vaul).
   *
   * No desktop, também esconde o botão X, bloqueia ESC e clique fora.
   */
  dismissible?: boolean;
  /**
   * Quando true, o drawer mobile abre quase em tela cheia (95dvh) em vez
   * do max-h-[85vh] padrão. Útil pra formulários com muitos campos onde
   * o usuário não deveria ter que rolar pra ver o título. Default: false.
   */
  mobileFullHeight?: boolean;
  /**
   * Quando true, pula o header (DialogHeader/DrawerHeader) e o ScrollArea
   * automáticos — children controlam o layout inteiro dentro do container.
   * Útil pra modais com header customizado full-bleed (logo, cores, etc.).
   * O `title` ainda é usado como aria-label para acessibilidade (VisuallyHidden).
   */
  customLayout?: boolean;
  /**
   * Footer sticky com botões de ação. Quando fornecido, renderiza FORA da
   * área de scroll, sempre visível na parte inferior do modal (desktop e mobile).
   * Usar isso pra botões "Salvar/Cancelar" — o user não precisa rolar até o
   * fim do formulário pra ver as ações.
   */
  footer?: React.ReactNode;
  /** Renderiza o mesmo conteúdo diretamente na página, sem modal ou drawer. */
  inline?: boolean;
  /** Identidade estável na fila global de overlays. */
  overlayId?: string;
  /** Prioridade maior suspende overlays menores sem desmontar seu conteúdo. */
  overlayPriority?: number;
}
/**
 * Responsive dialog that shows as a modal on desktop and bottom sheet drawer on mobile
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  drawerClassName,
  dismissible = true,
  mobileFullHeight = false,
  customLayout = false,
  footer,
  inline = false,
  overlayId,
  overlayPriority = OVERLAY_PRIORITY.userAction,
}: ResponsiveDialogProps) {
  const isMobile = useIsCompact();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const isActiveOverlay = useOverlaySlot(open, { id: overlayId, priority: overlayPriority });
  const visibleOpen = open && isActiveOverlay;

  React.useEffect(() => {
    if (open && scrollRef.current) {
      // ScrollArea viewport is the first child div with overflow
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = 0;
      } else {
        scrollRef.current.scrollTop = 0;
      }
    }
  }, [open]);

  if (inline) {
    return (
      <section className={cn("flex min-w-0 flex-col", className)} aria-label={title}>
        {!customLayout && (
          <div className="shrink-0 border-b border-border pb-4">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        )}
        <div className={cn("min-w-0 py-5", footer && "flex-1")}>{children}</div>
        {footer && <div className="shrink-0 border-t border-border pt-4">{footer}</div>}
      </section>
    );
  }

  if (isMobile) {
    return (
      <Drawer open={visibleOpen} onOpenChange={onOpenChange} dismissible={dismissible}>
        <DrawerContent
          className={cn(
            mobileFullHeight && "h-[95dvh] max-h-[95dvh]",
            (customLayout || footer) && "flex flex-col min-h-0 overflow-hidden p-0 gap-0",
            !dismissible && "[&>div:first-child]:hidden",
            drawerClassName,
          )}
          onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
          onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
        >
          {customLayout ? (
            <>
              <VisuallyHidden asChild>
                <DrawerTitle>{title}</DrawerTitle>
              </VisuallyHidden>
              {children}
            </>
          ) : (
            <>
              <DrawerHeader className="text-left shrink-0">
                <DrawerTitle>{title}</DrawerTitle>
                {description && <DrawerDescription>{description}</DrawerDescription>}
              </DrawerHeader>
              <ScrollArea
                ref={scrollRef}
                className={cn(
                  "overflow-y-auto overflow-x-hidden px-4 pb-4 [&>div>div]:!block [&>div>div]:max-w-full",
                  footer ? "flex-1 min-h-0" : mobileFullHeight ? "flex-1 min-h-0" : "max-h-[70vh]",
                )}
              >
                {children}
              </ScrollArea>
              {footer && (
                <div className="shrink-0 border-t bg-background px-4 py-3">
                  {footer}
                </div>
              )}
            </>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={visibleOpen} onOpenChange={dismissible ? onOpenChange : undefined}>
      <DialogContent
        className={cn(
          className,
          (customLayout || footer) && "p-0 overflow-hidden flex flex-col min-h-0 gap-0",
          footer && "max-h-[90vh]",
          !dismissible && "[&>button]:hidden",
        )}
        onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
        onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
        onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
      >
        {customLayout ? (
          <>
            <VisuallyHidden asChild>
              <DialogTitle>{title}</DialogTitle>
            </VisuallyHidden>
            {children}
          </>
        ) : footer ? (
          <>
            <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-4">
              {children}
            </div>
            <div className="shrink-0 border-t bg-background px-6 py-3">
              {footer}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            {children}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
