import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventCard } from './EventCard';

const task = {
  id: 'task-1',
  entry_type: 'tarefa',
  task_title: 'Confirmar pagamento em aberto',
  scheduled_date: '2026-11-23',
  scheduled_time: '08:30',
  scheduled_days: 1,
  status: 'agendada',
  service_type: { color: '#8b5cf6' },
  customer: null,
  equipment: null,
};

describe('EventCard de tarefa', () => {
  it('usa superfície neutra adaptada ao tema mesmo quando existe cor de serviço', () => {
    render(<EventCard order={task as any} compact />);

    const card = screen.getByText(task.task_title).closest('div');
    expect(card).toHaveClass('bg-foreground/[0.06]', 'text-foreground/70', 'border-foreground/10');
    expect(card).not.toHaveClass('bg-violet-500/15');
    expect(card).not.toHaveStyle({ backgroundColor: task.service_type.color });
  });

  it('mantém o título neutro no card detalhado', () => {
    render(<EventCard order={task as any} />);

    expect(screen.getByText(task.task_title)).toHaveClass('text-foreground/75');
  });
});
