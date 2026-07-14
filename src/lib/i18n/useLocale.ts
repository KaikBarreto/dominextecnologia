// ─────────────────────────────────────────────────────────────────────────────
// i18n — hook central. Deriva o locale atual do pathname e expõe helpers de
// path (localizePath/stripLocale) + as mensagens de UI já resolvidas pro locale.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { type LocaleCode } from './locales';
import {
  localeFromPath,
  localizePath as localizePathPure,
  stripLocale as stripLocalePure,
} from './paths';
import { MESSAGES, type Messages } from './messages';

export interface UseLocaleResult {
  /** Locale atual, derivado do pathname (pt-br quando sem prefixo). */
  locale: LocaleCode;
  /** Mensagens de UI já resolvidas pro locale atual (fallback pt-br na Fase 1). */
  messages: Messages;
  /** Prefixa um path base (pt-br) pro locale alvo (default = locale atual). */
  localizePath: (path: string, target?: LocaleCode) => string;
  /** Remove o prefixo de idioma, devolvendo o path canônico pt-br. */
  stripLocale: (path: string) => string;
}

/**
 * Hook do locale atual. Lê o pathname via react-router, então precisa estar
 * dentro do <BrowserRouter>. `localizePath` sem `target` usa o locale atual.
 */
export function useLocale(): UseLocaleResult {
  const { pathname } = useLocation();
  const locale = useMemo(() => localeFromPath(pathname), [pathname]);

  const localizePath = useCallback(
    (path: string, target?: LocaleCode) => localizePathPure(path, target ?? locale),
    [locale],
  );

  const stripLocale = useCallback((path: string) => stripLocalePure(path), []);

  const messages = MESSAGES[locale];

  return { locale, messages, localizePath, stripLocale };
}
