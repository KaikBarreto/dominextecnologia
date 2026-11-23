type FinalConsumerDraft = {
  model: number;
  direction: string;
  finalConsumer?: boolean;
  party?: { stateRegistration?: string | null } | null;
};

const hasStateRegistration = (value: unknown) =>
  typeof value === "string" && value.replace(/\D/g, "").length > 0;

/** Espelha no formulário a regra autoritativa aplicada pela edge function. */
export function resolveGoodsFinalConsumer(draft: FinalConsumerDraft) {
  if (draft.model === 65) return true;
  if (draft.model !== 55 || draft.direction !== "saida") return false;
  if (!hasStateRegistration(draft.party?.stateRegistration)) return true;
  return draft.finalConsumer === true;
}

export function goodsFinalConsumerLabel(draft: FinalConsumerDraft) {
  return resolveGoodsFinalConsumer(draft)
    ? "Uso ou consumo próprio"
    : "Revenda ou industrialização";
}
