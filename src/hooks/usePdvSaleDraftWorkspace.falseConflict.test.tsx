import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdvSaleDraftWorkspace } from './usePdvSaleDraftWorkspace';
import { completeDurablePdvDirectSale, createDurablePdvDirectSaleAttempt } from '@/lib/pdv/directSaleRecovery';
import { pdvSaleDraftStorageKey, type PdvSaleDraft } from '@/lib/pdv/sale-drafts';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', async () => {
  const { SupabaseClient } = await import('@supabase/supabase-js');
  const { PostgrestClient } = await import('@supabase/postgrest-js');
  return { supabase: { rpc: SupabaseClient.prototype.rpc,
    rest: new PostgrestClient('https://example.invalid/rest/v1', {
      fetch: async (url, options) => {
        const response = await rpc(new URL(String(url)).pathname.split('/').at(-1), JSON.parse(String(options?.body ?? '{}')));
        return new Response(JSON.stringify(response.error ?? response.data), {
          status: response.error ? 400 : 200, headers: { 'Content-Type': 'application/json' },
        });
      },
    }),
  } };
});

const owner = { companyId: 'company-a', userId: 'operator-a', cashSessionId: 'opening-a', terminalId: 'terminal-a', stockId: 'stock-a' };
const options = { owner, transactionDate: '2026-11-25', defaultStockId: owner.stockId, directSaleV2: true };

/** O Postgres guarda `jsonb` com as chaves reordenadas (tamanho, depois alfabética). */
function asJsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(asJsonb);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => [key, asJsonb(item)]));
}

/** Conta falsa com o mesmo contrato de revisão (CAS) e a mesma ordenação de chaves do banco real. */
function fakeAccount() {
  const rows = new Map<string, { id: string; revision: number; payload: unknown }>();
  rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'pdv_list_order_drafts_v2') return { data: [...rows.values()], error: null };
    if (name === 'pdv_save_order_draft_v2') {
      const id = String(args.p_draft_id);
      const current = rows.get(id);
      if ((current?.revision ?? 0) !== args.p_expected_revision) return { data: null, error: { code: '40001', message: 'Conflito de revisao do rascunho.' } };
      const row = { id, revision: (current?.revision ?? 0) + 1, payload: asJsonb(args.p_payload) };
      rows.set(id, row);
      return { data: row, error: null };
    }
    return { data: { deleted_at: new Date().toISOString() }, error: null };
  });
  return rows;
}

/** Mesma forma do `setCart` da tela: a linha nasce na ordem de chaves do carrinho. */
function addLine(draft: PdvSaleDraft): PdvSaleDraft {
  return {
    ...draft,
    cart: { ...draft.cart, lines: [...draft.cart.lines, {
      inventoryId: 'item-a', name: 'Cabo PP 4x2,5mm', imageUrl: null, unitPrice: 18, unit: 'm',
      unitCost: 0, quantity: 100, discountAmount: 0, availableQuantity: 1000,
    }] },
    appliedVoucher: null,
    appliedVouchers: [],
    attempt: draft.attempt,
  };
}

