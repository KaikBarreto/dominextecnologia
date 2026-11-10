import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PublicFormQuestionsEditor } from './PublicFormQuestionsEditor';
import type { PublicFormQuestionDraft } from '@/hooks/usePublicFormQuestions';

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const make = (id: string, question: string): PublicFormQuestionDraft => ({
  id, question, description: null, question_type: 'text', options: [], is_required: false,
});

describe('PublicFormQuestionsEditor', () => {
  it('mostra o estado vazio sem perguntas', () => {
    render(<PublicFormQuestionsEditor questions={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Nenhuma pergunta ainda')).toBeTruthy();
  });

  it('reordena pelas setas mantendo a lista consistente', () => {
    const onChange = vi.fn();
    render(<PublicFormQuestionsEditor questions={[make('a', 'Primeira'), make('b', 'Segunda')]} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText('Mover para cima')[1]);
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' }), expect.objectContaining({ id: 'a' })]);
  });

  it('remove uma pergunta', () => {
    const onChange = vi.fn();
    render(<PublicFormQuestionsEditor questions={[make('a', 'Primeira'), make('b', 'Segunda')]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Remover pergunta: Primeira'));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' })]);
  });
});
