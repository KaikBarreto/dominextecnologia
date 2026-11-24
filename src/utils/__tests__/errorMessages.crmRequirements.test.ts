import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '@/utils/errorMessages';

describe('mensagem dos requisitos de etapa do CRM', () => {
  it('preserva a orientação e remove hint, SQLSTATE e nomes internos', () => {
    const message = getErrorMessage({
      code: 'P0001',
      message: 'Conclua as tarefas pendentes. Vincule um cliente.',
      hint: 'STAGE_REQUIREMENTS_PENDING',
    });

    expect(message).toBe('Conclua as tarefas pendentes. Vincule um cliente.');
    expect(message).not.toMatch(/P0001|STAGE_REQUIREMENTS_PENDING|crm_/i);
  });
});
