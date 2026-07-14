// ─────────────────────────────────────────────────────────────────────────────
// i18n — redirect canônico do slug de segmento/módulo por idioma (Fase 6).
//
// Sob um idioma prefixado (/en, /es, /fr) a página resolve por KEY canônica +
// locale, então um slug NÃO-canônico ainda cai na página certa (fallback do
// registro). Ex.: /en/sistema-para-refrigeracao renderiza o segmento, mas a URL
// canônica é /en/refrigeration-hvac-software. Este hook redireciona (replace)
// pro slug canônico do locale atual quando o slug da URL difere dele, preservando
// query + hash.
//
// Segurança contra loop: só redireciona quando o 1º segmento do path (o slug)
// difere de slugFor(key, locale). Em pt-br (sem prefixo) o slug canônico É a
// própria key, então nunca redireciona. No SSG o StaticRouter já monta o path no
// slug canônico, e o effect não roda em renderToString — no-op garantido.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLocale } from './useLocale';
import { localizePath, stripLocale } from './paths';
import { slugFor } from './slugRegistry';

/**
 * Garante que a página de segmento/módulo esteja na URL do SLUG CANÔNICO do
 * idioma atual. `key` é a chave canônica (slug pt-br) da página, que o wrapper
 * já conhece (SegmentData.slug / ModuleData.slug).
 */
export function useCanonicalSlugRedirect(key: string): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { locale } = useLocale();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;

    // Slug atual = 1º segmento do path SEM o prefixo de idioma.
    const base = stripLocale(location.pathname);
    const currentSlug = base.replace(/^\/+/, '').split('/')[0];

    const canonical = slugFor(key, locale);
    if (!currentSlug || currentSlug === canonical) return; // já canônico: fica.

    done.current = true;
    const target =
      localizePath('/' + canonical, locale) + location.search + location.hash;
    navigate(target, { replace: true });
    // Reavalia quando muda o locale (troca de idioma) ou o path.
  }, [key, locale, location.pathname, location.search, location.hash, navigate]);
}
