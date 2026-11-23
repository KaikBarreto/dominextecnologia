import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';

let handler!: (req: Request) => Promise<Response>;
const originalServe = Deno.serve;
(Deno as unknown as { serve: unknown }).serve = (fn: typeof handler) => {
  handler = fn;
  return {};
};
const edgeModule = await import('./index.ts');
(Deno as unknown as { serve: unknown }).serve = originalServe;

const userId = 'd1111111-1111-4111-8111-111111111111';
const companyId = 'd2222222-2222-4222-8222-222222222222';
const otherCompanyId = 'd3333333-3333-4333-8333-333333333333';
const contractId = 'd4444444-4444-4444-8444-444444444444';
const documentId = 'd5555555-5555-4555-8555-555555555555';
const storagePath = `${companyId}/${contractId}/dossie_pmoc-v1.pdf`;

Deno.env.set('SUPABASE_URL', 'https://backend.example.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fictitious-local-test-key');

const originalFetch = globalThis.fetch;
let permissionAllowed = true;
let moduleAllowed = true;
let subscriptionAllowed = true;
let profileCompanyId = companyId;
let signedRequestBody: Record<string, unknown> | null = null;
const paths: string[] = [];

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setup(): void {
  permissionAllowed = true;
  moduleAllowed = true;
  subscriptionAllowed = true;
  profileCompanyId = companyId;
  signedRequestBody = null;
  paths.length = 0;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assertEquals(url.hostname, 'backend.example.invalid', 'Teste não pode acessar rede externa');
    paths.push(`${init?.method ?? 'GET'}:${url.pathname}`);

    if (url.pathname === '/auth/v1/user') {
      return Promise.resolve(json({ id: userId, aud: 'authenticated', role: 'authenticated' }));
    }

    const resource = url.pathname.split('/').at(-1);
    if (resource === 'profiles') {
      return Promise.resolve(json({ company_id: profileCompanyId, is_active: true }));
    }
    if (resource === 'user_roles') return Promise.resolve(json([{ role: 'gestor' }]));
    if (resource === 'can_manage_contracts') return Promise.resolve(json(permissionAllowed));
    if (resource === 'company_has_module') return Promise.resolve(json(moduleAllowed));
    if (resource === 'tenant_subscription_allows_access') return Promise.resolve(json(subscriptionAllowed));
    if (resource === 'pmoc_documents') {
      return Promise.resolve(json({
        id: documentId,
        company_id: companyId,
        contract_id: contractId,
        doc_type: 'dossie_pmoc',
        version: 1,
        generated_at: '2026-11-20T10:00:00.000Z',
        pdf_storage_path: storagePath,
      }));
    }
    if (resource === 'contracts') {
      return Promise.resolve(json({
        id: contractId,
        company_id: companyId,
        name: 'Unidade / Centro: Norte',
        is_pmoc: true,
      }));
    }
    if (url.pathname.startsWith('/storage/v1/object/sign/pmoc-documents/')) {
      signedRequestBody = JSON.parse(String(init?.body ?? '{}'));
      return Promise.resolve(json({
        signedURL: `/storage/v1/object/sign/pmoc-documents/${storagePath}?token=fictitious`,
      }));
    }

    throw new Error(`Rota local inesperada: ${url.pathname}`);
  }) as typeof fetch;
}

function request(auth = true): Request {
  return new Request('https://edge.example.invalid/pmoc-document-download', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: 'Bearer fictitious-session' } : {}),
    },
    body: JSON.stringify({ documentId, contractId }),
  });
}

Deno.test('download PMOC exige sessão antes de consultar o backend', async () => {
  setup();
  try {
    const response = await handler(request(false));
    assertEquals(response.status, 401);
    assertEquals(paths.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('download PMOC oculta documento de outro tenant', async () => {
  setup();
  profileCompanyId = otherCompanyId;
  try {
    const response = await handler(request());
    assertEquals(response.status, 404);
    assertEquals((await response.json()).code, 'not_found');
    assert(!paths.some((path) => path.includes('/storage/v1/object/sign/')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('download PMOC falha fechado sem permissão de contratos', async () => {
  setup();
  permissionAllowed = false;
  try {
    const response = await handler(request());
    assertEquals(response.status, 403);
    assertEquals((await response.json()).code, 'forbidden');
    assert(!paths.some((path) => path.includes('/storage/v1/object/sign/')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const denied of ['module', 'subscription'] as const) {
  Deno.test(`download PMOC falha fechado sem ${denied}`, async () => {
    setup();
    if (denied === 'module') moduleAllowed = false;
    if (denied === 'subscription') subscriptionAllowed = false;
    try {
      const response = await handler(request());
      assertEquals(response.status, 403);
      assertEquals((await response.json()).code, 'module_unavailable');
      assert(!paths.some((path) => path.includes('/storage/v1/object/sign/')));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

Deno.test('download PMOC assina exatamente a versão histórica autorizada', async () => {
  setup();
  try {
    const response = await handler(request());
    const payload = await response.json();
    assertEquals(response.status, 200);
    assertStringIncludes(payload.url, storagePath);
    assert(paths.some((path) => path.includes(`/pmoc-documents/${storagePath}`)));
    assertEquals(signedRequestBody?.expiresIn, 300);
    assertEquals(
      decodeURIComponent(new URL(payload.url).searchParams.get('download') ?? ''),
      'Dossiê PMOC - Unidade Centro Norte - 2026-11-20 - v1.pdf',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('nome de download não expõe path técnico', () => {
  assertEquals(edgeModule.buildDownloadName({
    doc_type: 'certificado',
    version: 4,
    generated_at: '2026-11-20T10:00:00.000Z',
  }, 'Cliente Modelo'), 'Certificado de Conformidade - Cliente Modelo - 2026-11-20 - v4.pdf');
});
