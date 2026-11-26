// Testes puros (Asaas e banco falsos) das peças da troca do "cliente escolhe".
//
//   deno test supabase/functions/_shared/customer-installment-swap.test.ts
//
// Travam: recuperação EXATA por externalReference (nada de heurística), a
// ordem estorno x remoção conforme o status, e a leitura que decide entre
// "trocou", "recusou" e "incerto" quando a RPC erra.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AsaasApiError, type AsaasTenantClient } from "./asaas-tenant-client.ts";
import {
  findCapturedInstallmentSale,
  swapToInstallmentSale,
  undoCapturedInstallment,
} from "./customer-installment-swap.ts";

type Handler = (method: string, path: string, query?: string) => unknown;

function fakeAsaas(handler: Handler, calls: string[] = []): AsaasTenantClient {
  const run = (method: string, path: string, query?: string) => {
    calls.push(`${method} ${path}${query ? `?${query}` : ""}`);
    const out = handler(method, path, query);
    if (out instanceof Error) return Promise.reject(out);
    return Promise.resolve(out);
  };
  return {
    get: (path: string, query?: string) => run("GET", path, query),
    post: (path: string) => run("POST", path),
    put: (path: string) => run("PUT", path),
    delete: (path: string) => run("DELETE", path),
  } as unknown as AsaasTenantClient;
}

const CHARGE = "11111111-2222-3333-4444-555555555555";

Deno.test("recuperação: só venda parcelada capturada DESTA cobrança, fora o id atual", async () => {
  const calls: string[] = [];
  const asaas = fakeAsaas((method, path) => {
    if (method === "GET" && path === "/payments") {
      return {
        data: [
          // a própria 1x atual: fica de fora
          { id: "pay_1x", status: "PENDING", externalReference: CHARGE, installment: null },
          // estornada: fica de fora
          { id: "pay_old1", status: "REFUNDED", externalReference: CHARGE, installment: "inst_old", installmentNumber: 1, value: 50 },
          // de OUTRA referência (filtro defensivo mesmo se a API ignorar o filtro)
          { id: "pay_x", status: "CONFIRMED", externalReference: "outra", installment: "inst_x", installmentNumber: 1, value: 50 },
          // a sobra capturada
          { id: "pay_n2", status: "CONFIRMED", externalReference: CHARGE, installment: "inst_ok", installmentNumber: 2, value: 62.5 },
          { id: "pay_n1", status: "CONFIRMED", externalReference: CHARGE, installment: "inst_ok", installmentNumber: 1, value: 62.5, netValue: 60.1, invoiceUrl: "https://x/i" },
        ],
      };
    }
    if (method === "GET" && path === "/installments/inst_ok") return { installmentCount: 10, value: 625.45 };
    throw new Error(`inesperado ${method} ${path}`);
  }, calls);

  const got = await findCapturedInstallmentSale(asaas, CHARGE, "pay_1x");
  assertEquals(got, {
    paymentId: "pay_n1",
    installmentId: "inst_ok",
    installmentCount: 10,
    billedValue: 625.45,
    netValue: 60.1,
    status: "CONFIRMED",
    invoiceUrl: "https://x/i",
  });
  assertEquals(calls[0], `GET /payments?externalReference=${CHARGE}&billingType=CREDIT_CARD&limit=100`);
});

Deno.test("recuperação: sem venda capturada → null", async () => {
  const asaas = fakeAsaas(() => ({ data: [{ id: "pay_1x", status: "PENDING", externalReference: CHARGE }] }));
  assertEquals(await findCapturedInstallmentSale(asaas, CHARGE, "pay_1x"), null);
});

Deno.test("desfazer: confirmada → estorno do parcelamento", async () => {
  const calls: string[] = [];
  const asaas = fakeAsaas(() => ({}), calls);
  assertEquals(await undoCapturedInstallment(asaas, "inst_ok", "CONFIRMED"), true);
  assertEquals(calls, ["POST /installments/inst_ok/refund"]);
});

