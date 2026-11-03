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
  /** Reduz o cabeçalho e os intervalos sem alterar a área útil/altura do modal. */
  density?: 'default' | 'compact';
}

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  drawerClassName,
  footer,
  overlayId,
  overlayPriority = OVERLAY_PRIORITY.userAction,
  density = 'default',
}: ResponsiveModalProps) {
  const isCompact = useIsCompact();
  const generatedOverlayId = React.useId();
  const resolvedOverlayId = overlayId ?? `responsive-modal-${generatedOverlayId}`;
  const isActiveOverlay = useOverlaySlot(open, { id: resolvedOverlayId, priority: overlayPriority });
  const visibleOpen = open && isActiveOverlay;

  if (isCompact) {
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
            {/* Header com título centralizado e botão FECHAR absoluto.
                O título usa padding horizontal simétrico (px-14) para que o texto
                nunca passe por baixo do botão FECHAR, mesmo em títulos longos.
                O botão fica absolute para não ocupar o fluxo e desalinhar o centro. */}
            {/* pt-7 dá folga do handle de arraste (que fica no topo do drawer) pro
                botão FECHAR não encostar no topo. O padding horizontal reserva espaço
                pro botão rotulado — título centralizado quebra em 2 linhas antes de
                colidir.

                ⚠️ A reserva TEM que ser >= a pegada real do botão, medida da borda
                da tela: `right-3` (12px) + largura do botão rotulado (~89px com
                "FECHAR"/"CLOSE"/"CERRAR"/"FERMER") = ~102px. Estava `px-20` = 80px,
                ou seja 22px A MENOS que o botão, e o título passava POR BAIXO dele.
                Medido no QA de 15/10/2026 a 390px: título ocupando x 93..297 contra
                o botão em x 288..377 — colidia até com título CURTO, em qualquer
                drawer do app, não só no que estava sendo testado.
                `px-28` = 112px deixa 10px de folga pra variação de fonte/idioma. */}
            <DrawerHeader className={cn(
              'relative shrink-0 px-28',
              density === 'compact' ? 'pb-2 pt-6' : 'pb-3 pt-7',
            )}>
              <DrawerTitle className="text-center">{title}</DrawerTitle>
              {description ? (
                <DrawerDescription className={cn('text-center', density === 'compact' ? 'mt-0.5 text-xs' : 'mt-1')}>
                  {description}
                </DrawerDescription>
              ) : null}
              <ModalCloseButton
                className="absolute right-3 top-4"
                onClick={() => onOpenChange(false)}
              />
            </DrawerHeader>
            <div className={cn(
              'min-h-0 flex-1 overflow-y-auto px-4',
              density === 'compact' ? 'pb-4' : 'pb-6',
              className,
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
      <Dialog open={visibleOpen} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            'flex max-h-[90vh] flex-col sm:max-w-[600px]',
            density === 'compact' && 'gap-3 p-5',
            className,
          )}
          // Clique fora não fecha; Escape segue ativo (não bloqueado).
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          // Com description, o Radix faz o wiring de aria-describedby sozinho.
          // Sem description, opta-se por não descrever (evita o warning de a11y do Radix).
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          {/* pr-8 reserva espaço pro botão "FECHAR" que o DialogContent injeta no canto. */}
          <DialogHeader className={cn('shrink-0 pr-8', density === 'compact' && 'space-y-0.5')}>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription className={cn(density === 'compact' && 'text-xs')}>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? <div className={cn('shrink-0 border-t', density === 'compact' ? 'pt-2.5' : 'pt-3')}>{footer}</div> : null}
        </DialogContent>
      </Dialog>
    </OverlayNestingProvider>
  );
}
