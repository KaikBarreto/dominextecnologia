import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalculoCapacitor } from './CalculoCapacitor';
import { CargaTermica } from './CargaTermica';

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/hooks/usePersistedState', async () => {
  const React = await import('react');
  return { usePersistedState: (_key: string, initial: unknown) => React.useState(initial) };
});
afterEach(cleanup);

describe('referências elétricas e térmicas na interface', () => {
  it('não recomenda capacitor a partir de BTU ou LRA sem especificação do modelo', () => {
    render(<CalculoCapacitor />);
    expect(screen.getByText('Confira a especificação do modelo')).toBeInTheDocument();
    expect(screen.getByText(/BTU\/h e LRA não determinam o capacitor/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('não apresenta o maior contator da lista como adequado para corrente acima dela', () => {
    render(<CalculoCapacitor />);
    fireEvent.click(screen.getByRole('button', { name: 'Trifásico' }));
    fireEvent.change(screen.getByLabelText(/Corrente nominal \(A\)/), { target: { value: '100' } });
    expect(screen.queryByText('95 A')).not.toBeInTheDocument();
    expect(screen.getAllByText(/acima da linha comercial/i).length).toBeGreaterThan(0);
  });

  it('impede aplicar ao contrato uma carga com dimensões negativas, mesmo se a área seria positiva', () => {
    const onApply = vi.fn();
    render(<CargaTermica onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Largura (metros)'), { target: { value: '-4' } });
    fireEvent.change(screen.getByLabelText('Comprimento (metros)'), { target: { value: '-5' } });
    expect(screen.getByRole('button', { name: 'Usar resultado' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('calcula valores com vírgula e aplica em TR sem depender da unidade exibida', () => {
    const onApply = vi.fn();
    render(<CargaTermica onApply={onApply} />);
    fireEvent.change(screen.getByLabelText('Altura (metros)'), { target: { value: '2,8' } });
    fireEvent.change(screen.getByLabelText('Largura (metros)'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Comprimento (metros)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar resultado' }));
    expect(onApply).toHaveBeenCalledWith('1');
  });
});
