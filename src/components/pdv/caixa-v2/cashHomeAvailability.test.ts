import { describe, expect, it } from 'vitest';
import { resolveCashHomeAvailability } from './cashHomeAvailability';

describe('saldo disponível na abertura de caixa', () => {
  it('distingue conferência pendente de falta de permissão', () => {
    const snapshot = { available: null, reconciliationRequired: true };
    expect(resolveCashHomeAvailability(true, snapshot)).toEqual({ kind: 'reconciliation', label: 'Em conferência' });
    expect(resolveCashHomeAvailability(false, snapshot)).toEqual({ kind: 'restricted', label: 'Acesso restrito' });
  });
  it('não apresenta falha de leitura como restrição de acesso', () => {
    expect(resolveCashHomeAvailability(true, null)).toEqual({ kind: 'unavailable', label: 'Indisponível' });
    expect(resolveCashHomeAvailability(true, { available: null, reconciliationRequired: false })).toEqual({ kind: 'unavailable', label: 'Indisponível' });
  });
  it('mantém zero como saldo confirmado e não divulga valor sem permissão', () => {
    expect(resolveCashHomeAvailability(true, { available: 0, reconciliationRequired: false })).toEqual({ kind: 'available', amount: 0 });
    expect(resolveCashHomeAvailability(false, { available: 500, reconciliationRequired: false })).toEqual({ kind: 'restricted', label: 'Acesso restrito' });
  });
  it('mantém a conferência pendente mesmo se houver valor parcial no snapshot', () => {
    expect(resolveCashHomeAvailability(true, { available: 500, reconciliationRequired: true })).toEqual({ kind: 'reconciliation', label: 'Em conferência' });
  });
});
