import { useRef, useState, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pdv } from '@/lib/i18n/messages/app/pdv';
import { computeTotal } from '@/lib/pdv/cart';
import { createPdvSaleDraft, type PdvSaleDraft } from '@/lib/pdv/sale-drafts';
import { usePdvPaymentVoucher, type PdvPaymentVoucherSnapshot } from '@/hooks/usePdvPaymentVoucher';
import { PdvPaymentDialog } from './PdvPaymentDialog';
import { PdvAppliedVoucherControl } from './PdvAppliedVoucherControl';

const state = vi.hoisted(() => ({ confirm: vi.fn(), options: vi.fn() }));
vi.mock('@/hooks/use-mobile', () => ({ useIsCompact: () => false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' }, profile: { company_id: 'company-1' } }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ timezone: 'UTC' }) }));
vi.mock('@/hooks/usePdvCustomerPaymentOptions', () => ({ usePdvCustomerPaymentOptions: (customerId: string, enabled: boolean) => { state.options(customerId, enabled); return { data: { availableCredit: 0, vouchers: [{ id: 'voucher-a', code: 'CREDITO-A', balance: 40, expiresOn: null }] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() }; } }));
vi.mock('@/lib/format/hooks', () => ({ useLocaleFormatters: () => ({ money: (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }) }));
vi.mock('@/components/ui/SignedImg', () => ({ SignedImg: () => null }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({ open, title, children, footer }: { open: boolean; title: string; children: ReactNode; footer: ReactNode }) => open ? <section role="dialog" aria-label={title}>{children}<footer>{footer}</footer></section> : null }));
vi.mock('@/components/pdv/caixa/PdvMoneyInput', () => ({ PdvMoneyInput: ({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) => <input id={id} type="number" value={value} onChange={event => onChange(Number(event.target.value))} /> }));
vi.mock('@/components/ui/DatePicker', () => ({ DatePicker: () => null }));

const money = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function createDraft(id: string, customerId: string, price: number): PdvSaleDraft { return { ...createPdvSaleDraft(1, '2026-11-15', 'stock-1'), id, cart: { customerId, discount: 0, lines: [{ inventoryId: 'item-1', name: 'Item fictício', imageUrl: null, availableQuantity: 10, quantity: 1, unitPrice: price, unitCost: 0, discountAmount: 0 }] } }; }
function Harness() {
  const [drafts, setDrafts] = useState(() => [createDraft('draft-a', 'customer-a', 100), createDraft('draft-b', 'customer-b', 200)]);
  const [activeId, setActiveId] = useState('draft-a');
  const [open, setOpen] = useState(false);
  const [scopeKey, setScopeKey] = useState('company-a:user-a:cash-a');
  const [, rerenderParent] = useState(0);
  const snapshotRef = useRef<PdvPaymentVoucherSnapshot | null>(null);
  const voucher = usePdvPaymentVoucher({ open, enabled: true, scopeKey, snapshotRef, drafts, conflictingDraftIds: [], hasAttempt: () => false, updateDraft: (id, update) => setDrafts(current => current.map(value => value.id === id ? update(value) : value)) });
  const current = snapshotRef.current;
  return <>
    <button onClick={() => {
      const draft = drafts.find(value => value.id === activeId)!;
      snapshotRef.current = { draftId: draft.id, cart: structuredClone(draft.cart), stockId: draft.stockId, notes: draft.notes, transactionDate: draft.transactionDate, appliedVoucher: draft.appliedVoucher };
      voucher.capture(snapshotRef.current, () => true); setOpen(true);
    }}>Abrir pagamento fixture</button>
    <button onClick={() => setActiveId('draft-b')}>Ativar outro pedido fixture</button>
    <button onClick={() => rerenderParent(value => value + 1)}>Rerender fixture</button>
    <button onClick={() => setScopeKey('company-b:user-b:cash-b')}>Trocar empresa fixture</button>
    <output data-testid="draft-values">{JSON.stringify(drafts.map(draft => ({ id: draft.id, voucher: draft.appliedVoucher })))}</output>
    {current && <PdvPaymentDialog open={open && voucher.inScope} onOpenChange={value => { setOpen(value); if (!value) voucher.reset(); }} texts={pdv['pt-br'].cashier.payment} total={computeTotal(current.cart)} itemCount={1} customerName={current.cart.customerId} customerId={current.cart.customerId} advancedPaymentsEnabled appliedVoucher={current.appliedVoucher} embeddedEditorOpen={voucher.pickerOpen}
      appliedCreditContent={<fieldset disabled={!voucher.canEdit}><PdvAppliedVoucherControl key={`${current.draftId}:${voucher.canEdit}`} enabled customerId={current.cart.customerId} total={computeTotal(current.cart)} value={current.appliedVoucher} formatCurrency={money} onChange={voucher.onChange} onPickerOpenChange={voucher.onPickerOpenChange} /></fieldset>}
      customerCredit={null} accounts={[]} canUseBankAccounts={false} hasOpenCashSession hasCofreAccount onGoToCashPanel={vi.fn()} onConfirm={state.confirm} />}
  </>;
}
async function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir pagamento fixture' }));
  fireEvent.click(screen.getByRole('button', { name: /Créditos do cliente/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
  await screen.findByRole('region', { name: 'Escolher voucher' });
}

describe('voucher selecionado dentro do diálogo real de pagamento', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); window.scrollTo = vi.fn(); state.confirm.mockResolvedValue(undefined); });
  it('escolhe e remove voucher, recalcula somente o restante e envia reference_id no payload financeiro', async () => {
    render(<Harness />); await openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Escolher voucher' })).not.toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(state.confirm).toHaveBeenCalledOnce());
    expect(state.confirm.mock.calls[0][0]).toEqual(expect.arrayContaining([{ method: 'voucher', amount: 40, reference_id: 'voucher-a' }, expect.objectContaining({ method: 'dinheiro', amount: 60 })]));
    expect(state.confirm.mock.calls[0][0].reduce((sum: number, row: { amount: number }) => sum + row.amount, 0)).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Remover voucher' }));
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(state.confirm).toHaveBeenCalledTimes(2));
    expect(state.confirm.mock.calls[1][0]).toEqual([expect.objectContaining({ method: 'dinheiro', amount: 100 })]);
  });
  it('bloqueia F9/footer durante edição, preserva a escolha após rerender e permite cancelar', async () => {
    render(<Harness />); await openPicker();
    fireEvent.change(screen.getByLabelText('Valor a aplicar'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rerender fixture' }));
    expect(screen.getByLabelText('Valor a aplicar')).toHaveValue(25);
    expect(screen.queryByRole('button', { name: /Finalizar Venda/ })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'F9' }); fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(state.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(state.confirm).toHaveBeenCalledOnce());
    expect(state.confirm.mock.calls[0][0]).toEqual([expect.objectContaining({ method: 'dinheiro', amount: 100 })]);
  });
  it('troca de pedido ativo não transfere voucher, cliente ou total do snapshot original', async () => {
    render(<Harness />); await openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Ativar outro pedido fixture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar voucher' }));
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(state.confirm).toHaveBeenCalledOnce());
    expect(state.confirm.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.objectContaining({ method: 'voucher', reference_id: 'voucher-a', amount: 40 }), expect.objectContaining({ amount: 60 })]));
    expect(JSON.parse(screen.getByTestId('draft-values').textContent!)).toEqual([{ id: 'draft-a', voucher: expect.objectContaining({ voucherId: 'voucher-a' }) }, { id: 'draft-b', voucher: null }]);
    expect(state.options).toHaveBeenLastCalledWith('customer-a', true);
  });
  it('fecha o fluxo visual ao trocar de empresa enquanto o seletor está aberto', async () => {
    render(<Harness />); await openPicker(); fireEvent.click(screen.getByRole('button', { name: 'Trocar empresa fixture' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); fireEvent.keyDown(window, { key: 'F9' });
    expect(state.confirm).not.toHaveBeenCalled(); expect(screen.getByTestId('draft-values')).not.toHaveTextContent('voucher-a');
  });
});
