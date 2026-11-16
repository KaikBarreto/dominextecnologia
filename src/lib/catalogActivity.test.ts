import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  catalogActivityKey,
  EMPTY_CATALOG_ACTIVITY,
  getCatalogActivitySnapshot,
  recordCatalogView,
  subscribeCatalogActivity,
  toggleCatalogFavorite,
} from './catalogActivity';

let testId = 0;
let key: string;

describe('preferências locais do catálogo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    key = catalogActivityKey(`user-${++testId}`, 'company-a')!;
  });

  it('isola usuário e empresa e não importa favoritos antigos sem escopo', () => {
    localStorage.setItem('tt:favoritos:modelos', JSON.stringify([{ modelId: 'legacy' }]));
    expect(getCatalogActivitySnapshot(key).favoriteIds).toEqual([]);
    recordCatalogView(key, 'model-a');
    toggleCatalogFavorite(key, 'model-a');
    expect(getCatalogActivitySnapshot(catalogActivityKey('another-user', 'company-a'))).toEqual(EMPTY_CATALOG_ACTIVITY);
    expect(getCatalogActivitySnapshot(catalogActivityKey(`user-${testId}`, 'another-company'))).toEqual(EMPTY_CATALOG_ACTIVITY);
    expect(getCatalogActivitySnapshot(key)).toEqual({ recentIds: ['model-a'], favoriteIds: ['model-a'] });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ version: 1, recentIds: ['model-a'], favoriteIds: ['model-a'] });
  });

  it('mantém os 30 modelos recentes distintos na ordem da última visualização', () => {
    for (let i = 0; i < 35; i++) recordCatalogView(key, `model-${i}`);
    recordCatalogView(key, 'model-10');
    const { recentIds, favoriteIds } = getCatalogActivitySnapshot(key);
    expect(recentIds).toHaveLength(30);
    expect(recentIds.slice(0, 3)).toEqual(['model-10', 'model-34', 'model-33']);
    expect(new Set(recentIds).size).toBe(30);
    expect(recentIds).not.toContain('model-4');
    expect(favoriteIds).toEqual([]);
  });

  it('alterna favoritos persistidos sem aplicar o limite dos recentes', () => {
    for (let i = 0; i < 45; i++) expect(toggleCatalogFavorite(key, `model-${i}`)).toBe(true);
    expect(getCatalogActivitySnapshot(key).favoriteIds).toHaveLength(45);
    expect(toggleCatalogFavorite(key, 'model-20')).toBe(false);
    expect(getCatalogActivitySnapshot(key, true).favoriteIds).toHaveLength(44);
    expect(getCatalogActivitySnapshot(key).favoriteIds).not.toContain('model-20');
    expect(getCatalogActivitySnapshot(key).recentIds).toEqual([]);
  });

  it('mantém referências estáveis até o conteúdo mudar e notifica só o escopo afetado', () => {
    const notify = vi.fn();
    const another = vi.fn();
    const unsubscribe = subscribeCatalogActivity(key, notify);
    const unsubscribeAnother = subscribeCatalogActivity(catalogActivityKey('other', 'company-a'), another);
    const initial = getCatalogActivitySnapshot(key);
    expect(getCatalogActivitySnapshot(key)).toBe(initial);
    recordCatalogView(key, 'model-a');
    const next = getCatalogActivitySnapshot(key);
    expect(next).not.toBe(initial);
    expect(getCatalogActivitySnapshot(key)).toBe(next);
    recordCatalogView(key, 'model-a');
    expect(getCatalogActivitySnapshot(key)).toBe(next);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(another).not.toHaveBeenCalled();
    toggleCatalogFavorite(key, 'model-b');
    expect(getCatalogActivitySnapshot(key).recentIds).toBe(next.recentIds);
    unsubscribe();
    unsubscribeAnother();
  });

  it('atualiza por storage de outra aba e responde à limpeza das preferências', () => {
    const notify = vi.fn();
    const unsubscribe = subscribeCatalogActivity(key, notify);
    getCatalogActivitySnapshot(key);
    localStorage.setItem(key, JSON.stringify({ version: 1, recentIds: ['remote'], favoriteIds: ['star'] }));
    window.dispatchEvent(new StorageEvent('storage', { key }));
    expect(notify).toHaveBeenCalledOnce();
    expect(getCatalogActivitySnapshot(key)).toEqual({ recentIds: ['remote'], favoriteIds: ['star'] });
    const snapshot = getCatalogActivitySnapshot(key);
    window.dispatchEvent(new StorageEvent('storage', { key }));
    expect(getCatalogActivitySnapshot(key)).toBe(snapshot);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(getCatalogActivitySnapshot(key)).toEqual(EMPTY_CATALOG_ACTIVITY);
    unsubscribe();
  });

  it('ignora IDs inválidos e não lê nem escreve sem escopo confirmado', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    expect(catalogActivityKey(null, 'company-a')).toBeNull();
    expect(catalogActivityKey('user-a', '')).toBeNull();
    expect(getCatalogActivitySnapshot(null)).toBe(EMPTY_CATALOG_ACTIVITY);
    recordCatalogView(null, 'model');
    expect(toggleCatalogFavorite(null, 'model')).toBe(false);
    for (const invalid of ['', ' ', ' model', 'a'.repeat(128)]) {
      recordCatalogView(key, invalid);
      expect(toggleCatalogFavorite(key, invalid)).toBe(false);
    }
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('recupera JSON corrompido e sanitiza listas de IDs desconhecidas', () => {
    localStorage.setItem(key, '{broken');
    expect(getCatalogActivitySnapshot(key)).toBe(EMPTY_CATALOG_ACTIVITY);
    localStorage.setItem(key, JSON.stringify({ version: 1, recentIds: [null, 7, '', 'ok', 'ok', { modelId: 'private' }], favoriteIds: ['star', 'star', ' '.repeat(5)] }));
    expect(getCatalogActivitySnapshot(key)).toEqual({ recentIds: ['ok'], favoriteIds: ['star'] });
    localStorage.setItem(key, JSON.stringify({ version: 42, recentIds: ['future'] }));
    expect(getCatalogActivitySnapshot(key)).toBe(EMPTY_CATALOG_ACTIVITY);
    recordCatalogView(key, 'recovered');
    expect(getCatalogActivitySnapshot(key).recentIds).toEqual(['recovered']);
  });

  it('mantém fallback reativo e isolado quando leitura/escrita do navegador são negadas', () => {
    const notify = vi.fn();
    const unsubscribe = subscribeCatalogActivity(key, notify);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(getCatalogActivitySnapshot(key)).toBe(EMPTY_CATALOG_ACTIVITY);
    recordCatalogView(key, 'model-a');
    toggleCatalogFavorite(key, 'model-b');
    const snapshot = getCatalogActivitySnapshot(key);
    expect(snapshot).toEqual({ recentIds: ['model-a'], favoriteIds: ['model-b'] });
    expect(getCatalogActivitySnapshot(key)).toBe(snapshot);
    expect(getCatalogActivitySnapshot(catalogActivityKey('other', 'company-b'))).toBe(EMPTY_CATALOG_ACTIVITY);
    expect(notify).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('não perde preferências em memória quando apenas a escrita falha por quota', () => {
    recordCatalogView(key, 'persisted');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    recordCatalogView(key, 'in-memory');
    toggleCatalogFavorite(key, 'favorite');
    expect(getCatalogActivitySnapshot(key)).toEqual({ recentIds: ['in-memory', 'persisted'], favoriteIds: ['favorite'] });
  });
});
