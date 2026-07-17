import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useAppLocale } from '@/hooks/useAppLocale';
import { useCompanyRegional } from '@/hooks/useCompanyRegional';
import { getLocaleDef, type LocaleCode } from '@/lib/i18n/locales';

// ─────────────────────────────────────────────────────────────────────────────
// i18n do APP LOGADO — context único que junta a resolução de IDIOMA (por
// usuário) com MOEDA e FUSO (da empresa). Fonte da verdade que as telas do app
// consomem: `const { locale, currency, timezone } = useAppLocaleContext()`.
//
// Montado DENTRO do <AuthProvider> (precisa de user/company). Enquanto carrega,
// locale = pt-br (default) — nunca bloqueia render.
// ─────────────────────────────────────────────────────────────────────────────

interface AppLocaleContextValue {
  /** Idioma resolvido: user_preferences → company_settings → 'pt-br'. */
  locale: LocaleCode;
  /** Moeda da empresa (ISO 4217). Default BRL. */
  currency: string;
  /** Fuso da empresa (nome IANA). Default America/Sao_Paulo. */
  timezone: string;
  /** true enquanto qualquer fonte (idioma do user / settings da empresa) carrega. */
  isLoading: boolean;
  /** Troca o idioma DO USUÁRIO (upsert own-row, otimista). */
  setUserLanguage: (language: LocaleCode) => Promise<void>;
}

const AppLocaleContext = createContext<AppLocaleContextValue | undefined>(undefined);

export function AppLocaleProvider({ children }: { children: React.ReactNode }) {
  const { locale, isLoading: langLoading, setUserLanguage } = useAppLocale();
  const { currency, timezone, isLoading: regionalLoading } = useCompanyRegional();

  // <html lang> do APP segue o locale resolvido. O HtmlLangManager do site roda
  // sob rotas /en, /es, /fr (useLocale pela URL); nas rotas do app (sem prefixo)
  // o useLocale cai em pt-br, então aqui sobrepomos com o idioma real do usuário.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = getLocaleDef(locale).htmlLang;
  }, [locale]);

  const value = useMemo<AppLocaleContextValue>(
    () => ({
      locale,
      currency,
      timezone,
      isLoading: langLoading || regionalLoading,
      setUserLanguage,
    }),
    [locale, currency, timezone, langLoading, regionalLoading, setUserLanguage],
  );

  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}

/** Default seguro pra fora do <AppLocaleProvider> (rota pública/anon, error
 *  boundary). NUNCA lança: um componente compartilhado usado fora do app logado
 *  não pode quebrar a página — cai em pt-br/BRL/São Paulo. */
const APP_LOCALE_FALLBACK: AppLocaleContextValue = {
  locale: 'pt-br',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  isLoading: false,
  setUserLanguage: async () => {},
};

export function useAppLocaleContext(): AppLocaleContextValue {
  return useContext(AppLocaleContext) ?? APP_LOCALE_FALLBACK;
}
