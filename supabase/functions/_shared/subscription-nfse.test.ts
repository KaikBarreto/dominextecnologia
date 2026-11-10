import {
  invoiceStatusFromEvent,
  parseSubscriptionNfseConfig,
  subscriptionNfseTypeLabel,
} from "./subscription-nfse.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Esperado ${JSON.stringify(expected)}, recebido ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function assertThrows(fn: () => unknown): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Era esperado que a função lançasse erro");
}

Deno.test("configuração fiscal exige serviço e todas as alíquotas explícitas", () => {
  const config = parseSubscriptionNfseConfig(JSON.stringify({
    municipalServiceCode: "1.05",
    municipalServiceName: "Licenciamento de software",
    taxes: {
      retainIss: false,
      iss: 2,
      cofins: 0,
      csll: 0,
      inss: 0,
      ir: 0,
      pis: 0,
    },
  }));
  assertEquals(config.municipalServiceCode, "1.05");
  assertEquals(config.taxes.iss, 2);

  assertThrows(() => parseSubscriptionNfseConfig(undefined));
  assertThrows(() =>
    parseSubscriptionNfseConfig(JSON.stringify({
      municipalServiceCode: "1.05",
      municipalServiceName: "Licenciamento de software",
      taxes: { retainIss: false, iss: 2 },
    }))
  );
});

Deno.test("rótulo fiscal separa venda, renovação e ajuste proporcional", () => {
  assertEquals(subscriptionNfseTypeLabel("primeira_venda"), "Venda");
  assertEquals(
    subscriptionNfseTypeLabel("upgrade"),
    "Ajuste proporcional de plano",
  );
  assertEquals(subscriptionNfseTypeLabel("renovacao"), "Renovação");
});

Deno.test("evento fiscal usa status do payload e possui fallback no nome do evento", () => {
  assertEquals(
    invoiceStatusFromEvent("INVOICE_UPDATED", "AUTHORIZED"),
    "AUTHORIZED",
  );
  assertEquals(invoiceStatusFromEvent("INVOICE_ERROR", null), "ERROR");
  assertEquals(
    invoiceStatusFromEvent("INVOICE_CANCELLATION_DENIED", "CANCELLATION_DENIED"),
    "AUTHORIZED",
  );
});
