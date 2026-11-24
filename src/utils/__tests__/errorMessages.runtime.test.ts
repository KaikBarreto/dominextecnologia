import { describe, expect, it } from 'vitest';
import {
  getErrorMessage,
  getSanitizedErrorDiagnostic,
  isInternalRuntimeError,
  isResetRuntimeError,
} from '../errorMessages';

describe('sanitização de erros internos de runtime', () => {
  it('nunca exibe o TypeError de reset para o usuário', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'reset')");

    expect(isInternalRuntimeError(error)).toBe(true);
    expect(isResetRuntimeError(error)).toBe(true);
    expect(getErrorMessage(error)).toBe(
      'O sistema encontrou uma inconsistência temporária. Atualize a página e tente novamente.',
    );
    expect(getErrorMessage(error)).not.toContain('reset');
    expect(getErrorMessage(error)).not.toContain('undefined');
  });

  it.each([
    new TypeError("Cannot read properties of null (reading 'id')"),
    { message: 'handler is not a function' },
    'Cannot set properties of undefined',
    new TypeError('Failed to fetch dynamically imported module: /assets/Inventory-antigo.js'),
  ])('oculta outras mensagens técnicas de JavaScript', (error) => {
    const message = getErrorMessage(error);

    expect(isInternalRuntimeError(error)).toBe(true);
    expect(message).not.toMatch(/undefined|null|not a function/i);
  });

  it('mantém a orientação específica de rede para Failed to fetch', () => {
    const error = new TypeError('Failed to fetch');

    expect(isInternalRuntimeError(error)).toBe(false);
    expect(getErrorMessage(error)).toBe('Sem conexão com a internet. Verifique sua rede e tente novamente.');
  });

  it('preserva diagnóstico sanitizado sem carregar o objeto ou credenciais', () => {
    const error = new Error(
      'Falha em https://api.exemplo.test/recurso?access_token=segredo&key=outra-chave',
    );
    error.stack = `${error.name}: ${error.message}\n    at salvar (arquivo.js:10:2)`;

    const diagnostic = getSanitizedErrorDiagnostic(error);

    expect(diagnostic.name).toBe('Error');
    expect(diagnostic.message).toContain('access_token=[removido]');
    expect(diagnostic.message).toContain('key=[removido]');
    expect(diagnostic.message).not.toContain('segredo');
    expect(diagnostic.message).not.toContain('outra-chave');
    expect(diagnostic.stack).not.toContain('segredo');
  });
});
