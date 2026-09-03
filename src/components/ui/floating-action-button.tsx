import { createPortal } from 'react-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Botão de ação flutuante (FAB) — a ação principal da tela, sempre à mão,
 * ancorada no canto inferior direito.
 *
 * DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. **Vai pro `document.body` por portal.** `html, body, #root` têm
 *    `overflow-x: clip` (src/index.css) e o shell do app usa transform em
 *    alguns pontos — qualquer ancestral com `transform`/`filter`/`contain`
 *    passa a ser o bloco de contenção de um `position: fixed`, e o botão
 *    ancora no lugar errado (ou some). Renderizar fora da árvore da página
 *    elimina a classe inteira de problema, em vez de torcer pra não acontecer.
 *
 * 2. **No celular ele sobe pra não ficar embaixo da barra de navegação.**
 *    A `MobileBottomNav` é `fixed bottom-0` e tem o seu próprio FAB central;
 *    `5.5rem` é o mesmo recuo que os toasts já usam pra escapar dela, mais o
 *    `safe-area-inset-bottom` do iPhone. Sem isso o botão nasce por baixo da
 *    barra e fica inclicável justamente no aparelho onde o FAB mais importa.
 *
 * No celular é redondo e só ícone; a partir de `lg` vira estendido com rótulo,
 * porque no desktop há espaço e o rótulo elimina a adivinhação do ícone.
 */
interface FloatingActionButtonProps {
  /** Ícone já dimensionado pelo chamador. */
  icon: ReactNode;
  /** Rótulo: vira `aria-label` sempre, e texto visível a partir de `lg`. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function FloatingActionButton({
  icon,
  label,
  onClick,
  disabled,
  className,
}: FloatingActionButtonProps) {
  // O portal só pode montar depois que existe DOM (SSG do site público).
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    setMontado(true);
  }, []);
  if (!montado) return null;

  return createPortal(
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'fixed right-4 z-40 lg:right-6',
        'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6',
        'h-14 w-14 rounded-full p-0 shadow-lg shadow-primary/30',
        'lg:h-12 lg:w-auto lg:gap-2 lg:px-5',
        'transition-transform active:scale-95',
        'animate-in fade-in zoom-in-90 duration-300',
        'print:hidden',
        className,
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </Button>,
    document.body,
  );
}
