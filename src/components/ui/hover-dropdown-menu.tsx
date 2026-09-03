import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '@/components/ui/dropdown-menu';

interface HoverDropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  contentClassName?: string;
  closeDelay?: number;
  openDelay?: number;
  /**
   * Janela de carência (ms) após abrir, na qual eventos de `mouseleave` são
   * ignorados. Sem isso o Radix "pisca": o conteúdo entra animando, cobre o
   * gatilho por um instante e o navegador dispara mouseleave mesmo com o cursor
   * parado — o menu fecha e reabre na sequência.
   */
  openGraceMs?: number;
}

/**
 * Menu suspenso que abre no HOVER e permanece aberto enquanto o ponteiro está
 * sobre o gatilho ou sobre o conteúdo. O clique continua funcionando (toque e
 * teclado), então nada se perde em acessibilidade nem no mobile.
 */
export function HoverDropdownMenu({
  trigger,
  children,
  align = 'end',
  side,
  sideOffset = 0,
  contentClassName,
  closeDelay = 250,
  openDelay = 0,
  openGraceMs = 220,
}: HoverDropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inGracePeriod = React.useRef(false);

  const clearTimers = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (graceTimer.current) {
      clearTimeout(graceTimer.current);
      graceTimer.current = null;
    }
  };

  const startGrace = () => {
    inGracePeriod.current = true;
    if (graceTimer.current) clearTimeout(graceTimer.current);
    graceTimer.current = setTimeout(() => {
      inGracePeriod.current = false;
    }, openGraceMs);
  };

  const doOpen = () => {
    setOpen(true);
    startGrace();
  };

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open) return;
    if (openDelay > 0) {
      openTimer.current = setTimeout(doOpen, openDelay);
    } else {
      doOpen();
    }
  };

  const handleLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (inGracePeriod.current) return;
    closeTimer.current = setTimeout(() => setOpen(false), closeDelay);
  };

  React.useEffect(() => () => clearTimers(), []);

  return (
    // `modal={false}`: no modo modal o Radix trava `pointer-events` no body
    // enquanto o menu está aberto. Num menu que abre no HOVER isso congela o
    // resto da tela sem o usuário ter clicado em nada.
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        asChild
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={contentClassName}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
