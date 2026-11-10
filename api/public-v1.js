const MAX_BODY_BYTES = 64 * 1024;
const ALLOWED_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'x-request-id',
  'retry-after',
  'location',
  'deprecation',
  'sunset',
  'link',
];

function problem(res, status, code, title, detail, requestId, extraHeaders = {}) {
  res.status(status);
  res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Request-Id', requestId);
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  return res.json({
    type: `https://api.dominex.app/problems/${code.replaceAll('_', '-')}`,
    title,
    status,
    code,
    detail,
    request_id: requestId,
  });
}

function serializedBody(req) {
  if (req.method === 'GET' || req.body === undefined || req.body === null) return null;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  return Buffer.from(JSON.stringify(req.body), 'utf8');
}

function requestPath(req) {
  const pathValue = Array.isArray(req.query.path) ? req.query.path.join('/') : (req.query.path ?? '');
  const path = String(pathValue).replace(/^\/+|\/+$/g, '');
  if (path.includes('\\') || path.split('/').some((segment) => segment === '..')) return null;
  return path;
}

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  const method = String(req.method ?? '').toUpperCase();
  if (method === 'OPTIONS') {
    return problem(res, 405, 'method_not_allowed', 'Método não permitido', 'A API pública não aceita chamadas de navegador.', requestId, { Allow: 'GET, POST, PATCH' });
  }
  if (!['GET', 'POST', 'PATCH'].includes(method)) {
    return problem(res, 405, 'method_not_allowed', 'Método não permitido', 'Use um dos métodos documentados.', requestId, { Allow: 'GET, POST, PATCH' });
  }
  if (method !== 'GET' && !String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    return problem(res, 400, 'invalid_content_type', 'Conteúdo inválido', 'Use Content-Type: application/json.', requestId);
  }

  const path = requestPath(req);
  if (path === null) return problem(res, 400, 'invalid_path', 'Caminho inválido', 'O caminho solicitado não é válido.', requestId);
  const body = serializedBody(req);
  if (body && body.byteLength > MAX_BODY_BYTES) {
    return problem(res, 413, 'payload_too_large', 'Requisição muito grande', 'O corpo excede 64 KiB.', requestId);
  }

  const baseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const proxySecret = process.env.PUBLIC_API_PROXY_SECRET;
  if (!baseUrl || !proxySecret) {
    console.error('[public-v1-proxy] missing_server_configuration', { requestId });
    return problem(res, 503, 'temporarily_unavailable', 'Serviço indisponível', 'Tente novamente em instantes.', requestId);
  }

  const upstream = new URL(`/functions/v1/public-api-v1/v1/${path}`, baseUrl.replace(/\/$/, ''));
  for (const [key, rawValue] of Object.entries(req.query)) {
    if (key === 'path') continue;
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      if (value !== undefined) upstream.searchParams.append(key, String(value));
    }
  }

  const headers = new Headers();
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string') headers.set('Authorization', authorization);
  const idempotencyKey = req.headers['idempotency-key'];
  if (typeof idempotencyKey === 'string') headers.set('Idempotency-Key', idempotencyKey);
  if (body) headers.set('Content-Type', 'application/json');
  const forwardedFor = req.headers['x-vercel-forwarded-for'] ?? req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') headers.set('X-Dominex-Client-Ip', forwardedFor.split(',')[0].trim());
  headers.set('X-Dominex-Proxy-Authorization', proxySecret);
  headers.set('X-Request-Id', requestId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const upstreamResponse = await fetch(upstream, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    res.status(upstreamResponse.status);
    for (const header of ALLOWED_RESPONSE_HEADERS) {
      const value = upstreamResponse.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    console.error('[public-v1-proxy] upstream_unavailable', {
      requestId,
      name: error instanceof Error ? error.name : 'unknown',
    });
    return problem(res, 503, 'temporarily_unavailable', 'Serviço indisponível', 'Tente novamente em instantes.', requestId);
  } finally {
    clearTimeout(timeout);
  }
}
