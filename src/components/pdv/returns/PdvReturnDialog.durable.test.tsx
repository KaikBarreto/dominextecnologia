import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdvReturnWorkspace } from '@/hooks/usePdvReturns';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn(), refetch: vi.fn(), workspace: undefined as PdvReturnWorkspace | undefined, auth: { company: 'c4110000-0000-4000-8000-000000000010', user: 'c4110000-0000-4000-8000-000000000011', active: true, permissions: ['*'], roles: ['admin'] } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mocks.auth.user }, profile: { user_id: mocks.auth.user, company_id: mocks.auth.company, is_active: mocks.auth.active }, permissions: mocks.auth.permissions, roles: mocks.auth.roles, hasPermissionRecord: true, loading: false, profileLoading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/ui/responsive-dialog', () => ({ ResponsiveDialog: ({ open, title, children, footer }: { open: boolean; title: string; children: ReactNode; footer?: ReactNode }) => open ? <div role="dialog"><h2>{title}</h2>{children}{footer}</div> : null }));
vi.mock('@/components/ui/DatePicker', () => ({ DatePicker: () => null }));
vi.mock('@/hooks/usePdvReturns', async importOriginal => ({
  ...await importOriginal<typeof import('@/hooks/usePdvReturns')>(),
  usePdvReturnWorkspace: () => ({ data: mocks.workspace, isLoading: false, isError: false, refetch: mocks.refetch }),
}));
import { PdvReturnDialog } from './PdvReturnDialog';
import { PdvReturnsPanel } from './PdvReturnsPanel';
import { pdvReturnIntentKey, readPdvReturnIntent } from '@/lib/pdv/return-intent';
const ORDER = 'c4110000-0000-4000-8000-000000000001', RETURN = 'c4110000-0000-4000-8000-000000000099';
const workspace: PdvReturnWorkspace = { orderId: ORDER, orderNumber: 1, customerId: 'customer', items: [{ deliveryItemId: 'c4110000-0000-4000-8000-000000000003', orderItemId: 'line', description: 'Material fictício', itemType: 'material', deliveredQuantity: 2, returnableQuantity: 2, commercialAmount: 200 }], stocks: [{ id: 'c4110000-0000-4000-8000-000000000004', name: 'Local fictício', destination: 'saleable' }], history: [], receivables: [] };
const owner = () => ({ companyId: mocks.auth.company, userId: mocks.auth.user, orderId: ORDER });
function Harness({ data = workspace, onCompleted = () => {} }: { data?: PdvReturnWorkspace; onCompleted?: () => void }) { const [open, setOpen] = useState(true); return <><button onClick={() => setOpen(true)}>Reabrir</button>{open && <PdvReturnDialog open onOpenChange={setOpen} workspace={data} canBackdate={false} onCompleted={onCompleted} />}</>; }
function renderDialog(props: React.ComponentProps<typeof Harness> = {}) { const client = new QueryClient(); return { client, ...render(<QueryClientProvider client={client}><Harness {...props} /></QueryClientProvider>) }; }
function fill() { fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantidade devolvida de Material fictício' }), { target: { value: '1' } }); fireEvent.change(screen.getByRole('textbox', { name: 'Motivo da devolução' }), { target: { value: 'Uma unidade voltou fisicamente' } }); }
function success() { return { data: { ok: true, return_id: RETURN, order_id: ORDER, commercial_total: -100, idempotent: true }, error: null }; }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.workspace = workspace; mocks.auth = { company: 'c4110000-0000-4000-8000-000000000010', user: 'c4110000-0000-4000-8000-000000000011', active: true, permissions: ['*'], roles: ['admin'] }; });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('devolução durável com componente/hook reais', () => {
  it('persiste e confere antes do POST, trava edição e mantém envio normal sem aviso de incerteza', async () => {
    let finish!: (value: ReturnType<typeof success>) => void;
    mocks.rpc.mockImplementation((_name, args) => {
      const saved = readPdvReturnIntent(owner()); expect(saved?.state).toBe('submitted'); expect(saved?.args).toEqual(args);
      return new Promise(resolve => { finish = resolve; });
    });
    const view = renderDialog(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' })); await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox', { name: 'Motivo da devolução' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Confirmar devolução' })).toBeDisabled();
    expect(screen.queryByText('A devolução pode ter sido registrada. A tentativa foi preservada neste aparelho.')).not.toBeInTheDocument();
    await act(async () => { finish({ ...success(), data: { ...success().data, idempotent: false } }); });
    expect(screen.getByRole('heading', { name: 'Devolução confirmada' })).toBeInTheDocument(); expect(readPdvReturnIntent(owner())).toBeNull(); view.unmount();
  });
  it('resposta perdida + reload + outra data repete args/key EXATOS sem segunda unidade/crédito', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    let committed = 0; const ledger = new Set<string>();
    mocks.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => { const id = String(args.p_idempotency_key); if (!ledger.has(id)) { ledger.add(id); committed++; throw new Error('Failed to fetch after commit'); } return success(); });
    const first = renderDialog(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await screen.findByRole('heading', { name: 'Conferir devolução pendente' }); expect(committed).toBe(1); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const frozen = structuredClone(mocks.rpc.mock.calls[0][1]); expect(readPdvReturnIntent(owner())?.state).toBe('unknown'); first.unmount();
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    expect(frozen.p_occurred_on).toBe('2026-11-16');
    const completed = vi.fn(); const second = renderDialog({ data: { ...workspace, items: [] }, onCompleted: completed });
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument(); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar confirmar' })); await screen.findByRole('heading', { name: 'Devolução confirmada' });
    expect(mocks.rpc.mock.calls[1][1]).toEqual(frozen); expect(committed).toBe(1); expect(completed).toHaveBeenCalledOnce(); expect(localStorage.getItem(pdvReturnIntentKey(owner()))).toBeNull(); second.unmount();
  });
  it('unknown seguido de permissão negada mantém intenção e mesma chave após fechar', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: null, error: { code: '42501', details: 'code=pdv_return_permission_denied' } }).mockResolvedValue(success());
    const first = renderDialog(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' })); await screen.findByRole('button', { name: 'Tentar confirmar' });
    const frozen = structuredClone(mocks.rpc.mock.calls[0][1]); fireEvent.click(screen.getByRole('button', { name: 'Tentar confirmar' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2)); await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar confirmar' })).toBeEnabled());
    expect(readPdvReturnIntent(owner())?.state).toBe('unknown'); expect(mocks.rpc.mock.calls[1][1]).toEqual(frozen); first.unmount();
    const second = renderDialog(); fireEvent.click(screen.getByRole('button', { name: 'Tentar confirmar' })); await screen.findByRole('heading', { name: 'Devolução confirmada' }); expect(mocks.rpc.mock.calls[2][1]).toEqual(frozen); second.unmount();
  });
  it('falha de persistência/readback impede POST e mantém usuário fora de estado confirmado', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); }); const view = renderDialog(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled()); expect(mocks.rpc).not.toHaveBeenCalled(); expect(screen.queryByRole('heading', { name: 'Devolução confirmada' })).not.toBeInTheDocument(); view.unmount();
  });
  it('troca A→B→A ou revogação mascara dados e suprime confirmação antiga sem auto-POST', async () => {
    let finish!: (value: ReturnType<typeof success>) => void; mocks.rpc.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const completed = vi.fn(), props = { data: workspace, onCompleted: completed }; const view = renderDialog(props); fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' })); await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    const originalOwner = owner(); mocks.auth.active = false; view.rerender(<QueryClientProvider client={view.client}><Harness {...props} /></QueryClientProvider>); expect(screen.queryByText('Uma unidade voltou fisicamente')).not.toBeInTheDocument();
    mocks.auth.active = true; mocks.auth.company = 'c4110000-0000-4000-8000-000000000020'; view.rerender(<QueryClientProvider client={view.client}><Harness {...props} /></QueryClientProvider>); expect(readPdvReturnIntent(originalOwner)).not.toBeNull();
    mocks.auth.company = originalOwner.companyId; view.rerender(<QueryClientProvider client={view.client}><Harness {...props} /></QueryClientProvider>);
    expect(screen.getByRole('button', { name: 'Tentar confirmar' })).toBeInTheDocument(); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await act(async () => { finish(success()); }); expect(completed).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled(); expect(mocks.rpc).toHaveBeenCalledTimes(1); view.unmount();
  });
  it('painel permite recuperar a intenção mesmo com zero unidades devolvíveis', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('network')).mockResolvedValue(success());
    const first = renderDialog(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' })); await screen.findByRole('button', { name: 'Tentar confirmar' });
    const frozen = structuredClone(mocks.rpc.mock.calls[0][1]); first.unmount(); mocks.workspace = { ...workspace, items: [] };
    const onReload = vi.fn(), client = new QueryClient(); const panel = render(<QueryClientProvider client={client}><PdvReturnsPanel orderId={ORDER} orderNumber={1} remainingQuantity={0} access={{ enabled: true, canReturn: true, canReverse: false, canCancelResidual: false, canBackdate: false }} onReload={onReload} /></QueryClientProvider>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(mocks.rpc).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Conferir devolução pendente' })); expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar confirmar' })); await screen.findByRole('heading', { name: 'Devolução confirmada' });
    expect(mocks.rpc.mock.calls[1][1]).toEqual(frozen); expect(onReload).toHaveBeenCalledOnce(); expect(mocks.refetch).toHaveBeenCalledOnce(); panel.unmount();
  });
  it('resposta malformada mantém pendência e bloqueia edição e nova intenção', async () => {
    mocks.rpc.mockResolvedValue({ ...success(), data: { ...success().data, return_id: '------------------------------------', commercial_total: '100' } });
    const view = renderDialog(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' })); await screen.findByRole('button', { name: 'Tentar confirmar' });
    expect(readPdvReturnIntent(owner())?.state).toBe('unknown'); expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Confirmar devolução' })).not.toBeInTheDocument(); view.unmount();
  });
  it('primeira falha definitiva libera correção; revogação posterior não troca a chave da pendência', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', details: 'code=pdv_return_payload_invalid' } }).mockRejectedValueOnce(new Error('network'));
    const view = renderDialog(); fill(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' })); await waitFor(() => expect(readPdvReturnIntent(owner())?.state).toBe('failed'));
    expect(screen.getByRole('textbox', { name: 'Motivo da devolução' })).toBeEnabled(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' })); await screen.findByRole('button', { name: 'Tentar confirmar' });
    expect(mocks.rpc.mock.calls[1][1].p_idempotency_key).not.toBe(mocks.rpc.mock.calls[0][1].p_idempotency_key);
    const frozenOwner = owner(), pendingKey = readPdvReturnIntent(frozenOwner)?.args.p_idempotency_key;
    mocks.auth.permissions = []; mocks.auth.roles = []; view.rerender(<QueryClientProvider client={view.client}><Harness /></QueryClientProvider>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(readPdvReturnIntent(frozenOwner)?.args.p_idempotency_key).toBe(pendingKey);
    mocks.auth.permissions = ['screen:pdv_orders', 'fn:return_pdv_order']; view.rerender(<QueryClientProvider client={view.client}><Harness /></QueryClientProvider>);
    expect(screen.getByRole('button', { name: 'Tentar confirmar' })).toBeInTheDocument(); expect(readPdvReturnIntent(frozenOwner)?.args.p_idempotency_key).toBe(pendingKey); expect(mocks.rpc).toHaveBeenCalledTimes(2); view.unmount();
  });
});
