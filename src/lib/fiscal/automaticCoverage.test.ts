import { describe, expect, it } from 'vitest';
import { automaticCoverageCheckKey } from './automaticCoverage';

const READY_PENDING = {
  certificateReady: true,
  certificateRef: 'tenant/certificado.pfx.enc',
  certificateExpiresAt: '2027-06-19T00:00:00.000Z',
  municipalityAlreadyEnabled: false,
  currentIbge: '5205802',
  persistedIbge: '5205802',
  currentEnvironment: 'producao' as const,
  persistedEnvironment: 'producao' as const,
};

describe('automaticCoverageCheckKey', () => {
  it('agenda a verificação quando A1, município e ambiente persistidos estão prontos', () => {
    expect(automaticCoverageCheckKey(READY_PENDING)).toBe(
      'producao:5205802:tenant/certificado.pfx.enc:2027-06-19T00:00:00.000Z',
    );
  });

  it('não repete a verificação quando o município já está liberado', () => {
    expect(
      automaticCoverageCheckKey({
        ...READY_PENDING,
        municipalityAlreadyEnabled: true,
      }),
    ).toBeNull();
  });

  it('não consulta dados editados antes de salvar', () => {
    expect(
      automaticCoverageCheckKey({
        ...READY_PENDING,
        currentIbge: '5300108',
      }),
    ).toBeNull();
    expect(
      automaticCoverageCheckKey({
        ...READY_PENDING,
        currentEnvironment: 'homologacao',
      }),
    ).toBeNull();
  });

  it('não consulta sem certificado válido ou IBGE persistido válido', () => {
    expect(
      automaticCoverageCheckKey({
        ...READY_PENDING,
        certificateReady: false,
      }),
    ).toBeNull();
    expect(
      automaticCoverageCheckKey({
        ...READY_PENDING,
        persistedIbge: '52058',
        currentIbge: '52058',
      }),
    ).toBeNull();
  });
});
