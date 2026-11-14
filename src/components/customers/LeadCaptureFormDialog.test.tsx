import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LeadCaptureFormDialog } from './LeadCaptureFormDialog';

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePublicFormQuestions', () => ({
  toQuestionDraft: (q: unknown) => q,
  usePublicFormQuestions: () => ({
    questions: [], isSuccess: false, isFetching: false, isError: false, refetch: vi.fn(),
    saveQuestions: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

function renderDialog() {
  return render(
    <LeadCaptureFormDialog open onOpenChange={vi.fn()} form={null} onSubmit={vi.fn()} isLoading={false} />,
  );
}

describe('LeadCaptureFormDialog (wizard)', () => {
  it('abre na etapa Formulário com os dois cartões de finalidade', () => {
    renderDialog();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /Cadastra cliente/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Só respostas/ }).getAttribute('aria-checked')).toBe('false');
  });

  it('troca a finalidade pelo cartão', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: /Só respostas/ }));
    expect(screen.getByRole('radio', { name: /Só respostas/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('barra o avanço sem título e libera com título', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(screen.getByRole('alert').textContent).toBe('Informe um título para o formulário');
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Pesquisa' } });
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Nome')).toBeTruthy();
  });

  it('mostra o resumo do rascunho a partir da etapa 2', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Pesquisa de satisfação' } });
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    const aside = screen.getByRole('complementary', { name: 'Resumo do formulário' });
    expect(aside.textContent).toContain('Pesquisa de satisfação');
    expect(aside.textContent).toContain('1 de 17 campos ligados');
    expect(aside.textContent).toContain('Ainda sem perguntas');
    expect(aside.textContent).toContain('Link público');
  });
});
