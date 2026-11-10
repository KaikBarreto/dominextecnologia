import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StockLocationNavigator } from './StockLocationNavigator';

const labels = {
  title: 'Locais de estoque',
  available: (count: number) => `${count} locais disponíveis`,
  consolidated: 'Visão consolidada',
  items: (count: number) => `${count} itens`,
  lowStock: (count: number) => `${count} baixos`,
  configure: 'Configurar local',
};

describe('StockLocationNavigator', () => {
  it('organiza geral e locais em uma lista contextual com indicadores', () => {
    render(
      <StockLocationNavigator
        generalId="general"
        generalLabel="Estoque geral"
        generalItemCount={12}
        generalLowStockCount={2}
        selectedId="loja"
        labels={labels}
        items={[
          {
            id: 'loja',
            name: 'Loja principal',
            groupLabel: 'Loja',
            purpose: 'pdv',
            isDefault: true,
            itemCount: 8,
            lowStockCount: 1,
          },
          {
            id: 'van',
            name: 'Van técnica 01',
            groupLabel: 'Operacional',
            purpose: 'operacional',
            isDefault: false,
            itemCount: 4,
            lowStockCount: 0,
          },
        ]}
        onSelect={() => {}}
        onConfigure={() => {}}
      />,
    );

    expect(screen.getByRole('complementary', { name: 'Locais de estoque' })).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Loja principal/i }).find((button) => button.getAttribute('aria-current') === 'page'),
    ).toBeDefined();
    expect(screen.getByText('Visão consolidada')).toBeInTheDocument();
    expect(screen.getByText('Operacional')).toBeInTheDocument();
    expect(screen.getAllByText(/baixos?/i)).toHaveLength(2);
  });

  it('separa a seleção do local da ação de configuração', () => {
    const onSelect = vi.fn();
    const onConfigure = vi.fn();
    render(
      <StockLocationNavigator
        generalId="general"
        generalLabel="Estoque geral"
        generalItemCount={0}
        generalLowStockCount={0}
        selectedId="general"
        labels={labels}
        items={[
          {
            id: 'galpao',
            name: 'Galpão central',
            groupLabel: null,
            purpose: 'operacional',
            isDefault: false,
            itemCount: 3,
            lowStockCount: 0,
          },
        ]}
        onSelect={onSelect}
        onConfigure={onConfigure}
      />,
    );

    const locationButton = screen
      .getAllByRole('button', { name: /Galpão central/i })
      .find((button) => !button.hasAttribute('aria-label'));
    expect(locationButton).toBeDefined();
    fireEvent.click(locationButton!);
    expect(onSelect).toHaveBeenCalledWith('galpao');

    fireEvent.click(screen.getByRole('button', { name: 'Configurar local: Galpão central' }));
    expect(onConfigure).toHaveBeenCalledWith('galpao');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
