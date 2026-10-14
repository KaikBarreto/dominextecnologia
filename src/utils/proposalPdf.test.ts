import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateReportPDF } = vi.hoisted(() => ({
  generateReportPDF: vi.fn(),
}));

vi.mock('@/utils/pdfPageRenderer', () => ({
  generateReportPDF,
}));

import {
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
    });
    expect(PROPOSAL_PDF_CLONE_CSS).toContain('.clean-page');
    expect(PROPOSAL_PDF_CLONE_CSS).toContain('min-height: 1123px');
  });
});
