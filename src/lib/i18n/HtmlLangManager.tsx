// ─────────────────────────────────────────────────────────────────────────────
// i18n — mantém <html lang="..."> em sincronia com o locale da rota no client.
// (O SSG cuidará do lang no HTML estático na Fase 3; aqui é o runtime SPA.)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { getLocaleDef } from './locales';
import { useLocale } from './useLocale';

export function HtmlLangManager() {
  const { locale } = useLocale();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = getLocaleDef(locale).htmlLang;
  }, [locale]);

  return null;
}
