import { describe, expect, it } from 'vitest';
import type { OsStatus } from './database';
import { getServiceOrderResetActionLabel, isResettableServiceOrderStatus } from './database';

describe('isResettableServiceOrderStatus', () => {
  it.each<OsStatus>(['a_caminho', 'em_andamento', 'pausada', 'concluida'])(
    'permite resetar OS em %s',
    (status) => {
      expect(isResettableServiceOrderStatus(status)).toBe(true);
    },
  );

  it.each<OsStatus>(['agendada', 'pendente', 'cancelada'])(
    'não oferece reset para OS em %s',
    (status) => {
      expect(isResettableServiceOrderStatus(status)).toBe(false);
    },
  );
});

describe('getServiceOrderResetActionLabel', () => {
  it('chama a ação de uma OS concluída de reabertura', () => {
    expect(getServiceOrderResetActionLabel('concluida')).toBe('Reabrir OS');
  });

  it.each<OsStatus>(['a_caminho', 'em_andamento', 'pausada'])(
    'mantém o nome resetar para OS em %s',
    (status) => {
      expect(getServiceOrderResetActionLabel(status)).toBe('Resetar OS');
    },
  );
});
