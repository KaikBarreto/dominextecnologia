import { describe, expect, it } from 'vitest';

import {
  getFinancialAccountPriority,
  sortFinancialAccountsByPriority,
} from './finance-account-priority';

const TODAY = '2026-09-28';

describe('sortFinancialAccountsByPriority', () => {
  it('mostra vencidas, depois pendentes e deixa pagas/recebidas por último', () => {
    const result = sortFinancialAccountsByPriority([
      { id: 'paga', is_paid: true, due_date: '2026-09-01', paid_date: '2026-09-20' },
      { id: 'pendente', is_paid: false, due_date: '2026-09-30' },
      { id: 'vencida', is_paid: false, due_date: '2026-09-10' },
    ], TODAY);

    expect(result.map((item) => item.id)).toEqual(['vencida', 'pendente', 'paga']);
  });

  it('considera conta que vence hoje como pendente, não vencida', () => {
    expect(getFinancialAccountPriority({ is_paid: false, due_date: TODAY }, TODAY)).toBe(1);
  });

  it('ordena vencidas e pendentes pelo vencimento mais próximo e deixa sem data no fim do grupo', () => {
    const result = sortFinancialAccountsByPriority([
      { id: 'pendente-sem-data', is_paid: false },
      { id: 'vencida-recente', is_paid: false, due_date: '2026-09-20' },
      { id: 'pendente-distante', is_paid: false, due_date: '2026-10-20' },
      { id: 'vencida-antiga', is_paid: false, due_date: '2026-08-20' },
      { id: 'pendente-proxima', is_paid: false, due_date: '2026-09-29' },
    ], TODAY);

    expect(result.map((item) => item.id)).toEqual([
      'vencida-antiga',
      'vencida-recente',
      'pendente-proxima',
      'pendente-distante',
      'pendente-sem-data',
    ]);
  });

  it('ordena realizadas da baixa mais recente para a mais antiga', () => {
    const result = sortFinancialAccountsByPriority([
      { id: 'antiga', is_paid: true, paid_date: '2026-07-10' },
      { id: 'recente', is_paid: true, paid_date: '2026-09-27' },
      { id: 'intermediaria', is_paid: true, paid_date: '2026-08-15' },
    ], TODAY);

    expect(result.map((item) => item.id)).toEqual(['recente', 'intermediaria', 'antiga']);
  });

  it('trata data inválida como ausente e não altera o array original', () => {
    const original = [
      { id: 'sem-data-valida', is_paid: false, due_date: '2026-99-99' },
      { id: 'com-data', is_paid: false, due_date: '2026-10-01' },
    ];
    const snapshot = [...original];

    const result = sortFinancialAccountsByPriority(original, TODAY);

    expect(result.map((item) => item.id)).toEqual(['com-data', 'sem-data-valida']);
    expect(original).toEqual(snapshot);
  });
});
