export interface PdvPreorderTabOwner {
  companyId: string;
  userId: string;
  cashSessionId: string | null;
}

export interface PdvPreorderTab<S = unknown> {
  id: string;
  draftId: string;
  preorderId: string | null;
  revision: number | null;
  customerId: string | null;
  number: number | null;
  total: number;
  hasContent: boolean;
  editorState?: S;
  version: string;
  updatedAt: number;
  recovered?: boolean;
}

export interface PdvPreorderWorkspace<S = unknown> {
  schema: 1;
  owner: PdvPreorderTabOwner;
  tabs: PdvPreorderTab<S>[];
  activeId: string | null;
  closed: Record<string, string>;
}

export function preorderTabStorageKey(owner: PdvPreorderTabOwner) {
  return `pdv:preorder-tabs:v1:${encodeURIComponent(owner.companyId)}:${encodeURIComponent(owner.userId)}:${encodeURIComponent(owner.cashSessionId ?? 'balcao')}`;
}

export function emptyPreorderWorkspace<S>(owner: PdvPreorderTabOwner): PdvPreorderWorkspace<S> {
  return { schema: 1, owner, tabs: [], activeId: null, closed: {} };
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const optionalId = (value: unknown) => value === null || typeof value === 'string' && UUID.test(value);
const optionalNumber = (value: unknown) => value === null || Number.isSafeInteger(value) && Number(value) >= 0;

/** JSON local é dado não confiável; a identidade precisa coincidir integralmente. */
export function parsePreorderWorkspace<S>(raw: string | null, owner: PdvPreorderTabOwner): PdvPreorderWorkspace<S> {
  if (raw === null) return emptyPreorderWorkspace(owner);
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.schema !== 1 || !record(value.owner)
    || value.owner.companyId !== owner.companyId || value.owner.userId !== owner.userId || value.owner.cashSessionId !== owner.cashSessionId
    || !Array.isArray(value.tabs) || !record(value.closed) || !optionalId(value.activeId)) throw new Error('Não foi possível recuperar as abas deste atendimento.');
  const ids = new Set<string>();
  for (const tab of value.tabs) {
    if (!record(tab) || typeof tab.id !== 'string' || !UUID.test(tab.id) || ids.has(tab.id)
      || typeof tab.draftId !== 'string' || !UUID.test(tab.draftId) || !optionalId(tab.preorderId) || !optionalId(tab.customerId)
      || !optionalNumber(tab.revision) || !optionalNumber(tab.number) || typeof tab.total !== 'number' || !Number.isFinite(tab.total) || tab.total < 0
      || typeof tab.hasContent !== 'boolean' || typeof tab.version !== 'string' || !UUID.test(tab.version)
      || typeof tab.updatedAt !== 'number' || !Number.isFinite(tab.updatedAt)
      || (tab.editorState !== undefined && !record(tab.editorState)) || (tab.recovered !== undefined && typeof tab.recovered !== 'boolean')) throw new Error('O backup das abas precisa ser conferido.');
    ids.add(tab.id);
  }
  if (Object.entries(value.closed).some(([id, version]) => !UUID.test(id) || typeof version !== 'string' || !UUID.test(version))) throw new Error('O backup das abas precisa ser conferido.');
  return value as unknown as PdvPreorderWorkspace<S>;
}

function content<S>(tab: PdvPreorderTab<S>) {
  const { version: _version, updatedAt: _updatedAt, recovered: _recovered, ...data } = tab;
  return JSON.stringify(data);
}

/** Ausência nunca exclui: fechamento é uma intenção explícita sobre a versão lida. */
export function mergePreorderWorkspaces<S>(base: PdvPreorderWorkspace<S>, local: PdvPreorderWorkspace<S>, remote: PdvPreorderWorkspace<S>): PdvPreorderWorkspace<S> {
  const key = preorderTabStorageKey(base.owner);
  if (preorderTabStorageKey(local.owner) !== key || preorderTabStorageKey(remote.owner) !== key) throw new Error('O atendimento mudou.');
  const b = new Map(base.tabs.map(tab => [tab.id, tab]));
  const l = new Map(local.tabs.map(tab => [tab.id, tab]));
  const r = new Map(remote.tabs.map(tab => [tab.id, tab]));
  const closed = { ...remote.closed, ...local.closed };
  const result: PdvPreorderTab<S>[] = [];
  const recovered: PdvPreorderTab<S>[] = [];
  const order = [...local.tabs.map(tab => tab.id), ...remote.tabs.map(tab => tab.id)].filter((id, index, all) => all.indexOf(id) === index);
  for (const id of order) {
    const original = b.get(id), ours = l.get(id), theirs = r.get(id);
    if (!ours && theirs) {
      if (local.closed[id] === theirs.version) continue;
      result.push(local.closed[id] ? { ...theirs, recovered: true } : theirs);
    } else if (ours && !theirs) {
      if (remote.closed[id] === ours.version) continue;
      result.push(remote.closed[id] ? { ...ours, recovered: true } : ours);
    } else if (ours && theirs) {
      if (ours.version === theirs.version || content(ours) === content(theirs)) result.push(ours);
      else if (original?.version === ours.version) result.push(theirs);
      else if (original?.version === theirs.version) result.push(ours);
      else {
        result.push(ours);
        const recoveryId = theirs.version;
        // A versão divergente ganha identidade estável; não se perde nem se
        // aplica automaticamente sobre o documento comercial no servidor.
        if (!l.has(recoveryId) && !r.has(recoveryId) && !recovered.some(tab => tab.id === recoveryId)) recovered.push({ ...theirs, id: recoveryId, draftId: theirs.preorderId ? theirs.draftId : recoveryId, recovered: true });
      }
    }
  }
  result.push(...recovered);
  const activeId = result.some(tab => tab.id === local.activeId) ? local.activeId : result[0]?.id ?? null;
  return { schema: 1, owner: local.owner, tabs: result, activeId, closed };
}
