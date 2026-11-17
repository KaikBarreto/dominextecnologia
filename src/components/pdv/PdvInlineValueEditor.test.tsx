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
  beforeEach(() => window.localStorage.clear());

  it('exibe o desconto ao cliente por padrão', () => {
    const onApply = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    expect(screen.getByText('Redução de R$ 30,00 (25%)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exibir desconto' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar edição de valor de Café' }));
    expect(onApply).toHaveBeenCalledWith(90, 'discount');
  });

  it('permite registrar a diferença como preço deste pedido', () => {
    const onApply = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preço neste pedido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar edição de valor de Café' }));
    expect(onApply).toHaveBeenCalledWith(90, 'price');
  });

  it('explica a diferença no desktop e no fluxo compacto', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    fireEvent.focus(screen.getByRole('button', { name: 'Entender como a diferença será registrada' }));
    expect((await screen.findAllByText(/Preço neste pedido altera somente o preço deste item/)).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar ajuda sobre como a diferença será registrada' }));
    expect(screen.getByRole('note')).toHaveTextContent('Exibir desconto mantém o preço original');
  });

  it('registra a edição do total somente como desconto visível e bloqueia aumento', () => {
    const onApply = vi.fn();
    renderEditor(onApply, { label: 'Total', adjustmentPolicy: 'discount' });
    fireEvent.click(screen.getByRole('button', { name: 'Editar Total' }));
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '9000' } });
    expect(screen.getByText('Desconto de R$ 30,00 (25%)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar edição de Total' }));
    expect(onApply).toHaveBeenCalledWith(90, 'discount');

    fireEvent.click(screen.getByRole('button', { name: 'Editar Total' }));
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '13000' } });
    expect(screen.getByText('Para aumentar o total, ajuste o valor dos itens.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar edição de Total' })).toBeDisabled();
  });

  it('reabre com a última opção confirmada no mesmo usuário e empresa', () => {
    const preferenceKey = 'pdv:value-adjustment-mode:company-1:user-1';
    const firstView = render(
      <PdvInlineValueEditor label="valor de Café" value={120} baseAmount={120} formatCurrency={formatCurrency} onApply={vi.fn()} modePreferenceKey={preferenceKey} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preço neste pedido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar edição de valor de Café' }));
    expect(window.localStorage.getItem(preferenceKey)).toBe('price');
    firstView.unmount();

    render(<PdvInlineValueEditor label="valor de Serviço" value={200} baseAmount={200} formatCurrency={formatCurrency} onApply={vi.fn()} modePreferenceKey={preferenceKey} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Serviço' }));
    fireEvent.change(screen.getByLabelText('valor de Serviço'), { target: { value: '15000' } });
    expect(screen.getByRole('button', { name: 'Preço neste pedido' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('cancela sem alterar o valor nem salvar preferência', () => {
    const key = 'pdv:value-adjustment-mode:cancel';
    const onApply = renderEditor(undefined, { modePreferenceKey: key });
    fireEvent.click(screen.getByRole('button', { name: 'Editar valor de Café' }));
    fireEvent.change(screen.getByLabelText('valor de Café'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preço neste pedido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edição de valor de Café' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(screen.getByRole('button', { name: 'Editar valor de Café' })).toHaveTextContent('R$ 120,00');
  });
});
