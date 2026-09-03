// =============================================================================
// _shared/nfse-status.ts — vocabulário ÚNICO de status de NFS-e (PT-BR canônico).
// =============================================================================
// PROBLEMA que este módulo resolve:
//   A Fisqal devolve o status em INGLÊS (pending → validated → xml_generated →
//   signed → queued → processing → sent → authorized | rejected | failed →
//   cancelled). A UI do Dominex (badges, filtros, KPIs, botões de cancelar/PDF)
//   só entende o vocabulário PT-BR canônico abaixo. Gravar o cru em
//   `nfse_emissions.status` fazia a nota autorizada virar badge de fallback,
//   sem botão de cancelar, sem PDF/XML e fora dos filtros/KPIs.
//
// REGRA: nada escreve em `nfse_emissions.status` sem passar por aqui.
//
// Referência do contrato: docs/integracoes/fisqal.md §6 (ciclo de vida) e o
// OpenAPI ao vivo (https://api.fisqal.com.br/docs-json).
// =============================================================================

/** Vocabulário canônico do Dominex (o mesmo que src/components/fiscal/nfseStatus.tsx conhece). */
export const NFSE_STATUS = {
  RASCUNHO: "rascunho",
  PENDENTE: "pendente",
  PROCESSANDO: "processando",
  AUTORIZADA: "autorizada",
  REJEITADA: "rejeitada",
  FALHOU: "falhou",
  CANCELAMENTO_PENDENTE: "cancelamento_pendente",
  CANCELADA: "cancelada",
} as const;

export type NfseCanonicalStatus = typeof NFSE_STATUS[keyof typeof NFSE_STATUS];

/** Lista dos status canônicos (útil pra validação/allowlist). */
export const NFSE_CANONICAL_STATUSES: readonly string[] = Object.values(NFSE_STATUS);

/** Status terminais: não mudam mais sozinhos (polling pode parar). */
export const NFSE_TERMINAL_STATUSES: readonly string[] = [
  NFSE_STATUS.AUTORIZADA,
  NFSE_STATUS.REJEITADA,
  NFSE_STATUS.FALHOU,
  NFSE_STATUS.CANCELADA,
];

/**
 * Status cru da Fisqal → canônico PT-BR.
 * Os intermediários do pipeline (validated/xml_generated/signed/queued) ainda
 * não saíram do nosso lado → "pendente". Já enviados à SEFIN → "processando".
 */
const RAW_TO_CANONICAL: Record<string, string> = {
  // pipeline interno da Fisqal (ainda não foi pra prefeitura/SEFIN)
  pending: NFSE_STATUS.PENDENTE,
  validated: NFSE_STATUS.PENDENTE,
  xml_generated: NFSE_STATUS.PENDENTE,
  signed: NFSE_STATUS.PENDENTE,
  queued: NFSE_STATUS.PENDENTE,
  // em trânsito / processando na prefeitura
  processing: NFSE_STATUS.PROCESSANDO,
  sent: NFSE_STATUS.PROCESSANDO,
  // terminais
  authorized: NFSE_STATUS.AUTORIZADA,
  rejected: NFSE_STATUS.REJEITADA,
  failed: NFSE_STATUS.FALHOU,
  error: NFSE_STATUS.FALHOU,
  cancelled: NFSE_STATUS.CANCELADA,
  canceled: NFSE_STATUS.CANCELADA,
};

/** Estados de cancelamento ainda em curso na fila assíncrona da Fisqal. */
const CANCEL_IN_FLIGHT = new Set<string>([
  "pending",
  "validated",
  "xml_generated",
  "signed",
  "queued",
  "processing",
  "sent",
  NFSE_STATUS.CANCELAMENTO_PENDENTE,
]);

function normalize(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/**
 * Normaliza um status vindo da Fisqal (ou já canônico) para o vocabulário PT-BR.
 *
 * - Case-insensitive e tolerante a espaços.
 * - Valores já canônicos (rascunho, pendente, …, cancelamento_pendente) passam direto.
 * - Vazio ou desconhecido → `fallback` (normalmente o status atual da linha, pra
 *   nunca "rebaixar" uma nota por causa de um valor que não sabemos ler).
 */
export function mapNfseStatus(raw: unknown, fallback: string): string {
  const s = normalize(raw);
  if (!s) return fallback;
  const canonical = RAW_TO_CANONICAL[s];
  if (canonical) return canonical;
  if (NFSE_CANONICAL_STATUSES.includes(s)) return s;
  return fallback;
}

/**
 * Variante para a resposta do POST /v1/nfse/{id}/cancel.
 * A fila de cancelamento da Fisqal é assíncrona: ela devolve o status do
 * PEDIDO de cancelamento, não do documento. Por isso "pending"/"processing"/
 * "sent" aqui significam "cancelamento pendente", e NÃO "pendente".
 *
 * Qualquer outro valor cai em `cancelamento_pendente` de propósito: assim o
 * polling (fisqal-nfse-status) reconcilia o status real do documento em vez de
 * marcarmos a nota como rejeitada/falhou por causa da resposta do cancelamento.
 */
export function mapNfseCancelStatus(raw: unknown): string {
  const s = normalize(raw);
  if (!s) return NFSE_STATUS.CANCELAMENTO_PENDENTE;
  if (s === "cancelled" || s === "canceled" || s === NFSE_STATUS.CANCELADA) {
    return NFSE_STATUS.CANCELADA;
  }
  if (CANCEL_IN_FLIGHT.has(s)) return NFSE_STATUS.CANCELAMENTO_PENDENTE;
  // Só deixamos passar o status do DOCUMENTO quando ele é conclusivo e coerente
  // com o fluxo de cancelamento (autorizada = cancelamento não pegou ainda).
  // "rejected"/"failed" aqui são do PEDIDO de cancelamento, não da nota — marcar
  // a nota como rejeitada/falhou seria mentira. Cai em cancelamento_pendente e o
  // polling (fisqal-nfse-status) reconcilia o status real do documento.
  const mapped = mapNfseStatus(s, NFSE_STATUS.CANCELAMENTO_PENDENTE);
  return mapped === NFSE_STATUS.AUTORIZADA || mapped === NFSE_STATUS.CANCELADA
    ? mapped
    : NFSE_STATUS.CANCELAMENTO_PENDENTE;
}

/** true quando o status canônico é terminal (autorizada|rejeitada|falhou|cancelada). */
export function isNfseTerminal(status: unknown): boolean {
  return NFSE_TERMINAL_STATUSES.includes(normalize(status));
}
