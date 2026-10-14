import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateReportPDF } = vi.hoisted(() => ({
  generateReportPDF: vi.fn(),
}));

vi.mock('@/utils/pdfPageRenderer', () => ({
  generateReportPDF,
}));

import {
  buildProposalPdfFilename,
  generateProposalPDF,
  PROPOSAL_PDF_CLONE_CSS,
  PROPOSAL_PDF_OPTIONS,
  PROPOSAL_PDF_WIDTH_PX,
} from '@/utils/proposalPdf';

describe('generateProposalPDF', () => {
  beforeEach(() => generateReportPDF.mockReset());

  it('gera em viewport A4, sem ampliar imagens, usando o renderer paginado', async () => {
    generateReportPDF.mockResolvedValue(undefined);
    const element = document.createElement('div');

    await generateProposalPDF(element, 'proposta-142.pdf');

    expect(generateReportPDF).toHaveBeenCalledWith(element, 'proposta-142.pdf', PROPOSAL_PDF_OPTIONS);
    expect(PROPOSAL_PDF_OPTIONS).toMatchObject({
      windowWidthPx: PROPOSAL_PDF_WIDTH_PX,
      enlargeImages: false,
      singlePageMinScale: 0.88,
    });
    expect(PROPOSAL_PDF_CLONE_CSS).toContain('.clean-page');
    expect(PROPOSAL_PDF_CLONE_CSS).toContain('min-height: 1123px');
  });
});

describe('buildProposalPdfFilename', () => {
  it('usa cliente e data da proposta com o padrão solicitado', () => {
    const filename = buildProposalPdfFilename({
      created_at: '2026-10-15T01:30:00.000Z',
      prospect_name: null,
      customers: { name: 'Cliente XPTO', email: null, phone: null },
    }, 'America/Sao_Paulo');

    expect(filename).toBe('Proposta - Cliente XPTO 14 OUT 2026.pdf');
  });

  it('usa o prospect e remove caracteres inválidos do nome do arquivo', () => {
    const filename = buildProposalPdfFilename({
      created_at: '2026-10-14T12:00:00.000Z',
      prospect_name: 'ACME / Brasil:*?',
      customers: undefined,
    });

    expect(filename).toBe('Proposta - ACME Brasil 14 OUT 2026.pdf');
  });
});
