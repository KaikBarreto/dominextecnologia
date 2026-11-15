import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDomiLinkTestPdfBase64,
  detectDomiLink,
  DOMILINK_BASE_URL,
  loadDomiLinkProfile,
  pairDomiLink,
  queueDomiLinkTestPrint,
  readDomiLinkBarcode,
  waitForDomiLinkPrintJob,
} from './client';
import type { DomiLinkDevice } from './types';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const pdfPrinter: DomiLinkDevice = { id: 'printer-1', kind: 'printer', label: 'PDF', online: true, capabilities: { print_formats: ['pdf'] } };
const thermalPrinter: DomiLinkDevice = { id: 'thermal-1', kind: 'printer', label: 'Térmica', online: true, capabilities: { print_formats: ['text', 'escpos'] } };

describe('cliente DomiLink', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const deniedCopy = 'Seu navegador bloqueou a conexão com o DomiLink. Nas configurações deste site, permita o acesso à rede local e tente novamente.';
  const offlineCopy = 'Não foi possível conectar ao DomiLink. Confira se o DomiLink está aberto e se o navegador permite acesso local.';

  it('orienta a permissão explicitamente negada sem repetir a requisição', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'denied' });
    vi.stubGlobal('navigator', { permissions: { query } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(detectDomiLink()).rejects.toMatchObject({ code: 'local_access_denied', message: deniedCopy });
    expect(query).toHaveBeenCalledWith({ name: 'loopback-network' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reconhece o nome antigo só quando a permissão de loopback é desconhecida', async () => {
    const query = vi.fn().mockRejectedValueOnce(new TypeError('Unsupported permission')).mockResolvedValue({ state: 'denied' });
    vi.stubGlobal('navigator', { permissions: { query } });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(pairDomiLink('123456')).rejects.toMatchObject({ code: 'local_access_denied', message: deniedCopy });
    expect(query.mock.calls).toEqual([[{ name: 'loopback-network' }], [{ name: 'local-network-access' }]]);
  });

  it.each(['granted', 'prompt'])('não atribui falha de rede a bloqueio quando loopback está %s', async (state) => {
    const query = vi.fn().mockResolvedValue({ state });
    vi.stubGlobal('navigator', { permissions: { query } });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('ERR_CONNECTION_REFUSED'));
    await expect(pairDomiLink('123456')).rejects.toMatchObject({ code: 'offline', message: offlineCopy });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preserva diagnóstico genérico e retry quando o navegador não reconhece as permissões', async () => {
    const query = vi.fn().mockRejectedValue(new TypeError('Unsupported permission'));
    vi.stubGlobal('navigator', { permissions: { query } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(detectDomiLink()).rejects.toMatchObject({ code: 'offline', message: offlineCopy });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('funciona sem Permissions API e não expõe a mensagem técnica original', async () => {
    vi.stubGlobal('navigator', {});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('CORS transport internal details'));
    await expect(pairDomiLink('123456')).rejects.toMatchObject({ code: 'offline', message: offlineCopy });
  });

  it('não classifica aborto como permissão negada', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'denied' });
    vi.stubGlobal('navigator', { permissions: { query } });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(pairDomiLink('123456')).rejects.toMatchObject({ code: 'offline', message: offlineCopy });
    expect(query).not.toHaveBeenCalled();
  });

  it('mantém o timeout e não troca uma requisição abortada por permissão negada', async () => {
    vi.useFakeTimers();
    const query = vi.fn().mockResolvedValue({ state: 'denied' });
    vi.stubGlobal('navigator', { permissions: { query } });
    let observedSignal: AbortSignal | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      observedSignal = init?.signal ?? null;
      observedSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const result = expect(pairDomiLink('123456')).rejects.toMatchObject({ code: 'offline', message: offlineCopy });
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(observedSignal?.aborted).toBe(true);
    expect(query).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('não troca erro HTTP pelo diagnóstico de permissão', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'denied' });
    vi.stubGlobal('navigator', { permissions: { query } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: { code: 'session_expired' } }, 401));
    await expect(pairDomiLink('123456')).rejects.toMatchObject({ code: 'session_expired', status: 401 });
    expect(query).not.toHaveBeenCalled();
  });

  it('detecta somente o endpoint loopback fixo e não envia credenciais do navegador', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ name: 'DomiLink', status: 'ok', version: '0.1.0', bind: 'loopback' }));
    await detectDomiLink();
    expect(fetchMock).toHaveBeenCalledWith(`${DOMILINK_BASE_URL}/health`, expect.objectContaining({ credentials: 'omit', cache: 'no-store' }));
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.has('Authorization')).toBe(false);
  });

  it('pareia só com código e nome público do cliente, sem token Supabase', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ token: 'sessao-local', token_type: 'Bearer', expires_in: 3600 }));
    await pairDomiLink('123456');
    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toEqual({ code: '123456', client_name: 'Dominex PDV Web' });
    expect(JSON.stringify(request)).not.toContain('supabase');
  });

  it('usa a sessão local somente nas rotas autenticadas', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ fiscal: false, printing: [], scales: [], barcodes: [], paper_widths_mm: [58, 80] }))
      .mockResolvedValueOnce(jsonResponse({ devices: [] }));
    await loadDomiLinkProfile('token-local', { name: 'DomiLink', status: 'ok', version: '0.1.0', bind: 'loopback' });
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect((init?.headers as Headers).get('Authorization')).toBe('Bearer token-local');
    }
  });

  it('envia PDF fictício com chave idempotente estável para a intenção', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ job: { id: 'job-1', status: 'queued', device_id: 'printer-1' }, replayed: false }, 202));
    await queueDomiLinkTestPrint('token-local', pdfPrinter, 'intent-12345678');
    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Headers).get('Idempotency-Key')).toBe('intent-12345678');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ device_id: 'printer-1', format: 'pdf', copies: 1, title: 'Teste DomiLink' });
    const pdf = atob(body.content_base64);
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toContain('/Type /Page ');
    expect(pdf).toContain('/Count 1');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(buildDomiLinkTestPdfBase64()).toBe(body.content_base64);
  });

  it('usa texto na térmica em vez de enviar PDF incompatível', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ job: { id: 'job-2', status: 'queued', device_id: 'thermal-1' }, replayed: false }, 202));
    await queueDomiLinkTestPrint('token-local', thermalPrinter, 'intent-thermal-1');
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ device_id: 'thermal-1', format: 'text' });
    expect(atob(body.content_base64)).toContain('Teste DomiLink');
  });

  it('repete falha de rede da impressão com a mesma chave, sem duplicar a intenção', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(jsonResponse({ job: { id: 'job-1', status: 'queued', device_id: 'printer-1' }, replayed: true }, 200));
    await queueDomiLinkTestPrint('token-local', pdfPrinter, 'intent-retry-123');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Headers).get('Idempotency-Key')).toBe('intent-retry-123');
    }
  });

  it('não repassa detalhe técnico devolvido pelo serviço para a UI', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: { code: 'device_not_found', message: 'serial /dev/ttyUSB0 segredo' } }, 404));
    await expect(queueDomiLinkTestPrint('token-local', pdfPrinter, 'intent-12345678')).rejects.toThrow('O equipamento não foi encontrado no DomiLink.');
  });

  it('acompanha printing até completed', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ job: { id: 'job-1', status: 'printing', device_id: 'printer-1', error_code: null } }))
      .mockResolvedValueOnce(jsonResponse({ job: { id: 'job-1', status: 'completed', device_id: 'printer-1', error_code: null } }));
    await expect(waitForDomiLinkPrintJob('token-local', { id: 'job-1', status: 'queued', device_id: 'printer-1' })).resolves.toMatchObject({ status: 'completed' });
  });

  it('traduz job failed pelo error_code sem expor backend', async () => {
    await expect(waitForDomiLinkPrintJob('token-local', { id: 'job-1', status: 'failed', device_id: 'printer-1', error_code: 'device_offline' })).rejects.toThrow('O equipamento está offline.');
  });
  it('não repete leitura de código após falha: o primeiro evento pode já ter sido consumido', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('conexão caiu após consumir código'))
      .mockResolvedValueOnce(jsonResponse({ code: 'segundo-codigo' }));
    await expect(readDomiLinkBarcode('token-local', 'barcode-1')).rejects.toMatchObject({ code: 'offline' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(readDomiLinkBarcode('token-local', 'barcode-1')).resolves.toBe('segundo-codigo');
  });

  it('orienta fila cheia sem expor mensagem interna nem reenviar impressão', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: { code: 'print_queue_full', message: 'internal queue capacity' } }, 503));
    await expect(queueDomiLinkTestPrint('token-local', pdfPrinter, 'intent-full')).rejects.toThrow('A fila de impressão está cheia. Aguarde 30 segundos e tente novamente.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('interrompe polling quando o contexto autenticado muda durante a resposta', async () => {
    let current = true;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      current = false;
      return jsonResponse({ job: { id: 'job-1', status: 'completed', device_id: 'printer-1' } });
    });
    await expect(waitForDomiLinkPrintJob('token-local', { id: 'job-1', status: 'queued', device_id: 'printer-1' }, () => {
      if (!current) throw new Error('contexto mudou');
    })).rejects.toThrow('contexto mudou');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

});
