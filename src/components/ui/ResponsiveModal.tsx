import * as React from 'react';
import { useIsCompact } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  ModalCloseButton,
} from '@/components/ui/dialog';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import {
  OVERLAY_PRIORITY,
  OverlayNestingProvider,
  useOverlaySlot,
} from '@/contexts/OverlayCoordinatorContext';

export interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** Aparência do conteúdo rolável, sem alterar os outros modais. */
  bodyClassName?: string;
  /** Classes aplicadas ao drawer móvel; use para estabilizar a altura de wizards entre etapas. */
  drawerClassName?: string;
  /** Footer content rendered below the scrollable area (fica colado embaixo, fora do scroll) */
  footer?: React.ReactNode;
  /**
   * @deprecated Redundante desde a régua "modal não fecha ao clicar fora".
   * Clicar/tocar fora NUNCA fecha o modal em nenhuma plataforma — fecha só pelo
   * botão "FECHAR", pelos botões do rodapé, ou (no mobile) arrastando o handle
   * de cima. A prop continua aceita pra não quebrar chamadas existentes, mas não
   * tem mais efeito.
   */
  lockBackdrop?: boolean;
  overlayId?: string;
  overlayPriority?: number;
  /** Liga um modal irmão ao modal pai para ambos permanecerem visíveis na pilha. */
  overlayParentId?: string | null;
  /** Reduz o cabeçalho e os intervalos sem alterar a área útil/altura do modal. */
  density?: 'default' | 'compact';
  /** Ocupa a viewport inteira e usa saída no topo esquerdo. Ideal para fluxos longos. */
  fullScreen?: boolean;
  /** @deprecated Use exitLabel para a ação que encerra o fluxo. */
  backLabel?: string;
  /** Texto da saída do fluxo em tela cheia. Voltar pertence à navegação entre etapas. */
  exitLabel?: string;
  /** Aviso não modal ancorado acima do rodapé do fluxo fullscreen. */
  floatingContent?: React.ReactNode;
  /** Acompanhamento ou ação contextual à direita do título fullscreen. */
  headerActions?: React.ReactNode;
}

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  bodyClassName,
  drawerClassName,
  footer,
  overlayId,
  overlayPriority = OVERLAY_PRIORITY.userAction,
  overlayParentId,
  density = 'default',
  fullScreen = false,
  backLabel,
  exitLabel,
  floatingContent,
  headerActions,
}: ResponsiveModalProps) {
  const isCompact = useIsCompact();
  const generatedOverlayId = React.useId();
  const resolvedOverlayId = overlayId ?? `responsive-modal-${generatedOverlayId}`;
  const isActiveOverlay = useOverlaySlot(open, { id: resolvedOverlayId, priority: overlayPriority, ...(overlayParentId !== undefined ? { parentId: overlayParentId } : {}) });
  const visibleOpen = open && isActiveOverlay;
  const resolvedExitLabel = exitLabel ?? backLabel ?? 'Sair';
  const [footerElement, setFooterElement] = React.useState<HTMLDivElement | null>(null);
  const [footerHeight, setFooterHeight] = React.useState<number | null>(null);
  const hasFooter = !!footer;

  React.useEffect(() => {
    if (!fullScreen || !visibleOpen) {
      setFooterHeight(null);
      return;
    }
    const element = footerElement;
    if (!element) { setFooterHeight(hasFooter ? null : 0); return; }
    const measure = () => setFooterHeight(Math.ceil(element.getBoundingClientRect().height));
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [fullScreen, visibleOpen, hasFooter, footerElement]);

  if (isCompact && !fullScreen) {
    return (
      <OverlayNestingProvider id={resolvedOverlayId}>
        {/* handleOnly: só o handle de cima arrasta pra fechar; arrastar no conteúdo rola. */}
        <Drawer open={visibleOpen} onOpenChange={onOpenChange} handleOnly>
          <DrawerContent
            className={cn('flex max-h-[90dvh] flex-col', drawerClassName)}
            // Modal de formulário: tap/clique fora NUNCA fecha. Fecha só por FECHAR,
            // pelos botões do rodapé, ou arrastando o handle de cima.
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DrawerHeader className={cn(
              'shrink-0 px-4',
              density === 'compact' ? 'pb-2 pt-2' : 'pb-3 pt-2',
            )}>
              <div className="mb-2 flex min-h-8 justify-end">
                <ModalCloseButton onClick={() => onOpenChange(false)} />
              </div>
              <DrawerTitle className="w-full break-words text-center text-xl leading-tight">{title}</DrawerTitle>
              {description ? (
                <DrawerDescription className={cn('mx-auto mt-2 w-full max-w-xl text-center leading-relaxed', density === 'compact' ? 'text-xs' : 'text-sm')}>
                  {description}
                </DrawerDescription>
              ) : null}
            </DrawerHeader>
            <div className={cn(
              'min-h-0 flex-1 overflow-y-auto px-4',
              density === 'compact' ? 'pb-4' : 'pb-6',
              className,
              bodyClassName,
            )}>
              {children}
            </div>
            {footer ? (
              <div className={cn(
                'shrink-0 border-t px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]',
                density === 'compact' ? 'pt-2.5' : 'pt-3',
              )}>
                {footer}
              </div>
            ) : null}
          </DrawerContent>
        </Drawer>
      </OverlayNestingProvider>
    );
  }

  return (
    <OverlayNestingProvider id={resolvedOverlayId}>
      {/* Modal de formulário: clique fora NUNCA fecha (bloqueado aqui, não no primitivo). Escape segue ativo. */}
      <Dialog open={visibleOpen} onOpenChange={onOpenChange} disableMobileDrawer={fullScreen}>
        <DialogContent
          className={cn(
            'flex max-h-[90vh] flex-col sm:max-w-[600px]',
            density === 'compact' && 'gap-3 p-5',
            fullScreen && '!left-0 !top-0 h-[100dvh] max-h-none w-screen !max-w-none !translate-x-0 !translate-y-0 gap-0 rounded-none border-0 p-0 shadow-none duration-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 sm:rounded-none',
            className,
          )}
          hideCloseButton={fullScreen}
          // Clique fora não fecha; Escape segue ativo (não bloqueado).
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          // Com description, o Radix faz o wiring de aria-describedby sozinho.
          // Sem description, opta-se por não descrever (evita o warning de a11y do Radix).
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          {fullScreen ? (
            <DialogHeader
              data-fullscreen-header
              className={cn(
                'flex shrink-0 flex-row items-center gap-3 space-y-0 border-b pb-3 pl-[calc(env(safe-area-inset-left)+1rem)] pr-[calc(env(safe-area-inset-right)+1rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] text-left sm:gap-6 sm:pb-5 sm:pl-[calc(env(safe-area-inset-left)+2.5rem)] sm:pr-[calc(env(safe-area-inset-right)+2.5rem)] sm:pt-[calc(env(safe-area-inset-top)+1.25rem)] [@media(max-height:500px)]:pb-2 [@media(max-height:500px)]:pt-[calc(env(safe-area-inset-top)+0.5rem)]',
                headerActions && 'grid grid-cols-[auto_minmax(0,1fr)] gap-y-1 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:flex sm:pb-5 sm:pt-[calc(env(safe-area-inset-top)+1.25rem)]',
              )}
            >
              <Button
                type="button"
                variant="cancel-ghost"
                className="h-11 shrink-0 gap-2 px-2 text-sm font-semibold sm:h-12 sm:px-3 sm:text-base"
                onClick={() => onOpenChange(false)}
                aria-label={resolvedExitLabel}
              >
                <LogOut className="h-5 w-5" />
                {resolvedExitLabel}
              </Button>
              <div className={cn('min-w-0 flex-1', headerActions && 'col-span-2 row-start-2')}>
                <DialogTitle className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{title}</DialogTitle>
                {description ? <DialogDescription className="mt-1.5 hidden text-base lg:block [@media(max-height:500px)]:hidden">{description}</DialogDescription> : null}
              </div>
              {headerActions && <div className="col-start-2 row-start-1 ml-auto shrink-0">{headerActions}</div>}
            </DialogHeader>
          ) : (
            <DialogHeader className={cn('shrink-0 pr-8', density === 'compact' && 'space-y-0.5')}>
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription className={cn(density === 'compact' && 'text-xs')}>{description}</DialogDescription> : null}
            </DialogHeader>
          )}
          <div className={cn('min-h-0 flex-1 overflow-y-auto', fullScreen && 'px-4 pb-5 pt-0 sm:px-10 sm:pb-6', bodyClassName)}>{children}</div>
          {fullScreen && floatingContent && footerHeight !== null ? (
            <div data-fullscreen-floating className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4" style={{ bottom: footerHeight + 16 }}>
              <div className="pointer-events-auto w-full max-w-3xl motion-safe:animate-in motion-safe:slide-in-from-bottom-3 motion-safe:fade-in duration-200">{floatingContent}</div>
            </div>
          ) : null}
          {footer ? <div ref={setFooterElement} data-fullscreen-footer={fullScreen || undefined} className={cn('shrink-0 border-t', fullScreen ? 'bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-10 sm:py-4' : density === 'compact' ? 'pt-2.5' : 'pt-3')}>{footer}</div> : null}
        </DialogContent>
      </Dialog>
    </OverlayNestingProvider>
  );
}
