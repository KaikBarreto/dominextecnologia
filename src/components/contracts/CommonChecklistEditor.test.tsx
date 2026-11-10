import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CommonChecklistEditor } from './CommonChecklistEditor';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

describe('CommonChecklistEditor', () => {
  it('confirma a exclusão sem alternar o accordion e remove somente após confirmar', () => {
    const onChangeTemplates = vi.fn();
    const onChangeExcluded = vi.fn();

    render(
      <TooltipProvider>
      <CommonChecklistEditor
        templates={[
          {
            id: 'checklist-1',
            name: 'Norma completa',
            questions: [
              { id: 'question-1', question: 'Verificar filtros', position: 1 },
            ],
          },
        ]}
        selectedTemplateIds={['checklist-1']}
        onChangeTemplates={onChangeTemplates}
        excluded={['question-1']}
        onChangeExcluded={onChangeExcluded}
      />
      </TooltipProvider>,
    );

    const accordionTrigger = screen.getByRole('button', { name: /^Perguntas do Checklist.*Norma completa/i });
    expect(accordionTrigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Remover checklist Norma completa/i }));

    expect(accordionTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(onChangeTemplates).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Remover checklist$/i }));

    expect(onChangeTemplates).toHaveBeenCalledWith([]);
    expect(onChangeExcluded).toHaveBeenCalledWith([]);
  });
});
