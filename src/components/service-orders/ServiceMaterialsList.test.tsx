import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  updateMutate: vi.fn(),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL' }),
}));

vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({
    items: [
      { id: 'inventory-a', name: 'Abraçadeira', sku: 'ABR', unit: 'kg', cost_price: 10 },
      { id: 'inventory-b', name: 'Tubo', sku: 'TUB', unit: 'un', cost_price: 15 },
    ],
  }),
}));

vi.mock('@/hooks/useServiceMaterials', () => ({
  useServiceMaterials: () => ({
    materials: [
      {
        id: 'material-b', item_name: 'Tubo', unit: 'un', quantity: 1,
        purchase_price: 20, subtotal: 20, stock_item_id: 'inventory-b',
      },
      {
        id: 'material-a', item_name: 'Abraçadeira', unit: 'kg', quantity: 2,
        purchase_price: 10, subtotal: 20, stock_item_id: 'inventory-a',
      },
    ],
    isLoading: false,
    error: null,
    totalCost: 40,
    createMaterial: { mutateAsync: vi.fn(), isPending: false },
    updateMaterial: { mutate: testState.updateMutate, isPending: false },
    deleteMaterial: { mutate: vi.fn(), isPending: false },
  }),
}));

import { ServiceMaterialsList } from './ServiceMaterialsList';

function bodyMaterialNames() {
  const rows = Array.from(document.querySelectorAll('tbody tr'));
  return rows.map((row) => row.querySelector('td')?.textContent ?? '');
}

describe('ServiceMaterialsList', () => {
  beforeEach(() => testState.updateMutate.mockReset());

  it('ordena pelos cabeçalhos e expõe o estado de ordenação', () => {
    render(<ServiceMaterialsList serviceId="service-1" bdiFactor={0.8} />);

    expect(bodyMaterialNames()[0]).toContain('Abraçadeira');

    const costSort = screen.getByRole('button', { name: /Ordenar por Seu custo unit/i });
    fireEvent.click(costSort);
    expect(costSort.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    expect(bodyMaterialNames()[0]).toContain('Abraçadeira');

    fireEvent.click(costSort);
    expect(costSort.closest('th')).toHaveAttribute('aria-sort', 'descending');
    expect(bodyMaterialNames()[0]).toContain('Tubo');
  });

  it('preserva vírgula e só salva quantidade e custo no blur/Enter', () => {
    render(<ServiceMaterialsList serviceId="service-1" bdiFactor={0.8} />);

    const quantity = screen.getByRole('textbox', { name: /Quantidade de Abraçadeira/i });
    fireEvent.change(quantity, { target: { value: '2,5' } });
    expect(quantity).toHaveValue('2,5');
    expect(testState.updateMutate).not.toHaveBeenCalled();

    fireEvent.blur(quantity);
    expect(testState.updateMutate).toHaveBeenCalledWith(
      { id: 'material-a', quantity: 2.5 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    testState.updateMutate.mockClear();
    const cost = screen.getByRole('textbox', { name: /Custo unitário de Abraçadeira/i });
    fireEvent.focus(cost);
    fireEvent.change(cost, { target: { value: '12,5' } });
    expect(cost).toHaveValue('12,5');
    expect(testState.updateMutate).not.toHaveBeenCalled();

    fireEvent.keyDown(cost, { key: 'Enter' });
    expect(testState.updateMutate).toHaveBeenCalledWith(
      { id: 'material-a', purchase_price: 12.5 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('mostra unidade, valor com BDI e permite restaurar um override', () => {
    render(<ServiceMaterialsList serviceId="service-1" bdiFactor={0.8} />);

    expect(screen.getByText('Custo de compra sobrescrito')).toBeInTheDocument();
    expect(screen.getByText('Override manual')).toBeInTheDocument();
    expect(screen.getByText('Cliente paga com BDI')).toBeInTheDocument();
    expect(screen.getAllByText(/Quilograma/).length).toBeGreaterThan(0);

    const tubeRow = screen.getByText('Tubo').closest('tr');
    expect(tubeRow).not.toBeNull();
    expect(within(tubeRow!).getAllByText(/25,00/)).toHaveLength(2);
    expect(within(tubeRow!).getAllByText(/Unidade/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Restaurar custo de compra de Tubo/i }));
    expect(testState.updateMutate).toHaveBeenCalledWith({ id: 'material-b', purchase_price: 15 });
  });
});
