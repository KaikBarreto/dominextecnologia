import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogActivityKey, toggleCatalogFavorite } from './catalogActivity';
import {
  acknowledgeCatalogFavorite, catalogJournalFavoriteIds, FAVORITES_SYNC_CONFLICT,
  getCatalogFavoriteJournal, hydrateCatalogFavorites, importCatalogLocalFavorites,
  queueCatalogFavorite, subscribeCatalogFavoriteJournal, type CatalogFavoriteRow,
} from './catalogFavoriteSync';

const opId = '01000000-0000-4000-8000-000000000001';
const row = (model_id: string, is_favorite: boolean, revision: number): CatalogFavoriteRow => ({
  model_id, is_favorite, revision, last_operation_id: opId, updated_at: '2026-11-16T00:00:00Z',
});
let counter = 0;
let key: string;

describe('journal de favoritos da conta', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    key = catalogActivityKey(`sync-store-${++counter}`, 'company-a')!;
  });

  it('mantém backup local enquanto a primeira consulta está pendente e importa só mediante ação explícita', () => {
    toggleCatalogFavorite(key, 'owned-local');
    localStorage.setItem('tt:favoritos:modelos', JSON.stringify([{ modelId: 'ownerless' }]));
    let journal = getCatalogFavoriteJournal(key);
    expect(journal.legacyIds).toEqual(['owned-local']);
    expect(journal.pending).toEqual([]);
    importCatalogLocalFavorites(key);
    expect(getCatalogFavoriteJournal(key).pending).toEqual([]);
    hydrateCatalogFavorites(key, []);
    importCatalogLocalFavorites(key);
    journal = getCatalogFavoriteJournal(key);
    expect(journal.legacyIds).toEqual([]);
    expect(journal.pending).toMatchObject([{ modelId: 'owned-local', favorite: true, expectedRevision: 0 }]);
    expect(journal.backup).toBe('saved');
    const same = getCatalogFavoriteJournal(key);
    expect(getCatalogFavoriteJournal(key)).toBe(same);
    importCatalogLocalFavorites(key);
    expect(getCatalogFavoriteJournal(key).pending).toHaveLength(1);
  });

  it('uma remoção de outro aparelho impede a importação de favorito local antigo', () => {
    toggleCatalogFavorite(key, 'removed-elsewhere');
    getCatalogFavoriteJournal(key);
    hydrateCatalogFavorites(key, [row('removed-elsewhere', false, 3)]);
    importCatalogLocalFavorites(key);
    expect(getCatalogFavoriteJournal(key).pending).toEqual([]);
    expect(catalogJournalFavoriteIds(getCatalogFavoriteJournal(key))).toEqual([]);
  });

  it('preserva operationId e revisão no armazenamento para retry idempotente após recarregar', () => {
    hydrateCatalogFavorites(key, [row('existing', true, 4)]);
    queueCatalogFavorite(key, 'existing');
    const operation = getCatalogFavoriteJournal(key).pending[0];
    const notify = vi.fn();
    const unsubscribe = subscribeCatalogFavoriteJournal(key, notify);
    window.dispatchEvent(new StorageEvent('storage', { key: `${key}:account-sync:v1` }));
    expect(getCatalogFavoriteJournal(key).pending[0]).toEqual(operation);
    expect(operation).toMatchObject({ modelId: 'existing', favorite: false, expectedRevision: 4 });
    unsubscribe();
  });

  it('um clique posterior segue a confirmação da própria operação sem perder sua intenção', () => {
    hydrateCatalogFavorites(key, []);
    queueCatalogFavorite(key, 'model');
    const first = getCatalogFavoriteJournal(key).pending[0];
    queueCatalogFavorite(key, 'model');
    acknowledgeCatalogFavorite(key, first, { ...row('model', true, 1), last_operation_id: first.id }, true);
    const journal = getCatalogFavoriteJournal(key);
    expect(journal.pending).toMatchObject([{ favorite: false, expectedRevision: 1 }]);
    expect(catalogJournalFavoriteIds(journal)).toEqual([]);
  });

  it('preserva a âncora após recarregar e coalesce somente a última intenção posterior', () => {
    hydrateCatalogFavorites(key, []);
    queueCatalogFavorite(key, 'model');
    const anchor = getCatalogFavoriteJournal(key).pending[0];
    queueCatalogFavorite(key, 'model');
    expect(getCatalogFavoriteJournal(key).pending).toHaveLength(2);
    expect(getCatalogFavoriteJournal(key).pending[0]).toBe(anchor);
    const unsubscribe = subscribeCatalogFavoriteJournal(key, vi.fn());
    window.dispatchEvent(new StorageEvent('storage', { key: `${key}:account-sync:v1` }));
    const restored = getCatalogFavoriteJournal(key);
    expect(restored.pending[0]).toEqual(anchor);
    expect(restored.pending[1].favorite).toBe(false);
    queueCatalogFavorite(key, 'model');
    expect(getCatalogFavoriteJournal(key).pending).toEqual([anchor]);
    for (let click = 0; click < 20; click++) {
      queueCatalogFavorite(key, 'model');
      expect(getCatalogFavoriteJournal(key).pending.length).toBeLessThanOrEqual(2);
      expect(getCatalogFavoriteJournal(key).pending[0]).toEqual(anchor);
    }
    unsubscribe();
  });

  it('conflito substitui intenção antiga pelo estado canônico sem ressuscitar remoção', () => {
    hydrateCatalogFavorites(key, [row('model', false, 2)]);
    queueCatalogFavorite(key, 'model');
    const operation = getCatalogFavoriteJournal(key).pending[0];
    acknowledgeCatalogFavorite(key, operation, row('model', false, 4), false);
    const journal = getCatalogFavoriteJournal(key);
    expect(journal.pending).toEqual([]);
    expect(journal.error).toBe(FAVORITES_SYNC_CONFLICT);
    expect(catalogJournalFavoriteIds(journal)).toEqual([]);
  });

  it('resposta de consulta antiga não desfaz uma revisão mais recente confirmada', () => {
    hydrateCatalogFavorites(key, [row('model', true, 1)]);
    queueCatalogFavorite(key, 'model');
    acknowledgeCatalogFavorite(key, getCatalogFavoriteJournal(key).pending[0], row('model', false, 2), true);
    hydrateCatalogFavorites(key, [row('model', true, 1)]);
    hydrateCatalogFavorites(key, []);
    expect(getCatalogFavoriteJournal(key).rows[0].revision).toBe(2);
    expect(catalogJournalFavoriteIds(getCatalogFavoriteJournal(key))).toEqual([]);
  });

  it('mantém fila em memória e informa backup não persistido quando localStorage falha', () => {
    hydrateCatalogFavorites(key, []);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    queueCatalogFavorite(key, 'offline');
    const journal = getCatalogFavoriteJournal(key);
    expect(journal.backup).toBe('memory');
    expect(journal.pending).toHaveLength(1);
    expect(catalogJournalFavoriteIds(journal)).toEqual(['offline']);
    expect(getCatalogFavoriteJournal(catalogActivityKey('other-user', 'company-a')).pending).toEqual([]);
    expect(getCatalogFavoriteJournal(catalogActivityKey(`sync-store-${counter}`, 'company-b')).pending).toEqual([]);
  });

  it('sem escopo confirmado nunca grava nem recupera preferências de outra conta', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    expect(queueCatalogFavorite(null, 'model')).toBe(false);
    importCatalogLocalFavorites(null);
    expect(catalogJournalFavoriteIds(getCatalogFavoriteJournal(null))).toEqual([]);
    expect(set).not.toHaveBeenCalled();
  });
});
