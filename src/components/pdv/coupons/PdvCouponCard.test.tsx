import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdvCouponCard } from './PdvCouponCard';

describe('PdvCouponCard', () => {
  it('mostra cupom percentual compacto com faixa saturada e regra', () => {
    render(
      <PdvCouponCard
        code="OBRA15"
        kind="percentage"
        value={15}
        ruleSummary="Em compras acima de R$ 300,00"
        expiresOn="2027-02-28"
      />,
    );

    const coupon = screen.getByRole('button', { name: 'Cupom OBRA15, 15% OFF, Disponível' });
    expect(coupon).toHaveAttribute('data-state', 'available');
    expect(coupon).toHaveClass('min-h-24');
    expect(screen.getByText('Percentual')).toHaveClass('bg-violet-600', 'text-white');
    expect(screen.getByText('Em compras acima de R$ 300,00')).toBeInTheDocument();
    expect(screen.getByText('Válido até 28/02/2027')).toBeInTheDocument();
  });

  it('formata cupom de valor fixo sem transformá-lo em saldo', () => {
    render(
      <PdvCouponCard
        code="REFRI50"
        kind="fixed"
        value={50}
        ruleSummary="Uma utilização por cliente"
      />,
    );

    expect(screen.getByRole('button', { name: /Cupom REFRI50, R\$\s*50,00 OFF, Disponível/ })).toBeInTheDocument();
    expect(screen.getByText('Valor fixo')).toHaveClass('bg-blue-600', 'text-white');
    expect(screen.getByText('Sem data de validade')).toBeInTheDocument();
  });

  it('dá identidade própria ao cupom de frete', () => {
    render(
      <PdvCouponCard
        code="ENTREGAZERO"
        kind="shipping"
        ruleSummary="Entrega local em até 20 km"
      />,
    );

    expect(screen.getByRole('button', { name: 'Cupom ENTREGAZERO, Frete grátis, Disponível' })).toBeInTheDocument();
    expect(screen.getByText('Frete')).toHaveClass('bg-emerald-600', 'text-white');
    expect(screen.getByText('Frete grátis')).toBeInTheDocument();
  });

  it('marca a seleção com uma única borda forte, check e aria-pressed', () => {
    const onSelect = vi.fn();
    render(
      <PdvCouponCard
        code="BALCAO10"
        kind="percentage"
        value={10}
        ruleSummary="Válido no balcão"
        selected
        onSelect={onSelect}
      />,
    );

    const coupon = screen.getByRole('button');
    expect(coupon).toHaveAttribute('aria-pressed', 'true');
    expect(coupon).toHaveClass('border-primary', 'bg-primary', 'text-primary-foreground');
    fireEvent.click(coupon);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['expired', 'Vencido'],
    ['inactive', 'Inativo'],
  ] as const)('bloqueia cupom %s e preserva o estado legível', (status, label) => {
    const onSelect = vi.fn();
    render(
      <PdvCouponCard
        code="ANTIGO20"
        kind="percentage"
        value={20}
        status={status}
        ruleSummary="Campanha encerrada"
        expiresOn="2026-01-31"
        onSelect={onSelect}
      />,
    );

    const coupon = screen.getByRole('button', { name: `Cupom ANTIGO20, 20% OFF, ${label}` });
    expect(coupon).toBeDisabled();
    expect(coupon).toHaveAttribute('data-state', status);
    expect(screen.getByText(label)).toBeInTheDocument();
    fireEvent.click(coupon);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
