import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvInlineValueEditor } from '@/components/pdv/PdvInlineValueEditor';

const formatCurrency = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

const renderEditor = (
  onApply = vi.fn(),
  props: Partial<ComponentProps<typeof PdvInlineValueEditor>> = {},
) => {
  render(
    <PdvInlineValueEditor
      label="valor de Café"
      value={120}
      baseAmount={120}
      formatCurrency={formatCurrency}
      onApply={onApply}
      {...props}
    />,
  );
  return onApply;
};

describe('PdvInlineValueEditor', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('troca somente o preço deste pedido por padrão', () => {
    const onApply = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });

    expect(screen.getByText('Redução de R$ 30,00 (25%)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preço neste pedido' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar edição de valor de Café' }));

    expect(onApply).toHaveBeenCalledWith(90, 'price');
  });

  it('permite registrar a diferença como desconto visível', () => {
    const onApply = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exibir desconto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar edição de valor de Café' }));

    expect(onApply).toHaveBeenCalledWith(90, 'discount');
  });

  it('explica a diferença entre preço da operação e desconto visível', async () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    fireEvent.focus(screen.getByRole('button', { name: 'Entender como a diferença será registrada' }));

    expect((await screen.findAllByText(/Preço neste pedido altera somente o preço deste item/)).length).toBeGreaterThan(0);
  });

  it('abre a explicação no fluxo compacto sem sobrepor o editor', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar ajuda sobre como a diferença será registrada' }));

    expect(screen.getByRole('note')).toHaveTextContent('Exibir desconto mantém o preço original');
  });

  it('registra a edição do total somente como desconto visível', () => {
    const onApply = vi.fn();
    renderEditor(onApply, { label: 'Total', adjustmentPolicy: 'discount' });

    fireEvent.click(screen.getByRole('button', { name: 'Editar Total' }));
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '9000' } });

    expect(screen.getByText('Desconto de R$ 30,00 (25%)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preço neste pedido' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exibir desconto' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar edição de Total' }));
    expect(onApply).toHaveBeenCalledWith(90, 'discount');
  });

  it('orienta a ajustar os itens quando tentam aumentar o total', () => {
    const onApply = vi.fn();
    renderEditor(onApply, { label: 'Total', adjustmentPolicy: 'discount' });

    fireEvent.click(screen.getByRole('button', { name: 'Editar Total' }));
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '13000' } });

    expect(screen.getByText('Para aumentar o total, ajuste o valor dos itens.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar edição de Total' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('reabre com a última opção confirmada no mesmo usuário e empresa', () => {
    const preferenceKey = 'pdv:value-adjustment-mode:company-1:user-1';
    const firstApply = vi.fn();
    const firstView = render(
      <PdvInlineValueEditor
        label="valor de Café"
        value={120}
        baseAmount={120}
        formatCurrency={formatCurrency}
        onApply={firstApply}
        modePreferenceKey={preferenceKey}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exibir desconto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar edição de valor de Café' }));

    expect(firstApply).toHaveBeenCalledWith(90, 'discount');
    expect(window.localStorage.getItem(preferenceKey)).toBe('discount');
    firstView.unmount();

    render(
      <PdvInlineValueEditor
        label="valor de Serviço"
        value={200}
        baseAmount={200}
        formatCurrency={formatCurrency}
        onApply={vi.fn()}
        modePreferenceKey={preferenceKey}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Serviço' }));
    fireEvent.change(screen.getByLabelText('valor de Serviço'), { target: { value: '15000' } });

    expect(screen.getByRole('button', { name: 'Exibir desconto' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Preço neste pedido' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('cancela a edição sem alterar o valor', () => {
    const onApply = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edição de valor de Café' }));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Editar valor de Café' })).toHaveTextContent('R$ 120,00');
  });
});
