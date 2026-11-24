import { beforeEach, describe, expect, it } from 'vitest';
import {
  LEGACY_WHITE_LABEL_OPERATION_CSS_VARS,
  WHITE_LABEL_BRAND_CSS_VARS,
  clearAllWhiteLabelCssVars,
  clearLegacyWhiteLabelOperationCssVars,
} from './whiteLabelCssVars';

describe('contrato visual do white-label', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
  });

  it('mantém marca e tokens operacionais em conjuntos separados', () => {
    expect(WHITE_LABEL_BRAND_CSS_VARS).toEqual([
      '--brand-primary',
      '--brand-primary-foreground',
      '--gradient-brand',
    ]);
    expect(LEGACY_WHITE_LABEL_OPERATION_CSS_VARS).not.toContain('--brand-primary');
    expect(LEGACY_WHITE_LABEL_OPERATION_CSS_VARS).toEqual(expect.arrayContaining([
      '--primary',
      '--ring',
      '--sidebar-primary',
      '--sidebar-accent',
      '--sidebar-ring',
      '--wl-nav-neon',
    ]));
  });

  it('remove resíduos operacionais sem apagar a identidade da empresa', () => {
    const style = document.documentElement.style;
    style.setProperty('--brand-primary', '25 90% 50%');
    LEGACY_WHITE_LABEL_OPERATION_CSS_VARS.forEach((variable) => {
      style.setProperty(variable, '160 100% 39%');
    });

    clearLegacyWhiteLabelOperationCssVars(style);

    expect(style.getPropertyValue('--brand-primary')).toBe('25 90% 50%');
    LEGACY_WHITE_LABEL_OPERATION_CSS_VARS.forEach((variable) => {
      expect(style.getPropertyValue(variable)).toBe('');
    });
  });

  it('limpa marca e resíduos operacionais no logout', () => {
    const style = document.documentElement.style;
    [...WHITE_LABEL_BRAND_CSS_VARS, ...LEGACY_WHITE_LABEL_OPERATION_CSS_VARS].forEach((variable) => {
      style.setProperty(variable, '1 2% 3%');
    });

    clearAllWhiteLabelCssVars(style);

    [...WHITE_LABEL_BRAND_CSS_VARS, ...LEGACY_WHITE_LABEL_OPERATION_CSS_VARS].forEach((variable) => {
      expect(style.getPropertyValue(variable)).toBe('');
    });
  });
});
