import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePdvReceiptStages } from '@/lib/pdv/receipt/stagePolicy';

const mocks = vi.hoisted(() => ({
  save: vi.fn(), mode: 'dispatch', canManage: true,
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAdminOrGestor: () => mocks.canManage, hasPermission: () => false, hasPermissionRecord: true }) }));
vi.mock('@/components/layout/PageHeader', () => ({ PageHeader: ({ title, actions }: { title: string; actions: ReactNode }) => <header><h1>{title}</h1>{actions}</header> }));
vi.mock('@/components/settings/domilink/DomiLinkDeviceShortcut', () => ({ DomiLinkDeviceShortcut: () => <span>DomiLink</span> }));
vi.mock('@/components/pdv/settings/PdvStoreStockSettings', () => ({ PdvStoreStockSettings: () => null }));
vi.mock('@/components/pdv/settings/PdvTerminalSettings', () => ({ PdvTerminalSettings: () => null }));
vi.mock('@/components/pdv/settings/PdvCashAccountSettings', () => ({ PdvCashAccountSettings: () => null }));
vi.mock('@/hooks/usePdvCounterFlow', () => ({ usePdvWorkflowSettings: () => ({ data: { pdvMode: 'balcao', fulfillmentMode: mocks.mode }, save: { mutateAsync: vi.fn() } }) }));
vi.mock('@/hooks/usePdvReceiptSettings', () => {
  const data = { defaultFormat:'80mm',autoPrint:false,copies:1,stages:resolvePdvReceiptStages() };
  return { usePdvReceiptSettings: () => ({ data, save: { mutateAsync:mocks.save } }) };
});
import PdvSettings from './PdvSettings';

describe('comprovantes nas configurações do PDV', () => {
  beforeEach(() => {
    mocks.mode = 'dispatch';
    mocks.canManage = true;
    mocks.save.mockReset().mockResolvedValue({});
    window.localStorage.clear();
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = vi.fn();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  function openReceipts() {
    render(<PdvSettings />);
    fireEvent.click(screen.getByRole('tab', { name:'Comprovantes' }));
  }
  it('permite abrir cada etapa independentemente e mantém prévia do documento real', async () => {
    openReceipts();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    expect(screen.getByRole('heading', { name:'Orçamento' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name:'Pedido' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name:'Retirada' })).toBeInTheDocument();
    expect(screen.getByText(/PEDIDO Nº 2087/)).toBeInTheDocument();
    expect(screen.getByText('PAGO')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('switch')[0]);
    fireEvent.click(screen.getByRole('button', { name:'Salvar comprovante' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      stages: {
        budget:{autoPrint:true,format:'80mm',copies:1},
        sale:{autoPrint:false,format:'80mm',copies:1},
        delivery:{autoPrint:false,format:'80mm',copies:1},
      },
    })));
  });
  it('explica a entrega no caixa e não oferece uma retirada separada nesse fluxo', () => {
    mocks.mode = 'cashier';
    openReceipts();
    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(screen.queryByRole('heading', { name:'Retirada' })).not.toBeInTheDocument();
    expect(screen.getByText(/não há uma etapa de retirada separada/)).toBeInTheDocument();
    expect(screen.getByText(/PEDIDO Nº 2087/)).toBeInTheDocument();
    expect(screen.getByText('PAGO')).toBeInTheDocument();
  });
  it('mantém consulta e prévia para perfil sem permissão de alteração', () => {
    mocks.canManage = false;
    openReceipts();
    expect(screen.queryByRole('button', { name:'Salvar comprovante' })).not.toBeInTheDocument();
    for (const control of screen.getAllByRole('switch')) expect(control).toBeDisabled();
    expect(screen.getByText('Prévia do documento')).toBeInTheDocument();
  });
});
