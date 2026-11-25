import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

let handler!: (req: Request) => Promise<Response>;
const originalServe = Deno.serve;
(Deno as unknown as { serve: unknown }).serve = (fn: typeof handler) => {
  handler = fn;
  return {};
};
await import("./index.ts");
(Deno as unknown as { serve: unknown }).serve = originalServe;

const originalFetch = globalThis.fetch;
Deno.env.set("SUPABASE_URL", "https://backend.example.invalid");
Deno.env.set("SUPABASE_ANON_KEY", "fictitious-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fictitious-service-key");

const TOKEN = "a".repeat(64);
const COMPANY = "c0000000-0000-4000-8000-000000000001";
const OTHER_COMPANY = "c0000000-0000-4000-8000-000000000002";
const CUSTOMER = "d0000000-0000-4000-8000-000000000001";
const OTHER_CUSTOMER = "d0000000-0000-4000-8000-000000000002";
const NFE = "e0000000-0000-4000-8000-000000000001";
const NFCE = "e0000000-0000-4000-8000-000000000002";
const MANUAL = "e0000000-0000-4000-8000-000000000003";
const HIDDEN = "e0000000-0000-4000-8000-000000000004";
const ORDER = "f0000000-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let payloadInvoices: Row[];
let signedPaths: Array<{ bucket: string; path: string }>;

function nfeRow(overrides: Row = {}): Row {
  return {
    id: NFE,
    company_id: COMPANY,
    customer_id: CUSTOMER,
    status: "authorized",
    environment: 1,
    direction: "saida",
    number: 123,
    danfe_pdf_path: `${COMPANY}/55/${NFE}/danfe.pdf`,
    processed_xml_path: `${COMPANY}/55/${NFE}/procNFe.xml`,
    ...overrides,
  };
}

function setup() {
  tables = {
    nfe_documents: [nfeRow()],
    nfce_documents: [{
      id: NFCE,
      company_id: COMPANY,
      customer_id: CUSTOMER,
      status: "authorized",
      environment: 1,
      order_id: null,
      number: 77,
      danfce_pdf_path: `${COMPANY}/65/${NFCE}/danfce.pdf`,
      processed_xml_path: null,
    }],
    customer_documents: [{
      id: MANUAL,
      company_id: COMPANY,
      customer_id: CUSTOMER,
      is_visible_in_portal: true,
      storage_path: `${COMPANY}/${CUSTOMER}/nota.pdf`,
      file_name: "nota.pdf",
    }],
    pdv_orders: [{ id: ORDER, company_id: COMPANY, customer_id: CUSTOMER }],
  };
  payloadInvoices = [
    { id: NFE, source: "dominex_nfe" },
    { id: NFCE, source: "dominex_nfce" },
    { id: MANUAL, source: "manual" },
  ];
  signedPaths = [];

  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), {
      status,
      headers: { "content-type": "application/json" },
    });

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url,
    );
    assertEquals(url.hostname, "backend.example.invalid");

    if (url.pathname === "/rest/v1/rpc/get_portal_data") {
      return Promise.resolve(json({
        access: "granted",
        customer: { id: CUSTOMER, company_id: COMPANY },
        invoices: payloadInvoices,
        documents: [],
      }));
    }

    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      const rest = decodeURIComponent(
        url.pathname.slice("/storage/v1/object/sign/".length),
      );
      const [bucket, ...parts] = rest.split("/");
      const path = parts.join("/");
      signedPaths.push({ bucket, path });
      return Promise.resolve(
        json({ signedURL: `/object/sign/${bucket}/${path}?token=fake` }),
      );
    }

    const tableName = url.pathname.replace("/rest/v1/", "");
    const rows = tables[tableName];
    if (!rows) throw new Error(`Unexpected test route ${url.pathname}`);
    const filtered = rows.filter((row) => {
      for (const [key, value] of url.searchParams.entries()) {
        if (key === "select") continue;
        if (!value.startsWith("eq.")) throw new Error(`filtro inesperado ${key}`);
        if (String(row[key]) !== value.slice(3)) return false;
      }
      return true;
    });
    const headers = new Headers(init?.headers);
    const accept = headers.get("accept") ?? "";
    if (accept.includes("vnd.pgrst.object")) {
      return Promise.resolve(
        filtered.length === 1 ? json(filtered[0]) : json({ message: "none" }, 406),
      );
    }
    return Promise.resolve(json(filtered));
  }) as typeof fetch;
}

const request = (body: Row) =>
  new Request("https://edge.example.invalid", {
    method: "POST",
    headers: {
      authorization: "Bearer fictitious-anon-key",
      "content-type": "application/json",
    },
    body: JSON.stringify({ portalToken: TOKEN, sessionToken: null, ...body }),
  });

