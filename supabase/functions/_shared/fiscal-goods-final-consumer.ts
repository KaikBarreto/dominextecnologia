export interface GoodsFinalConsumerInput {
  model: 55 | 65;
  direction: "entrada" | "saida";
  stateRegistration?: unknown;
  requested?: unknown;
}

const hasStateRegistration = (value: unknown) =>
  typeof value === "string" && value.replace(/\D/g, "").length > 0;

/** Um destinatário sem IE nunca pode ser enviado como não consumidor final. */
export function resolveGoodsFinalConsumer(input: GoodsFinalConsumerInput) {
  if (input.model === 65) return true;
  if (input.direction !== "saida") return false;
  if (!hasStateRegistration(input.stateRegistration)) return true;
  return input.requested === true;
}

export function isGoodsFinalConsumerCompatible(input: GoodsFinalConsumerInput) {
  return !(
    input.model === 55 &&
    input.direction === "saida" &&
    !hasStateRegistration(input.stateRegistration) &&
    resolveGoodsFinalConsumer(input) !== true
  );
}
