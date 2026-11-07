import { describe, expect, it } from 'vitest';

import { keepsAnswerControlsVisible } from './dynamicFormQuestionUx';

describe('keepsAnswerControlsVisible', () => {
  it.each(['boolean', 'conformidade', 'select', 'photo', 'video', 'signature'])(
    'mantém o controle %s visível depois da resposta',
    (questionType) => {
      expect(keepsAnswerControlsVisible({ question_type: questionType })).toBe(true);
    },
  );

  it.each(['text', 'number', 'pmoc_measurement'])(
    'mantém %s compacto até o usuário pedir edição',
    (questionType) => {
      expect(keepsAnswerControlsVisible({ question_type: questionType })).toBe(false);
    },
  );

  it('mantém um formulário composto visível quando contém controle direto', () => {
    expect(keepsAnswerControlsVisible({
      question_type: 'text',
      answer_types: ['text', 'photo'],
    })).toBe(true);
  });
});
