import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSON inválido' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const cepRaw = (body as { cep?: unknown })?.cep;
    if (typeof cepRaw !== 'string') {
      return new Response(JSON.stringify({ error: 'CEP inválido' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const cleanCep = cepRaw.replace(/\D/g, '').slice(0, 8);
    if (cleanCep.length !== 8) {
      return new Response(JSON.stringify({ error: 'CEP inválido' }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let viaCepData: any;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, { signal: controller.signal });
      if (!response.ok) throw new Error('ViaCEP indisponível');
      viaCepData = await response.json();
    } finally {
      clearTimeout(timeout);
    }

    if (viaCepData?.erro) {
      return new Response(JSON.stringify({ error: 'CEP não encontrado' }), {
        status: 404,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      logradouro: String(viaCepData.logradouro || '').slice(0, 200),
      bairro: String(viaCepData.bairro || '').slice(0, 100),
      cidade: String(viaCepData.localidade || '').slice(0, 100),
      estado: String(viaCepData.uf || '').slice(0, 2),
    }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (_error) {
    return new Response(JSON.stringify({ error: 'Erro ao buscar CEP' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
