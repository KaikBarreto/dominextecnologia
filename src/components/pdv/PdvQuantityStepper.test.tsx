import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvQuantityStepper } from '@/components/pdv/PdvQuantityStepper';

function renderStepper(quantity = 19, step = 1) {
  const onIncrement = vi.fn();
  const onSetQuantity = vi.fn();
  const onConfirmEdit = vi.fn();

  render(
    <PdvQuantityStepper
      quantity={quantity}
      availableQuantity={100}
      onIncrement={onIncrement}
      step={step}
      onSetQuantity={onSetQuantity}
      onConfirmEdit={onConfirmEdit}
      decrementAriaLabel="Diminuir"
      incrementAriaLabel="Aumentar"
      editAriaLabel="Editar quantidade"
    />,
  );

  return { onIncrement, onSetQuantity, onConfirmEdit };
}

describe('PdvQuantityStepper', () => {
  it('preserva todos os dígitos de uma quantidade grande ao editar e confirmar', () => {
    const { onSetQuantity } = renderStepper(12345.678);
    fireEvent.click(screen.getByRole('button', { name: 'Editar quantidade' }));
    const input = screen.getByRole('textbox', { name: 'Editar quantidade' });
    expect(input).toHaveValue('12345,678');
    fireEvent.change(input, { target: { value: '98765,432' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSetQuantity).toHaveBeenCalledWith(98765.432);
  });

  it('cancela a edição de uma quantidade grande com Escape', () => {
    const { onSetQuantity, onConfirmEdit } = renderStepper(12345.678);
    fireEvent.click(screen.getByRole('button', { name: 'Editar quantidade' }));
    const input = screen.getByRole('textbox', { name: 'Editar quantidade' });
    fireEvent.change(input, { target: { value: '98765,432' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Editar quantidade' })).toHaveTextContent('12345,678');
    expect(onSetQuantity).not.toHaveBeenCalled();
    expect(onConfirmEdit).not.toHaveBeenCalled();
  });

  it('confirma quantidade grande ao sair do campo sem redirecionar o foco', () => {
    const { onSetQuantity, onConfirmEdit } = renderStepper();
    fireEvent.click(screen.getByRole('button', { name: 'Editar quantidade' }));
    const input = screen.getByRole('textbox', { name: 'Editar quantidade' });
    fireEvent.change(input, { target: { value: '98765,432' } });
    fireEvent.blur(input);
    expect(onSetQuantity).toHaveBeenCalledWith(98765.432);
    expect(onConfirmEdit).not.toHaveBeenCalled();
  });

  it('aceita vírgula e confirma a quantidade fracionada sem truncar', () => {
    const { onSetQuantity, onConfirmEdit } = renderStepper();

    fireEvent.click(screen.getByRole('button', { name: 'Editar quantidade' }));
    const input = screen.getByRole('textbox', { name: 'Editar quantidade' });
    fireEvent.change(input, { target: { value: '13,6' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSetQuantity).toHaveBeenCalledWith(13.6);
    expect(onConfirmEdit).toHaveBeenCalledTimes(1);
  });

  it('exibe quantidade fracionada com vírgula ao editar', () => {
    renderStepper(0.75);
    fireEvent.click(screen.getByRole('button', { name: 'Editar quantidade' }));

    expect(screen.getByRole('textbox', { name: 'Editar quantidade' })).toHaveValue('0,75');
  });

  it('limita a edição a três casas decimais', () => {
    const { onSetQuantity } = renderStepper();
    fireEvent.click(screen.getByRole('button', { name: 'Editar quantidade' }));
    const input = screen.getByRole('textbox', { name: 'Editar quantidade' });
    fireEvent.change(input, { target: { value: '1,2345' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSetQuantity).toHaveBeenCalledWith(1.234);
  });

  it('usa o passo configurado nos botões', () => {
    const { onIncrement } = renderStepper(1.2, 0.1);

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir' }));

    expect(onIncrement).toHaveBeenNthCalledWith(1, 0.1);
    expect(onIncrement).toHaveBeenNthCalledWith(2, -0.1);
  });
});
