import { describe, it, expect } from 'vitest';
import { isEntryMutationPending } from './EntryActionPanel';

/**
 * Bug real reportado pelo Tech Lead (QA no navegador, 2026-10-18): o botão
 * "Desfazer" usava uma trava GLOBAL (`anyMutationPending`, OR de `isPending`
 * de TODAS as mutations compartilhadas pelo extrato inteiro). Com isso,
 * gravar a linha A deixava o Desfazer da linha B travado — e, pior, o
 * `await` dentro de `onSuccess` podia deixar essa trava presa pra sempre.
 *
 * `isEntryMutationPending` substitui a trava global por uma checagem
 * por-linha: só considera a mutação "pendente para esta linha" se as
 * `variables` da chamada em voo apontarem pro MESMO `entryId`.
 */

function idle<TVariables>(): { isPending: false; variables?: TVariables } {
  return { isPending: false };
}

function pendingFor<TVariables>(variables: TVariables): { isPending: true; variables: TVariables } {
  return { isPending: true, variables };
}

function buildAllIdleMutations() {
  return {
    matchExisting: idle<{ entryId: string }>(),
    settleTransaction: idle<{ entryId: string }>(),
    createTransaction: idle<{ entryId: string }>(),
    createTransfer: idle<{ entryId: string }>(),
    payCardBill: idle<{ entryId: string }>(),
    createEmployeeMovement: idle<{ entryId: string }>(),
    flipSign: idle<{ entryIds: string[] }>(),
    ignoreEntry: idle<{ entryId: string }>(),
    unmatchEntry: idle<{ entryId: string }>(),
  };
}

describe('isEntryMutationPending', () => {
  it('não trava quando nenhuma mutação está em voo', () => {
    expect(isEntryMutationPending('entry-a', buildAllIdleMutations())).toBe(false);
  });

  it('trava a linha quando o unmatchEntry em voo é DESTA entry (caso do botão Desfazer)', () => {
    const mutations = { ...buildAllIdleMutations(), unmatchEntry: pendingFor({ entryId: 'entry-a' }) };
    expect(isEntryMutationPending('entry-a', mutations)).toBe(true);
  });

  it('NÃO trava uma linha B enquanto a linha A está gravando (regressão do bug real: trava era global)', () => {
    const mutations = { ...buildAllIdleMutations(), createTransaction: pendingFor({ entryId: 'entry-a' }) };
    // Linha A (a que está sendo gravada) fica travada...
    expect(isEntryMutationPending('entry-a', mutations)).toBe(true);
    // ...mas a linha B, que não tem nada em voo, continua clicável.
    expect(isEntryMutationPending('entry-b', mutations)).toBe(false);
  });

  it('considera flipSign em lote: trava só as entries que estão na lista de ids em voo', () => {
    const mutations = { ...buildAllIdleMutations(), flipSign: pendingFor({ entryIds: ['entry-a', 'entry-c'] }) };
    expect(isEntryMutationPending('entry-a', mutations)).toBe(true);
    expect(isEntryMutationPending('entry-c', mutations)).toBe(true);
    expect(isEntryMutationPending('entry-b', mutations)).toBe(false);
  });

  it('cada tipo de mutation trava a própria entry quando em voo', () => {
    const cases: Array<[keyof ReturnType<typeof buildAllIdleMutations>, unknown]> = [
      ['matchExisting', pendingFor({ entryId: 'entry-a' })],
      ['settleTransaction', pendingFor({ entryId: 'entry-a' })],
      ['createTransaction', pendingFor({ entryId: 'entry-a' })],
      ['createTransfer', pendingFor({ entryId: 'entry-a' })],
      ['payCardBill', pendingFor({ entryId: 'entry-a' })],
      ['createEmployeeMovement', pendingFor({ entryId: 'entry-a' })],
      ['ignoreEntry', pendingFor({ entryId: 'entry-a' })],
      ['unmatchEntry', pendingFor({ entryId: 'entry-a' })],
    ];

    for (const [key, pending] of cases) {
      const mutations = { ...buildAllIdleMutations(), [key]: pending };
      expect(isEntryMutationPending('entry-a', mutations as ReturnType<typeof buildAllIdleMutations>)).toBe(true);
      expect(isEntryMutationPending('entry-outra', mutations as ReturnType<typeof buildAllIdleMutations>)).toBe(false);
    }
  });

  it('não quebra quando `variables` ainda é undefined no primeiro render da mutation', () => {
    // Estado real do react-query antes de qualquer `.mutate()` ser chamado:
    // isPending é false e variables é undefined — não pode lançar.
    expect(() => isEntryMutationPending('entry-a', buildAllIdleMutations())).not.toThrow();
  });
});
