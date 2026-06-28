// ─────────────────────────────────────────────────────────────────────────────
// useMarketingViewport — alterna a meta viewport conforme a rota (acessibilidade).
//
// Site público de marketing → viewport ZOOMÁVEL (zoom de pinça liberado, passa no
// Lighthouse a11y). Qualquer outra rota (sistema logado, OS pública, portais) →
// viewport FIXO, mantendo a sensação de app nativo (régua mobile-first).
//
// O index.html base já nasce com o viewport FIXO (default do app logado). Este
// hook só PROMOVE pra zoomável quando entra numa rota de marketing e RESTAURA o
// fixo ao sair. Roda no client durante a navegação SPA; as páginas estáticas do
// SSG já vêm com o viewport certo no HTML (sem flicker no primeiro paint).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  isMarketingRoute,
  MARKETING_VIEWPORT,
  APP_VIEWPORT,
} from '@/utils/publicMarketingRoutes';

export function useMarketingViewport() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;

    const next = isMarketingRoute(pathname) ? MARKETING_VIEWPORT : APP_VIEWPORT;
    // Só escreve se mudou (evita invalidar o viewport à toa a cada navegação).
    if (meta.getAttribute('content') !== next) {
      meta.setAttribute('content', next);
    }
  }, [pathname]);
}
