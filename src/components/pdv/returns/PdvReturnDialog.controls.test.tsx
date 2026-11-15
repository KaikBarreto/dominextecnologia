import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdvReturnWorkspace } from '@/hooks/usePdvReturns';
import { PdvReturnDialog } from './PdvReturnDialog';

const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
beforeAll(() => Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterAll(() => { if (scrollDescriptor) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollDescriptor); else Reflect.deleteProperty(Element.prototype, 'scrollIntoView'); });
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/usePdvReturns', async importOriginal => ({ ...await importOriginal<typeof import('@/hooks/usePdvReturns')>(), usePdvCreateReturn: () => ({ mutateAsync: mocks.mutate, isPending: false }) }));
vi.mock('@/components/ui/responsive-dialog', () => ({ ResponsiveDialog: ({ open, children, footer }: { open: boolean; children: ReactNode; footer?: ReactNode }) => open ? <div role="dialog">{children}{footer}</div> : null }));
vi.mock('@/components/ui/DatePicker', () => ({ DatePicker: ({ ariaLabel, value, max, disabled }: { ariaLabel: string; value: string; max: string; disabled?: boolean }) => <button type="button" aria-label={ariaLabel} data-max={max} disabled={disabled}>{value}</button> }));
const workspace: PdvReturnWorkspace = {
  orderId: 'order-1', orderNumber: 42, customerId: 'customer-1',
  items: [{ deliveryItemId: 'delivery-1', orderItemId: 'item-1', description: 'Cabo', itemType: 'material', deliveredQuantity: 2, returnableQuantity: 2, commercialAmount: 200 }],
  stocks: [{ id: 'stock-sale', name: 'Prateleira', destination: 'saleable' }, { id: 'stock-quarantine', name: 'Conferência', destination: 'quarantine' }], receivables: [], history: [],
};
beforeEach(() => { mocks.mutate.mockReset().mockResolvedValue({}); mocks.toast.mockReset(); });

async function choose(name: string, option: string | RegExp) {
  fireEvent.keyDown(screen.getByRole('combobox', { name }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

describe('controles próprios na devolução', () => {
  it('troca a condição e mantém o local, valor e payload canônicos ao confirmar', async () => {
    render(<PdvReturnDialog open onOpenChange={vi.fn()} workspace={workspace} canBackdate={false} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Cabo' }), { target: { value: '1' } });
    await choose('Condição do item devolvido', 'Quarentena');
    expect(screen.getByRole('combobox', { name: 'Local de destino' })).toHaveTextContent('Conferência');
    expect(screen.getByRole('button', { name: 'Data da devolução' })).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo da devolução' }), { target: { value: 'Peça voltou para conferência' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order-1', lines: [{ deliveryItemId: 'delivery-1', quantity: 1, destination: 'quarantine', destinationStockId: 'stock-quarantine' }], dispositions: [{ kind: 'customer_credit', amount: 100 }] })));
  });

  it('seleciona a dívida no controle próprio sem registrar movimento antes da confirmação', async () => {
    render(<PdvReturnDialog open onOpenChange={vi.fn()} workspace={{ ...workspace, receivables: [{ id: 'debt-1', description: 'Compra de outubro', dueDate: null, openAmount: 20 }, { id: 'debt-2', description: 'Compra de novembro', dueDate: null, openAmount: 80 }] }} canBackdate />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Cabo' }), { target: { value: '1' } });
    await choose('Conta em aberto', /Compra de novembro/);
    expect(screen.getByRole('combobox', { name: 'Conta em aberto' })).toHaveTextContent('Compra de novembro');
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Motivo da devolução' }), { target: { value: 'Devolver e abater a conta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ dispositions: [{ kind: 'receivable_reduction', amount: 80, receivableTransactionId: 'debt-2' }, { kind: 'customer_credit', amount: 20 }] })));
  });
});