describe('reabrir o PDV não transforma o mesmo atendimento em versões diferentes', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());

  it('venda digitada e já salva na conta continua finalizável depois de sair e voltar à tela', async () => {
    const rows = fakeAccount();
    const first = renderHook(() => usePdvSaleDraftWorkspace(options));
    await waitFor(() => expect(first.result.current.serverReady).toBe(true));
    const draftId = first.result.current.activeDraft.id;
    act(() => first.result.current.updateActiveDraft(addLine));
    await waitFor(() => expect(rows.get(draftId)?.revision).toBe(1), { timeout: 4000 });
    first.unmount();

    // O operador saiu da tela (ou a página recarregou) e voltou ao mesmo caixa.
    const second = renderHook(() => usePdvSaleDraftWorkspace(options));
    await waitFor(() => expect(second.result.current.serverReady).toBe(true));
    expect(second.result.current.draftConflicts).toEqual([]);
    expect(second.result.current.syncIssue).toBeNull();
    expect(second.result.current.workspace.drafts).toHaveLength(1);

    const attempt = createDurablePdvDirectSaleAttempt('intent', 'stable');
    let saved: unknown;
    await act(async () => { saved = await second.result.current.persistDraftNow(draftId, draft => ({ ...draft, attempt })); });
    expect(saved).toEqual({ server: 'saved', localSaved: true });
  });

  it('venda com tentativa já gravada continua finalizável depois de sair e voltar à tela', async () => {
    const rows = fakeAccount();
    const first = renderHook(() => usePdvSaleDraftWorkspace(options));
    await waitFor(() => expect(first.result.current.serverReady).toBe(true));
    const draftId = first.result.current.activeDraft.id;
    act(() => first.result.current.updateActiveDraft(addLine));
    const attempt = createDurablePdvDirectSaleAttempt('intent', 'stable');
    await act(async () => { await first.result.current.persistDraftNow(draftId, draft => ({ ...draft, attempt })); });
    await waitFor(() => expect((rows.get(draftId)?.payload as { attempt?: unknown } | undefined)?.attempt).toBeTruthy(), { timeout: 4000 });
    first.unmount();

    const second = renderHook(() => usePdvSaleDraftWorkspace(options));
    await waitFor(() => expect(second.result.current.serverReady).toBe(true));
    expect(second.result.current.draftConflicts).toEqual([]);
    expect(second.result.current.syncIssue).toBeNull();
    let saved: unknown;
    await act(async () => {
      saved = await second.result.current.persistDraftNow(draftId, draft => ({ ...draft, attempt: draft.attempt ?? attempt }));
    });
    expect(saved).toEqual({ server: 'saved', localSaved: true });
  });

  it('libera sozinho o atendimento que uma versão anterior travou sem haver diferença de conteúdo', async () => {
    const rows = fakeAccount();
    const first = renderHook(() => usePdvSaleDraftWorkspace(options));
    await waitFor(() => expect(first.result.current.serverReady).toBe(true));
    const draftId = first.result.current.activeDraft.id;
    act(() => first.result.current.updateActiveDraft(addLine));
    await waitFor(() => expect(rows.get(draftId)?.revision).toBe(1), { timeout: 4000 });
    first.unmount();

    // Estado deixado no navegador pela comparação por texto cru: a venda igual
    // foi gravada como duas "versões", e o clique em Finalizar instalou a
    // tentativa só neste dispositivo (a conta recusou por causa do bloqueio).
    const key = pdvSaleDraftStorageKey(owner);
    const stored = JSON.parse(localStorage.getItem(key)!);
    const saved = stored.drafts.find((draft: { id: string }) => draft.id === draftId);
    const attempt = createDurablePdvDirectSaleAttempt('intent', 'stable');
    const attempted = { ...saved, attempt, updatedAt: '2026-11-25T20:49:30.000Z' };
    localStorage.setItem(key, JSON.stringify({ ...stored, drafts: [attempted] }));
    localStorage.setItem(`${key}:server-bases`, JSON.stringify([[draftId, { revision: 1, serialized: JSON.stringify(saved) }]]));
    localStorage.setItem(`${key}:server-conflicts`, JSON.stringify({
      blocked: [draftId],
      versions: [[draftId, [JSON.stringify(rows.get(draftId)!.payload), JSON.stringify(saved), JSON.stringify(attempted)]]],
    }));

    const second = renderHook(() => usePdvSaleDraftWorkspace(options));
    await waitFor(() => expect(second.result.current.serverReady).toBe(true));
    expect(second.result.current.draftConflicts).toEqual([]);
    expect(second.result.current.syncIssue).toBeNull();
    expect(JSON.parse(localStorage.getItem(`${key}:server-conflicts`)!)).toEqual({ blocked: [], versions: [] });
    let result: unknown;
    await act(async () => { result = await second.result.current.persistDraftNow(draftId, draft => ({ ...draft, attempt: draft.attempt ?? attempt })); });
    expect(result).toEqual({ server: 'saved', localSaved: true });
    expect((rows.get(draftId)!.payload as { attempt: { clientRequestId: string } }).attempt.clientRequestId).toBe('stable');
    expect(second.result.current.workspace.drafts).toHaveLength(1);
  });

  it('continua protegendo quando a conta realmente mudou em outro dispositivo', async () => {
    const rows = fakeAccount();
    const first = renderHook(() => usePdvSaleDraftWorkspace(options));
    await waitFor(() => expect(first.result.current.serverReady).toBe(true));
    const draftId = first.result.current.activeDraft.id;
    act(() => first.result.current.updateActiveDraft(addLine));
    await waitFor(() => expect(rows.get(draftId)?.revision).toBe(1), { timeout: 4000 });
    first.unmount();

    const key = pdvSaleDraftStorageKey(owner);
    const stored = JSON.parse(localStorage.getItem(key)!);
    const saved = stored.drafts.find((draft: { id: string }) => draft.id === draftId);
    // Outro dispositivo gravou uma observação; este ficou com outra, ainda não enviada.
    rows.set(draftId, { id: draftId, revision: 2, payload: asJsonb({ ...saved, notes: 'Entregar amanhã', updatedAt: '2026-11-25T20:50:00.000Z' }) });
    localStorage.setItem(key, JSON.stringify({ ...stored, drafts: [{ ...saved, notes: 'Retira na loja', updatedAt: '2026-11-25T20:51:00.000Z' }] }));
    localStorage.setItem(`${key}:server-conflicts`, JSON.stringify({ blocked: [draftId], versions: [[draftId, [JSON.stringify(saved)]]] }));

    const second = renderHook(() => usePdvSaleDraftWorkspace(options));
    await waitFor(() => expect(second.result.current.serverReady).toBe(true));
    expect(second.result.current.draftConflicts).toHaveLength(1);
    expect(second.result.current.syncIssue).toBe('conflict');
    const attempt = createDurablePdvDirectSaleAttempt('intent', 'stable');
    let result: unknown;
    await act(async () => { result = await second.result.current.persistDraftNow(draftId, draft => ({ ...draft, attempt })); });
    expect(result).toEqual({ server: 'conflict', localSaved: true });
    expect(rows.get(draftId)!.revision).toBe(2);
  });
});

