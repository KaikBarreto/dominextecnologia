import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DreComparisonDialog } from './DreComparisonDialog';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));

const october2026 = {
  from: new Date(2026, 9, 1),
  to: new Date(2026, 9, 31),
};

describe('DreComparisonDialog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('oferece atalhos claros, mostra a prévia cronológica e aplica a comparação escolhida', () => {
    const onApply = vi.fn();

    render(
      <DreComparisonDialog
        open
        onOpenChange={() => undefined}
        currentRange={october2026}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mesmo período no ano passado/i }));

    expect(screen.getAllByText('Comparação principal')).toHaveLength(2);
    expect(screen.getAllByText('Outubro de 2025').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Outubro de 2026').length).toBeGreaterThan(0);
    expect(screen.getByText(/Outubro de 2026 − Outubro de 2025/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar comparação' }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toEqual(october2026);
    expect(onApply.mock.calls[0][1]).toEqual([{
      from: new Date(2025, 9, 1),
      to: new Date(2025, 9, 31),
    }]);
  });

  it('permite remover todas as comparações sem perder o período principal', () => {
    const onApply = vi.fn();

    render(
      <DreComparisonDialog
        open
        onOpenChange={() => undefined}
        currentRange={october2026}
        value={[{ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }]}
        onApply={onApply}
      />,
    );

    expect(screen.getByRole('button', { name: /Período anterior/i })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Remover comparações' }));

    expect(onApply).toHaveBeenCalledWith(october2026, undefined);
  });

  it('oferece os mesmos atalhos no período principal e no outro período', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T15:00:00.000Z'));

    render(
      <DreComparisonDialog
        open
        onOpenChange={() => undefined}
        currentRange={october2026}
        onApply={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Alterar período' }));
    expect(screen.getAllByRole('button', { name: 'Este mês' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Outro período/i }));
    expect(screen.getAllByRole('button', { name: 'Este mês' })).toHaveLength(2);
    expect(screen.getAllByText('Atalhos de período')).toHaveLength(2);
  });
});