Deno.test("desfazer: em análise de risco → remoção do parcelamento", async () => {
  const calls: string[] = [];
  const asaas = fakeAsaas(() => ({}), calls);
  assertEquals(await undoCapturedInstallment(asaas, "inst_ok", "AWAITING_RISK_ANALYSIS"), true);
  assertEquals(calls, ["DELETE /installments/inst_ok"]);
});

Deno.test("desfazer: resposta inconclusiva → consulta e NÃO repete se já estornou", async () => {
  const calls: string[] = [];
  const asaas = fakeAsaas((method, path) => {
    if (method === "POST") return new AsaasApiError("timeout", 504);
    if (method === "GET" && path === "/installments/inst_ok") return { deleted: false };
    if (method === "GET" && path === "/payments") return { data: [{ id: "p1", status: "REFUND_REQUESTED" }] };
    return {};
  }, calls);
  assertEquals(await undoCapturedInstallment(asaas, "inst_ok", "CONFIRMED"), true);
  assertEquals(calls.filter((c) => c.startsWith("POST")).length, 1);
});

Deno.test("desfazer: status mudou → usa a operação que o estado pede", async () => {
  const calls: string[] = [];
  const asaas = fakeAsaas((method, path) => {
    // achávamos que estava em análise; a Asaas já confirmou: DELETE é recusado.
    if (method === "DELETE") return new AsaasApiError("não permitido", 400);
    if (method === "GET" && path === "/installments/inst_ok") return { deleted: false };
    if (method === "GET" && path === "/payments") return { data: [{ id: "p1", status: "CONFIRMED" }] };
    return {};
  }, calls);
  assertEquals(await undoCapturedInstallment(asaas, "inst_ok", "AWAITING_RISK_ANALYSIS"), true);
  assertEquals(calls.includes("POST /installments/inst_ok/refund"), true);
});

function fakeSupabase(rpcResults: { data?: unknown; error?: unknown }[], read: { data?: unknown; error?: unknown }) {
  let i = 0;
  return {
    rpc: () => Promise.resolve(rpcResults[Math.min(i++, rpcResults.length - 1)]),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(read) }) }),
    }),
  };
}

const CAPTURED = {
  paymentId: "pay_n1", installmentId: "inst_ok", installmentCount: 10,
  billedValue: 625.45, netValue: 60.1, status: "CONFIRMED", invoiceUrl: null,
};

Deno.test("troca: RPC ok → swapped; recusa → refused com motivo", async () => {
  assertEquals(
    await swapToInstallmentSale(fakeSupabase([{ data: { swapped: true, reason: null } }], {}), CHARGE, "pay_1x", CAPTURED),
    { outcome: "swapped", reason: null },
  );
  assertEquals(
    await swapToInstallmentSale(
      fakeSupabase([{ data: { swapped: false, reason: "charge_already_paid" } }], {}),
      CHARGE, "pay_1x", CAPTURED,
    ),
    { outcome: "refused", reason: "charge_already_paid" },
  );
});

Deno.test("troca: RPC erra mas a releitura mostra o id novo → swapped", async () => {
  const sb = fakeSupabase([{ error: { message: "x" } }], { data: { asaas_payment_id: "pay_n1" } });
  assertEquals((await swapToInstallmentSale(sb, CHARGE, "pay_1x", CAPTURED)).outcome, "swapped");
});

Deno.test("troca: RPC e releitura erram → uncertain (não desfazer às cegas)", async () => {
  const sb = fakeSupabase([{ error: { message: "x" } }], { error: { message: "down" } });
  assertEquals((await swapToInstallmentSale(sb, CHARGE, "pay_1x", CAPTURED)).outcome, "uncertain");
});

Deno.test("troca: RPC erra sempre e a releitura prova que não trocou → refused", async () => {
  const sb = fakeSupabase([{ error: { message: "x" } }], { data: { asaas_payment_id: "pay_1x" } });
  assertEquals(await swapToInstallmentSale(sb, CHARGE, "pay_1x", CAPTURED), { outcome: "refused", reason: "rpc_error" });
});
