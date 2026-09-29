import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CrmTaskAgendaView, CrmTaskKanbanBoard, type CrmOpportunityTask } from './CrmTaskViews';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const tasks: CrmOpportunityTask[] = [
  { id: '1', task_title: 'Retornar orçamento', status: 'pendente', scheduled_date: '2026-09-29', lead_id: 'lead-1' },
  { id: '2', task_title: 'Aguardar documentos', status: 'cancelada', scheduled_date: null, lead_id: 'lead-1' },
  { id: '3', task_title: 'Contrato assinado', status: 'concluida', scheduled_date: '2026-09-30', lead_id: 'lead-1' },
];

const commonProps = {
  tasks,
  leadTitleMap: new Map([['lead-1', 'Climatização Alfa']]),
  profileMap: new Map(),
  onOpen: vi.fn(),
  onStatusChange: vi.fn(),
};

describe('visualizações de tarefas do CRM', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('organiza o Kanban com Concluído como última coluna e preserva status legados', () => {
    render(<CrmTaskKanbanBoard {...commonProps} />);

    const headings = ['A FAZER', 'EM ANDAMENTO', 'PAUSADO', 'CONCLUÍDO'];
    headings.forEach(title => expect(screen.getByText(title)).toBeInTheDocument());
    expect(screen.getByText('Aguardar documentos')).toBeInTheDocument();
    expect(screen.getByText('Contrato assinado')).toBeInTheDocument();
  });

  it('oferece calendário com mês, semana, dia e bandeja para tarefas sem data', () => {
    render(<CrmTaskAgendaView {...commonProps} />);

    expect(screen.getByRole('tab', { name: 'Mês' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Semana' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dia' })).toBeInTheDocument();
    expect(screen.getByText('Sem data')).toBeInTheDocument();
  });
});
