import { describe, expect, it } from 'vitest';
import { normalizeServiceOrderNumberError } from './service-order-number-errors';

describe('erros de numeração da OS', () => {
  it.each(['OSN01', 'OSN02', 'OSN03', 'OSN99'])('traduz a família %s preservando o código para recuperação', code => {
    const normalized = normalizeServiceOrderNumberError({ code, message: 'SQLSTATE private_table constraint secret' }) as Error & { code: string };
    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.code).toBe(code);
    expect(normalized.message).not.toMatch(/OSN|SQLSTATE|private_table|constraint|secret/);
  });
  it.each([null, undefined, 'Erro de rede', new Error('Operação indisponível'), { code: '42501', message: 'schedule_create_permission_denied' }])('preserva o domínio de outros erros', error => {
    expect(normalizeServiceOrderNumberError(error)).toBe(error);
  });
});
