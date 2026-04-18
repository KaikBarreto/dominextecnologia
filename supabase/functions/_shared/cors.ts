const ALLOWED_ORIGINS = [
  'https://dominextecnologia.lovable.app',
  'https://app.dominex.com.br',
  // adicionar domínio de produção real aqui
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-token, x-share-token, x-rating-token, x-bootstrap-secret',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  return null;
}
