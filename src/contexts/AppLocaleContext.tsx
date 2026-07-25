import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos da animação de troca de idioma
// ─────────────────────────────────────────────────────────────────────────────
type VeilPhase = 'idle' | 'fadingOut' | 'fadingIn';

const FADE_MS = 700; // duração de cada metade do crossfade (ms)

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AppLocaleProvider({ children }: { children: React.ReactNode }) {
  const { locale, isLoading: langLoading, setUserLanguage } = useAppLocale();
  const { currency, timezone, isLoading: regionalLoading } = useCompanyRegional();

  // ── locale visível (o que o contexto expõe aos consumidores) ──────────────
  const [displayLocale, setDisplayLocale] = useState<LocaleCode>(locale);
  const initializedRef = useRef(false);

  // ── estado do véu de transição ─────────────────────────────────────────────
  const [veilPhase, setVeilPhase] = useState<VeilPhase>('idle');
  // opacity que o véu mostra: durante fadingOut vai 0→1; durante fadingIn vai 1→0
  const [veilOpacity, setVeilOpacity] = useState(0);

  // Refs para guardar ids dos timeouts e do rAF (cleanup no unmount)
  const t1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (t1Ref.current !== null) clearTimeout(t1Ref.current);
      if (t2Ref.current !== null) clearTimeout(t2Ref.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── efeito principal: observa o locale resolvido ───────────────────────────
  useEffect(() => {
    // Enquanto carregando, não faz nada
    if (langLoading) return;

    // Primeira resolução após o loading: aplica sem animar
    if (!initializedRef.current) {
      initializedRef.current = true;
      setDisplayLocale(locale);
      return;
    }

    // Se o locale não mudou de fato, ignora
    if (locale === displayLocale) return;

    // Usuário prefere menos movimento: swap instantâneo
    if (prefersReducedMotion()) {
      setDisplayLocale(locale);
      return;
    }

    // ── sequência de crossfade ─────────────────────────────────────────────
    // Limpa qualquer animação em curso
    if (t1Ref.current !== null) clearTimeout(t1Ref.current);
    if (t2Ref.current !== null) clearTimeout(t2Ref.current);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    // a) Monta o véu com opacity 0 (fase fadingOut)
    setVeilPhase('fadingOut');
    setVeilOpacity(0);

    // Dispara a transição CSS no próximo frame (0→1)
    rafRef.current = requestAnimationFrame(() => {
      setVeilOpacity(1);

      // b) Após o fade-out terminar: troca o locale ESCONDIDO atrás do véu opaco
      t1Ref.current = setTimeout(() => {
        setDisplayLocale(locale);

        // c) Inicia fade-in (1→0)
        setVeilPhase('fadingIn');
        setVeilOpacity(0);

        // d) Após o fade-in terminar: desmonta o véu
        t2Ref.current = setTimeout(() => {
          setVeilPhase('idle');
        }, FADE_MS);
      }, FADE_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, langLoading]);

  // ── <html lang> segue o displayLocale (o que está visível) ────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = getLocaleDef(displayLocale).htmlLang;
  }, [displayLocale]);

  const value = useMemo<AppLocaleContextValue>(
    () => ({
      locale: displayLocale,
      currency,
      timezone,
      isLoading: langLoading || regionalLoading,
      setUserLanguage,
    }),
    [displayLocale, currency, timezone, langLoading, regionalLoading, setUserLanguage],
  );

  // ── véu de transição (portal sobre tudo) ──────────────────────────────────
  const veil =
    veilPhase !== 'idle' && typeof document !== 'undefined'
      ? createPortal(
          <div
            aria-hidden="true"
            className="fixed inset-0 z-[9999] bg-background"
            style={{
              transition: `opacity ${FADE_MS}ms ease`,
              opacity: veilOpacity,
            }}
          />,
          document.body,
        )
      : null;

  return (
    <AppLocaleContext.Provider value={value}>
      {children}
      {veil}
    </AppLocaleContext.Provider>
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// LINKS PÚBLICOS (OS pública, portal do cliente, portal do contrato/PMOC, ponto,
// orçamento, proposta): o idioma/moeda/fuso seguem a EMPRESA QUE GEROU O LINK,
// não a máquina de quem abre (é o cliente do tenant vendo a página).
//
// Cada página pública carrega os dados pelo token/slug (RPC), que DEVE trazer o
// idioma/moeda/fuso da empresa (company_settings.language/currency/timezone).
// A página então envolve seu conteúdo em <PublicAppLocaleProvider> com esses
// valores — aí os componentes (inclusive os compartilhados) renderizam no idioma
// da empresa. Enquanto o payload não trouxer, cai em pt-br/BRL/SP (defensivo).
// ─────────────────────────────────────────────────────────────────────────────
export function PublicAppLocaleProvider({
  language,
  currency,
  timezone,
  children,
}: {
  language?: string | null;
  currency?: string | null;
  timezone?: string | null;
  children: React.ReactNode;
}) {
  const isLocale = (v: unknown): v is LocaleCode =>
    v === 'pt-br' || v === 'en' || v === 'es' || v === 'fr';
  const value = useMemo<AppLocaleContextValue>(
    () => ({
      locale: isLocale(language) ? language : 'pt-br',
      currency: currency || 'BRL',
      timezone: timezone || 'America/Sao_Paulo',
      isLoading: false,
      setUserLanguage: async () => {},
    }),
    [language, currency, timezone],
  );
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = getLocaleDef(value.locale).htmlLang;
    }
  }, [value.locale]);
  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}
