import { parseEvolutionDeliveryAck } from "./evolution-ack.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Esperado ${expectedJson}, recebido ${actualJson}`);
  }
}

Deno.test("interpreta ACK achatado da Evolution 2.3.7", () => {
  assertEquals(
    parseEvolutionDeliveryAck({
      keyId: "provider-123",
      remoteJid: "5511999999999@s.whatsapp.net",
      status: "DELIVERY_ACK",
    }),
    {
      providerMessageId: "provider-123",
      remoteJid: "5511999999999@s.whatsapp.net",
      status: "delivered",
    },
  );
});

Deno.test("interpreta confirmação de leitura aninhada", () => {
  assertEquals(
    parseEvolutionDeliveryAck({
      key: { id: "provider-456", remoteJid: "5511888888888@s.whatsapp.net" },
      update: { status: 4 },
    }),
    {
      providerMessageId: "provider-456",
      remoteJid: "5511888888888@s.whatsapp.net",
      status: "read",
    },
  );
});

Deno.test("ignora ACK de servidor e payload sem referência", () => {
  assertEquals(
    parseEvolutionDeliveryAck({ keyId: "provider-789", status: "SERVER_ACK" }),
    null,
  );
  assertEquals(parseEvolutionDeliveryAck({ status: "READ" }), null);
});
