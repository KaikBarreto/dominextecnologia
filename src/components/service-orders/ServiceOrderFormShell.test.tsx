import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ServiceOrderFormStepper,
  ServiceOrderFormSummary,
  type ServiceOrderWizardStep,
} from './ServiceOrderFormShell';

const steps: ServiceOrderWizardStep[] = [
  { key: 'client', label: 'Atendimento e orçamento' },
  { key: 'equipment', label: 'Escopo técnico' },
  { key: 'details', label: 'Equipe e agenda' },
  { key: 'review', label: 'Revisão' },
];

describe('ServiceOrderFormStepper', () => {
  it('permite voltar para etapas alcançadas sem liberar salto para frente', () => {
    const onStepChange = vi.fn();
    render(<ServiceOrderFormStepper steps={steps} currentIndex={0} maxReachedIndex={2} onStepChange={onStepChange} />);

    const current = screen.getByRole('button', { name: /Atendimento e orçamento/i });
    const previous = screen.getByRole('button', { name: /Equipe e agenda/i });
    const forward = screen.getByRole('button', { name: /Revisão/i });

    expect(current).toHaveAttribute('aria-current', 'step');
    expect(forward).toBeDisabled();

    fireEvent.click(previous);
    expect(onStepChange).toHaveBeenCalledWith(2);
    fireEvent.click(forward);
    expect(onStepChange).toHaveBeenCalledTimes(1);
  });

  it('mostra no mobile somente a etapa ativa completa e o progresso', () => {
    render(<ServiceOrderFormStepper steps={steps} currentIndex={3} maxReachedIndex={3} onStepChange={() => {}} />);

    expect(screen.getByText('Etapa 4 de 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progresso: etapa 4 de 4' })).toHaveAttribute('aria-valuenow', '4');
    expect(screen.getByText('Revisão', { selector: 'p' })).toBeInTheDocument();
  });
});

describe('ServiceOrderFormSummary', () => {
  it('consolida contexto operacional e expõe os estados importantes na revisão', () => {
    render(
      <ServiceOrderFormSummary
        mode="review"
        data={{
          customerName: 'Cliente Exemplo',
          serviceNames: ['Manutenção preventiva'],
          equipmentCount: 2,
          checklistCount: 3,
          assigneeNames: ['Ana Técnica'],
          teamNames: ['Equipe Norte'],
          scheduleLabel: '03/11/2026 às 09:00',
          scheduleCount: 2,
          budgetItemCount: 4,
          recurrenceLabel: 'Serão criadas 4 OS.',
          description: 'Revisar condensadoras.',
          notes: 'Acesso pela portaria.',
          requireTechSignature: true,
          requireClientSignature: false,
          generateNpsSurvey: true,
        }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Revisão da ordem de serviço' })).toHaveAttribute('data-summary-mode', 'review');
    expect(screen.getByText('Cliente Exemplo')).toBeInTheDocument();
    expect(screen.getByText('Equipe Norte, Ana Técnica')).toBeInTheDocument();
    expect(screen.getByText('Assinatura técnica: obrigatória')).toBeInTheDocument();
    expect(screen.getByText('Pesquisa NPS: ativa')).toBeInTheDocument();
  });
});
