import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BDICompositionPreview } from './BDICompositionPreview';

const money = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

describe('BDICompositionPreview', () => {
  it('expõe a composição completa e explica o coeficiente como 1 menos as taxas', () => {
    render(
      <BDICompositionPreview
        totalCost={680}
        finalPrice={1000}
        bdiFactor={0.68}
        taxRate={10}
        adminRate={12}
        profitRate={10}
        formatMoney={money}
        formatRate={(value) => String(value).replace('.', ',')}
        labels={{
          cost: 'Custo total',
          tax: 'Imposto',
          admin: 'Administração indireta',
          profit: 'Lucro',
          finalPrice: 'Preço final',
          factor: 'Coeficiente BDI',
          factorFormation: 'Método BDI',
          priceFormula: 'Preço = Custo total ÷ BDI',
        }}
      />,
    );

    expect(screen.getByText('R$ 1000,00')).toBeInTheDocument();
    expect(screen.getByText('BDI = 1 − (10% + 12% + 10%)')).toBeInTheDocument();
    expect(screen.getByText('BDI = 0.6800')).toBeInTheDocument();
    expect(screen.getByText('R$ 680,00 ÷ 0.6800 = R$ 1000,00')).toBeInTheDocument();

    const cost = screen.getByTestId('bdi-layer-cost');
    expect(within(cost).getByText('Custo total')).toBeInTheDocument();
    expect(within(cost).getByText('68%')).toBeInTheDocument();
    expect(within(cost).getByText('R$ 680,00')).toBeInTheDocument();

    const profit = screen.getByTestId('bdi-layer-profit');
    expect(within(profit).getByText('Lucro')).toBeInTheDocument();
    expect(within(profit).getByText('R$ 100,00')).toBeInTheDocument();
  });

  it.each(['inline', 'compact'] as const)('mantém a mesma composição na variação %s', (variant) => {
    render(
      <BDICompositionPreview
        variant={variant}
        totalCost={680}
        finalPrice={1000}
        bdiFactor={0.68}
        taxRate={10}
        adminRate={12}
        profitRate={10}
        formatMoney={money}
        formatRate={(value) => String(value).replace('.', ',')}
        labels={{
          composition: 'Composição do preço sugerido',
          cost: 'Custo total',
          tax: 'Imposto',
          admin: 'Administração indireta',
          profit: 'Lucro',
          finalPrice: 'Preço final',
          factor: 'Coeficiente BDI',
          factorFormation: 'Método BDI',
          priceFormula: 'Preço = Custo total ÷ BDI',
        }}
      />,
    );

    expect(screen.getByText('Composição do preço sugerido')).toBeInTheDocument();
    expect(screen.getByTestId('bdi-strip-cost')).toHaveTextContent('68%');
    expect(screen.getByTestId('bdi-strip-tax')).toHaveTextContent('10%');
    expect(screen.getByText('R$ 1000,00')).toBeInTheDocument();
  });
});
