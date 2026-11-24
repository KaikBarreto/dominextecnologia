export const WHITE_LABEL_BRAND_CSS_VARS = [
  '--brand-primary',
  '--brand-primary-foreground',
  '--gradient-brand',
] as const;

// Resíduos de versões antigas. A identidade do tenant não pode controlar
// ações, foco ou navegação do app: esses tokens seguem o contrato operacional
// preto no tema claro e branco no tema escuro definido em `[data-app]`.
export const LEGACY_WHITE_LABEL_OPERATION_CSS_VARS = [
  '--primary',
  '--primary-foreground',
  '--ring',
  '--sidebar-primary',
  '--sidebar-accent',
  '--sidebar-ring',
  '--wl-nav-neon',
] as const;

type RemovableCssStyle = Pick<CSSStyleDeclaration, 'removeProperty'>;

export function clearLegacyWhiteLabelOperationCssVars(style: RemovableCssStyle) {
  LEGACY_WHITE_LABEL_OPERATION_CSS_VARS.forEach((variable) => style.removeProperty(variable));
}

export function clearAllWhiteLabelCssVars(style: RemovableCssStyle) {
  WHITE_LABEL_BRAND_CSS_VARS.forEach((variable) => style.removeProperty(variable));
  clearLegacyWhiteLabelOperationCssVars(style);
}
