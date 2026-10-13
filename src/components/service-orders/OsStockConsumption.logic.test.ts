import { describe, expect, it } from 'vitest';
import { resolveInitialStockId } from './OsConsumeStockDialog';
import {
  hasInvalidSummaryQuantity,
  parseQty,
} from './OsConsumptionSummaryDialog';
import type { OsMaterialLine } from '@/hooks/useOsMaterials';

function line(id: string, quantity: number): OsMaterialLine {
  return { id, quantity } as OsMaterialLine;
}

describe('seleção do estoque na OS', () => {
  it('não troca uma seleção válida quando o estoque do cliente chega depois', () => {
    expect(resolveInitialStockId({
      currentStockId: 'estoque-geral',
      selectableStockIds: ['estoque-geral', 'estoque-cliente'],
      activeCustomerStockId: 'estoque-cliente',
      defaultStockId: 'estoque-geral',
    })).toBe('estoque-geral');
  });

  it('prioriza o estoque do cliente somente quando ainda não há seleção válida', () => {
    expect(resolveInitialStockId({
      currentStockId: 'estoque-antigo',
      selectableStockIds: ['estoque-geral', 'estoque-cliente'],
      activeCustomerStockId: 'estoque-cliente',
      defaultStockId: 'estoque-geral',
    })).toBe('estoque-cliente');
  });

  it('preserva a regra anterior de último local e local principal sem estoque do cliente', () => {
    expect(resolveInitialStockId({
      currentStockId: '',
      selectableStockIds: ['estoque-a', 'estoque-b'],
      lastUsedStockId: 'estoque-b',
      defaultStockId: 'estoque-a',
    })).toBe('estoque-b');

    expect(resolveInitialStockId({
      currentStockId: '',
      selectableStockIds: ['estoque-a', 'estoque-b'],
      lastUsedStockId: 'inexistente',
      defaultStockId: 'estoque-a',
    })).toBe('estoque-a');
  });
});

describe('validação das quantidades no resumo', () => {
  it('interpreta vírgula decimal e rejeita vazio, zero e negativo', () => {
    expect(parseQty('1,5')).toBe(1.5);
    expect(parseQty('')).toBe(0);
    expect(parseQty('abc')).toBe(0);

    const lines = [line('ok', 2), line('invalida', 3)];
    expect(hasInvalidSummaryQuantity(lines, { ok: '1,5', invalida: '0' })).toBe(true);
    expect(hasInvalidSummaryQuantity(lines, { ok: '1,5', invalida: '' })).toBe(true);
    expect(hasInvalidSummaryQuantity(lines, { ok: '1,5', invalida: '-1' })).toBe(true);
  });

  it('aceita todas as linhas quando cada quantidade é maior que zero', () => {
    const lines = [line('a', 1), line('b', 2)];
    expect(hasInvalidSummaryQuantity(lines, { a: '0,01', b: '3' })).toBe(false);
  });
});