async function run(body: Row) {
  setup();
  return await call(body);
}
async function call(body: Row) {
  try {
    const res = await handler(request(body));
    return { status: res.status, body: await res.json() };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("NF-e liberada devolve PDF assinado do bucket fiscal", async () => {
  const r = await run({ documentId: NFE, source: "dominex_nfe" });
  assertEquals(r.status, 200);
  assert(String(r.body.url).includes("fiscal-artifacts"));
  assert(String(r.body.url).includes("download=NF-e-123.pdf"));
  assertEquals(r.body.expires_in, 300);
  assertEquals(signedPaths, [{
    bucket: "fiscal-artifacts",
    path: `${COMPANY}/55/${NFE}/danfe.pdf`,
  }]);
});

Deno.test("NF-e liberada devolve XML assinado quando format=xml", async () => {
  const r = await run({ documentId: NFE, source: "dominex_nfe", format: "xml" });
  assertEquals(r.status, 200);
  assert(String(r.body.url).includes("download=NF-e-123.xml"));
  assertEquals(signedPaths[0].path, `${COMPANY}/55/${NFE}/procNFe.xml`);
});

Deno.test("NFC-e liberada devolve DANFC-e; sem XML responde 404", async () => {
  const pdf = await run({ documentId: NFCE, source: "dominex_nfce" });
  assertEquals(pdf.status, 200);
  assert(String(pdf.body.url).includes("download=NFC-e-77.pdf"));
  assertEquals(signedPaths[0].path, `${COMPANY}/65/${NFCE}/danfce.pdf`);
  const xml = await run({ documentId: NFCE, source: "dominex_nfce", format: "xml" });
  assertEquals(xml.status, 404);
  assertEquals(signedPaths.length, 0);
});

function nfceOwner(owner: Row) {
  Object.assign(tables.nfce_documents[0], owner);
}

Deno.test("NFC-e com cliente direto de outro cliente é 404", async () => {
  setup();
  nfceOwner({ customer_id: OTHER_CUSTOMER, order_id: ORDER });
  const r = await call({ documentId: NFCE, source: "dominex_nfce" });
  assertEquals(r.status, 404);
  assertEquals(signedPaths.length, 0);
});

Deno.test("NFC-e só com pedido do PDV do próprio cliente libera", async () => {
  setup();
  nfceOwner({ customer_id: null, order_id: ORDER });
  const r = await call({ documentId: NFCE, source: "dominex_nfce" });
  assertEquals(r.status, 200);
  assertEquals(signedPaths[0].path, `${COMPANY}/65/${NFCE}/danfce.pdf`);
});

Deno.test("NFC-e cujo pedido é de OUTRO cliente ou de outra empresa é 404", async () => {
  for (const order of [{ customer_id: OTHER_CUSTOMER }, { company_id: OTHER_COMPANY }, { customer_id: null }]) {
    setup();
    nfceOwner({ customer_id: null, order_id: ORDER });
    Object.assign(tables.pdv_orders[0], order);
    const r = await call({ documentId: NFCE, source: "dominex_nfce" });
    assertEquals(r.status, 404, JSON.stringify(order));
    assertEquals(signedPaths.length, 0);
  }
});

Deno.test("NFC-e sem cliente e sem pedido é 404", async () => {
  setup();
  nfceOwner({ customer_id: null, order_id: null });
  const r = await call({ documentId: NFCE, source: "dominex_nfce" });
  assertEquals(r.status, 404);
});

Deno.test("item fora do payload do visitante é 404 mesmo com id válido", async () => {
  setup();
  tables.nfe_documents.push(nfeRow({ id: HIDDEN }));
  const r = await call({ documentId: HIDDEN, source: "dominex_nfe" });
  assertEquals(r.status, 404);
  assertEquals(r.body.error, "not_found");
  assertEquals(signedPaths.length, 0);
});

Deno.test("source trocado (NF-e pedida como NFC-e) é 404", async () => {
  const r = await run({ documentId: NFE, source: "dominex_nfce" });
  assertEquals(r.status, 404);
  assertEquals(signedPaths.length, 0);
});

Deno.test("linha de outro cliente ou de outra empresa é 404", async () => {
  for (const override of [{ customer_id: OTHER_CUSTOMER }, { company_id: OTHER_COMPANY }]) {
    setup();
    tables.nfe_documents = [nfeRow(override)];
    const r = await call({ documentId: NFE, source: "dominex_nfe" });
    assertEquals(r.status, 404);
    assertEquals(r.body.error, "not_found");
    assertEquals(signedPaths.length, 0);
  }
});

Deno.test("nota não autorizada, de homologação ou de entrada é 404", async () => {
  for (
    const override of [
      { status: "cancelled" },
      { status: "processing" },
      { environment: 2 },
      { direction: "entrada" },
    ]
  ) {
    setup();
    tables.nfe_documents = [nfeRow(override)];
    const r = await call({ documentId: NFE, source: "dominex_nfe" });
    assertEquals(r.status, 404, JSON.stringify(override));
    assertEquals(signedPaths.length, 0);
  }
});

Deno.test("caminho fora do prefixo da empresa ou com .. é 404", async () => {
  for (
    const path of [
      `${OTHER_COMPANY}/55/${NFE}/danfe.pdf`,
      `${COMPANY}/65/${NFE}/danfe.pdf`,
      `${COMPANY}/55/${NFE}/../../${HIDDEN}/danfe.pdf`,
      null,
    ]
  ) {
    setup();
    tables.nfe_documents = [nfeRow({ danfe_pdf_path: path })];
    const r = await call({ documentId: NFE, source: "dominex_nfe" });
    assertEquals(r.status, 404, String(path));
    assertEquals(signedPaths.length, 0);
  }
});

Deno.test("format inválido é 400", async () => {
  const r = await run({ documentId: NFE, source: "dominex_nfe", format: "zip" });
  assertEquals(r.status, 400);
  assertEquals(r.body.error, "invalid_format");
});

Deno.test("source desconhecido continua 400", async () => {
  const r = await run({ documentId: NFE, source: "nfe" });
  assertEquals(r.status, 400);
  assertEquals(r.body.error, "invalid_source");
});

Deno.test("regressão: upload manual segue no bucket de documentos e ignora format", async () => {
  const r = await run({ documentId: MANUAL, source: "manual", format: "zip" });
  assertEquals(r.status, 200);
  assertEquals(r.body.expires_in, 300);
  assertEquals(signedPaths, [{
    bucket: "customer-documents",
    path: `${COMPANY}/${CUSTOMER}/nota.pdf`,
  }]);
});
