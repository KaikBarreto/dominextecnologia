import { generateReportPDF, type RenderElementToPdfOptions } from '@/utils/pdfPageRenderer';
import type { Quote } from '@/hooks/useQuotes';

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
  .pdf-clone .clean-table-wrap { display: block !important; }
  .pdf-clone .clean-items-mobile { display: none !important; }
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
  // Evita uma segunda folha só para o rodapé nas propostas curtas. Se exigir
  // redução maior que 12%, mantém a paginação para preservar a leitura.
  singlePageMinScale: 0.88,
  cloneCss: PROPOSAL_PDF_CLONE_CSS,
};

type ProposalFilenameQuote = Pick<Quote, 'created_at' | 'prospect_name' | 'customers'>;

function sanitizeFilenamePart(value: string): string {
  const withoutControlCharacters = Array.from(value.normalize('NFC'), (character) => (
    character.charCodeAt(0) < 32 ? ' ' : character
  )).join('');

  return withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
}

/**
 * Nome amigável e seguro para compartilhamento, mantendo o nome do cliente como
 * foi cadastrado e exibindo a data da proposta no fuso da empresa.
 */
export function buildProposalPdfFilename(
  quote: ProposalFilenameQuote,
  timezone = 'America/Sao_Paulo',
): string {
  const rawClientName = quote.customers?.name || quote.prospect_name || 'Cliente';
  const clientName = sanitizeFilenamePart(rawClientName).slice(0, 120).trim() || 'Cliente';
  const parsedDate = new Date(quote.created_at);
  const proposalDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const parts = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  }).formatToParts(proposalDate);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  const month = part('month').replace(/\./g, '').toLocaleUpperCase('pt-BR');

  return `Proposta - ${clientName} ${part('day')} ${month} ${part('year')}.pdf`;
}

/** Gera a proposta em largura A4 real e fatia conteúdos longos em várias folhas. */
export function generateProposalPDF(element: HTMLElement, filename: string): Promise<void> {
  return generateReportPDF(element, filename, PROPOSAL_PDF_OPTIONS);
}
