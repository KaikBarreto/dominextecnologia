import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '@/utils/errorMessages';
import { allOrNothingDeleteError, assertRowsAffected, NO_ROWS_AFFECTED_MESSAGES, NoRowsAffectedError } from './supabaseMutation';

describe('assertRowsAffected', () => {
  it('devolve a contagem quando a operação afetou linhas', () => {
    expect(assertRowsAffected({ error: null, count: 2 }, 'delete')).toBe(2);
  });

  it('repassa o erro do banco sem trocar por outro', () => {
    const dbError = { code: '23503', message: 'fk' };
    expect(() => assertRowsAffected({ error: dbError, count: null }, 'update')).toThrow(expect.objectContaining({ code: '23503' }));
  });

  it.each([
    ['zero linhas (RLS barrou em silêncio)', 0],
    ['contagem ausente (chamada sem count exact)', null],
  ])('falha fechado com %s', (_name, count) => {
    expect(() => assertRowsAffected({ error: null, count }, 'delete')).toThrow(NoRowsAffectedError);
  });

  it('a mensagem chega inteira ao usuário pelo tradutor de erros', () => {
    try {
      assertRowsAffected({ error: null, count: 0 }, 'delete');
    } catch (error) {
      expect(getErrorMessage(error)).toBe(NO_ROWS_AFFECTED_MESSAGES.delete);
      return;
    }
    throw new Error('deveria ter lançado');
  });

  it('aceita mensagem específica da tela', () => {
    expect(() => assertRowsAffected({ error: null, count: 0 }, 'update', 'Sem permissão para editar esta conta.'))
      .toThrow('Sem permissão para editar esta conta.');
  });

  it('em lote, afetar menos linhas que o pedido também é erro', () => {
    expect(assertRowsAffected({ error: null, count: 5 }, 'delete', undefined, 5)).toBe(5);
    expect(() => assertRowsAffected({ error: null, count: 3 }, 'delete', undefined, 5)).toThrow(/Alguns itens não foram excluídos/);
  });

  it('recusa da exclusão tudo-ou-nada chega inteira; outros erros sobem como vieram', () => {
    const refusal = allOrNothingDeleteError({ code: '23503', message: 'Não foi possível excluir a OS: ela tem registros vinculados. Nada foi apagado.' });
    expect(refusal).toBeInstanceOf(NoRowsAffectedError);
    expect(getErrorMessage(refusal)).toBe('Não foi possível excluir a OS: ela tem registros vinculados. Nada foi apagado.');
    const raw = { code: '42501', message: 'permission denied for table teams' };
    expect(allOrNothingDeleteError(raw)).toBe(raw);
    const other = { code: '57014', message: 'Não foi possível algo' };
    expect(allOrNothingDeleteError(other)).toBe(other);
  });
});

