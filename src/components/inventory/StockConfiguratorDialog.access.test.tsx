import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockConfiguratorDialog } from './StockConfiguratorDialog';
import type { Stock } from '@/hooks/useStocks';

const mocks = vi.hoisted(() => ({ canManage: true, canManageAccess: true, access: undefined as { restricted: boolean; user_ids: string[] } | undefined, accessLoading: false, accessError: null as Error | null, setAccess: vi.fn(), userError: null as Error | null }));
vi.mock('@/hooks/useStocks', () => ({ useStocks: () => ({ updateStockPurpose: { mutateAsync: vi.fn() } }), useStockManagement: () => ({ canManage: mocks.canManage, canManageAccess: mocks.canManageAccess, companyId: 'company' }) }));
vi.mock('@/hooks/useStockAccess', () => ({ useStockAccess: () => ({ access: mocks.access, isLoading: mocks.accessLoading, error: mocks.accessError, setAccess: { mutateAsync: mocks.setAccess } }) }));
vi.mock('@/hooks/useUsers', () => ({ useUsers: () => ({ users: [{ user_id: 'member', company_id: 'company', full_name: 'Pessoa da equipe', role: 'tecnico' }, { user_id: 'foreign', company_id: 'other', full_name: 'Outro tenant', role: 'tecnico' }], isLoading: false, error: mocks.userError }) }));
vi.mock('@/hooks/useInventory', () => ({ useInventory: () => ({ items: [], stockLevelsLoaded: true, getPresenceForStock: () => false, setStockMaterials: { mutateAsync: vi.fn() } }) }));
vi.mock('@/hooks/useMaterialGroups', () => ({ useMaterialGroups: () => ({ groups: [] }) }));
vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({ hasModule: () => true }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: ({ open, children, footer }: { open: boolean; children: React.ReactNode; footer: React.ReactNode }) => open ? <div>{children}{footer}</div> : null }));
vi.mock('@/components/mobile/MobilePillTabs', () => ({ MobilePillTabs: ({ tabs, onTabChange }: { tabs: { value: string; label: string }[]; onTabChange: (tab: string) => void }) => <nav>{tabs.map(tab => <button key={tab.value} onClick={() => onTabChange(tab.value)}>{tab.label}</button>)}</nav> }));
const props = { open: true, onOpenChange: vi.fn(), stock: { id: 'stock', name: 'Loja' } as Stock, onOpenTransfer: vi.fn() };
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.canManage = true; mocks.canManageAccess = true; mocks.access = undefined; mocks.accessLoading = false; mocks.accessError = null; mocks.userError = null; });

describe('configuração segura de acesso ao local', () => {
  it('oculta a gestão de acesso para operador com permissão de estoque', () => {
    mocks.canManageAccess = false;
    render(<StockConfiguratorDialog {...props} />);
    expect(screen.queryByRole('button', { name: 'Acesso' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Itens' })).toBeInTheDocument();
  });
  it('não permite salvar antes de confirmar a ACL ou depois de erro', () => {
    mocks.accessLoading = true;
    const { rerender } = render(<StockConfiguratorDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Acesso' }));
    expect(screen.getByRole('button', { name: 'Salvar acesso' })).toBeDisabled();
    mocks.accessLoading = false; mocks.accessError = new Error('internal'); rerender(<StockConfiguratorDialog {...props} />);
    expect(screen.getByRole('button', { name: 'Salvar acesso' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível confirmar');
    expect(mocks.setAccess).not.toHaveBeenCalled();
  });
  it('impede restrito vazio e nunca lista usuário de outra empresa', async () => {
    mocks.access = { restricted: true, user_ids: [] };
    render(<StockConfiguratorDialog {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Acesso' }));
    await waitFor(() => expect(screen.getByText('Pessoa da equipe')).toBeInTheDocument());
    expect(screen.queryByText('Outro tenant')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar acesso' })).toBeDisabled();
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[switches.length - 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acesso' }));
    await waitFor(() => expect(mocks.setAccess).toHaveBeenCalledWith({ stockId: 'stock', restricted: true, userIds: ['member'] }));
  });
});
