import { describe, expect, it } from 'vitest';
import { quoteNumberErrorMessage } from './quote-number-errors';

describe('erros de numeração do orçamento', () => {
  it.each(['QNR01', '42501', 'QNR02', 'QNR03', 'QNR99', '22P02', '22023', '23503', '23505', undefined])('oculta códigos e detalhes internos de %s', code => {
    const message = quoteNumberErrorMessage({ code });
    expect(message).not.toContain(code ?? 'undefined');
    expect(message).not.toMatch(/SQLSTATE|quote_number|constraint|relation|schema|rpc/i);
    expect(message.length).toBeGreaterThan(30);
  });
  it('orienta o usuário sobre expiração, uso em outra versão e falhas de dados', () => {
    expect(quoteNumberErrorMessage({ code: 'QNR02' })).toContain('Gere um novo número');
    expect(quoteNumberErrorMessage({ code: 'QNR03' })).toContain('outra versão');
    expect(quoteNumberErrorMessage({ code: '23503' })).toContain('cliente selecionado');
  });
});
