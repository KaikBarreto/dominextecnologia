import { describe, expect, it } from 'vitest';
import { resolvePdvReceiptStagePolicy, resolvePdvReceiptStages } from './stagePolicy';

describe('políticas de comprovante por etapa', () => {
  it('migra o automatismo legado somente para a venda', () => {
    const settings = { defaultFormat: '58mm' as const, autoPrint: true, copies: 2 as const };
    expect(resolvePdvReceiptStages(settings)).toEqual({
      budget: { autoPrint: false, format: '58mm', copies: 2 },
      sale: { autoPrint: true, format: '58mm', copies: 2 },
      delivery: { autoPrint: false, format: '58mm', copies: 2 },
    });
  });
  it('cada etapa prevalece sem modificar as outras', () => {
    const settings = { autoPrint: true, stages: { budget: { autoPrint: true, format: 'a4' as const, copies: 3 as const } } };
    expect(resolvePdvReceiptStagePolicy(settings, 'budget')).toEqual({ autoPrint: true, format: 'a4', copies: 3 });
    expect(resolvePdvReceiptStagePolicy(settings, 'delivery')).toEqual({ autoPrint: false, format: '80mm', copies: 1 });
  });
  it('defaults não ligam abertura automática nem herdam políticas do prototype', () => {
    expect(resolvePdvReceiptStagePolicy(undefined, 'sale').autoPrint).toBe(false);
    const stages = Object.create({ sale: { autoPrint: true, format: 'a4', copies: 3 } });
    expect(resolvePdvReceiptStagePolicy({ stages }, 'sale')).toEqual({ autoPrint: false, format: '80mm', copies: 1 });
  });
});
