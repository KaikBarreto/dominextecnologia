import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '@/hooks/useInventory';
import { MaterialBatchPicker } from './MaterialBatchPicker';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL' }),
}));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ children, footer, open }: { children: ReactNode; footer: ReactNode; open: boolean }) => open ? <section>{children}{footer}</section> : null,
}));
vi.mock('@/hooks/useSignedUrl', () => ({ resolveStorageUrl: async (url: string) => url }));

const material = {
  id: 'material-1', name: 'Tubo de cobre flexível', image_url: '/material-cobre.jpg',
  sku: 'COBRE-01', category: 'Tubulações', unit: 'm', cost_price: 12, sale_price: 20,
} as InventoryItem;

function setup(items = [material]) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(<MaterialBatchPicker open items={items} onConfirm={onConfirm} onOpenChange={onOpenChange} />);
  return { onConfirm, onOpenChange };
}

describe('MaterialBatchPicker', () => {
  it('mostra foto do catálogo sem recortar o produto e usa fallback quando a imagem falha', async () => {
    setup();
    const image = await screen.findByAltText(`Foto de ${material.name}`);
    expect(image.getAttribute('src')).toBe('/material-cobre.jpg');
    expect(image.className).toContain('object-contain');
    fireEvent.error(image);
    expect(screen.queryByAltText(`Foto de ${material.name}`)).toBeNull();
  });

  it('preserva a vírgula durante a quantidade do catálogo e confirma custo/preço separados', () => {
    const { onConfirm, onOpenChange } = setup([{ ...material, image_url: null }]);
    const quantity = screen.getByLabelText(`Quantidade de ${material.name}`) as HTMLInputElement;
    fireEvent.change(quantity, { target: { value: '2,' } });
    expect(quantity.value).toBe('2,');
    fireEvent.change(quantity, { target: { value: '2,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao orçamento' }));
    expect(onConfirm).toHaveBeenCalledWith([{ inventoryId: material.id, manualName: null, quantity: 2.5, unitCost: 12, unitPrice: 20 }]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('mantém um material avulso na seleção após outra busca e preserva a quantidade decimal intermediária', () => {
    const { onConfirm } = setup([{ ...material, image_url: null }]);
    const search = screen.getByPlaceholderText('Buscar por nome, código ou categoria...');
    fireEvent.change(search, { target: { value: 'Isolamento especial' } });
    const quantity = screen.getByLabelText('Quantidade de Isolamento especial') as HTMLInputElement;
    fireEvent.change(quantity, { target: { value: '2,' } });
    expect(quantity.value).toBe('2,');
    fireEvent.change(quantity, { target: { value: '2,5' } });
    fireEvent.change(screen.getByLabelText('Custo unit. de Isolamento especial'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Preço unitário de Isolamento especial'), { target: { value: '11' } });
    fireEvent.change(search, { target: { value: 'cobre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao orçamento' }));
    expect(onConfirm).toHaveBeenCalledWith([{ inventoryId: null, manualName: 'Isolamento especial', quantity: 2.5, unitCost: 7, unitPrice: 11 }]);
  });
});
