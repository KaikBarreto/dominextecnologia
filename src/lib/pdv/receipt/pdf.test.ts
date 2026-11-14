import { describe, expect, it } from 'vitest';
import { PDV_RECEIPT_PREVIEW_FIXTURE } from './fixture';
import { generatePdvReceiptPdf } from './pdf';

describe('generatePdvReceiptPdf', () => {
  it.each(['a4','58mm','80mm'] as const)('gera PDF %s sem qualquer escrita externa', (format) => {
    const blob = generatePdvReceiptPdf(PDV_RECEIPT_PREVIEW_FIXTURE, format);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
  });

  it('inclui a marca Dominex somente fora do white-label', () => {
    const branded = generatePdvReceiptPdf(PDV_RECEIPT_PREVIEW_FIXTURE, '80mm');
    const whiteLabel = generatePdvReceiptPdf({
      ...PDV_RECEIPT_PREVIEW_FIXTURE,
      company: { ...PDV_RECEIPT_PREVIEW_FIXTURE.company, whiteLabelEnabled: true },
    }, '80mm');
    expect(branded.size).toBeGreaterThan(whiteLabel.size);
  });
});
