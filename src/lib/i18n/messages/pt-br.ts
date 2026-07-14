// ─────────────────────────────────────────────────────────────────────────────
// i18n — strings de UI curtas (pt-br é a FONTE da verdade do shape).
//
// Só strings de interface (navbar, seletor, labels). Conteúdo longo
// (segmentos/módulos/blog) NÃO vem por aqui — vira dados por idioma na Fase 2.
// ─────────────────────────────────────────────────────────────────────────────

export const ptBr = {
  languageSelector: {
    label: 'Idioma',
    ariaLabel: 'Selecionar idioma',
  },
} as const;

/** Shape canônico das mensagens de UI. en/es/fr fazem fallback pra ele. */
export type Messages = typeof ptBr;

export default ptBr;
