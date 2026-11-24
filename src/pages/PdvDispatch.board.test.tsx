import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdvDispatchQueueRow } from '@/hooks/usePdvDispatch';
import { DispatchBoard } from './PdvDispatch';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/usePdvDispatch', () => ({ usePdvCompleteDispatch: vi.fn(), usePdvDispatchHistory: vi.fn(), usePdvDispatchOrder: vi.fn(), usePdvDispatchQueue: vi.fn(), stablePdvAttempt: vi.fn() }));
vi.mock('@/hooks/usePdvReturns', () => ({ derivePdvReturnsAccess: vi.fn(), usePdvReturnsFeature: vi.fn() }));
vi.mock('@/hooks/usePdvAfterSale', () => ({ derivePdvAfterSaleAccess: vi.fn(), usePdvAfterSaleFeature: vi.fn() }));
vi.mock('@/hooks/usePdvSalesFlow', () => ({ resolvePdvSalesFlowMode: vi.fn(), usePdvSalesFlow: vi.fn() }));
vi.mock('@/hooks/usePdvCounterFlow', () => ({ usePdvCounterCapability: vi.fn() }));
vi.mock('@/components/pdv/dispatch/PdvDeliveryReceiptButton', () => ({ PdvDeliveryReceiptButton: () => null }));
vi.mock('@/components/pdv/dispatch/PdvDispatchDetail', () => ({ PdvDispatchDetail: () => null }));

const orders: PdvDispatchQueueRow[] = [
  {id:'order-11',number:11,recipientName:'João Silva',stockId:'stock-a',stockName:'Balcão',status:'liberado_retirada',releasedAt:'2026-11-14T10:00:00Z',remainingItems:2},
  {id:'order-12',number:12,recipientName:'Maria Santos',stockId:'stock-b',stockName:'Depósito',status:'retirada_parcial',releasedAt:'2026-11-14T10:05:00Z',remainingItems:1},
];

describe('Kanban de retirada', () => {
  it('reutiliza o cabeçalho canônico fora do escopo visual legado, com cor, ícone e contagem', () => {
    render(<DispatchBoard orders={orders} onSelect={vi.fn()} />);
    const pickup=screen.getByRole('region',{name:'Aguardando retirada'});const partial=screen.getByRole('region',{name:'Retirada parcial'});
    const pickupHeader=pickup.querySelector('[data-kanban-column-header]');const partialHeader=partial.querySelector('[data-kanban-column-header]');
    expect(pickupHeader).toHaveStyle({backgroundColor:'#1e40af'});expect(partialHeader).toHaveStyle({backgroundColor:'#92400e'});
    expect(pickupHeader?.querySelector('svg')).toBeInTheDocument();expect(partialHeader?.querySelector('svg')).toBeInTheDocument();
    expect(pickupHeader?.closest('.pdv-preview-sale')).toBeNull();expect(within(pickup).getByText('1')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.getByRole('region',{name:'Kanban da expedição'}).querySelector('[draggable="true"]')).toBeNull();
  });

  it('busca localmente por cliente sem acento, número e estoque, escondendo colunas sem resultado', () => {
    render(<DispatchBoard orders={orders} onSelect={vi.fn()} />);const search=screen.getByRole('searchbox',{name:'Buscar pedido, cliente ou estoque'});
    fireEvent.change(search,{target:{value:'joao'}});expect(screen.getByText('João Silva')).toBeVisible();expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument();expect(screen.queryByRole('heading',{name:'Retirada parcial'})).not.toBeInTheDocument();
    fireEvent.change(search,{target:{value:'#12'}});expect(screen.getByText('Maria Santos')).toBeVisible();expect(screen.queryByRole('heading',{name:'Aguardando retirada'})).not.toBeInTheDocument();
    fireEvent.change(search,{target:{value:'deposito'}});expect(screen.getByText('Maria Santos')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Limpar busca de retiradas'}));expect(screen.getByRole('heading',{name:'Aguardando retirada'})).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Retirada parcial'})).toBeInTheDocument();
  });

  it('mostra estado vazio para zero resultados e restaurar limpa também colunas vazias', () => {
    render(<DispatchBoard orders={[orders[0]]} onSelect={vi.fn()} />);const search=screen.getByRole('searchbox');
    fireEvent.change(search,{target:{value:'inexistente'}});expect(screen.getByText('Nenhuma retirada encontrada')).toBeVisible();expect(screen.queryByRole('heading',{name:'Aguardando retirada'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Limpar busca'}));expect(search).toHaveValue('');expect(screen.getByRole('heading',{name:'Aguardando retirada'})).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Retirada parcial'})).toBeInTheDocument();expect(screen.getByText('Nenhum pedido nesta etapa.')).toBeVisible();
  });

  it('preserva seleção e retirada rápida, sem oferecer retirada quando o callback autorizado não existe', () => {
    const select=vi.fn();const pickup=vi.fn();const {rerender}=render(<DispatchBoard orders={orders} onSelect={select} onCompletePickup={pickup} />);
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'João'}});fireEvent.click(screen.getByRole('button',{name:'Abrir Pedido #11'}));expect(select).toHaveBeenCalledExactlyOnceWith('order-11');
    fireEvent.click(screen.getByRole('button',{name:'Marcar como retirado'}));expect(pickup).toHaveBeenCalledExactlyOnceWith('order-11');
    rerender(<DispatchBoard orders={orders} onSelect={select} onCompletePickup={pickup} pendingOrderId="order-11" />);expect(screen.getByRole('button',{name:'Marcar como retirado'})).toBeDisabled();
    rerender(<DispatchBoard orders={orders} onSelect={select} />);expect(screen.queryByRole('button',{name:'Marcar como retirado'})).not.toBeInTheDocument();
  });
});
