import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDV_RECEIPT_PREVIEW_FIXTURE } from '@/lib/pdv/receipt/fixture';
import { preparePdvStageReceiptAuto } from '@/lib/pdv/receipt/stageAuto';
import { PdvOrderReceiptButton, usePdvOrderReceiptOpener } from './PdvOrderReceiptButton';
import { PdvPreorderReceiptButton, usePdvPreorderReceiptOpener } from '../preorders/PdvPreorderReceiptButton';

const state = vi.hoisted(() => ({
  auth: { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true as boolean | undefined }, roles: ['comercial'], permissions: ['screen:pdv_orders'], hasPermissionRecord: true, loading: false, profileLoading: false },
  order: vi.fn(), budget: vi.fn(), logo: vi.fn(), pdf: vi.fn(), open: vi.fn(), pending: vi.fn(), toast: vi.fn(), close: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/hooks/usePdvOrderReceiptSnapshot', () => ({ fetchPdvOrderReceiptSnapshot: state.order }));
vi.mock('@/hooks/usePdvPreorders', () => ({ fetchPdvPreorderDetail: state.budget }));
vi.mock('@/hooks/usePdvReceiptCompany', () => ({ usePdvReceiptCompany: () => ({ name: 'Empresa fictícia', whiteLabelEnabled: false }), PDV_RECEIPT_COMPANY_PENDING: 'Aguarde a identificação da empresa.' }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/lib/pdv/receipt/pdf', () => ({ preparePdvReceiptSnapshotLogo: state.logo, generatePdvReceiptPdf: state.pdf }));
vi.mock('@/utils/openPdfInTab', () => ({ openPdfInTab: state.open, openPendingPdfTab: state.pending }));

const budget = { preorder: { number: 12, updated_at: '2026-11-14T10:00:00Z', discount_amount: 0 }, items: [{ description: 'Item fictício', quantity: 1, unit_price: 10, discount_amount: 0 }] };
const readers = [
  { name: 'pedido', fetch: state.order, data: PDV_RECEIPT_PREVIEW_FIXTURE, button: () => <PdvOrderReceiptButton orderId="same-id" format="80mm" />, useReader: () => { const opener = usePdvOrderReceiptOpener('same-id'); return { ...opener, openReceipt: (options?: { target?: Window | null; copies?: 1 | 2 | 3 }) => opener.open('same-id', '80mm', options) }; } },
  { name: 'orçamento', fetch: state.budget, data: budget, button: () => <PdvPreorderReceiptButton preorderId="same-id" />, useReader: () => { const opener = usePdvPreorderReceiptOpener('same-id'); return { ...opener, openReceipt: (options?: { target?: Window | null; copies?: 1 | 2 | 3 }) => opener.open('same-id', { ...options, format: '80mm' }) }; } },
];
function changeContext(phase: string) {
  if (phase === 'empresa') state.auth.profile.company_id = 'company-2';
  if (phase === 'usuário') { state.auth.user.id = 'user-2'; state.auth.profile.user_id = 'user-2'; }
  if (phase === 'revogação') state.auth.permissions = [];
  if (phase === 'papel') state.auth.roles = ['estoque'];
  if (phase === 'loading') state.auth.loading = true;
  if (phase === 'perfil antigo') state.auth.profile.user_id = 'old-user';
  if (phase === 'inativo') state.auth.profile.is_active = false;
  if (phase === 'desconhecido') state.auth.profile.is_active = undefined;
}

describe('publicação contextual de PDFs do PDV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth = { user: { id: 'user-1' }, profile: { user_id: 'user-1', company_id: 'company-1', is_active: true }, roles: ['comercial'], permissions: ['screen:pdv_orders'], hasPermissionRecord: true, loading: false, profileLoading: false };
    state.order.mockResolvedValue(PDV_RECEIPT_PREVIEW_FIXTURE); state.budget.mockResolvedValue(budget);
    state.logo.mockImplementation(async snapshot => snapshot); state.pdf.mockReturnValue(new Blob());
    state.pending.mockImplementation(() => ({ close: state.close, closed: false }));
  });
  for (const reader of readers) {
    describe(reader.name, () => {
      it.each(['empresa', 'usuário', 'revogação', 'papel', 'loading', 'perfil antigo', 'inativo', 'desconhecido', 'desmontagem'])('fecha aba manual e não publica resposta antiga após %s', async phase => {
        let finish!: (value: unknown) => void;
        reader.fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        const { rerender, unmount } = render(reader.button());
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(reader.fetch).toHaveBeenCalledOnce());
        const signal = reader.fetch.mock.calls[0][1] as AbortSignal;
        changeContext(phase);
        if (phase === 'desmontagem') unmount(); else rerender(reader.button());
        expect(signal.aborted).toBe(true); expect(state.close).toHaveBeenCalled();
        await act(async () => { finish(reader.data); });
        expect(state.logo).not.toHaveBeenCalled(); expect(state.pdf).not.toHaveBeenCalled(); expect(state.open).not.toHaveBeenCalled(); expect(state.toast).not.toHaveBeenCalled();
      });

      it('descarta PDF após logo em A→B→A e permite nova emissão do mesmo ID', async () => {
        let finishLogo!: (value: unknown) => void;
        state.logo.mockReturnValueOnce(new Promise(resolve => { finishLogo = resolve; }));
        const { rerender } = render(reader.button());
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(state.logo).toHaveBeenCalledOnce());
        state.auth.profile.company_id = 'company-2'; rerender(reader.button());
        state.auth.profile.company_id = 'company-1'; rerender(reader.button());
        expect(screen.getByRole('button')).toBeEnabled();
        await act(async () => { finishLogo(PDV_RECEIPT_PREVIEW_FIXTURE); });
        expect(state.pdf).not.toHaveBeenCalled(); expect(state.open).not.toHaveBeenCalled(); expect(state.toast).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(state.open).toHaveBeenCalledOnce());
      });

      it('não publica erro tardio de preparação do logo em outro contexto', async () => {
        let failLogo!: (error: Error) => void;
        state.logo.mockReturnValueOnce(new Promise((_, reject) => { failLogo = reject; }));
        const { rerender } = render(reader.button());
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(state.logo).toHaveBeenCalledOnce());
        changeContext('revogação'); rerender(reader.button());
        await act(async () => { failLogo(new Error('Falha tardia')); });
        expect(state.close).toHaveBeenCalled(); expect(state.open).not.toHaveBeenCalled(); expect(state.toast).not.toHaveBeenCalled();
      });

      it.each(['admin', 'gestor', 'comercial'])('preserva contexto pronto legado do papel %s sem inventar gate de tela', async role => {
        state.auth.roles = [role]; state.auth.permissions = []; state.auth.hasPermissionRecord = false;
        render(reader.button()); fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(state.open).toHaveBeenCalledOnce());
      });

      it.each(['loading', 'perfil antigo', 'inativo', 'desconhecido'])('não busca documento ao começar sem contexto confirmado: %s', phase => {
        changeContext(phase); render(reader.button());
        expect(screen.getByRole('button')).toBeDisabled(); fireEvent.click(screen.getByRole('button'));
        expect(reader.fetch).not.toHaveBeenCalled(); expect(state.pending).not.toHaveBeenCalled();
      });

      it.each(['empresa', 'revogação', 'desmontagem'])('cancela emissão automática preparada antes do writer confirmar após %s', async phase => {
        const { result, rerender, unmount } = renderHook(() => reader.useReader());
        const opener = result.current, notify = vi.fn();
        const attempt = opener.guardAttempt(preparePdvStageReceiptAuto({ policy: { autoPrint: true, format: '80mm', copies: 1 }, seen: new Set(), openPending: () => ({ close: state.close, closed: false }) as unknown as Window, notify }));
        changeContext(phase);
        if (phase === 'desmontagem') unmount(); else rerender();
        expect(attempt.isCurrent()).toBe(false); expect(state.close).toHaveBeenCalled();
        await attempt.commit('confirmed-event', (_format, options) => opener.openReceipt(options));
        expect(reader.fetch).not.toHaveBeenCalled(); expect(state.open).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
      });

      it('preserva evento automático idempotente e não reemite após remontar contexto igual', async () => {
        const seen = new Set<string>(), notify = vi.fn();
        const hook = renderHook(() => reader.useReader());
        let opener = hook.result.current;
        const prepare = () => opener.guardAttempt(preparePdvStageReceiptAuto({ policy: { autoPrint: true, format: '80mm', copies: 1 }, seen, openPending: () => ({ close: state.close, closed: false }) as unknown as Window, notify }));
        await prepare().commit('same-confirmed-event', (_format, options) => opener.openReceipt(options));
        hook.unmount();
        const next = renderHook(() => reader.useReader()); opener = next.result.current;
        await prepare().commit('same-confirmed-event', (_format, options) => opener.openReceipt(options));
        expect(reader.fetch).toHaveBeenCalledOnce(); expect(state.open).toHaveBeenCalledOnce(); expect(notify).not.toHaveBeenCalled();
      });

      it('continua apresentando erro real no contexto original', async () => {
        reader.fetch.mockRejectedValueOnce(new Error('Falha de leitura'));
        render(reader.button()); fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Não foi possível gerar o comprovante' })));
      });
    });
  }
});
