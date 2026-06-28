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
 * Em desktop e no SSR: renderiza os filhos diretamente, num <div> com a MESMA
 * classe min-h-screen que o wrapper de animação usaria — layout idêntico, zero
 * mismatch de hidratação e nenhum import de framer-motion.
 *
 * Em mobile: monta a camada lazy. Enquanto o chunk carrega (fallback), os
 * filhos já aparecem no mesmo wrapper neutro — sem flash nem layout shift.
 *
 * Coloque DENTRO do <BrowserRouter> (o motion usa useNavigate) e FORA das
 * <Routes> (precisa envolver tudo que pode ser navegado).
 */
const SwipeBackMotion = React.lazy(() => import("./SwipeBackProvider"));

export function SwipeBackProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();

  // Fallback neutro: mesmo wrapper visual do motion, sem animação.
  const plain = <div className="min-h-screen">{children}</div>;

  if (!isMobile) return plain;

  return (
    <React.Suspense fallback={plain}>
      <SwipeBackMotion>{children}</SwipeBackMotion>
    </React.Suspense>
  );
}
