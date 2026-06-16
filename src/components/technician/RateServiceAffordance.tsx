import { createPortal } from 'react-dom';
import { Star } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';

interface RateServiceAffordanceProps {
  onClick: () => void;
}

/**
 * Affordance pra REABRIR a pesquisa de satisfação depois que o cliente fecha o
 * drawer (link público, modo cliente). A página controla quando renderiza:
 * só quando há avaliação pendente E o drawer está fechado.
 *
 * - Mobile: rodapé fixo na base (botão largo, primary), respeitando safe-area.
 * - Desktop: FAB no canto inferior direito.
 *
 * Sempre via portal pro body: a página pública pode estar dentro de um
 * ancestral com `transform` (RouteTransition/pull-to-refresh), que cria um
 * containing block novo e quebra `position: fixed` relativo ao viewport.
 */
export function RateServiceAffordance({ onClick }: RateServiceAffordanceProps) {
  const isMobile = useIsMobile();

  const node = isMobile ? (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <Button onClick={onClick} size="lg" className="h-12 w-full text-base">
        <Star className="h-5 w-5 fill-current" />
        Avaliar atendimento
      </Button>
    </div>
  ) : (
    <Button
      onClick={onClick}
      size="lg"
      className="fixed bottom-6 right-6 z-40 h-12 gap-2 rounded-full px-5 shadow-lg shadow-primary/30 print:hidden animate-in fade-in zoom-in-90 duration-300"
    >
      <Star className="h-5 w-5 fill-current" />
      Avaliar atendimento
    </Button>
  );

  return createPortal(node, document.body);
}
