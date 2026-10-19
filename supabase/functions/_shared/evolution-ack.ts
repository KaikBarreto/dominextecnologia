export type EvolutionDeliveryAck = {
  providerMessageId: string | null;
  remoteJid: string | null;
  status: "delivered" | "read";
};

function normalizeAck(value: unknown): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const text = String(value ?? "").toUpperCase();
  if (text.includes("READ") || text.includes("PLAYED")) return 4;
  if (text.includes("DELIVER")) return 3;
  if (text.includes("SERVER") || text.includes("SENT")) return 2;
  return 0;
}

/**
 * Normaliza tanto o payload público mais comum quanto o payload achatado da
 * Evolution 2.3.7 (`keyId`, `remoteJid`, `status: DELIVERY_ACK`).
 */
export function parseEvolutionDeliveryAck(
  value: unknown,
): EvolutionDeliveryAck | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const key =
    input.key && typeof input.key === "object" && !Array.isArray(input.key)
      ? input.key as Record<string, unknown>
      : null;
  const update = input.update && typeof input.update === "object" &&
      !Array.isArray(input.update)
    ? input.update as Record<string, unknown>
    : null;
  const ack = normalizeAck(update?.status ?? input.status ?? input.ack);
  if (ack < 3) return null;

  const rawId = key?.id ?? input.keyId ?? input.id;
  const rawRemoteJid = key?.remoteJid ?? input.remoteJid;
  const providerMessageId = String(rawId ?? "").trim() || null;
  const remoteJid = String(rawRemoteJid ?? "").trim() || null;
  if (!providerMessageId && !remoteJid) return null;

  return {
    providerMessageId,
    remoteJid,
    status: ack >= 4 ? "read" : "delivered",
  };
}
