import type { FormDraftSaveStatus } from '@/hooks/useFormDraft';

export const QUOTE_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export type QuoteDraftPersistence = 'account' | 'local';
export type QuoteDraftSyncIssue = 'conflict' | 'unavailable' | null;
export interface DraftReply { payload?: unknown; revision: number; updated_at: string | null; expires_at: string | null }
export interface DraftRpcError { code?: string }
interface Pending<T> { data: T | null; snapshot: string; requestId: string; revision: number | null; expiresAt: number }
interface Backup<T> { version: 1; data: T | null; savedAt: number; expiresAt: number; revision: number | null; requestId?: string; dirty: boolean; uncertain?: Pending<T> }
export interface QuoteDraftView<T> {
  draftData: T | null; showResumePrompt: boolean; status: FormDraftSaveStatus;
  savedAt: number | null; expiresAt: number | null; persistence: QuoteDraftPersistence;
  isLoading: boolean; syncIssue: QuoteDraftSyncIssue;
}
interface ControllerOptions<T> {
  storageKey: string;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  read: () => Promise<{ data: DraftReply | null; error: DraftRpcError | null }>;
  write: (payload: T | null, revision: number, requestId: string) => Promise<{ data: DraftReply | null; error: DraftRpcError | null }>;
  changed: (view: QuoteDraftView<T>) => void;
  legacyRead?: () => T | null;
  legacyClear?: () => void;
  ignoreKeys: () => string[];
  debounceMs: () => number;
}
export const emptyQuoteDraftView = <T>(): QuoteDraftView<T> => ({ draftData: null, showResumePrompt: false, status: 'idle', savedAt: null, expiresAt: null, persistence: 'account', isLoading: true, syncIssue: null });
function meaningful(value: unknown): boolean {
  if (value == null || value === '' || value === false || value === 0) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/** Serial writes + CAS. Local data is a fallback, never evidence of a cloud save. */
export class QuoteFormDraftController<T extends object> {
  view = emptyQuoteDraftView<T>();
  private queue: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private open = false;
  private stopped = false;
  private suppressed = false;
  private baseline: string | null = null;
  private latest: T | null = null;
  private revision: number | null = null;
  private remoteSnapshot: string | null = null;
  private inFlight = false;
  private pending: Pending<T> | null = null;
  private uncertain: Pending<T> | null = null;
  private conflictCanBeResolved = false;
  private backup: Backup<T> | null = null;
  constructor(private options: ControllerOptions<T>) {}
  private update(patch: Partial<QuoteDraftView<T>>) {
    this.view = { ...this.view, ...patch };
    if (!this.stopped) this.options.changed(this.view);
  }
  private useful(data: T) { return Object.entries(data).some(([key, value]) => !this.options.ignoreKeys().includes(key) && meaningful(value)); }
  private localRead(): Backup<T> | null {
    try {
      const staleConflict = this.options.storage.getItem(`${this.options.storageKey}:conflict`);
      if (staleConflict && JSON.parse(staleConflict).expiresAt <= Date.now()) this.options.storage.removeItem(`${this.options.storageKey}:conflict`);
      const raw = this.options.storage.getItem(this.options.storageKey);
      if (!raw) {
        const legacy = this.options.legacyRead?.();
        if (legacy && this.useful(legacy)) {
          const migrated: Backup<T> = { version: 1, data: legacy, savedAt: Date.now(), expiresAt: Date.now() + QUOTE_DRAFT_TTL_MS, revision: null, dirty: true };
          if (this.localWrite(migrated)) this.options.legacyClear?.(); return migrated;
        }
        return null;
      }
      const value = JSON.parse(raw) as Backup<T>;
      if (value.version !== 1 || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()
          || (value.data !== null && (typeof value.data !== 'object' || Array.isArray(value.data)))) {
        this.options.storage.removeItem(this.options.storageKey); return null;
      }
      return value;
    } catch { return null; }
  }
  private localWrite(backup: Backup<T>) {
    const next = { ...backup };
    if (this.uncertain) next.uncertain = this.uncertain; else delete next.uncertain;
    this.backup = next;
    try { this.options.storage.setItem(this.options.storageKey, JSON.stringify(next)); return true; } catch { return false; }
  }
  private cancelTimer() { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }
  activate() {
    this.stopped = false; this.open = true; this.suppressed = false; this.baseline = null; this.latest = null;
    this.generation += 1;
    const generation = this.generation;
    this.update({ ...emptyQuoteDraftView<T>() });
    this.backup = this.localRead();
    if (this.uncertain && this.uncertain.expiresAt <= Date.now()) this.uncertain = null;
    if (this.pending && this.pending.expiresAt <= Date.now()) this.pending = null;
    this.queue = this.queue.then(async () => {
      // Confirma uma escrita de resultado incerto com a MESMA chave antes de
      // comparar o backup mais novo (incluindo tombstones) com o servidor.
      const savedUncertain = this.backup?.uncertain;
      if (savedUncertain && savedUncertain.expiresAt > Date.now()) {
        this.uncertain = savedUncertain;
        this.revision = savedUncertain.revision;
        const latest = this.backup!;
        this.pending = { data: latest.data, snapshot: JSON.stringify(latest.data), requestId: latest.requestId ?? crypto.randomUUID(), revision: null, expiresAt: latest.expiresAt };
        if (this.pending.requestId === savedUncertain.requestId) this.pending = savedUncertain;
        await this.writePending();
      }
      let reply: Awaited<ReturnType<ControllerOptions<T>['read']>>;
      try { reply = await this.options.read(); } catch { reply = { data: null, error: {} }; }
      if (this.stopped || generation !== this.generation) return;
      const local = this.backup;
      const localPayload = local?.data && this.useful(local.data) ? local.data : null;
      if (reply.error || !reply.data) {
        this.revision = null;
        this.update({ draftData: localPayload, showResumePrompt: !!localPayload, isLoading: false,
          status: local ? 'saved' : 'error', persistence: 'local', savedAt: local?.savedAt ?? null,
          expiresAt: local?.expiresAt ?? null, syncIssue: 'unavailable' });
        return;
      }
      const remote = reply.data;
      this.revision = remote.revision;
      const remotePayload = remote.payload && typeof remote.payload === 'object' && !Array.isArray(remote.payload)
        && (!remote.expires_at || Date.parse(remote.expires_at) > Date.now()) ? remote.payload as T : null;
      this.remoteSnapshot = JSON.stringify(remotePayload);
      const alreadySynced = !!local && JSON.stringify(local.data) === JSON.stringify(remotePayload);
      const conflict = !!local?.dirty && !alreadySynced && ((local.revision === null && remotePayload !== null) || (local.revision !== null && local.revision !== remote.revision));
      const preferLocal = !!local?.dirty && !alreadySynced && !conflict;
      this.conflictCanBeResolved = conflict;
      const payload = preferLocal ? localPayload : remotePayload;
      const savedAt = preferLocal ? local!.savedAt : remote.updated_at ? Date.parse(remote.updated_at) : null;
      const expiresAt = preferLocal ? local!.expiresAt : remote.expires_at ? Date.parse(remote.expires_at) : null;
      if (!remotePayload && (!local?.dirty || alreadySynced)) { this.backup = null; try { this.options.storage.removeItem(this.options.storageKey); } catch { /* remote empty */ } }
      if (!preferLocal && !conflict && remotePayload) this.localWrite({ version: 1, data: remotePayload, revision: remote.revision,
        savedAt: savedAt!, expiresAt: expiresAt!, dirty: false });
      this.update({ draftData: payload, showResumePrompt: !!payload, isLoading: false,
        status: conflict ? 'error' : payload ? 'saved' : 'idle', persistence: preferLocal ? 'local' : 'account', savedAt, expiresAt,
        syncIssue: conflict ? 'conflict' : null });
      if (preferLocal && local && !local.data) { this.pending = { data: null, snapshot: 'null', requestId: local.requestId ?? crypto.randomUUID(), revision: local.revision, expiresAt: local.expiresAt }; await this.writePending(); }
      else if (!payload && this.latest) this.save(this.latest);
    });
  }
  save(data: T) {
    if (this.stopped || !this.open || this.suppressed) return;
    const snapshot = JSON.stringify(data);
    this.latest = data;
    if (this.baseline === null) { this.baseline = snapshot; return; }
    if (this.view.isLoading || this.view.showResumePrompt) return;
    if (!this.useful(data)) {
      if (this.backup?.data || this.remoteSnapshot && this.remoteSnapshot !== 'null') void this.clear(false);
      else { this.cancelTimer(); this.update({ status: 'idle' }); }
      return;
    }
    if (snapshot === this.baseline && !this.pending && !this.backup?.data) return;
    if (snapshot === this.remoteSnapshot && !this.inFlight && !this.uncertain) {
      this.cancelTimer(); this.pending = null;
      if (this.revision !== null) this.localWrite({ version: 1, data, savedAt: this.view.savedAt ?? Date.now(), expiresAt: this.view.expiresAt ?? Date.now() + QUOTE_DRAFT_TTL_MS, revision: this.revision, dirty: false });
      this.update({ status: 'saved', persistence: 'account', syncIssue: null }); return;
    }
    if (this.pending?.snapshot === snapshot) return;
    this.cancelTimer();
    this.pending = { data, snapshot, requestId: crypto.randomUUID(), revision: null, expiresAt: Date.now() + QUOTE_DRAFT_TTL_MS };
    const now = Date.now();
    const localSaved = this.localWrite({ version: 1, data, savedAt: now, expiresAt: now + QUOTE_DRAFT_TTL_MS, revision: this.revision, dirty: true, requestId: this.pending.requestId });
    this.update({ status: this.revision === null || this.view.syncIssue === 'conflict' ? localSaved ? 'saved' : 'error' : 'saving', persistence: 'local', savedAt: localSaved ? now : null, expiresAt: now + QUOTE_DRAFT_TTL_MS });
    if (this.revision === null || this.view.syncIssue === 'conflict') return;
    this.timer = setTimeout(() => { this.timer = null; this.enqueueWrite(); }, Math.max(0, this.options.debounceMs()));
  }
  private enqueueWrite(): Promise<void> {
    this.queue = this.queue.then(() => this.writePending()); return this.queue;
  }
  private async writePending() {
    const pending = this.uncertain ?? this.pending;
    if (!pending || this.stopped || this.revision === null || this.view.syncIssue === 'conflict') return;
    if (pending.expiresAt <= Date.now()) {
      if (this.uncertain === pending) this.uncertain = null;
      if (this.pending === pending) this.pending = null;
      if (this.pending) { await this.writePending(); return; }
      this.update({ status: 'error', syncIssue: 'unavailable' }); return;
    }
    pending.revision ??= this.revision;
    let reply: Awaited<ReturnType<ControllerOptions<T>['write']>>;
    this.inFlight = true;
    // Registra antes do fetch: fechar o navegador durante a request também
    // deixa um retry idempotente recuperável, mesmo sem receber erro de rede.
    this.uncertain = pending;
    if (this.backup) this.localWrite(this.backup);
    try { reply = await this.options.write(pending.data, pending.revision, pending.requestId); } catch { reply = { data: null, error: {} }; }
    finally { this.inFlight = false; }
    if (this.stopped) return;
    if (reply.error || !reply.data) {
      if (reply.error?.code !== '40001') {
        this.uncertain = pending;
        if (this.backup) this.localWrite(this.backup);
      } else { this.uncertain = null; this.conflictCanBeResolved = false; }
      const localExists = !!this.localRead();
      this.update({ status: reply.error?.code === '40001' ? 'error' : localExists ? 'saved' : 'error', persistence: 'local', syncIssue: reply.error?.code === '40001' ? 'conflict' : 'unavailable' }); return;
    }
    if (this.uncertain === pending) this.uncertain = null;
    this.revision = reply.data.revision;
    this.remoteSnapshot = pending.snapshot;
    if (this.pending !== pending) {
      // A edição mais recente só pode partir da revisão recém-confirmada.
      if (this.backup?.dirty) this.localWrite({ ...this.backup, revision: this.revision });
      if (this.pending) { this.pending.revision = null; await this.writePending(); }
      return;
    }
    this.pending = null;
    const savedAt = Date.parse(reply.data.updated_at!);
    const expiresAt = Date.parse(reply.data.expires_at!);
    if (pending.data === null) {
      this.backup = null;
      this.options.legacyClear?.();
      try { this.options.storage.removeItem(this.options.storageKey); } catch { /* remote tombstone is authoritative */ }
    } else this.localWrite({ version: 1, data: pending.data, savedAt, expiresAt, revision: this.revision, dirty: false });
    this.update({ status: pending.data ? 'saved' : 'idle', persistence: 'account', savedAt: pending.data ? savedAt : null, expiresAt: pending.data ? expiresAt : null, syncIssue: null });
  }
  flush(data?: T) {
    if (data !== undefined) this.save(data);
    this.cancelTimer();
    return this.enqueueWrite();
  }
  close() { this.open = false; this.cancelTimer(); return this.enqueueWrite(); }
  stop() { this.cancelTimer(); this.stopped = true; this.generation += 1; }
  private resolveHydratedConflict() {
    if (!this.conflictCanBeResolved || !this.view.showResumePrompt || this.view.isLoading || this.revision === null) return;
    if (this.backup?.dirty) { try { this.options.storage.setItem(`${this.options.storageKey}:conflict`, JSON.stringify(this.backup)); } catch { /* best effort */ } }
    this.conflictCanBeResolved = false;
    this.pending = null; this.uncertain = null;
    this.update({ syncIssue: null, persistence: 'account' });
  }
  accept() {
    this.resolveHydratedConflict();
    this.baseline = null;
    this.update({ showResumePrompt: false });
    if (this.view.draftData) {
      this.latest = this.view.draftData;
      this.baseline = '__accepted__';
      this.save(this.latest);
    }
  }
  async clear(suppress = true) {
    this.cancelTimer(); this.suppressed = suppress; this.latest = null;
    this.pending = { data: null, snapshot: 'null', requestId: crypto.randomUUID(), revision: null, expiresAt: Date.now() + QUOTE_DRAFT_TTL_MS };
    const now = Date.now();
    const locallyRemoved = this.localWrite({ version: 1, data: null, savedAt: now, expiresAt: now + QUOTE_DRAFT_TTL_MS, revision: this.revision, dirty: true, requestId: this.pending.requestId });
    this.update({ draftData: null, showResumePrompt: false, status: this.revision === null ? locallyRemoved ? 'saved' : 'error' : this.view.syncIssue === 'conflict' ? 'error' : 'saving', persistence: 'local' });
    await this.enqueueWrite();
  }
  startNew(data?: T) {
    this.resolveHydratedConflict();
    this.suppressed = false; this.baseline = '__new__'; this.update({ draftData: null, showResumePrompt: false });
    if (data && this.useful(data)) this.save(data);
    else void this.clear(false);
  }
  retry() {
    if (!this.view.syncIssue && !this.pending) return;
    // Releitura é necessária depois de conflito; nunca reaplica a versão antiga.
    // O backup anterior fica preservado para recuperação explícita.
    if (this.view.syncIssue === 'conflict') {
      if (this.backup?.dirty) { try { this.options.storage.setItem(`${this.options.storageKey}:conflict`, JSON.stringify(this.backup)); } catch { /* best effort */ } }
      this.backup = null;
      this.options.legacyClear?.();
      try { this.options.storage.removeItem(this.options.storageKey); } catch { /* best effort */ }
      this.pending = null; this.uncertain = null;
      this.activate();
    } else if (this.revision === null) this.activate();
    else { this.update({ status: 'saving', syncIssue: null }); void this.enqueueWrite(); }
  }
}
