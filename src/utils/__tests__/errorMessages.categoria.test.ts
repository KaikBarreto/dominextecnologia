// A migration 20260919190000 cria UNIQUE (company_id, name) em
// financial_categories. Sem tradução, o usuário que tentasse criar uma
// categoria com nome repetido passaria a ver o erro cru do Postgres na tela —
// a trava trocaria um bug silencioso (duplicar) por um erro feio.
//
// Este teste prende a mensagem específica e, principalmente, a ORDEM: ela tem
// que vencer a regra genérica de "duplicate key value", que também casa.
import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '../errorMessages';

const PG_DUPLICATE_CATEGORIA = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "financial_categories_company_id_name_key"',
};

describe('erro de categoria duplicada', () => {
  it('nomeia o campo em vez de falar em "registro"', () => {
    const msg = getErrorMessage(PG_DUPLICATE_CATEGORIA);
    expect(msg).toContain('categoria');
    expect(msg).toContain('nome');
    // Não pode cair na genérica, que não diz o que fazer.
    expect(msg).not.toBe('Já existe um registro com esses dados.');
  });

  it('não vaza o texto cru do Postgres pro usuário', () => {
    const msg = getErrorMessage(PG_DUPLICATE_CATEGORIA);
    expect(msg).not.toContain('duplicate key');
    expect(msg).not.toContain('unique constraint');
    expect(msg).not.toContain('financial_categories');
  });

  it('outra violação de unicidade continua caindo na mensagem genérica', () => {
    const outro = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "outra_tabela_key"',
    };
    expect(getErrorMessage(outro)).toBe('Já existe um registro com esses dados.');
  });
});
