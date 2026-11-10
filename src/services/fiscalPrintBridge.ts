const BRIDGE_BASE_URL = 'http://127.0.0.1:18181/v1';
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_PDF_BASE64_LENGTH = 14_000_000;

export type FiscalDocumentKind = 'danfce';

export interface FiscalPrinterInfo {
  name: string;
  driver: string | null;
  compatible: boolean;
  reason: string | null;
}

export interface FiscalBridgeStatus {
  connected: boolean;
  version: string | null;
  printers: FiscalPrinterInfo[];
  error: string | null;
}

export interface FiscalPrintJob {
  operationId: string;
  documentKind: FiscalDocumentKind;
  pdfBase64: string;
  printerName: string;
  paperWidthMm: 80;
  copies?: 1 | 2;
}

export interface FiscalPrintSubmitResult {
  accepted: boolean;
  jobId: string | null;
  errorCode: string | null;
  message: string | null;
}

export type FiscalPrintJobStatus = 'queued' | 'printing' | 'completed' | 'failed';

export interface FiscalPrintJobResult {
  jobId: string;
  status: FiscalPrintJobStatus;
  errorCode: string | null;
  message: string | null;
}

function withTimeout(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { signal: controller.signal, clear: () => window.clearTimeout(timer) };
}

function normalizePrinter(value: unknown): FiscalPrinterInfo | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return null;
  return {
    name,
    driver: typeof raw.driver === 'string' ? raw.driver : null,
    compatible: raw.compatible !== false,
    reason: typeof raw.reason === 'string' ? raw.reason : null,
  };
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const timeout = withTimeout();
  try {
    return await fetch(`${BRIDGE_BASE_URL}${path}`, {
      ...init,
      signal: timeout.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Fiscal-Bridge-Protocol': '1',
        ...init.headers,
      },
    });
  } finally {
    timeout.clear();
  }
}

export async function getFiscalBridgeStatus(): Promise<FiscalBridgeStatus> {
  try {
    const response = await request('/status');
    if (!response.ok) throw new Error('bridge_unavailable');
    const body = (await response.json()) as Record<string, unknown>;
    const printers = Array.isArray(body.printers)
      ? body.printers.map(normalizePrinter).filter((item): item is FiscalPrinterInfo => !!item)
      : [];
    return {
      connected: body.ready === true,
      version: typeof body.version === 'string' ? body.version : null,
      printers,
      error: null,
    };
  } catch {
    return { connected: false, version: null, printers: [], error: 'bridge_unavailable' };
  }
}

export async function sendFiscalPrintJob(job: FiscalPrintJob): Promise<FiscalPrintSubmitResult> {
  if (!/^[0-9a-f-]{36}$/i.test(job.operationId)) {
    return { accepted: false, jobId: null, errorCode: 'invalid_operation', message: null };
  }
  if (!job.printerName.trim()) {
    return { accepted: false, jobId: null, errorCode: 'printer_required', message: null };
  }
  if (
    !job.pdfBase64.startsWith('JVBER') ||
    job.pdfBase64.length > MAX_PDF_BASE64_LENGTH
  ) {
    return { accepted: false, jobId: null, errorCode: 'invalid_pdf', message: null };
  }
  try {
    const response = await request('/print', {
      method: 'POST',
      body: JSON.stringify({
        operationId: job.operationId,
        documentKind: job.documentKind,
        contentType: 'application/pdf',
        contentBase64: job.pdfBase64,
        printerName: job.printerName,
        paperWidthMm: job.paperWidthMm,
        copies: job.copies ?? 1,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      accepted: response.ok && body.accepted === true,
      jobId: typeof body.jobId === 'string' ? body.jobId : null,
      errorCode: typeof body.errorCode === 'string' ? body.errorCode : response.ok ? null : 'bridge_error',
      message: typeof body.message === 'string' ? body.message : null,
    };
  } catch {
    return { accepted: false, jobId: null, errorCode: 'bridge_unavailable', message: null };
  }
}

export async function getFiscalPrintJob(jobId: string): Promise<FiscalPrintJobResult | null> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return null;
  try {
    const response = await request(`/jobs/${jobId}`);
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    const status = body.status;
    if (status !== 'queued' && status !== 'printing' && status !== 'completed' && status !== 'failed') {
      return null;
    }
    return {
      jobId,
      status,
      errorCode: typeof body.errorCode === 'string' ? body.errorCode : null,
      message: typeof body.message === 'string' ? body.message : null,
    };
  } catch {
    return null;
  }
}

export async function waitForFiscalPrintJob(
  jobId: string,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<FiscalPrintJobResult | null> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const pollMs = options.pollMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const job = await getFiscalPrintJob(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') return job;
    await new Promise((resolve) => window.setTimeout(resolve, pollMs));
  }
  return null;
}

export function openFiscalPdf(pdfBase64: string, fileName = 'danfce.pdf'): boolean {
  if (!pdfBase64.startsWith('JVBER') || pdfBase64.length > MAX_PDF_BASE64_LENGTH) return false;
  try {
    const binary = window.atob(pdfBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (opened) opened.document.title = fileName;
    return !!opened;
  } catch {
    return false;
  }
}
