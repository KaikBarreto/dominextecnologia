import { describe, expect, it } from 'vitest';

import { getErrorMessage } from '../errorMessages';

describe('getErrorMessage — escopo da OS', () => {
  it('orienta a recarga sem expor SQLSTATE ou estrutura interna', () => {
    const message = getErrorMessage({
      code: 'P0001',
      message: 'Serviço do equipamento não pertence a esta ordem de serviço',
    });

    expect(message).toBe(
      'Os serviços desta OS foram atualizados em outro fluxo. Reabra a OS para carregar os dados atuais e tente novamente.',
    );
    expect(message).not.toContain('P0001');
    expect(message).not.toContain('não pertence');
  });
});
