import { describe, expect, it } from 'vitest';

import { getErrorMessage } from '../errorMessages';

describe('getErrorMessage — financeiro', () => {
  it('traduz a custódia reservada do PDV antes do SQLSTATE genérico', () => {
    expect(getErrorMessage({
      code: '23514',
      message: 'new row violates check constraint',
      details: 'PDV_TREASURY_CUSTODY_RESERVED',
    })).toBe(
      'Esta conta é reservada à custódia do caixa do PDV. Selecione outra conta bancária ou caixa para registrar o pagamento.',
    );
  });

  it('reconhece o código de domínio quando o cliente o entrega no hint', () => {
    expect(getErrorMessage({
      code: '23514',
      message: 'check violation',
      hint: 'PDV_TREASURY_CUSTODY_RESERVED',
    })).not.toContain('23514');
  });
});
