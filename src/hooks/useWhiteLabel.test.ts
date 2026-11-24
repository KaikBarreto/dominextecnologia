import { beforeEach, describe, expect, it } from 'vitest';
import { applyWhiteLabelTheme } from './useWhiteLabel';
import { LEGACY_WHITE_LABEL_OPERATION_CSS_VARS } from '@/lib/whiteLabelCssVars';

describe('applyWhiteLabelTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style');
    localStorage.clear();
  });

  it('aplica a cor da empresa somente nos tokens de identidade', () => {
    const style = document.documentElement.style;
    LEGACY_WHITE_LABEL_OPERATION_CSS_VARS.forEach((variable) => {
      style.setProperty(variable, '160 100% 39%');
    });

    applyWhiteLabelTheme(true, '#f97316');

    expect(style.getPropertyValue('--brand-primary')).not.toBe('');
    expect(style.getPropertyValue('--brand-primary-foreground')).not.toBe('');
    expect(style.getPropertyValue('--gradient-brand')).toContain('linear-gradient');
    LEGACY_WHITE_LABEL_OPERATION_CSS_VARS.forEach((variable) => {
      expect(style.getPropertyValue(variable)).toBe('');
    });
  });

  it('remove a marca e os resíduos quando o white-label está desligado', () => {
    applyWhiteLabelTheme(true, '#f97316');
    document.documentElement.style.setProperty('--primary', '25 90% 50%');

    applyWhiteLabelTheme(false, null);

    expect(document.documentElement.style.getPropertyValue('--brand-primary')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
  });
});
