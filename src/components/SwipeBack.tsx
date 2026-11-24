import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * SwipeBackProvider — wrapper LEVE do gesto swipe-back, sem framer-motion.
 *
 * O gesto real (SwipeBackMotion em SwipeBackProvider.tsx) é a única coisa que
 * importa framer-motion na raiz da app. Como o gesto só faz sentido no PWA
 * instalado em mobile (e nunca no site público/landing), carregar a camada de
 * animação aqui de forma LAZY e só em mobile tira ~5,5MB de framer-motion do
 * entry chunk e do caminho crítico da landing pública (que é desktop-heavy).
 *
 * O conteúdo permanece no mesmo div em todas as larguras. A camada lazy é
 * apenas um controlador irmão dos filhos: carregar o chunk ou mudar o
 * breakpoint nunca remonta formulários e telas em andamento.
 *
 * Coloque DENTRO do <BrowserRouter> (o motion usa useNavigate) e FORA das
 * <Routes> (precisa envolver tudo que pode ser navegado).
 */
const SwipeBackMotion = React.lazy(() => import("./SwipeBackProvider"));

export function SwipeBackProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const targetRef = React.useRef<HTMLDivElement>(null);

  return (
    <div ref={targetRef} className="min-h-screen">
      {children}
      {isMobile ? <React.Suspense fallback={null}>
        <SwipeBackMotion targetRef={targetRef} />
      </React.Suspense> : null}
    </div>
  );
}
