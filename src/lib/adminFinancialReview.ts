// Movimentos técnicos não admitem baixa/classificação manual (mesma regra de
// admin_reconcile_asaas_is_neutral). Permanecem disponíveis no extrato completo.
const technicalEvents = [
  "OPENING_BALANCE",
  "RECONCILIATION_ADJUSTMENT",
  "RECEIVABLE_ANTICIPATION_GROSS_CREDIT",
  "RECEIVABLE_ANTICIPATION_GROSS_DEBIT",
  "RECEIVABLE_ANTICIPATION_DEBIT",
];

export const isTechnicalFinancialMovement = (eventType: string | null | undefined) =>
  technicalEvents.includes(eventType ?? "");

// Aplicar no servidor, antes de count/range: filtrar a página no cliente deixaria
// contadores incorretos e páginas vazias. Eventos desconhecidos continuam visíveis.
export const ADMIN_REVIEW_EVENT_FILTER =
  `asaas_event_type.is.null,asaas_event_type.not.in.(${technicalEvents.join(",")})`;
