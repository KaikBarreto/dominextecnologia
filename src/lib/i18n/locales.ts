// ─────────────────────────────────────────────────────────────────────────────
// i18n — tabela de idiomas do SITE PÚBLICO (Fase 1: só liga a máquina).
//
// Decisões-lei (não reabrir):
//  • pt-br é o DEFAULT e fica SEM prefixo de URL. As URLs atuais
//    (/sistema-para-refrigeracao, /blog, /) continuam canônicas do português.
//    NUNCA quebrar URL existente (preserva ranking do Google).
//  • en/es/fr entram COM prefixo (/en/..., /es/..., /fr/...). Nesta fase
//    renderizam o MESMO conteúdo pt-br (ainda não traduzido).
// ─────────────────────────────────────────────────────────────────────────────

export type LocaleCode = 'pt-br' | 'en' | 'es' | 'fr';

export interface LocaleDef {
  /** Código interno usado no prefixo de URL (exceto pt-br, que não prefixa). */
  code: LocaleCode;
  /** Nome NATIVO do idioma, exibido no seletor. */
  label: string;
  /** Valor do atributo <html lang="...">. */
  htmlLang: string;
  /**
   * Valor da meta Open Graph `og:locale` (formato `ll_CC`: pt_BR, en_US, es_ES,
   * fr_FR). Usado pelo SSG pra emitir o og:locale certo por página.
   */
  ogLocale: string;
  /** true só no pt-br (default sem prefixo). */
  isDefault: boolean;
}

export const DEFAULT_LOCALE: LocaleCode = 'pt-br';

/** Ordem = ordem de exibição no seletor. pt-br primeiro (default). */
export const LOCALES: LocaleDef[] = [
  { code: 'pt-br', label: 'Português', htmlLang: 'pt-BR', ogLocale: 'pt_BR', isDefault: true },
  { code: 'en', label: 'English', htmlLang: 'en', ogLocale: 'en_US', isDefault: false },
  { code: 'es', label: 'Español', htmlLang: 'es', ogLocale: 'es_ES', isDefault: false },
  { code: 'fr', label: 'Français', htmlLang: 'fr', ogLocale: 'fr_FR', isDefault: false },
];

/** Só os prefixos de URL (idiomas não-default). Usado no roteamento. */
export const PREFIXED_LOCALES: LocaleCode[] = LOCALES.filter((l) => !l.isDefault).map(
  (l) => l.code,
);

export function isLocaleCode(value: string | undefined | null): value is LocaleCode {
  return !!value && LOCALES.some((l) => l.code === value);
}

export function getLocaleDef(code: LocaleCode): LocaleDef {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}
