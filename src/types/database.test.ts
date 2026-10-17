import { describe, expect, it } from 'vitest';
import type { OsStatus } from './database';
import { isResettableServiceOrderStatus } from './database';

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
