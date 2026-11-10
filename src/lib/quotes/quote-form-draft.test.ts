import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { QuoteFormDraftController, QUOTE_DRAFT_TTL_MS, type DraftReply, type DraftRpcError } from './quote-form-draft';

interface Draft { name: string; items: { price: number }[]; mode?: string }
const blank: Draft = { name: '', items: [] };
const one: Draft = { name: 'Clínica fictícia', items: [{ price: 120 }] };
const two: Draft = { name: 'Loja fictícia', items: [{ price: 220 }] };
const reply = (revision = 0, payload: unknown = null): DraftReply => ({ revision, payload, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + QUOTE_DRAFT_TTL_MS).toISOString() });
async function tick() { for (let i = 0; i < 6; i++) await Promise.resolve(); }
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function setup(remote: DraftReply = reply()) {
  const storage = new Map<string, string>();
  let current = remote;
  let lastRequestId: string | undefined;
  const read = vi.fn<() => Promise<{ data: DraftReply | null; error: DraftRpcError | null }>>(async () => ({ data: current, error: null }));
  const write = vi.fn<(data: Draft | null, revision: number, id: string) => Promise<{ data: DraftReply | null; error: DraftRpcError | null }>>(async (data, revision, _id) => {
    if (_id === lastRequestId) return { data: current, error: null };
    if (revision !== current.revision) return { data: null, error: { code: '40001' } };
    current = reply(current.revision + 1, data); lastRequestId = _id;
    return { data: current, error: null };
  });
  const changed = vi.fn();
  const createController = () => new QuoteFormDraftController<Draft>({ storageKey: 'user-a:company-a',
    storage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value); }, removeItem: key => { storage.delete(key); } },
    read, write, changed, ignoreKeys: () => ['mode'], debounceMs: () => 500,
  });
  const controller = createController();
  return { controller, createController, storage, read, write, changed, remote: () => current, setRemote: (next: DraftReply, requestId?: string) => { current = next; lastRequestId = requestId; } };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('personal quote draft: cloud truth and isolation', () => {
  it('does not create a remote draft from defaults', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick();
    h.controller.save({ ...blank, mode: 'registered' }); await h.controller.flush();
    expect(h.write).not.toHaveBeenCalled(); expect(h.controller.view.status).toBe('idle');
  });
  it('debounces complete data and only announces account after real acknowledgement', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick();
    h.controller.save(one); expect(h.controller.view.status).toBe('saving'); expect(h.controller.view.persistence).toBe('local');
    await vi.advanceTimersByTimeAsync(500);
    expect(h.write).toHaveBeenCalledTimes(1); expect(h.write.mock.calls[0][0]).toEqual(one);
    expect(h.controller.view.status).toBe('saved'); expect(h.controller.view.persistence).toBe('account');
    expect(h.controller.view.expiresAt! - h.controller.view.savedAt!).toBe(QUOTE_DRAFT_TTL_MS);
  });
  it('does not overwrite another device before the user accepts recovery', async () => {
    const h = setup(reply(4, one)); h.controller.activate(); h.controller.save(blank); await tick();
    expect(h.controller.view.draftData).toEqual(one); expect(h.controller.view.showResumePrompt).toBe(true);
    h.controller.save(two); await h.controller.flush(); expect(h.write).not.toHaveBeenCalled();
    h.controller.accept(); expect(h.controller.view.showResumePrompt).toBe(false); expect(h.write).not.toHaveBeenCalled();
  });
  it('keeps first edit made during hydration and saves it when no recovery exists', async () => {
    const h = setup(); const pending = deferred<{ data: DraftReply; error: null }>(); h.read.mockImplementationOnce(() => pending.promise);
    h.controller.activate(); h.controller.save(blank); h.controller.save(one); await tick();
    expect(h.write).not.toHaveBeenCalled(); pending.resolve({ data: reply(), error: null }); await tick();
    await h.controller.flush(); expect(h.remote().payload).toEqual(one);
  });
  it('closing during the debounce flushes latest data', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick(); h.controller.save(one);
    await h.controller.close(); expect(h.remote().payload).toEqual(one);
  });
  it('keeps network errors local and retries with the same idempotency key', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick();
    h.write.mockImplementationOnce(async () => ({ data: null, error: {} }));
    h.controller.save(one); await h.controller.flush();
    expect(h.controller.view.persistence).toBe('local'); expect(h.controller.view.syncIssue).toBe('unavailable');
    const requestId = h.write.mock.calls[0][2]; h.controller.retry(); await tick();
    expect(h.write.mock.calls[1][2]).toBe(requestId); expect(h.controller.view.persistence).toBe('account');
  });
  it('CAS conflict never silently overwrites a newer remote draft', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick();
    h.setRemote(reply(3, two)); h.controller.save(one); await h.controller.flush();
    expect(h.controller.view.syncIssue).toBe('conflict'); expect(h.controller.view.status).toBe('error');
    expect(h.remote().payload).toEqual(two); expect(JSON.parse([...h.storage.values()][0]).data).toEqual(one);
    h.controller.save({ ...one, name: 'Alteração local' }); await h.controller.flush(); expect(h.write).toHaveBeenCalledTimes(1);
  });
  it('ignores already expired remote payload while retaining CAS revision', async () => {
    const h = setup({ ...reply(5, one), expires_at: new Date(Date.now() - 1).toISOString() });
    h.controller.activate(); h.controller.save(blank); await tick();
    expect(h.controller.view.showResumePrompt).toBe(false);
    h.controller.save(two); await h.controller.flush(); expect(h.write.mock.calls[0][1]).toBe(5);
  });
  it('removes expired local fallback before recovery', async () => {
    const h = setup(); h.storage.set('user-a:company-a', JSON.stringify({ version: 1, data: one, expiresAt: Date.now() - 1, savedAt: 1, revision: 0, dirty: true }));
    h.controller.activate(); await tick(); expect(h.controller.view.showResumePrompt).toBe(false); expect(h.storage.size).toBe(0);
  });
  it('completion is an awaited server tombstone and cannot resurrect on close', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick(); h.controller.save(one); await h.controller.flush();
    await h.controller.clear(); await h.controller.flush(two); await h.controller.close();
    expect(h.remote().payload).toBe(null); expect(h.storage.size).toBe(0); expect(h.write).toHaveBeenCalledTimes(2);
  });
  it('serializes a delete behind an in-flight write', async () => {
    const h = setup(); const pending = deferred<{ data: DraftReply; error: null }>();
    h.controller.activate(); h.controller.save(blank); await tick();
    h.write.mockImplementationOnce(() => pending.promise); h.controller.save(one); const first = h.controller.flush(); await tick();
    const deleting = h.controller.clear(); h.setRemote(reply(1, one)); pending.resolve({ data: h.remote(), error: null });
    await first; await deleting; expect(h.remote().payload).toBe(null); expect(h.write.mock.calls[1][1]).toBe(1);
  });
  it('serializes edits made during a write using the newly acknowledged revision', async () => {
    const h = setup(); const pending = deferred<{ data: DraftReply; error: null }>();
    h.controller.activate(); h.controller.save(blank); await tick();
    h.write.mockImplementationOnce(() => pending.promise); h.controller.save(one); const first = h.controller.flush(); await tick();
    h.controller.save(two); const second = h.controller.flush(); h.setRemote(reply(1, one)); pending.resolve({ data: h.remote(), error: null });
    await first; await second; expect(h.remote().payload).toEqual(two); expect(h.write.mock.calls[1][1]).toBe(1);
  });
  it('switching identity cancels queued work and ignores a late read', async () => {
    const h = setup(); const pending = deferred<{ data: DraftReply; error: null }>(); h.read.mockImplementationOnce(() => pending.promise);
    h.controller.activate(); h.controller.save(blank); h.controller.save(one); await tick(); h.controller.stop();
    pending.resolve({ data: reply(3, two), error: null }); await tick(); await h.controller.flush();
    expect(h.write).not.toHaveBeenCalled(); expect(h.controller.view.showResumePrompt).toBe(false);
  });
  it('offline hydration does not issue blind writes with revision zero', async () => {
    const h = setup(); h.read.mockImplementationOnce(async () => ({ data: null, error: {} }));
    h.controller.activate(); h.controller.save(blank); await tick(); h.controller.save(one); await h.controller.flush();
    expect(h.write).not.toHaveBeenCalled(); expect(h.controller.view.persistence).toBe('local'); expect(h.controller.view.syncIssue).toBe('unavailable');
  });
  it('reconnect while already synchronized does not leave a permanent Saving label', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick(); h.controller.save(one); await h.controller.flush();
    h.controller.retry(); expect(h.controller.view.status).toBe('saved');
  });
  it('does not flag conflict when a lost acknowledgement already saved the same payload', async () => {
    const h = setup(reply(5, one));
    h.storage.set('user-a:company-a', JSON.stringify({ version: 1, data: one, savedAt: Date.now(), expiresAt: Date.now() + QUOTE_DRAFT_TTL_MS, revision: 4, dirty: true }));
    h.controller.activate(); await tick();
    expect(h.controller.view.syncIssue).toBe(null); expect(h.controller.view.persistence).toBe('account');
    expect(h.controller.view.draftData).toEqual(one);
  });
  it('does not overwrite an existing cloud draft with an offline version that never loaded a revision', async () => {
    const h = setup(reply(2, two));
    h.storage.set('user-a:company-a', JSON.stringify({ version: 1, data: one, savedAt: Date.now(), expiresAt: Date.now() + QUOTE_DRAFT_TTL_MS, revision: null, dirty: true }));
    h.controller.activate(); await tick();
    expect(h.controller.view.syncIssue).toBe('conflict'); expect(h.controller.view.draftData).toEqual(two);
    h.controller.accept(); await h.controller.flush(); expect(h.write).not.toHaveBeenCalled();
  });
  it('a suspended pending save cannot reappear after its 30 day expiration', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick(); h.controller.save(one);
    vi.setSystemTime(Date.now() + QUOTE_DRAFT_TTL_MS + 1); await h.controller.flush();
    expect(h.write).not.toHaveBeenCalled(); expect(h.controller.view.status).toBe('error');
  });
  it('offline clear has an honest local state instead of Saving forever', async () => {
    const h = setup(); h.read.mockImplementationOnce(async () => ({ data: null, error: {} }));
    h.controller.activate(); await tick(); await h.controller.clear();
    expect(h.controller.view.status).not.toBe('saving'); expect(h.controller.view.persistence).toBe('local');
  });

  it('reconciles a lost acknowledgement before saving an edit made in flight', async () => {
    const h = setup(); const lost = deferred<{ data: DraftReply | null; error: { code?: string } }>();
    h.controller.activate(); h.controller.save(blank); await tick();
    h.write.mockImplementationOnce(async (data, _revision, requestId) => { h.setRemote(reply(1, data), requestId); return lost.promise; });
    h.controller.save(one); const first = h.controller.flush(); await tick();
    h.controller.save(two); const second = h.controller.flush(); lost.resolve({ data: null, error: {} });
    await first; await second;
    expect(h.controller.view.syncIssue).toBe(null); expect(h.remote().payload).toEqual(two);
    expect(h.write.mock.calls.map(call => call[1])).toEqual([0, 0, 1]);
    expect(h.write.mock.calls[0][2]).toBe(h.write.mock.calls[1][2]);
  });
  it('reconciles a lost acknowledgement before clearing a completed quote', async () => {
    const h = setup(); const lost = deferred<{ data: DraftReply | null; error: { code?: string } }>();
    h.controller.activate(); h.controller.save(blank); await tick();
    h.write.mockImplementationOnce(async (data, _revision, requestId) => { h.setRemote(reply(1, data), requestId); return lost.promise; });
    h.controller.save(one); const first = h.controller.flush(); await tick();
    const deleting = h.controller.clear(); lost.resolve({ data: null, error: {} }); await first; await deleting;
    expect(h.controller.view.syncIssue).toBe(null); expect(h.remote().payload).toBe(null);
    await h.controller.close(); h.controller.activate(); await tick(); expect(h.controller.view.showResumePrompt).toBe(false);
  });
  it('reconciles uncertain write and a newer tombstone across unmount/remount', async () => {
    const h = setup(); const lost = deferred<{ data: DraftReply | null; error: { code?: string } }>();
    h.controller.activate(); h.controller.save(blank); await tick();
    h.write.mockImplementationOnce(async (data, _revision, requestId) => { h.setRemote(reply(1, data), requestId); return lost.promise; });
    h.controller.save(one); const first = h.controller.flush(); await tick();
    const deleting = h.controller.clear();
    // Primeiro retry continua offline. O backup deve guardar A incerto e B=null.
    h.write.mockImplementationOnce(async () => ({ data: null, error: {} }));
    lost.resolve({ data: null, error: {} }); await first; await deleting; h.controller.stop();
    const restored = h.createController(); restored.activate(); await tick();
    expect(h.remote().payload).toBeNull(); expect(restored.view.showResumePrompt).toBe(false);
    expect(restored.view.syncIssue).toBeNull();
  });
  it('removes clean backup when another device has completed the draft, including subsequent offline recovery', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick();
    h.controller.save(one); await h.controller.flush(); await h.controller.close();
    h.setRemote(reply(2, null)); h.controller.activate(); await tick();
    expect(h.storage.size).toBe(0); await h.controller.close();
    h.read.mockImplementationOnce(async () => ({ data: null, error: {} }));
    h.controller.activate(); await tick(); expect(h.controller.view.showResumePrompt).toBe(false);
  });

  it('reverting to the cloud value before debounce replaces the dirty local backup', async () => {
    const h = setup(reply(1, one)); h.controller.activate(); await tick(); h.controller.accept();
    h.controller.save(two); h.controller.save(one); await h.controller.flush();
    expect(h.write).not.toHaveBeenCalled();
    const local = JSON.parse(h.storage.get('user-a:company-a')!);
    expect(local.data).toEqual(one); expect(local.dirty).toBe(false);
  });

  it('an expired uncertain write does not block a new draft after 30 days', async () => {
    const h = setup(); h.controller.activate(); h.controller.save(blank); await tick();
    h.write.mockImplementationOnce(async () => ({ data: null, error: {} }));
    h.controller.save(one); await h.controller.flush(); await h.controller.close();
    vi.setSystemTime(Date.now() + QUOTE_DRAFT_TTL_MS + 1);
    h.controller.activate(); h.controller.save(blank); await tick();
    h.controller.save(two); await h.controller.flush(); expect(h.remote().payload).toEqual(two);
  });

  it('accepting an explicitly recovered remote version resolves the hydrated conflict for future edits', async () => {
    const h = setup(reply(5, two));
    h.storage.set('user-a:company-a', JSON.stringify({ version: 1, data: one, savedAt: Date.now(), expiresAt: Date.now() + QUOTE_DRAFT_TTL_MS, revision: 3, dirty: true }));
    h.controller.activate(); await tick(); expect(h.controller.view.syncIssue).toBe('conflict');
    h.controller.accept(); h.controller.save({ ...two, name: 'Remoto revisado' }); await h.controller.flush();
    expect(h.controller.view.syncIssue).toBeNull(); expect(h.remote().payload).toMatchObject({ name: 'Remoto revisado' });
    expect(h.write.mock.calls[0][1]).toBe(5);
  });
  it('starting over explicitly resolves hydrated conflict with the freshly read CAS revision', async () => {
    const h = setup(reply(5, two));
    h.storage.set('user-a:company-a', JSON.stringify({ version: 1, data: one, savedAt: Date.now(), expiresAt: Date.now() + QUOTE_DRAFT_TTL_MS, revision: 3, dirty: true }));
    h.controller.activate(); await tick(); h.controller.startNew(); await h.controller.flush();
    h.controller.save(one); await h.controller.flush();
    expect(h.controller.view.syncIssue).toBeNull(); expect(h.remote().payload).toEqual(one); expect(h.write.mock.calls[0][1]).toBe(5);
  });

});
