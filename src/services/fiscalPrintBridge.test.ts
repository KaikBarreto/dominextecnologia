import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getFiscalBridgeStatus,
  getFiscalPrintJob,
  sendFiscalPrintJob,
  waitForFiscalPrintJob,
} from './fiscalPrintBridge';

const OPERATION_ID = '1f47f72c-9e88-4f62-a1c9-4baf79eaf971';
const JOB_ID = '95fe4e5c-d979-4b5a-814d-f1bd17007abc';
const PDF = 'JVBERi0xLjQKJSVFT0YK';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fiscalPrintBridge', () => {
  it('normaliza status e impressoras da ponte local', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ready: true,
      version: '1.7.22',
      printers: [{ name: 'POS-80', driver: 'Thermal', compatible: true, reason: null }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getFiscalBridgeStatus()).resolves.toMatchObject({
      connected: true,
      version: '1.7.22',
      printers: [{ name: 'POS-80', compatible: true }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:18181/v1/status',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Fiscal-Bridge-Protocol': '1' }),
      }),
    );
  });

  it('distingue trabalho aceito de impressão concluída', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accepted: true,
      jobId: JOB_ID,
      status: 'queued',
    }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendFiscalPrintJob({
      operationId: OPERATION_ID,
      documentKind: 'danfce',
      pdfBase64: PDF,
      printerName: 'POS-80',
      paperWidthMm: 80,
    })).resolves.toEqual({ accepted: true, jobId: JOB_ID, errorCode: null, message: null });
  });

  it('bloqueia dados inválidos antes de chamar localhost', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendFiscalPrintJob({
      operationId: 'invalido',
      documentKind: 'danfce',
      pdfBase64: PDF,
      printerName: 'POS-80',
      paperWidthMm: 80,
    });
    expect(result).toMatchObject({ accepted: false, errorCode: 'invalid_operation' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consulta e espera até o resultado real da impressão', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'printing' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(waitForFiscalPrintJob(JOB_ID, { pollMs: 1, timeoutMs: 100 })).resolves.toEqual({
      jobId: JOB_ID,
      status: 'completed',
      errorCode: null,
      message: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('não inventa sucesso quando a ponte retorna estado desconhecido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'misterioso' }), { status: 200 }),
    ));
    await expect(getFiscalPrintJob(JOB_ID)).resolves.toBeNull();
  });
});
