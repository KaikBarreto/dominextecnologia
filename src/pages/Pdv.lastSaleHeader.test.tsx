vi.mock('@/hooks/useGoodsFiscalAccess', () => ({ useGoodsFiscalAccess: () => ({allowed:fiscal.allowed,scopeId:'fiscal-scope'}) }));
vi.mock('@/components/fiscal/goods/PdvNfceSaleAction', () => ({ PdvNfceSaleAction: (props: Record<string,unknown>) => { fiscal.controller(props); return null; } }));
const fiscal = vi.hoisted(() => ({ controller: vi.fn(), allowed:true }));
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PdvLastSaleHeader } from './Pdv';

const state = vi.hoisted(() => ({ receipt: vi.fn() }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL', timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/components/pdv/receipt/PdvOrderReceiptButton', () => ({ openPdvOrderReceipt: vi.fn(), PdvOrderReceiptButton: ({ orderId, label, documentKind }: { orderId: string; label: string; documentKind: string }) => <button onClick={() => state.receipt(orderId, documentKind)}>{label}</button> }));
const sale = { scopeKey: 'company-a:user-a:cash-a:terminal-a:stock-a', orderId: 'order-completed', orderNumber: 12, total: 50 };
const props = { completedSale: sale, scopeKey: sale.scopeKey, receiptFormat: '80mm' as const, canOpenPostSale: false, onOpenPostSale: vi.fn(), children: <button>Novo atendimento</button> };

beforeEach(() => { fiscal.allowed=true; fiscal.controller.mockClear(); });

describe('atalho compacto do último pedido', () => {
  it('mantém a próxima venda e abre o comprovante do pedido concluído sem navegar ou mutar dados', async () => {
    render(<PdvLastSaleHeader {...props} />);
    expect(screen.getByRole('button', { name: 'Novo atendimento' })).toBeInTheDocument();
    expect(screen.queryByText(/O comprovante pode ser reaberto/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Último pedido #12' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Comprovante' }));
    expect(state.receipt).toHaveBeenCalledWith('order-completed', 'sale');
    expect(screen.queryByRole('button', { name: 'Abrir pós-venda' })).not.toBeInTheDocument();
  });
  it('monta controller sem abrir popover e abre painel por ação compacta', async () => {
    render(<PdvLastSaleHeader {...props} />);
    expect(fiscal.controller).toHaveBeenLastCalledWith(expect.objectContaining({ orderId: sale.orderId, detailsOpen: false, promptAfterPayment: true, contextKey: sale.scopeKey }));
    fireEvent.click(screen.getByRole('button', { name: 'Último pedido #12' }));
    fireEvent.click(await screen.findByRole('button', { name: 'NFC-e desta venda' }));
    expect(fiscal.controller).toHaveBeenLastCalledWith(expect.objectContaining({ orderId: sale.orderId, detailsOpen: true }));
    expect(screen.queryByRole('button', { name: 'Comprovante' })).not.toBeInTheDocument();
  });
  it('não repete pergunta após reverificar acesso ao retornar ao cabeçalho', () => { const {rerender}=render(<PdvLastSaleHeader {...props}/>);const controller=fiscal.controller.mock.calls.at(-1)![0];controller.onPromptShown();fiscal.allowed=false;rerender(<PdvLastSaleHeader {...props}/>);fiscal.allowed=true;rerender(<PdvLastSaleHeader {...props}/>);expect(fiscal.controller).toHaveBeenLastCalledWith(expect.objectContaining({promptAfterPayment:false})); });
  it('oculta ação e controller sem acesso fiscal', async () => { fiscal.allowed=false; render(<PdvLastSaleHeader {...props} />); fireEvent.click(screen.getByRole('button',{name:'Último pedido #12'})); expect(screen.queryByRole('button',{name:'NFC-e desta venda'})).not.toBeInTheDocument(); expect(fiscal.controller).not.toHaveBeenCalled(); });
  it('limpa alvo ao sair e voltar ao mesmo escopo de caixa', async () => { const {rerender}=render(<PdvLastSaleHeader {...props} />); fireEvent.click(screen.getByRole('button',{name:'Último pedido #12'}));fireEvent.click(await screen.findByRole('button',{name:'NFC-e desta venda'}));expect(fiscal.controller).toHaveBeenLastCalledWith(expect.objectContaining({detailsOpen:true}));rerender(<PdvLastSaleHeader {...props} scopeKey="other-cash"/>);rerender(<PdvLastSaleHeader {...props}/>);expect(fiscal.controller).toHaveBeenLastCalledWith(expect.objectContaining({detailsOpen:false})); });
  it('conserva o pós-venda autorizado e fecha seu menu antes de abri-lo', async () => {
    const open = vi.fn();
    render(<PdvLastSaleHeader {...props} canOpenPostSale onOpenPostSale={open} />);
    fireEvent.click(screen.getByRole('button', { name: 'Último pedido #12' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir pós-venda' }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Comprovante' })).not.toBeInTheDocument();
  });
  it.each(['company-b:user-a:cash-a:terminal-a:stock-a','company-a:user-b:cash-a:terminal-a:stock-a','company-a:user-a:cash-b:terminal-a:stock-a',null])('mascara o último pedido e o popover antigo imediatamente ao trocar para %s', async scopeKey => {
    const { rerender } = render(<PdvLastSaleHeader {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Último pedido #12' }));
    expect(await screen.findByText('Pedido #12 concluído')).toBeInTheDocument();
    rerender(<PdvLastSaleHeader {...props} scopeKey={scopeKey} />);
    expect(screen.queryByText('Pedido #12 concluído')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Último pedido #12' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo atendimento' })).toBeInTheDocument();
  });
});
