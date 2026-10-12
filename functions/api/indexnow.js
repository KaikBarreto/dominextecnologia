import { submitIndexNow } from '../_lib/indexnow.js';

const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...responseHeaders, Allow: 'POST' },
    });
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: responseHeaders,
    });
  }
  const urls = Array.isArray(payload?.urls) ? payload.urls : [payload?.url];
  const result = await submitIndexNow(urls);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: responseHeaders,
  });
}
