import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const SLOT_ID = 'acoes-da-tela';

/**
 * Lugar onde as ações da tela aparecem: à DIREITA, na MESMA linha da barra de
 * abas, aproveitando a faixa que já existe em vez de gastar uma linha inteira
 * só com dois botões.
 *
 * Quem renderiza o slot é a página (junto das abas). Quem preenche é o painel
 * da aba ativa, via [ScreenActions] — assim os botões continuam morando perto
 * do estado e dos diálogos que eles abrem, sem precisar içar nada pra página.
 */
export function ScreenActionsSlot({ className }: { className?: string }) {
  return <div id={SLOT_ID} className={cn('flex shrink-0 items-center gap-2', className)} />;
}

/**
 * Joga os botões no slot da barra de abas. Sem slot na tela (ou sem ele ainda
 * montado), não renderiza nada — a página que não tem a faixa simplesmente não
 * recebe as ações, em vez de quebrar.
 */
export function ScreenActions({ children }: { children: ReactNode }) {
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);

  // O slot vive acima na árvore e já está no DOM quando o painel monta, mas a
  // leitura fica no efeito pra não depender dessa ordem.
  useEffect(() => {
    setAlvo(document.getElementById(SLOT_ID));
  }, []);

  if (!alvo) return null;
  return createPortal(children, alvo);
}
