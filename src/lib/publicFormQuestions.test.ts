import { describe, expect, it } from 'vitest';
import {
  buildAnswersPayload,
  isAllowedUploadUrl,
  parsePublicFormQuestions,
  validatePublicFormAnswers,
  STORAGE_PUBLIC_URL_PREFIX,
  type PublicFormQuestion,
} from './publicFormQuestions';

function q(overrides: Partial<PublicFormQuestion> & { id: string }): PublicFormQuestion {
  return {
    question: 'Pergunta',
    description: null,
    question_type: 'text',
    options: [],
    is_required: false,
    position: 0,
    ...overrides,
  } as PublicFormQuestion;
}

describe('validatePublicFormAnswers', () => {
  it('cobra só a pergunta obrigatória vazia, e nomeia qual é', () => {
    const questions = [
      q({ id: 'a', question: 'Seu nome', is_required: true }),
      q({ id: 'b', question: 'Observação' }),
    ];
    const result = validatePublicFormAnswers(questions, { b: 'nada' });
    expect(result.ok).toBe(false);
    expect(result.questionId).toBe('a');
    expect(result.message).toContain('Seu nome');
  });

  it('deixa passar pergunta opcional não respondida', () => {
    const questions = [q({ id: 'a', question: 'Observação' })];
    expect(validatePublicFormAnswers(questions, {}).ok).toBe(true);
    expect(validatePublicFormAnswers(questions, { a: '   ' }).ok).toBe(true);
  });

  it('aceita vírgula decimal em número, igual o servidor normaliza', () => {
    const questions = [q({ id: 'n', question: 'Metragem', question_type: 'number' })];
    expect(validatePublicFormAnswers(questions, { n: '12,5' }).ok).toBe(true);
    expect(validatePublicFormAnswers(questions, { n: 'abc' }).ok).toBe(false);
  });

  it('exige nota inteira de 0 a 10 em rating', () => {
    const questions = [q({ id: 'r', question: 'Nota', question_type: 'rating' })];
    expect(validatePublicFormAnswers(questions, { r: 10 }).ok).toBe(true);
    expect(validatePublicFormAnswers(questions, { r: 11 }).ok).toBe(false);
    expect(validatePublicFormAnswers(questions, { r: 7.5 }).ok).toBe(false);
  });

  it('recusa valor fora das opções em escolha única e múltipla', () => {
    const single = [q({ id: 's', question: 'Turno', question_type: 'select', options: ['Manhã', 'Tarde'] })];
    expect(validatePublicFormAnswers(single, { s: 'Tarde' }).ok).toBe(true);
    expect(validatePublicFormAnswers(single, { s: 'Madrugada' }).ok).toBe(false);

    const multi = [q({ id: 'm', question: 'Serviços', question_type: 'multiselect', options: ['A', 'B'] })];
    expect(validatePublicFormAnswers(multi, { m: ['A', 'B'] }).ok).toBe(true);
    expect(validatePublicFormAnswers(multi, { m: ['A', 'C'] }).ok).toBe(false);
  });

  it('só aceita foto e assinatura vindas do nosso Storage', () => {
    const questions = [q({ id: 'f', question: 'Foto do local', question_type: 'photo' })];
    expect(validatePublicFormAnswers(questions, { f: `${STORAGE_PUBLIC_URL_PREFIX}customer-photos/x.jpg` }).ok).toBe(true);
    expect(validatePublicFormAnswers(questions, { f: 'https://evil.example/x.jpg' }).ok).toBe(false);
    expect(validatePublicFormAnswers(questions, { f: 'data:image/png;base64,AAAA' }).ok).toBe(false);
  });

  it('recusa data fora de ISO e dd/mm/aaaa', () => {
    const questions = [q({ id: 'd', question: 'Quando', question_type: 'date' })];
    expect(validatePublicFormAnswers(questions, { d: '2026-11-10' }).ok).toBe(true);
    expect(validatePublicFormAnswers(questions, { d: '10/11/2026' }).ok).toBe(true);
    expect(validatePublicFormAnswers(questions, { d: '10-11-26' }).ok).toBe(false);
  });

  it('recusa texto acima do teto do servidor', () => {
    const questions = [q({ id: 't', question: 'Relato' })];
    expect(validatePublicFormAnswers(questions, { t: 'a'.repeat(4001) }).ok).toBe(false);
    expect(validatePublicFormAnswers(questions, { t: 'a'.repeat(4000) }).ok).toBe(true);
  });
});

describe('isAllowedUploadUrl', () => {
  it('barra travessia de path mesmo com o prefixo certo', () => {
    expect(isAllowedUploadUrl(`${STORAGE_PUBLIC_URL_PREFIX}a/../../b.jpg`)).toBe(false);
  });
});

describe('buildAnswersPayload', () => {
  it('descarta vazio e normaliza número, booleano e múltipla escolha', () => {
    const questions = [
      q({ id: 'vazio', question: 'Vazio' }),
      q({ id: 'num', question: 'Num', question_type: 'number' }),
      q({ id: 'bool', question: 'Bool', question_type: 'boolean' }),
      q({ id: 'multi', question: 'Multi', question_type: 'multiselect', options: ['A'] }),
      q({ id: 'txt', question: 'Txt' }),
    ];
    const payload = buildAnswersPayload(questions, {
      vazio: '   ', num: '12,5', bool: 'true', multi: ['A'], txt: '  oi  ',
    });
    expect(payload).toEqual({ num: 12.5, bool: true, multi: ['A'], txt: 'oi' });
  });
});

describe('parsePublicFormQuestions', () => {
  it('ordena por position e descarta tipo desconhecido ou sem id', () => {
    const parsed = parsePublicFormQuestions([
      { id: 'b', question: 'B', question_type: 'text', options: [], is_required: false, position: 2 },
      { id: 'a', question: 'A', question_type: 'text', options: [], is_required: true, position: 1 },
      { id: 'x', question: 'X', question_type: 'inventado', options: [], is_required: false, position: 0 },
      { id: '', question: 'Sem id', question_type: 'text', options: [], is_required: false, position: 0 },
    ]);
    expect(parsed.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('devolve lista vazia quando a RPC não mandou array', () => {
    expect(parsePublicFormQuestions(null)).toEqual([]);
    expect(parsePublicFormQuestions({})).toEqual([]);
  });
});
