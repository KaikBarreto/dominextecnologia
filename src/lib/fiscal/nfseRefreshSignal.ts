const NFSE_PAGED_REFRESH_EVENT = 'dominex:nfse-paged-refresh';

/**
 * Sincroniza as listagens paginadas locais com mutations/polling do React
 * Query. A RPC paginada não usa o mesmo cache de `useNfse`, então invalidar
 * apenas a query canônica deixava a tabela visualmente desatualizada.
 */
export function requestNfsePagedRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NFSE_PAGED_REFRESH_EVENT));
}

export function subscribeNfsePagedRefresh(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(NFSE_PAGED_REFRESH_EVENT, listener);
  return () => window.removeEventListener(NFSE_PAGED_REFRESH_EVENT, listener);
}
