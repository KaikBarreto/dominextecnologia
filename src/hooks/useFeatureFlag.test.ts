import { describe, it, expect } from 'vitest';
import { isFlagEnabledFor } from './useFeatureFlag';

describe('isFlagEnabledFor', () => {
  it('desligado quando enabled=false e allowlist vazia', () => {
    expect(isFlagEnabledFor({ enabled: false, contract_allowlist: [] }, 'ct-1')).toBe(false);
  });
  it('ligado pra todos quando enabled=true', () => {
    expect(isFlagEnabledFor({ enabled: true, contract_allowlist: [] }, 'ct-1')).toBe(true);
  });
  it('ligado só pros contratos da allowlist quando enabled=false', () => {
    const flag = { enabled: false, contract_allowlist: ['ct-1'] };
    expect(isFlagEnabledFor(flag, 'ct-1')).toBe(true);
    expect(isFlagEnabledFor(flag, 'ct-2')).toBe(false);
  });
  it('flag ausente (null) → desligado', () => {
    expect(isFlagEnabledFor(null, 'ct-1')).toBe(false);
  });
  it('sem contractId e enabled=false → desligado', () => {
    expect(isFlagEnabledFor({ enabled: false, contract_allowlist: ['ct-1'] }, null)).toBe(false);
  });
});
