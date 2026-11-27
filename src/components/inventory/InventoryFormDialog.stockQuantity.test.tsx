import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  loaded: true,
  update: vi.fn().mockResolvedValue({}),
  presence: vi.fn().mockResolvedValue(undefined),
  stocks: [{ id: 'secondary', name: 'Juruti', is_default: false }],
}));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useSuppliers', () => ({ useSuppliers: () => ({ suppliers: [] }) }));
vi.mock('@/hooks/useMaterialGroups', () => ({ useMaterialGroups: () => ({ groups: [], createGroup: {} }) }));
vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({ hasModule: () => false, isLoading: false }) }));
vi.mock('@/hooks/useStocks', () => ({ useStocks: () => ({ stocks: state.stocks, isLoading: false }) }));
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({
  createItem: {}, updateItem: { mutateAsync: state.update }, stockLevelsLoaded: state.loaded,
  getQuantityForStock: (_: string, stockId: string) => stockId === 'secondary' ? 6 : 3, getMinQuantityForStock: () => null, getPresenceForStock: () => true,
  updateStockLevelMinQuantity: {}, setInventoryPresence: { mutateAsync: state.presence },
}) }));
vi.mock('@/hooks/useBarcodeScanner', () => ({ useBarcodeScanner: () => ({}) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({ open, children, footer }: { open: boolean; children: ReactNode; footer: ReactNode }) => open ? <div>{children}{footer}</div> : null }));
vi.mock('@/components/financial/SupplierSelectField', () => ({ SupplierSelectField: () => null }));
vi.mock('@/components/inventory/identifiers/InventoryIdentifierCameraScanner', () => ({ InventoryIdentifierCameraScanner: () => null }));
vi.mock('@/components/inventory/identifiers/InventoryIdentifierManager', () => ({ InventoryIdentifierManager: () => null }));
import { InventoryFormDialog } from './InventoryFormDialog';
import type { InventoryItem } from '@/hooks/useInventory';

const item = { id: 'item', name: 'Produto fictício', quantity: 19, unit: 'un', sale_price: 10, cost_price: 5 } as InventoryItem;
function stockTab() {
  fireEvent.mouseDown(screen.getByRole('tab', { name: /Estoque e preços/ }), { button: 0, ctrlKey: false });
}
beforeEach(() => {
  vi.clearAllMocks(); state.loaded = true;
  state.stocks = [{ id: 'secondary', name: 'Juruti', is_default: false }];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
function chooseStock(name: string) {
  const select = screen.getByRole('combobox', { name: 'Local para alterar a quantidade' });
  act(() => select.focus());
  fireEvent.keyDown(select, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name }));
}
describe('quantidade do formulário por local', () => {
  it('hidrata o saldo do local secundário e não gera movimento ao salvar só cadastro/preço', async () => {
    render(<InventoryFormDialog open onOpenChange={vi.fn()} item={item} activeStockId="secondary" />);
    stockTab();
    expect(await screen.findByLabelText('Quantidade')).toHaveValue('6');
    fireEvent.change(screen.getByLabelText('Preço de Venda (R$)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    const payload = state.update.mock.calls[0][0];
    expect(payload).not.toHaveProperty('quantity');
    expect(payload).not.toHaveProperty('previousQuantity');
    expect(state.presence).not.toHaveBeenCalled();
  });
  it('envia somente a edição explícita de quantidade contra a base local', async () => {
    render(<InventoryFormDialog open onOpenChange={vi.fn()} item={item} activeStockId="secondary" />);
    stockTab();
    fireEvent.change(await screen.findByLabelText('Quantidade'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ quantity: 8, previousQuantity: 6, activeStockId: 'secondary' })));
  });
  it('edita cadastro na visão geral sem liberar ajuste do agregado', async () => {
    render(<InventoryFormDialog open onOpenChange={vi.fn()} item={item} activeStockId={null} />);
    stockTab();
    expect(await screen.findByLabelText('Quantidade')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    expect(state.update.mock.calls[0][0]).not.toHaveProperty('quantity');
  });
  it.each(['8', '3', '0', '7,5'])('escolhe explicitamente o único local na visão geral e informa quantidade final %s', async (value) => {
    render(<InventoryFormDialog open onOpenChange={vi.fn()} item={item} activeStockId={null} />);
    stockTab();
    expect(screen.getByLabelText('Quantidade')).toBeDisabled();
    chooseStock('Juruti');
    expect(screen.getByLabelText('Quantidade')).toBeEnabled();
    expect(screen.getByLabelText('Quantidade')).toHaveValue('6');
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith(expect.objectContaining({
      quantity: Number(value.replace(',', '.')), previousQuantity: 6, activeStockId: 'secondary',
    })));
  });
  it('selecionar local sem mudar quantidade preserva o saldo e permite editar preço', async () => {
    render(<InventoryFormDialog open onOpenChange={vi.fn()} item={item} />);
    stockTab();
    chooseStock('Juruti');
    fireEvent.change(screen.getByLabelText('Preço de Venda (R$)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(state.update).toHaveBeenCalled());
    expect(state.update.mock.calls[0][0]).toMatchObject({ sale_price: 25 });
    expect(state.update.mock.calls[0][0]).not.toHaveProperty('quantity');
  });
  it('troca o local sem usar saldo nem alteração digitada do local anterior', async () => {
    state.stocks.push({ id: 'other', name: 'Van técnica', is_default: false });
    render(<InventoryFormDialog open onOpenChange={vi.fn()} item={item} />);
    stockTab();
    chooseStock('Juruti');
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '10' } });
    chooseStock('Van técnica');
    expect(screen.getByLabelText('Quantidade')).toHaveValue('3');
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(state.update).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 4, previousQuantity: 3, activeStockId: 'other',
    })));
  });
  it('limita a seleção aos locais do contexto e limpa a escolha ao reabrir', () => {
    state.stocks.push({ id: 'other', name: 'Van técnica', is_default: false });
    const props = { onOpenChange: vi.fn(), item, quantityStockIds: ['secondary'] };
    const app = render(<InventoryFormDialog open {...props} />);
    stockTab();
    const select = screen.getByRole('combobox', { name: 'Local para alterar a quantidade' });
    act(() => select.focus()); fireEvent.keyDown(select, { key: 'Enter' });
    expect(screen.queryByRole('option', { name: 'Van técnica' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Juruti' }));
    app.rerender(<InventoryFormDialog open={false} {...props} />);
    app.rerender(<InventoryFormDialog open {...props} />);
    stockTab();
    expect(screen.getByLabelText('Quantidade')).toBeDisabled();
  });
  it('espera os saldos carregarem antes de permitir salvar', async () => {
    state.loaded = false;
    const { rerender } = render(<InventoryFormDialog open onOpenChange={vi.fn()} item={item} activeStockId="secondary" />);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    state.loaded = true;
    rerender(<InventoryFormDialog open onOpenChange={vi.fn()} item={item} activeStockId="secondary" />);
    stockTab();
    await waitFor(() => expect(screen.getByLabelText('Quantidade')).toHaveValue('6'));
  });
});
