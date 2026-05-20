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
  pageTitle: 'text-2xl lg:text-3xl font-bold tracking-tight text-foreground',

  /** Subtítulo/descrição abaixo do título principal. */
  pageSubtitle: 'text-sm text-muted-foreground',

  /** Título de uma seção dentro da página (acima de cards, blocos). */
  sectionTitle: 'text-[13px] font-semibold uppercase tracking-widest text-foreground/85',

  /** Título de card (CardTitle do shadcn). */
  cardTitle: 'text-base lg:text-lg font-semibold leading-none tracking-tight',

  /** Descrição abaixo de CardTitle. */
  cardDescription: 'text-sm text-muted-foreground',

  /** Label de campo de formulário. */
  fieldLabel: 'text-sm font-medium text-foreground',
} as const;
