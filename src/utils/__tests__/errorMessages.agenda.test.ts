import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '../errorMessages';

describe('erros da agenda', () => {
  it('traduz recurso fora do tenant sem expor codigo interno', () => {
    const message = getErrorMessage({
      code: 'P0001',
      message: 'schedule_resource_not_in_tenant',
    });

    expect(message).toBe(
      'Um dos responsáveis desta OS não está mais ativo na empresa. Atualize a atribuição e tente novamente.',
    );
    expect(message).not.toContain('schedule_resource');
    expect(message).not.toContain('P0001');
  });
});
