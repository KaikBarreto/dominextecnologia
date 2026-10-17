const MAX_BODY_BYTES = 64 * 1024;
const API_METHODS = new Set(['GET', 'POST']);
const ALLOWED_RESPONSE_HEADERS = [
  'content-type',
  'x-request-id',
  'retry-after',
  'location',
  'deprecation',
  'sunset',
  'link',
];

function problem(status, code, title, detail, requestId, extraHeaders = {}) {
  return Response.json(
    {
      type: `https://api.dominex.app/problems/${code.replaceAll('_', '-')}`,
      title,
      status,
      code,
      detail,
      request_id: requestId,
    },
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'X-Request-Id': requestId,
        ...extraHeaders,
      },
    },
  );
}

function redirectToDocs(pathname) {
  const suffix = pathname === '/v1/docs' ? '/docs' : pathname;
  return Response.redirect(`https://www.dominex.app${suffix}`, 308);
}

async function readBody(request) {
  if (request.method === 'GET' || !request.body) return null;
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return false;

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return false;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function proxyStatic(request, env, pathname) {
  const targetPath = pathname === '/v1/openapi.json' ? pathname : '/docs/llms.txt';
  const upstream = new URL(targetPath, env.DOCS_ORIGIN);
  const response = await fetch(new Request(upstream, { method: 'GET' }));
  const headers = new Headers();
  headers.set(
    'Content-Type',
    pathname === '/v1/openapi.json'
      ? 'application/vnd.oai.openapi+json;version=3.1.1; charset=utf-8'
      : 'text/plain; charset=utf-8',
  );
  headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}

async function handleRequest(request, env) {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);

  if (url.pathname === '/' || url.pathname === '/docs' || url.pathname === '/v1/docs') {
    return redirectToDocs(url.pathname);
  }
  if (url.pathname === '/v1/openapi.json' || url.pathname === '/llms.txt') {
    if (request.method !== 'GET') {
      return problem(405, 'method_not_allowed', 'Método não permitido', 'Use GET neste recurso.', requestId, { Allow: 'GET' });
    }
    return proxyStatic(request, env, url.pathname);
  }
  if (!url.pathname.startsWith('/v1/')) {
    return problem(404, 'not_found', 'Recurso não encontrado', 'Consulte a documentação da API.', requestId);
  }
  if (request.method === 'OPTIONS' || !API_METHODS.has(request.method)) {
    return problem(405, 'method_not_allowed', 'Método não permitido', 'A API pública aceita somente os métodos documentados.', requestId, { Allow: 'GET, POST' });
  }
  if (request.method === 'POST' && !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return problem(400, 'invalid_content_type', 'Conteúdo inválido', 'Use Content-Type: application/json.', requestId);
  }
  if (!env.PUBLIC_API_UPSTREAM || !env.PUBLIC_API_PROXY_SECRET) {
    console.error('[public-api-gateway] missing_server_configuration', { requestId });
    return problem(503, 'temporarily_unavailable', 'Serviço indisponível', 'Tente novamente em instantes.', requestId);
  }

  const body = await readBody(request);
  if (body === false) {
    return problem(413, 'payload_too_large', 'Requisição muito grande', 'O corpo excede 64 KiB.', requestId);
  }

  const upstream = new URL(`${env.PUBLIC_API_UPSTREAM.replace(/\/$/, '')}${url.pathname}${url.search}`);
  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  const idempotencyKey = request.headers.get('idempotency-key');
  if (authorization) headers.set('Authorization', authorization);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  if (body) headers.set('Content-Type', 'application/json');
  headers.set('X-Dominex-Proxy-Authorization', env.PUBLIC_API_PROXY_SECRET);
  headers.set('X-Dominex-Client-Ip', request.headers.get('cf-connecting-ip') ?? 'unknown');
  headers.set('X-Request-Id', requestId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    const responseHeaders = new Headers();
    for (const name of ALLOWED_RESPONSE_HEADERS) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set('Cache-Control', 'no-store, max-age=0');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    console.error('[public-api-gateway] upstream_unavailable', {
      requestId,
      name: error instanceof Error ? error.name : 'unknown',
    });
    return problem(503, 'temporarily_unavailable', 'Serviço indisponível', 'Tente novamente em instantes.', requestId);
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  fetch: handleRequest,
};

export { handleRequest };
