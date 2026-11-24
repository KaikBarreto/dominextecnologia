import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvCouponPicker, type PdvCouponOption } from './PdvCouponPicker';

const coupons: PdvCouponOption[] = [
  { id: 'c1', code: 'OBRA15', name: 'Cliente da obra', kind: 'percentage', value: 15, ruleSummary: 'Acima de R$ 300,00', expiresOn: '2027-02-28' },
  { id: 'c2', code: 'REFRI50', name: 'Semana da refrigeração', kind: 'fixed', value: 50, ruleSummary: 'Uma utilização', expiresOn: null },
  { id: 'c3', code: 'ENTREGAZERO', name: 'Entrega local', kind: 'shipping', ruleSummary: 'Até 20 km', status: 'inactive', expiresOn: null },
];

describe('PdvCouponPicker', () => {
  it('lista cupons em itens compactos e pesquisáveis', () => {
    render(<PdvCouponPicker coupons={coupons} onSelect={() => {}} />);

    expect(screen.getByRole('searchbox', { name: 'Buscar cupom' })).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByRole('radiogroup', { name: 'Cupons disponíveis' })).toBeInTheDocument();
    const items = screen.getAllByRole('radio');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveClass('min-h-20');
    expect(screen.getByText('3 cupons')).toBeInTheDocument();
  });

  it('busca por código sem diferenciar maiúsculas', () => {
    render(<PdvCouponPicker coupons={coupons} onSelect={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'refri50' } });

    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByText('REFRI50')).toBeInTheDocument();
    expect(screen.queryByText('OBRA15')).not.toBeInTheDocument();
    expect(screen.getByText('1 cupom')).toBeInTheDocument();
  });

  it('busca por nome ignorando acentos', () => {
    render(<PdvCouponPicker coupons={coupons} onSelect={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'refrigeracao' } });

    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByText('REFRI50')).toBeInTheDocument();
  });

  it('mostra ausência de resultado e permite limpar a busca', () => {
    render(<PdvCouponPicker coupons={coupons} onSelect={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'inexistente' } });

    expect(screen.getByRole('status')).toHaveTextContent('Nenhum cupom encontrado');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('informa o cupom selecionado e devolve o objeto pelo callback', () => {
    const onSelect = vi.fn();
    render(<PdvCouponPicker coupons={coupons} selectedId="c1" onSelect={onSelect} />);

    const selected = screen.getByRole('radio', { name: /Cupom OBRA15/ });
    expect(selected).toHaveAttribute('aria-checked', 'true');
    const next = screen.getByRole('radio', { name: /Cupom REFRI50/ });
    expect(next).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(next);
    expect(onSelect).toHaveBeenCalledWith(coupons[1]);
  });

  it('mantém cupom inativo visível, porém não selecionável', () => {
    const onSelect = vi.fn();
    render(<PdvCouponPicker coupons={coupons} onSelect={onSelect} />);

    const inactive = screen.getByRole('radio', { name: /Cupom ENTREGAZERO/ });
    expect(inactive).toBeDisabled();
    fireEvent.click(inactive);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('mostra estado vazio quando não há cupons aplicáveis', () => {
    render(<PdvCouponPicker coupons={[]} onSelect={() => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nenhum cupom disponível');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });
});
