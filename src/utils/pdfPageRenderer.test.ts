import { describe, expect, it } from 'vitest';
import { getSinglePageFitScale } from '@/utils/pdfPageRenderer';

describe('getSinglePageFitScale', () => {
  it('reduz um pequeno excedente para uma única página', () => {
    expect(getSinglePageFitScale(1200, 1123, 0.88)).toBeCloseTo(1123 / 1200);
  });

  it('mantém a paginação quando a redução passaria do limite de legibilidade', () => {
    expect(getSinglePageFitScale(1400, 1123, 0.88)).toBeNull();
  });

  it('não redimensiona conteúdo que já cabe em uma página', () => {
    expect(getSinglePageFitScale(1100, 1123, 0.88)).toBeNull();
  });
});
