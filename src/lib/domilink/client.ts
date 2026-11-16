import type {
  DomiLinkCapabilities,
  DomiLinkDevice,
  DomiLinkErrorPayload,
  DomiLinkHealth,
  DomiLinkPairResult,
  DomiLinkPrintJob,
  DomiLinkProfile,
  DomiLinkScaleReading,
} from './types';

export const DOMILINK_BASE_URL = 'http://127.0.0.1:8765' as const;

const FRIENDLY_ERRORS: Record<string, string> = {
  invalid_pairing_code: 'Código inválido. Confira o código mostrado no DomiLink.',
  pairing_expired: 'O código venceu. Gere outro no DomiLink e tente novamente.',
  pairing_locked: 'Muitas tentativas. Gere outro código no DomiLink para conectar.',
  invalid_session: 'A conexão expirou. Faça o pareamento novamente.',
  missing_session: 'Faça o pareamento com o DomiLink antes de continuar.',
  pair_code_invalid: 'Código inválido ou vencido. Confira o DomiLink e tente novamente.',
  pair_locked: 'Muitas tentativas. Reinicie o DomiLink para gerar outro código.',
  invalid_token: 'A conexão expirou. Faça o pareamento novamente.',
  session_expired: 'A conexão expirou. Faça o pareamento novamente.',
  device_not_found: 'O equipamento não foi encontrado no DomiLink.',
  idempotency_conflict: 'Este teste já foi enviado com outro conteúdo.',
  print_queue_full: 'A fila de impressão está cheia. Aguarde 30 segundos e tente novamente.',
  rate_limited: 'Muitas tentativas. Aguarde um instante e tente novamente.',
  body_too_large: 'O documento é grande demais para enviar ao DomiLink.',
  unsupported_format: 'Esta impressora não aceita o formato do documento de teste.',
  device_offline: 'O equipamento está offline. Confira a conexão e tente novamente.',
  device_timeout: 'O equipamento demorou para responder. Tente novamente.',
  unexpected_adapter_error: 'O equipamento recusou o trabalho. Confira o DomiLink.',
};

export class DomiLinkError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = 'DomiLinkError';
  }
}

function timeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => window.clearTimeout(timeout) };
}

async function readError(response: Response): Promise<DomiLinkError> {
  let payload: DomiLinkErrorPayload = {};
  try { payload = await response.json() as DomiLinkErrorPayload; } catch { /* resposta local inválida */ }
  const code = payload.error?.code ?? 'request_failed';
  return new DomiLinkError(code, FRIENDLY_ERRORS[code] ?? 'Não foi possível falar com o DomiLink.', response.status);
}

async function localAccessDenied(): Promise<boolean> {
  if (!navigator.permissions?.query) return false;
  // Chromium recente separa loopback da rede local. O nome antigo é fallback
  // somente quando o navegador não reconhece a permissão específica.
  for (const name of ['loopback-network', 'local-network-access']) {
    try {
      const permission = await navigator.permissions.query({ name } as PermissionDescriptor);
      return permission.state === 'denied';
    } catch { /* permissão não suportada: não inferir bloqueio */ }
  }
  return false;
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null; timeoutMs?: number; retryGet?: boolean } = {},
): Promise<T> {
  const { token, timeoutMs = 5_000, retryGet = true, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const execute = async () => {
    const timeout = timeoutSignal(timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch(`${DOMILINK_BASE_URL}${path}`, { ...init, headers, signal: timeout.signal, cache: 'no-store', credentials: 'omit' });
      } catch (error) {
        // Abort/timeout e erros HTTP não comprovam uma permissão negada.
        if (error instanceof TypeError && !timeout.signal.aborted && await localAccessDenied() && !timeout.signal.aborted) {
          throw new DomiLinkError('local_access_denied', 'Seu navegador bloqueou a conexão com o DomiLink. Nas configurações deste site, permita o acesso à rede local e tente novamente.');
        }
        throw error;
      }
      if (!response.ok) throw await readError(response);
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } finally {
      timeout.cancel();
    }
  };

  try {
    return await execute();
  } catch (error) {
    if (error instanceof DomiLinkError) throw error;
    if ((init.method ?? 'GET') === 'GET' && retryGet) {
      try { return await execute(); } catch (retryError) {
        if (retryError instanceof DomiLinkError) throw retryError;
      }
    }
    throw new DomiLinkError('offline', 'Não foi possível conectar ao DomiLink. Confira se o DomiLink está aberto e se o navegador permite acesso local.');
  }
}

export async function detectDomiLink(): Promise<DomiLinkHealth> {
  const health = await request<DomiLinkHealth>('/health', { timeoutMs: 2_500 });
  if (health.name !== 'DomiLink' || health.status !== 'ok' || health.bind !== 'loopback') {
    throw new DomiLinkError('invalid_service', 'O serviço local respondeu de forma inesperada.');
  }
  return health;
}

export function pairDomiLink(code: string) {
  return request<DomiLinkPairResult>('/v1/pair', {
    method: 'POST',
    body: JSON.stringify({ code, client_name: 'Dominex PDV Web' }),
    timeoutMs: 5_000,
    retryGet: false,
  });
}

