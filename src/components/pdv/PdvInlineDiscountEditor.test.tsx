import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvInlineDiscountEditor } from '@/components/pdv/PdvInlineDiscountEditor';

const texts = {
  add: 'Aplicar desconto', edit: 'Editar desconto', close: 'Fechar',
  valueMode: 'Valor', percentageMode: 'Percentual',
  valueLabel: 'Valor do desconto', percentageLabel: 'Percentual do desconto',
  invalidNumber: 'Informe um número válido.', percentageLimit: 'O percentual máximo é 100%.',
  valueLimit: 'O desconto não pode ultrapassar {value}.',
  itemTotal: 'Total do item', afterDiscount: 'Após desconto',
  cancel: 'Cancelar', apply: 'Aplicar', remove: 'Remover desconto',
};

const renderEditor = (onApply = vi.fn()) => {
  render(
    <PdvInlineDiscountEditor
      variant="line"
      label="Desconto"
      baseAmount={200}
      discountAmount={0}
      formatCurrency={(value) => `R$ ${value.toFixed(2)}`}
      currencySymbol="R$"
      locale="pt-br"
      currencyFractionDigits={2}
      texts={texts}
      onApply={onApply}
    />,
  );
  return onApply;
};

describe('PdvInlineDiscountEditor', () => {
  it('aplica desconto em valor sem campo permanente na linha', () => {
    const onApply = renderEditor();
    expect(screen.queryByLabelText('Valor do desconto')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar desconto: Desconto' }));
    fireEvent.change(screen.getByLabelText('Valor do desconto'), { target: { value: '12,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(onApply).toHaveBeenCalledWith(12.5);
  });

  it('converte percentual no valor absoluto que o carrinho persiste', () => {
    const onApply = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar desconto: Desconto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Percentual' }));
    fireEvent.change(screen.getByLabelText('Percentual do desconto'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(onApply).toHaveBeenCalledWith(20);
  });
});
