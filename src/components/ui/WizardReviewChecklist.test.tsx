import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WizardMobileSummary, WizardReviewChecklist } from './WizardReviewChecklist';

describe('WizardReviewChecklist', () => {
  it('distingue pendência obrigatória de etapa opcional e volta para editar', () => {
    const onEdit = vi.fn();
    render(
      <WizardReviewChecklist
        items={[
          { key: 'customer', label: 'Cliente', detail: 'Selecione o cliente.', complete: false, stepIndex: 0 },
          { key: 'scope', label: 'Escopo', detail: 'Pode ser completado depois.', complete: false, optional: true, stepIndex: 1 },
        ]}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByText('1 pendência precisa de atenção.')).toBeInTheDocument();
    expect(screen.getByText('Opcional')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Editar/i })[1]);
    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it('abre o resumo móvel sob demanda sem perder a síntese recolhida', () => {
    render(
      <WizardMobileSummary title="Resumo da OS" summary="Cliente · 1 visita">
        <p>Conteúdo consolidado</p>
      </WizardMobileSummary>,
    );

    expect(screen.getByText('Cliente · 1 visita')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo consolidado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Resumo da OS/i }));
    expect(screen.getByText('Conteúdo consolidado')).toBeInTheDocument();
  });
});
