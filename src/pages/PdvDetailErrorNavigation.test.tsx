import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PdvDispatch from './PdvDispatch';
import PdvPreorders from './PdvPreorders';

const state = vi.hoisted(() => ({ retry: vi.fn(), write: vi.fn(), id: '00000000-0000-4000-8000-000000000001', empty: [] }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'qa-company' }, user: { id: 'qa-user' }, roles: [], permissions: [], hasPermissionRecord: true, hasPermission: () => false, hasScreenAccess: () => true, isAdminOrGestor: () => false }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br', timezone: 'America/Sao_Paulo' }) }));
vi.mock('@/lib/format/hooks', () => ({ useLocaleFormatters: () => ({ money: (value: number) => String(value), dateTime: (value: unknown) => String(value ?? '') }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/usePdvReceiptCompany', () => ({ usePdvReceiptCompany: () => ({ data: null }) }));
vi.mock('@/hooks/usePdvStageReceiptAuto', () => ({ usePdvStageReceiptAuto: () => ({ prepare: vi.fn() }) }));
vi.mock('@/hooks/usePdvCounterFlow', () => ({ usePdvCounterCapability: () => ({ data: { counterEnabled: true, fulfillmentMode: 'dispatch' }, isLoading: false }) }));
vi.mock('@/hooks/usePdvReturns', () => ({ usePdvReturnsFeature: () => ({ data: false }), derivePdvReturnsAccess: () => ({ enabled: false }) }));
vi.mock('@/hooks/usePdvAfterSale', () => ({ usePdvAfterSaleFeature: () => ({ data: false }), derivePdvAfterSaleAccess: () => ({ enabled: false }) }));
vi.mock('@/hooks/usePdvDispatch', () => ({
  usePdvDispatchOrder: (id: string | null) => ({ data: null, isError: Boolean(id), isLoading: false, refetch: state.retry }),
  usePdvDispatchQueue: () => ({ data: state.empty, isLoading: false, isError: false, refetch: state.retry }),
  usePdvDispatchHistory: () => ({ data: state.empty, isLoading: false, isError: false, refetch: state.retry }),
  usePdvCompleteDispatch: () => ({ mutateAsync: state.write }), stablePdvAttempt: vi.fn(),
}));
vi.mock('@/hooks/usePdvPreorders', () => ({
  usePdvPreorder: (id: string | null) => ({ data: null, isError: Boolean(id), isLoading: false, refetch: state.retry }),
  usePdvPreorderQueue: () => ({ data: state.empty, isLoading: false, isError: false, refetch: state.retry }),
  usePdvPreorderActions: () => ({}),
}));
vi.mock('@/hooks/usePdvPreorderCatalog', () => ({ usePdvPreorderCatalog: () => ({ data: { customers: [], materials: [], stocks: [], terminals: [] }, isLoading: false, isError: false, refetch: state.retry }) }));
vi.mock('@/hooks/usePdvSalesFlow', () => ({ usePdvSalesFlow: () => ({ data: state.empty, refetch: state.retry }), usePdvSalesFlowOrder: () => ({ data: null, refetch: state.retry }), resolvePdvSalesFlowMode: () => 'dispatch' }));
vi.mock('@/components/pdv/preorders/PdvPreorderDetail', () => ({ PdvPreorderDetail: () => null }));
vi.mock('@/components/pdv/preorders/PdvPreorderReceiptButton', () => ({ PdvPreorderReceiptButton: () => null, openPdvPreorderReceipt: vi.fn() }));
vi.mock('@/components/pdv/dispatch/PdvDispatchDetail', () => ({ PdvDispatchDetail: () => null }));
vi.mock('@/components/pdv/dispatch/PdvDeliveryReceiptButton', () => ({ PdvDeliveryReceiptButton: () => null, openPdvDeliveryReceipt: vi.fn() }));
// A visibilidade responsiva do layout pertence ao CSS. O stub conserva a transição lista/detalhe usada pelas páginas.
vi.mock('@/components/ui/ListDetailLayout', () => ({ ListDetailLayout: ({ mobileDetailOpen, listTitle, children }: { mobileDetailOpen: boolean; listTitle: string; children: React.ReactNode }) => mobileDetailOpen ? <section aria-label="Detalhe mobile">{children}</section> : <section aria-label={listTitle}>Lista disponível</section> }));

vi.mock('@/components/pdv/flow/PdvSalesFlowBoard', () => ({ PdvSalesFlowBoard: ({ onOpen }: { onOpen: (card: unknown) => void }) => <button onClick={() => onOpen({ stage: 'completed', fulfillmentMode: 'cashier', orderId: state.id })}>Abrir pedido concluído QA</button> }));

function LocationEvidence() { const location = useLocation(); return <output aria-label="Endereço atual">{location.pathname}{location.search}</output>; }
beforeEach(() => vi.clearAllMocks());

describe('retorno após falha de detalhe no mobile', () => {
  it('Expedição permite tentar novamente e voltar à fila limpando o pedido da URL sem registrar retirada', async () => {
    render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}} initialEntries={[`/pdv/expedicao?pedido=${state.id}`]}><PdvDispatch /><LocationEvidence /></MemoryRouter>);
    expect(screen.getByText('Não foi possível abrir o pedido')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(state.retry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à fila' }));
    expect(await screen.findByRole('region', { name: 'Pedidos liberados' })).toBeInTheDocument();
    expect(screen.getByLabelText('Endereço atual')).toHaveTextContent('/pdv/expedicao');
    expect(screen.getByLabelText('Endereço atual')).not.toHaveTextContent('pedido=');
    expect(state.write).not.toHaveBeenCalled();
  });
  it('Orçamentos devolve a lista quando o orçamento selecionado falha, preservando a opção de atualizar', () => {
    render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}} initialEntries={[`/pdv/orcamentos?orcamento=${state.id}`]}><PdvPreorders /></MemoryRouter>);
    expect(screen.getByText('Não foi possível abrir o orçamento')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(state.retry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à lista' }));
    expect(screen.getByRole('region', { name: 'Orçamentos do balcão' })).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível abrir o orçamento')).not.toBeInTheDocument();
    expect(state.write).not.toHaveBeenCalled();
  });
  it('permite sair do erro de pedido concluído aberto pelo Fluxo sem navegar para fora de Orçamentos', () => {
    render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}} initialEntries={['/pdv/orcamentos']}><PdvPreorders /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', {name:'Fluxo do balcão'}));
    fireEvent.click(screen.getByRole('button', {name:'Abrir pedido concluído QA'}));
    expect(screen.getByText('Não foi possível abrir o pedido concluído')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name:'Voltar à lista'}));
    expect(screen.queryByText('Não foi possível abrir o pedido concluído')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name:'Abrir pedido concluído QA'})).toBeInTheDocument();
    expect(state.write).not.toHaveBeenCalled();
  });

});
