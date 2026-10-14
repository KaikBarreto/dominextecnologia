import { generateReportPDF, type RenderElementToPdfOptions } from '@/utils/pdfPageRenderer';

export const PROPOSAL_PDF_WIDTH_PX = 794;

/**
 * O PDF precisa manter a régua desktop/A4 mesmo quando o download parte de um
 * modal estreito ou de um celular. Este CSS é injetado só no clone offscreen:
 * não altera a prévia nem a proposta pública.
 */
export const PROPOSAL_PDF_CLONE_CSS = `
  .pdf-clone .clean-root,
  .pdf-clone .vg-root,
  .pdf-clone .au-root,
  .pdf-clone .pr-root {
    width: 794px !important;
    max-width: 794px !important;
  }

  .pdf-clone .clean-page {
    width: 794px !important;
    max-width: 794px !important;
    padding: 48px 52px !important;
  }
  .pdf-clone .clean-table-wrap { overflow: visible !important; }
  .pdf-clone .clean-table { min-width: 600px !important; }

  .pdf-clone .vg-page,
  .pdf-clone .au-page,
  .pdf-clone .pr-page {
    width: 794px !important;
    max-width: 794px !important;
    min-height: 1123px !important;
    padding: 56px !important;
    border-top: 0 !important;
  }
`;

export const PROPOSAL_PDF_OPTIONS: RenderElementToPdfOptions = {
  windowWidthPx: PROPOSAL_PDF_WIDTH_PX,
  enlargeImages: false,
  cloneCss: PROPOSAL_PDF_CLONE_CSS,
};

/** Gera a proposta em largura A4 real e fatia conteúdos longos em várias folhas. */
export function generateProposalPDF(element: HTMLElement, filename: string): Promise<void> {
  return generateReportPDF(element, filename, PROPOSAL_PDF_OPTIONS);
}
