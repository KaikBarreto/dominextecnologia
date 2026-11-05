import { describe, expect, it } from 'vitest';
import {
  emissaoNacionalObrigatoriaSimples,
  isFiscalReadyToEmit,
  type FiscalSettings,
} from './useFiscalSettings';

const NOW = new Date('2026-11-04T12:00:00.000Z').getTime();

function settings(
  patch: Partial<
    Pick<
      FiscalSettings,
      | 'fiscal_ambiente'
      | 'pode_emitir'
      | 'certificado_ref'
      | 'certificate_expires_at'
      | 'regime_tributario'
    >
  > = {},
) {
  return {
    fiscal_ambiente: 'producao' as const,
    pode_emitir: true,
    certificado_ref: 'tenant/certificado-cifrado',
    certificate_expires_at: '2027-11-04T12:00:00.000Z',
    regime_tributario: 'lucro_presumido',
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

  it('permite testar em homologação mesmo sem cobertura previamente confirmada', () => {
    expect(
      isFiscalReadyToEmit(settings({ fiscal_ambiente: 'homologacao', pode_emitir: false }), NOW),
    ).toBe(true);
  });

  it('libera ME/EPP do Simples na competência obrigatória mesmo com emissor municipal próprio', () => {
    expect(
      isFiscalReadyToEmit(
        settings({ regime_tributario: 'simples_nacional', pode_emitir: false }),
        NOW,
        '2026-11-01',
      ),
    ).toBe(true);
  });

  it('mantém fail-closed antes do corte federal e para empresa fora do Simples', () => {
    expect(emissaoNacionalObrigatoriaSimples('simples_nacional', '2026-10-31')).toBe(false);
    expect(emissaoNacionalObrigatoriaSimples('lucro_presumido', '2026-11-01')).toBe(false);
    expect(
      isFiscalReadyToEmit(
        settings({ regime_tributario: 'simples_nacional', pode_emitir: false }),
        NOW,
        '2026-10-31',
      ),
    ).toBe(false);
  });
});
