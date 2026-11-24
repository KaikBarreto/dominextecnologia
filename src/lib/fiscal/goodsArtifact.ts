export function goodsArtifactUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
/** A janela foi reservada no clique síncrono; não abre popup depois de await. */
export function showGoodsArtifact(target: Window | null, url: string): boolean {
  if (!target || target.closed) return false;
  try { target.opener = null; target.location.replace(url); return true; }
  catch { try { target.close(); } catch { /* A orientação/link permanece no painel. */ } return false; }
}
