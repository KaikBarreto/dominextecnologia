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

export interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
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
}

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  footer,
}: ResponsiveModalProps) {
  const isCompact = useIsCompact();

  if (isCompact) {
    return (
      // handleOnly: só o handle de cima arrasta pra fechar; arrastar no conteúdo rola.
      <Drawer open={open} onOpenChange={onOpenChange} handleOnly>
        <DrawerContent className="flex max-h-[90dvh] flex-col">
          <DrawerHeader className="relative shrink-0 pr-24">
            <DrawerTitle>{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : null}
            <ModalCloseButton
              className="absolute right-3 top-3"
              onClick={() => onOpenChange(false)}
            />
          </DrawerHeader>
          <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 pb-6', className)}>
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
              {footer}
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    // Clique fora não fecha (bloqueado por padrão no DialogContent); Escape segue ativo.
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('flex max-h-[90vh] flex-col sm:max-w-[600px]', className)}
        // Com description, o Radix faz o wiring de aria-describedby sozinho.
        // Sem description, opta-se por não descrever (evita o warning de a11y do Radix).
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        {/* pr-8 reserva espaço pro botão "FECHAR" que o DialogContent injeta no canto. */}
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="shrink-0 border-t pt-3">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
