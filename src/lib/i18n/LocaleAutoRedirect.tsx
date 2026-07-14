// ─────────────────────────────────────────────────────────────────────────────
// i18n — auto-detecção de idioma CLIENT-SIDE (só para humano).
//
// Montado APENAS nas rotas públicas SEM prefixo (base pt-br). Ao cair aqui:
//   • se NÃO há cookie dnx_lang E navigator.language mapeia pra en/es/fr,
//     redireciona (replace) pro mesmo path no idioma detectado.
//   • se o idioma é pt/pt-PT/desconhecido, ou já há cookie → fica no pt-br.
//
// Regra-lei SEO: NUNCA redireciona por User-Agent nem no servidor. Roda 1x por
// montagem; o crawler que não executa JS fica no default. O seletor manual grava
// o cookie e desliga esta detecção.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEFAULT_LOCALE } from './locales';
import { detectLocale, hasLangCookie } from './detectLocale';
import { localizePath } from './paths';

export function LocaleAutoRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    // Escolha manual já feita → respeita, sem redirecionar.
    if (hasLangCookie()) return;

    const detected = detectLocale();
    if (detected === DEFAULT_LOCALE) return; // pt/pt-PT/desconhecido: fica.

    const target = localizePath(
      location.pathname + location.search + location.hash,
      detected,
    );
    if (target !== location.pathname + location.search + location.hash) {
      navigate(target, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