describe('venda recusada pelo servidor libera o atendimento para correção', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
  afterEach(() => vi.restoreAllMocks());

  it('remove a tentativa do atendimento neste dispositivo e na conta, e a venda corrigida segue com outra identidade', async () => {
    const rows = fakeAccount();
    const { result } = renderHook(() => usePdvSaleDraftWorkspace(options));
    await waitFor(() => expect(result.current.serverReady).toBe(true));
    const draftId = result.current.activeDraft.id;
    act(() => result.current.updateActiveDraft(addLine));
    const refusal = new Error('O limite disponível do cliente não cobre esta venda.');
    const persist = (attempt: NonNullable<PdvSaleDraft['attempt']>) => result.current.persistDraftNow(draftId, draft => ({ ...draft, attempt }));
    const release = (attempt: NonNullable<PdvSaleDraft['attempt']>) => result.current.persistDraftNow(draftId, draft =>
      draft.attempt?.clientRequestId === attempt.clientRequestId ? { ...draft, attempt: null } : draft);
    let refusedKey: string | undefined;

    await act(async () => {
      await expect(completeDurablePdvDirectSale({ attempt: result.current.activeDraft.attempt, signature: 'fiado', persist,
        complete: async attempt => { refusedKey = attempt.idempotencyKey; throw refusal; },
        onConfirmed: vi.fn(), isDefinitiveRejection: error => error === refusal, release })).rejects.toBe(refusal);
    });
    expect(refusedKey).toMatch(/^direct-sale-v3-/);
    expect(result.current.activeDraft.attempt).toBeNull();
    expect((rows.get(draftId)!.payload as { attempt: unknown }).attempt).toBeNull();
    expect(result.current.draftConflicts).toEqual([]);

    // O operador troca a forma de pagamento: a assinatura muda e a venda segue.
    const complete = vi.fn(async (_attempt: NonNullable<PdvSaleDraft['attempt']>) => ({ orderId: 'order', orderNumber: 23, deliveryId: 'delivery', subtotal: 1800, discountAmount: 0, total: 1800, idempotent: false }));
    await act(async () => {
      await completeDurablePdvDirectSale({ attempt: result.current.activeDraft.attempt, signature: 'dinheiro', persist,
        complete, onConfirmed: vi.fn(), isDefinitiveRejection: error => error === refusal, release });
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0][0].idempotencyKey).not.toBe(refusedKey);
    expect(result.current.activeDraft.attempt?.confirmedSale?.orderNumber).toBe(23);
  });
});

