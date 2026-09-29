import { describe, expect, it } from 'vitest';
import { buildProposalPdfMetadata } from './proposalSimulatorPdf';

describe('proposalSimulatorPdf', () => {
  it('gera código e nome de arquivo seguros para o cliente', () => {
    const metadata = buildProposalPdfMetadata(
      'Climatização São José / Filiais',
      3,
      new Date(2026, 8, 29, 12),
    );

    expect(metadata.code).toBe('DOM-20260929-CLIMATIZ');
    expect(metadata.filename).toBe('proposta-dominex-climatizacao-sao-jose-filiais.pdf');
    expect(metadata.unitSummary).toBe('3 unidades');
    expect(metadata.issuedLabel).toBe('29/09/2026');
    expect(metadata.validityLabel).toBe('14/10/2026');
  });

  it('usa rótulo singular e fallback seguro', () => {
    const metadata = buildProposalPdfMetadata('', 1, new Date(2026, 0, 1));

    expect(metadata.clientName).toBe('Cliente');
    expect(metadata.unitSummary).toBe('1 unidade');
    expect(metadata.filename).toBe('proposta-dominex-cliente.pdf');
  });
});
