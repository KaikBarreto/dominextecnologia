import { afterEach, describe, expect, it, vi } from 'vitest';
import { queueDomiLinkDocumentPrint } from './client';
import type { DomiLinkDevice } from './types';

const printer: DomiLinkDevice = { id: 'printer', kind: 'printer', label: 'Impressora', online: true, capabilities: { print_formats: ['pdf'] } };
function document() {
  const blob = new Blob(['%PDF-fixture']);
  Object.defineProperty(blob, 'arrayBuffer', { value: async () => new TextEncoder().encode('%PDF-fixture').buffer });
  return blob;
}

describe('PDF real na fila local', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('envia o documento canônico uma vez com a chave da intenção', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ job: { id: 'job', status: 'queued' }, replayed: false })));
    vi.stubGlobal('fetch', fetch);
    await queueDomiLinkDocumentPrint('test-session', printer, document(), 'receipt-intent');
    expect(fetch).toHaveBeenCalledOnce();
    const [, options] = fetch.mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(atob(payload.content_base64)).toBe('%PDF-fixture');
    expect(payload.title).toBe('Comprovante');
    expect(options.headers.get('Idempotency-Key')).toBe('receipt-intent');
  });
  it('não repete POST quando a confirmação de envio é incerta', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);
    await expect(queueDomiLinkDocumentPrint('test-session', printer, document(), 'receipt-intent')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('descarta PDF que terminou de preparar depois da troca de contexto', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    let checks = 0;
    await expect(queueDomiLinkDocumentPrint('test-session', printer, document(), 'receipt-intent', () => { if (++checks > 1) throw new Error('mudou'); })).rejects.toThrow('mudou');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('recusa enviar PDF para impressora configurada apenas para bytes ESC/POS', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(queueDomiLinkDocumentPrint('test-session', { ...printer, capabilities: { print_formats: ['escpos'] } }, document(), 'receipt-intent')).rejects.toThrow(/aceite PDF/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
