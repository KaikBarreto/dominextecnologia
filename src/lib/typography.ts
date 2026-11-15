/**
 * Design system de tipografia do Dominex.
 *
 * Fonte única para classes de heading/subtítulo/seção. Use em vez de
 * inventar combinações de classes Tailwind em cada página.
 *
 * Inspirado no EcoSistema (src/lib/typography.ts), adaptado pra identidade Dominex.
 */
export const typography = {
  /** Título principal da página (h1). Use em conjunto com PageHeader. */
  pageTitle: 'app-ui-page-title text-[length:var(--app-ui-title-mobile,24px)] md:text-[length:var(--app-ui-title-size,30px)] font-[number:var(--app-ui-title-weight,700)] leading-tight tracking-[var(--app-ui-title-tracking,-0.025em)] text-foreground',

  /** Subtítulo/descrição abaixo do título principal. */
  pageSubtitle: 'app-ui-page-subtitle text-[length:var(--app-ui-body-size,14px)] leading-relaxed text-muted-foreground',

  /** Título de uma seção dentro da página (acima de cards, blocos). */
  sectionTitle: 'app-ui-section-title text-[13px] font-semibold uppercase tracking-widest text-foreground/85',

  /** Título de card (CardTitle do shadcn). */
  cardTitle: 'app-ui-card-title text-base font-semibold leading-snug tracking-tight',

  /** Descrição abaixo de CardTitle. */
  cardDescription: 'text-sm text-muted-foreground',

  /** Label de campo de formulário. */
  fieldLabel: 'app-ui-field-label text-[length:var(--app-ui-field-size,14px)] font-medium text-foreground',
} as const;
