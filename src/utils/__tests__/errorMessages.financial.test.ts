import { describe, expect, it } from 'vitest';

import { getErrorMessage } from '../errorMessages';

describe('getErrorMessage — financeiro', () => {
  it('traduz a custódia reservada do PDV antes do SQLSTATE genérico', () => {
    expect(getErrorMessage({
      code: '23514',
      message: 'new row violates check constraint',
      details: 'PDV_TREASURY_CUSTODY_RESERVED',
    })).toBe(
      'Esse dinheiro está separado para o caixa do PDV que está aberto. Use outra conta ou feche o caixa antes de continuar.',
    );
  });

  it('reconhece o código de domínio quando o cliente o entrega no hint', () => {
    expect(getErrorMessage({
      code: '23514',
      message: 'check violation',
      hint: 'PDV_TREASURY_CUSTODY_RESERVED',
    })).not.toContain('23514');
  });

  it('explica o lançamento imutável do caixa sem falar em custódia', () => {
    const message = getErrorMessage({
      code: '55000',
      message: 'Este lançamento pertence à custódia do caixa e não pode ser alterado ou excluído. Registre uma reversão.',
      details: 'PDV_CUSTODY_FINANCIAL_IMMUTABLE',
    });
    expect(message).toBe(
      'Este lançamento foi criado pelo caixa do PDV e não pode ser editado nem excluído aqui. Para desfazer, cancele a venda ou registre o estorno no próprio PDV.',
    );
    expect(message).not.toContain('custódia');
  });
});
