import { describe, expect, it } from 'vitest';

import { selectActiveFormValidations } from './activeFormValidations';

describe('selectActiveFormValidations', () => {
  it('ignora uma validação antiga com assinatura pendente', () => {
    const current = { isValid: true, missingQuestions: [] as string[] };
    const stale = { isValid: false, missingQuestions: ['Assinatura'] };

    expect(selectActiveFormValidations(
      { 'equipment::current': current, 'standalone-old-0': stale },
      new Set(['equipment::current']),
    )).toEqual([current]);
  });

  it('mantém a validação legada quando o formulário legado está ativo', () => {
    const legacy = { isValid: false, missingQuestions: ['Assinatura'] };

    expect(selectActiveFormValidations(
      { legacy },
      new Set(['legacy']),
    )).toEqual([legacy]);
  });
});
