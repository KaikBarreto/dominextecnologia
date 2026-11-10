import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PublicFormQuestionField } from './PublicFormQuestionField';
import {
  PUBLIC_FORM_QUESTION_TYPES_VALUES,
  type PublicFormQuestion,
} from '@/lib/publicFormQuestions';

function makeQuestion(over: Partial<PublicFormQuestion> = {}): PublicFormQuestion {
  return {
    id: 'q1',
    question: 'Pergunta de teste',
    description: null,
    question_type: 'text',
    options: [],
    is_required: false,
    position: 0,
    ...over,
  };
}

// jsdom não tem ResizeObserver nem canvas; o pad de assinatura precisa dos dois.
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

describe('PublicFormQuestionField', () => {
  it.each(PUBLIC_FORM_QUESTION_TYPES_VALUES)('renderiza o tipo %s sem quebrar', (type) => {
    const { container } = render(
      <PublicFormQuestionField
        question={makeQuestion({ question_type: type, options: ['A', 'B'] })}
        value={undefined}
        onChange={() => {}}
        onUploadFile={async () => 'https://x'}
      />,
    );
    expect(screen.getByText('Pergunta de teste')).toBeTruthy();
    expect(container.querySelector('#pfq-q1')).toBeTruthy();
  });

  it('marca obrigatório com asterisco e opcional com o aviso', () => {
    const { rerender } = render(
      <PublicFormQuestionField question={makeQuestion({ is_required: true })} value="" onChange={() => {}} />,
    );
    expect(screen.getByText('*')).toBeTruthy();
    rerender(
      <PublicFormQuestionField question={makeQuestion()} value="" onChange={() => {}} />,
    );
    expect(screen.getByText('(opcional)')).toBeTruthy();
  });

  it('mostra a mensagem de erro recebida', () => {
    render(
      <PublicFormQuestionField
        question={makeQuestion({ is_required: true })}
        value=""
        onChange={() => {}}
        error="Responda: Pergunta de teste"
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Responda: Pergunta de teste');
  });

  it('boolean: toca em Sim, em Não, e limpa ao tocar de novo', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <PublicFormQuestionField question={makeQuestion({ question_type: 'boolean' })} value={undefined} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText('Sim'));
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText('Não'));
    expect(onChange).toHaveBeenLastCalledWith(false);
    rerender(
      <PublicFormQuestionField question={makeQuestion({ question_type: 'boolean' })} value={true} onChange={onChange} />,
    );
    fireEvent.click(screen.getByText('Sim'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('rating: escala de 0 a 10', () => {
    const onChange = vi.fn();
    render(
      <PublicFormQuestionField question={makeQuestion({ question_type: 'rating' })} value={undefined} onChange={onChange} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(11);
    fireEvent.click(screen.getByText('7'));
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('multiselect: mantém a ordem das alternativas, não a do toque', () => {
    const onChange = vi.fn();
    render(
      <PublicFormQuestionField
        question={makeQuestion({ question_type: 'multiselect', options: ['A', 'B', 'C'] })}
        value={['C']}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onChange).toHaveBeenLastCalledWith(['A', 'C']);
  });

  it('number: aceita vírgula decimal e sinal negativo, descarta letras', () => {
    const onChange = vi.fn();
    render(
      <PublicFormQuestionField question={makeQuestion({ question_type: 'number' })} value="" onChange={onChange} />,
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '-12,5abc' } });
    expect(onChange).toHaveBeenLastCalledWith('-12,5');
    fireEvent.change(input, { target: { value: '1.5' } });
    expect(onChange).toHaveBeenLastCalledWith('1,5');
  });

  it('textos de chrome seguem o idioma da empresa', () => {
    render(
      <PublicFormQuestionField question={makeQuestion({ question_type: 'boolean' })} value={undefined} onChange={() => {}} lang="en" />,
    );
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('(optional)')).toBeTruthy();
  });
});