export async function loadDomiLinkProfile(token: string, health?: DomiLinkHealth): Promise<DomiLinkProfile> {
  const [resolvedHealth, capabilities, devices] = await Promise.all([
    health ? Promise.resolve(health) : detectDomiLink(),
    request<DomiLinkCapabilities>('/v1/capabilities', { token }),
    request<{ devices: DomiLinkDevice[] }>('/v1/devices', { token }),
  ]);
  if (capabilities.fiscal !== false) throw new DomiLinkError('invalid_capabilities', 'O serviço local respondeu de forma inesperada.');
  return { health: resolvedHealth, capabilities, devices: devices.devices };
}

export function revokeDomiLink(token: string) {
  return request<void>('/v1/session', { method: 'DELETE', token, retryGet: false });
}

function asciiToBase64(value: string) {
  return btoa(value);
}

export function buildDomiLinkTestPdfBase64() {
  const streamContent = 'BT /F1 14 Tf 24 70 Td (Teste DomiLink - nao fiscal) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 120] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${streamContent.length} >>\nstream\n${streamContent}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return asciiToBase64(pdf);
}

function testPayloadFor(device: DomiLinkDevice) {
  const formats = device.capabilities.print_formats ?? [];
  if (formats.includes('pdf')) return { format: 'pdf' as const, content_base64: buildDomiLinkTestPdfBase64() };
  if (formats.includes('text')) return { format: 'text' as const, content_base64: asciiToBase64('Teste DomiLink\nComprovante nao fiscal\n') };
  if (formats.includes('escpos')) return { format: 'escpos' as const, content_base64: asciiToBase64('\x1b@Teste DomiLink\n\n') };
  throw new DomiLinkError('unsupported_format', FRIENDLY_ERRORS.unsupported_format);
}

export async function queueDomiLinkTestPrint(token: string, device: DomiLinkDevice, idempotencyKey: string) {
  const testPayload = testPayloadFor(device);
  const options = {
    method: 'POST', token, timeoutMs: 12_000,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ device_id: device.id, ...testPayload, copies: 1, title: 'Teste DomiLink' }),
    retryGet: false,
  } as const;
  try {
    return await request<{ job: DomiLinkPrintJob; replayed: boolean }>('/v1/print/jobs', options);
  } catch (error) {
    // Uma queda local pode acontecer depois que o serviço aceitou o job. O retry usa
    // a MESMA chave, então o DomiLink devolve o trabalho anterior em vez de imprimir duas vezes.
    if (!(error instanceof DomiLinkError) || error.code !== 'offline') throw error;
    return request<{ job: DomiLinkPrintJob; replayed: boolean }>('/v1/print/jobs', options);
  }
}

export function getDomiLinkPrintJob(token: string, jobId: string) {
  return request<{ job: DomiLinkPrintJob }>(`/v1/print/jobs/${encodeURIComponent(jobId)}`, { token, timeoutMs: 5_000 });
}

/** Documento real: uma intenção explícita; falha de transporte nunca dispara outra impressão. */
export async function queueDomiLinkDocumentPrint(token: string, device: DomiLinkDevice, document: Blob, idempotencyKey: string, assertCurrent: () => void = () => undefined) {
  assertCurrent();
  if (!device.capabilities.print_formats?.includes('pdf')) throw new DomiLinkError('unsupported_format', 'Escolha uma impressora do sistema que aceite PDF.');
  if (document.size > 5 * 1024 * 1024) throw new DomiLinkError('body_too_large', FRIENDLY_ERRORS.body_too_large);
  const bytes = new Uint8Array(await document.arrayBuffer());
  assertCurrent();
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return request<{ job: DomiLinkPrintJob; replayed: boolean }>('/v1/print/jobs', {
    method: 'POST', token, timeoutMs: 12_000, retryGet: false,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ device_id: device.id, format: 'pdf', content_base64: btoa(binary), copies: 1, title: 'Comprovante' }),
  });
}

export async function waitForDomiLinkPrintJob(token: string, initial: DomiLinkPrintJob, assertCurrent: () => void = () => undefined) {
  let job = initial;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    assertCurrent();
    if (job.status === 'completed') return job;
    if (job.status === 'failed') {
      const code = job.error_code ?? 'unexpected_adapter_error';
      throw new DomiLinkError(code, FRIENDLY_ERRORS[code] ?? 'A impressão falhou. Confira o equipamento no DomiLink.');
    }
    if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 250));
    assertCurrent();
    job = (await getDomiLinkPrintJob(token, job.id)).job;
  }
  throw new DomiLinkError('job_timeout', 'O DomiLink não confirmou a impressão. Confira a fila do equipamento.');
}

export async function readDomiLinkScale(token: string, deviceId: string) {
  const payload = await request<{ reading: DomiLinkScaleReading }>(`/v1/scales/${encodeURIComponent(deviceId)}/read`, { token, timeoutMs: 5_000 });
  return payload.reading;
}

export function tareDomiLinkScale(token: string, deviceId: string) {
  return request<void>(`/v1/scales/${encodeURIComponent(deviceId)}/tare`, { method: 'POST', token, timeoutMs: 5_000, retryGet: false });
}

export async function readDomiLinkBarcode(token: string, deviceId: string) {
  const payload = await request<{ code: string }>(`/v1/barcodes/${encodeURIComponent(deviceId)}/read`, { token, timeoutMs: 15_000, retryGet: false });
  return payload.code;
}

export function createDomiLinkIdempotencyKey() {
  return `dominex-${crypto.randomUUID()}`;
}
