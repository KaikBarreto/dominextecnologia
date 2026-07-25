// ─────────────────────────────────────────────────────────────────────────────
// DISC — resolução de i18n para os componentes visuais (gráficos + relatório).
//
// Regra de reuso (crítica): estes componentes rodam TANTO no app logado quanto na
// TELA PÚBLICA anônima. Por isso o locale é aceito por PROP; se não vier, cai no
// contexto (`useAppLocaleContext`), que NUNCA lança — fora do provider ele já
// devolve pt-br/BRL/SP defensivo (ver AppLocaleContext). Assim o mesmo componente
// funciona nos dois mundos sem depender de provider exclusivo do app.
// ─────────────────────────────────────────────────────────────────────────────

import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';

/** Bloco i18n completo do domínio DISC no locale resolvido. */
export function useDiscMessages(localeProp?: LocaleCode) {
  const { locale: ctxLocale } = useAppLocaleContext();
  const locale = localeProp ?? ctxLocale;
  return { locale, t: MESSAGES[locale].app.discProfile };
}

/** Interpola `{chave}` num template i18n. */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}
