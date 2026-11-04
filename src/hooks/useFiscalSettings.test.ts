import { describe, expect, it } from 'vitest';
import { isFiscalReadyToEmit, type FiscalSettings } from './useFiscalSettings';

const NOW = new Date('2026-11-04T12:00:00.000Z').getTime();

function settings(
  patch: Partial<Pick<FiscalSettings, 'pode_emitir' | 'certificado_ref' | 'certificate_expires_at'>> = {},
) {
  return {
    pode_emitir: true,
    certificado_ref: 'tenant/certificado-cifrado',
    certificate_expires_at: '2027-11-04T12:00:00.000Z',
    ...patch,
  };
}

describe('isFiscalReadyToEmit', () => {
  it('libera somente com município confirmado e A1 próprio dentro da validade', () => {
    expect(isFiscalReadyToEmit(settings(), NOW)).toBe(true);
  });

  it.each([
    ['município não confirmado', { pode_emitir: false }],
    ['referência do A1 ausente', { certificado_ref: null }],
    ['validade desconhecida', { certificate_expires_at: null }],
    ['validade inválida', { certificate_expires_at: 'data-inválida' }],
    ['certificado vencido', { certificate_expires_at: '2026-11-03T12:00:00.000Z' }],
    ['certificado vencendo agora', { certificate_expires_at: '2026-11-04T12:00:00.000Z' }],
  ])('falha fechado quando %s', (_label, patch) => {
    expect(isFiscalReadyToEmit(settings(patch), NOW)).toBe(false);
  });
});
