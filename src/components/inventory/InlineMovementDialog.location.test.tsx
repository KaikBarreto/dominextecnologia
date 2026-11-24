import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ loaded: true, move: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useStocks', () => ({ useStocks: () => ({ stocks: [
  { id: 'main', name: 'Principal', is_default: true }, { id: 'secondary', name: 'Juruti', is_default: false },
] }) }));
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({ registerInlineMovement: { mutateAsync: state.move, isPending: false }, stockLevelsLoaded: state.loaded, getQuantityForStock: (_: string, stock: string) => stock === 'secondary' ? 6 : 13 }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({ open, children, footer }: { open: boolean; children: ReactNode; footer: ReactNode }) => open ? <div>{children}{footer}</div> : null }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <select aria-label="Local de estoque" value={value} onChange={(event) => onValueChange(event.target.value)}><option value="">Escolha</option>{children}</select>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>, SelectTrigger: () => null, SelectValue: () => null,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
import { InlineMovementDialog } from './InlineMovementDialog';
import type { InventoryItem } from '@/hooks/useInventory';
const item = { id: 'item', name: 'Material fictício', quantity: 19, unit: 'un' } as InventoryItem;
beforeEach(() => { vi.clearAllMocks(); state.loaded = true; });
describe('movimentação com local explícito', () => {
  it('visão geral exige escolher o local e usa o saldo secundário', async () => {
    render(<InlineMovementDialog open onOpenChange={vi.fn()} item={item} activeStockId={null} movementType="entrada" />);
    fireEvent.change(screen.getByPlaceholderText('Qtd.'), { target: { value: '2' } });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Local de estoque'), { target: { value: 'secondary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(state.move).toHaveBeenCalledWith(expect.objectContaining({ stockId: 'secondary', quantity: 2 })));
  });
  it('saldo agregado não permite saída maior que o saldo local', async () => {
    render(<InlineMovementDialog open onOpenChange={vi.fn()} item={item} activeStockId="secondary" movementType="saida" />);
    fireEvent.change(screen.getByPlaceholderText('Qtd.'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(state.move).not.toHaveBeenCalled();
  });
});
