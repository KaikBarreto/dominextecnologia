import { describe, expect, it } from 'vitest';
import { canShareServiceOrder, isServiceOrderEntry } from './serviceOrderAccess';

describe('serviceOrderAccess', () => {
  it('mantém OS e registros legados na listagem de ordens', () => {
    expect(isServiceOrderEntry({ entry_type: 'os' })).toBe(true);
    expect(isServiceOrderEntry({ entry_type: null })).toBe(true);
    expect(isServiceOrderEntry({})).toBe(true);
  });

  it('remove tarefas internas da listagem e do compartilhamento público', () => {
    const task = { entry_type: 'tarefa' as const, customer_id: 'customer-1' };

    expect(isServiceOrderEntry(task)).toBe(false);
    expect(canShareServiceOrder(task)).toBe(false);
  });

  it('só permite compartilhar uma OS vinculada a cliente', () => {
    expect(canShareServiceOrder({ entry_type: 'os', customer_id: 'customer-1' })).toBe(true);
    expect(canShareServiceOrder({ entry_type: 'os', customer_id: '' })).toBe(false);
  });
});
