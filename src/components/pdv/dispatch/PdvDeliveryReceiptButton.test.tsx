import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { preparePdvStageReceiptAuto } from '@/lib/pdv/receipt/stageAuto';
import { PdvDeliveryReceiptButton, openPdvDeliveryReceipt, usePdvDeliveryReceiptOpener } from './PdvDeliveryReceiptButton';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), preview: vi.fn(), pending: vi.fn(), logo: vi.fn(), toast: vi.fn(),
  company: null as { name: string; whiteLabelEnabled: boolean } | null,
  auth: { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true as boolean | undefined }, permissions: ['screen:pdv_dispatch'], roles: ['estoque'], hasPermissionRecord: true, loading: false, profileLoading: false },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/usePdvDispatch', () => ({ fetchPdvDeliveryReceipt: mocks.fetch }));
vi.mock('@/lib/pdv/deliveryReceiptPdf', () => ({ previewPdvDeliveryReceipt: mocks.preview, toPdvDeliveryReceiptSnapshot: (_snapshot: unknown, options: unknown) => options }));
vi.mock('@/lib/pdv/receipt/pdf', () => ({ preparePdvReceiptSnapshotLogo: mocks.logo }));
vi.mock('@/utils/openPdfInTab', () => ({ openPendingPdfTab: mocks.pending }));
vi.mock('@/hooks/usePdvReceiptCompany', () => ({ usePdvReceiptCompany: () => mocks.company, PDV_RECEIPT_COMPANY_PENDING: 'Aguarde a identificação da empresa para gerar o comprovante.' }));
vi.mock('@/hooks/usePdvReceiptSettings', () => ({ usePdvReceiptSettings: () => ({ data: null }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

describe('comprovante da retirada persistida', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.company = null;
    mocks.auth = { user: { id: 'user-1' }, profile: { company_id: 'company-1', user_id: 'user-1', is_active: true }, permissions: ['screen:pdv_dispatch'], roles: ['estoque'], hasPermissionRecord: true, loading: false, profileLoading: false };
    mocks.logo.mockImplementation(async (snapshot: unknown) => snapshot);
  });
  it('usa apenas o evento parcial retornado, com empresa real e formato escolhido', async () => {
    const event = { deliveryId: 'withdrawal-2', withdrawnAt: '2026-11-14T10:30:00Z', order: { id: 'order-1', number: 1, status: 'retirada_parcial' }, customerName: 'Cliente exemplo', stockName: 'Depósito', items: [{ description: 'Material exemplo', unit: 'un', quantity: 1, remainingQuantity: 4 }] };
    mocks.fetch.mockResolvedValue(event);
    const target = { close: vi.fn() } as unknown as Window;
    const company = { name: 'Empresa exemplo', whiteLabelEnabled: false };
    await openPdvDeliveryReceipt('withdrawal-2', '80mm', { target, company, copies: 2 });
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('withdrawal-2');
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(event, target, { company, format: '80mm', copies: 2 });
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(event.items[0]).toEqual({ description: 'Material exemplo', unit: 'un', quantity: 1, remainingQuantity: 4 });
  });

  it('desabilita emissão manual e fecha placeholder automático sem buscar dados quando identidade não está pronta', async () => {
    render(<PdvDeliveryReceiptButton deliveryId="withdrawal-2" />);
    const button = screen.getByRole('button', { name: 'Comprovante' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    const target = { close: vi.fn() } as unknown as Window;
    await expect(openPdvDeliveryReceipt('withdrawal-2', '80mm', { target, company: null })).rejects.toThrow('Aguarde a identificação da empresa');
    expect(target.close).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.pending).not.toHaveBeenCalled();
  });

  it.each(['empresa', 'usuário', 'permissão', 'inativo', 'desconhecido', 'desmontagem'] as const)('fecha PDF manual pendente e descarta resposta após %s', async phase => {
    mocks.company = { name: 'Empresa exemplo', whiteLabelEnabled: false };
    let finish!: (data: unknown) => void;
    mocks.fetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const close = vi.fn(); mocks.pending.mockReturnValue({ close });
    const { rerender, unmount } = render(<PdvDeliveryReceiptButton deliveryId="same-delivery" />);
    fireEvent.click(screen.getByRole('button', { name: 'Comprovante' }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    const signal = mocks.fetch.mock.calls[0][1] as AbortSignal;
    if (phase === 'empresa') mocks.auth.profile.company_id = 'company-2';
    if (phase === 'usuário') { mocks.auth.user.id = 'user-2'; mocks.auth.profile.user_id = 'user-2'; }
    if (phase === 'permissão') mocks.auth.permissions = [];
    if (phase === 'inativo') mocks.auth.profile.is_active = false;
    if (phase === 'desconhecido') mocks.auth.profile.is_active = undefined;
    if (phase === 'desmontagem') unmount(); else rerender(<PdvDeliveryReceiptButton deliveryId="same-delivery" />);
    expect(signal.aborted).toBe(true); expect(close).toHaveBeenCalled();
    await act(async () => { finish({ deliveryId: 'old-delivery' }); });
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.logo).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('descarta PDF A→B→A após logo assíncrono e libera nova tentativa no mesmo ID', async () => {
    mocks.company = { name: 'Empresa exemplo', whiteLabelEnabled: false };
    mocks.fetch.mockResolvedValue({ deliveryId: 'same-delivery' });
    let logoDone!: (value: unknown) => void;
    mocks.logo.mockReturnValueOnce(new Promise(resolve => { logoDone = resolve; }));
    const close = vi.fn(); mocks.pending.mockReturnValue({ close });
    const { rerender } = render(<PdvDeliveryReceiptButton deliveryId="same-delivery" />);
    fireEvent.click(screen.getByRole('button', { name: 'Comprovante' }));
    await waitFor(() => expect(mocks.logo).toHaveBeenCalledOnce());
    mocks.auth.profile.company_id = 'company-2'; rerender(<PdvDeliveryReceiptButton deliveryId="same-delivery" />);
    mocks.auth.profile.company_id = 'company-1'; rerender(<PdvDeliveryReceiptButton deliveryId="same-delivery" />);
    expect(screen.getByRole('button', { name: 'Comprovante' })).toBeEnabled();
    await act(async () => { logoDone({ company: mocks.company }); });
    expect(mocks.preview).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Comprovante' }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
  });

  it.each(['empresa', 'desmontagem'] as const)('cancela placeholder automático ainda sem writer confirmado após %s', async phase => {
    mocks.company = { name: 'Empresa exemplo', whiteLabelEnabled: false };
    const close = vi.fn(), notify = vi.fn();
    const { result, rerender, unmount } = renderHook(() => usePdvDeliveryReceiptOpener('order-1'));
    const oldOpener = result.current;
    const attempt = oldOpener.guardAttempt(preparePdvStageReceiptAuto({ policy: { autoPrint: true, format: '80mm', copies: 1 }, openPending: () => ({ close, closed: false }) as unknown as Window, seen: new Set(), notify }));
    if (phase === 'desmontagem') unmount(); else { mocks.auth.profile.company_id = 'company-2'; rerender(); }
    expect(close).toHaveBeenCalled();
    await attempt.commit('delivery:old', (format, options) => oldOpener.open('old', format, options));
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.preview).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
  });

  it('mantém deduplicação automática por evento confirmado no mesmo contexto', async () => {
    mocks.company = { name: 'Empresa exemplo', whiteLabelEnabled: false };
    mocks.fetch.mockResolvedValue({ deliveryId: 'confirmed-delivery' });
    const close = vi.fn(), notify = vi.fn(), seen = new Set<string>();
    const { result } = renderHook(() => usePdvDeliveryReceiptOpener('order-1'));
    const opener = result.current;
    for (let retry = 0; retry < 2; retry++) {
      const attempt = opener.guardAttempt(preparePdvStageReceiptAuto({ policy: { autoPrint: true, format: '80mm', copies: 1 }, openPending: () => ({ close, closed: false }) as unknown as Window, seen, notify }));
      await attempt.commit('delivery:confirmed-delivery', (format, options) => opener.open('confirmed-delivery', format, options));
    }
    expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.preview).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce(); expect(notify).not.toHaveBeenCalled();
  });

  it('não apresenta erro do PDF automático em outra empresa durante preparação do logo', async () => {
    mocks.company = { name: 'Empresa exemplo', whiteLabelEnabled: false };
    mocks.fetch.mockResolvedValue({ deliveryId: 'delivery-1' });
    let rejectLogo!: (error: Error) => void;
    mocks.logo.mockReturnValueOnce(new Promise((_, reject) => { rejectLogo = reject; }));
    const close = vi.fn(), notify = vi.fn();
    const { result, rerender } = renderHook(() => usePdvDeliveryReceiptOpener('order-1'));
    const opener = result.current;
    const attempt = opener.guardAttempt(preparePdvStageReceiptAuto({ policy: { autoPrint: true, format: '80mm', copies: 1 }, openPending: () => ({ close, closed: false }) as unknown as Window, seen: new Set(), notify }));
    const committed = attempt.commit('delivery:delivery-1', (format, options) => opener.open('delivery-1', format, options));
    await waitFor(() => expect(mocks.logo).toHaveBeenCalledOnce());
    mocks.auth.profile.company_id = 'company-2'; rerender();
    rejectLogo(new Error('Falha tardia'));
    await committed;
    expect(mocks.preview).not.toHaveBeenCalled(); expect(close).toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled();
  });

});
