// A migration 20260919260000 trava a hierarquia de categoria financeira no
// BANCO (gatilho trg_financial_categories_valida_parent): no máximo dois
// níveis, pai da mesma empresa, tipo compatível.
//
// O gatilho fala PT-BR SEM ACENTO (a mensagem viaja por SQL) e usa SQLSTATE
// P0001 de propósito — 23514/23503 já têm mensagem genérica no mapa de
// SQLSTATE, que é consultado ANTES do texto e engoliria a explicação.
//
// Estes testes prendem as duas coisas que quebram em silêncio se alguém mexer:
//  1. a copy acentuada que o cliente lê;
//  2. o fato de P0001 NÃO poder ganhar mensagem genérica de SQLSTATE.
import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '../errorMessages';

/** Erro como o supabase-js entrega o RAISE EXCEPTION do gatilho. */
const doGatilho = (message: string) => ({ code: 'P0001', message });

describe('erros de hierarquia de categoria financeira', () => {
  it('recusa de neto vira copy acentuada, sem jargão de banco', () => {
    const msg = getErrorMessage(
      doGatilho(
        'Categoria "CSP" ja e uma subcategoria. A hierarquia tem no maximo dois niveis: nao existe sub-subcategoria.',
      ),
    );
    expect(msg).toContain('dois níveis');
    expect(msg).not.toContain('sub-subcategoria');
    expect(msg).not.toContain('ja e');
  });

  it('pai com filhas que tenta virar filha explica o que fazer', () => {
    const msg = getErrorMessage(
      doGatilho(
        'Categoria "CSP" tem 3 subcategoria(s) e por isso nao pode virar subcategoria de outra. Solte as subcategorias dela primeiro.',
      ),
    );
    expect(msg).toContain('subcategorias');
    expect(msg).toContain('Solte');
  });

  it('pai de outra empresa não vaza company_id nem nome da tabela', () => {
    const msg = getErrorMessage(
      doGatilho(
        'Categoria pai "CSP" pertence a outra empresa. Subcategoria so pode ser criada dentro da mesma empresa.',
      ),
    );
    expect(msg).toContain('não é da sua empresa');
    expect(msg).not.toContain('financial_categories');
    expect(msg).not.toContain('company_id');
  });

  it('tipo incompatível fala a língua da tela (entrada/saída)', () => {
    const msg = getErrorMessage(
      doGatilho(
        'Categoria pai "CSP" e do tipo "saida" e a subcategoria e do tipo "entrada". A subcategoria precisa ser do mesmo tipo do pai (ou o pai ser "ambos").',
      ),
    );
    expect(msg).toContain('entrada');
    expect(msg).toContain('saída');
  });

  it('trocar o tipo de um pai com filhas de outro tipo é explicado', () => {
    const msg = getErrorMessage(
      doGatilho(
        'Categoria "CSP" tem 2 subcategoria(s) de outro tipo. Mude o tipo das subcategorias antes de mudar o tipo da categoria pai.',
      ),
    );
    expect(msg).toContain('subcategorias');
    expect(msg).toContain('antes de mudar');
  });

  it('auto-referência tem mensagem própria', () => {
    const msg = getErrorMessage(doGatilho('Uma categoria nao pode ser subcategoria dela mesma.'));
    expect(msg).toBe('Uma categoria não pode ser subcategoria dela mesma.');
  });

  it('P0001 não pode ganhar mensagem genérica de SQLSTATE', () => {
    // Se alguém mapear P0001 no SQLSTATE_MESSAGES, TODAS as mensagens acima
    // somem de uma vez — o SQLSTATE é consultado antes do texto.
    //
    // Nota de achado (pré-existente, fora do escopo desta mudança): mensagem de
    // gatilho NÃO mapeada volta pro usuário com o código colado no fim
    // ("... ainda. | P0001"), porque o fallback cru junta message+code. É mais
    // um motivo pra toda mensagem nova de gatilho ganhar tradução no
    // DATABASE_ERROR_MAP — as 6 de cima têm, e voltam limpas.
    const naoMapeada = doGatilho('Mensagem de gatilho que ninguem traduziu ainda.');
    const msg = getErrorMessage(naoMapeada);
    expect(msg).toContain('Mensagem de gatilho que ninguem traduziu ainda.');
    expect(msg).not.toBe('Ocorreu um erro. Tente novamente.');
  });
});
