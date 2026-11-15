import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  navigate: vi.fn(), toast: vi.fn(), access: true,
  detail: { data: { order: { id: 'order-1', commercialStatus: 'pago', paymentStatus: 'pago', pickupStatus: 'liberado', canGenerateReceipt: true } }, isError: false },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ roles: [], permissions: [], hasPermissionRecord: true, profile: { company_id: 'company-1' }, isAdminOrGestor: () => false, hasScreenAccess: () => true }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/hooks/usePdvReturns', () => ({ usePdvReturnsFeature: () => ({ data: true }), derivePdvReturnsAccess: () => ({ enabled: true, canReturn: state.access }) }));
vi.mock('@/hooks/usePdvAfterSale', () => ({ usePdvAfterSaleFeature: () => ({ data: true }), derivePdvAfterSaleAccess: () => ({ enabled: true, canView: state.access }) }));
vi.mock('@/hooks/usePdvOrdersList', () => ({ usePdvOrderWorkspace: () => state.detail }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: { defaultFormat: '80mm' } }) }));
vi.mock('@/components/pdv/receipt/PdvOrderReceiptButton', () => ({ usePdvOrderReceiptOpener: () => ({ open: vi.fn(), isCurrent: () => true }) }));
vi.mock('@/hooks/usePdvCustomerHistory', () => ({ usePdvCustomerHistory: () => ({ data: { rows: [{ id: 'order-1', number: 27, total: 50, created_at: '2026-11-14T12:00:00Z' }], total: 1 }, isPending: false, isError: false }) }));
vi.mock('@/hooks/usePdvCustomerPaymentOptions', () => ({ usePdvCustomerPaymentOptions: () => ({ data: { vouchers: [{ id: 'v1', code: 'ATIVO', balance: 50, expiresOn: null }, { id: 'v2', code: 'VENCIDO', balance: 40, expiresOn: '2000-01-01' }] }, isPending: false, isError: false }) }));
vi.mock('@/components/customers/CustomerAvatar', () => ({ CustomerAvatar: () => <span>Avatar</span> }));
vi.mock('@/components/customers/PartyAccountPanel', () => ({ PartyAccountPanel: () => <div>Conta corrente real do cliente</div> }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null }));
import { PdvCustomerProfileDialog } from './PdvCustomerProfileDialog';

describe('Ficha do cliente no PDV', () => {
  beforeEach(() => { vi.clearAllMocks(); state.access = true; state.detail.data.order.paymentStatus = 'pago'; });
  function open() {
    render(<PdvCustomerProfileDialog customer={{ id: 'customer-1', customer_type: 'pf', name: 'Cliente da loja', created_at: '2026-11-14T12:00:00Z', updated_at: '2026-11-14T12:00:00Z' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver ficha do cliente' }));
  }
  it('mantém as três abas na mesma ficha e consulta saldo/histórico reais', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Ficha do cliente' });
    fireEvent.click(screen.getByRole('tab', { name: 'Saldo e créditos' }));
    expect(screen.getByText('Conta corrente real do cliente')).toBeInTheDocument();
    expect(screen.getByText('ATIVO')).toBeInTheDocument();
    expect(screen.getByText('Sem vencimento')).toBeInTheDocument();
    expect(screen.queryByText('VENCIDO')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(screen.getByText('#27 · Pedido')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBe(dialog);
  });
  it('abre devolução pelo destino real do pedido e fecha a ficha', async () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações do pedido 27' }), { key: 'ArrowDown' });
    await screen.findByRole('menu');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Devoluções e itens não retirados' }));
    expect(state.navigate).toHaveBeenCalledWith('/pdv/pedidos?pedido=order-1&acao=devolucoes');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('não oferece devolução ou reembolso sem permissão', async () => {
    state.access = false;
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações do pedido 27' }), { key: 'ArrowDown' });
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: 'Devoluções e itens não retirados' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Trocas, créditos e reembolsos' })).not.toBeInTheDocument();
  });
  it('leva o pedido escolhido da ficha diretamente à fila do caixa e fecha a ficha', async () => {
    state.detail.data.order.paymentStatus = 'parcial';
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Ações do pedido 27' }), { key: 'ArrowDown' });
    await screen.findByRole('menu');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Receber no caixa' }));
    expect(state.navigate).toHaveBeenCalledWith('/pdv?fila=1&pedido=order-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

});
