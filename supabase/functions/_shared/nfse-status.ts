// =============================================================================
// _shared/nfse-status.ts — vocabulário ÚNICO de status de NFS-e (PT-BR canônico).
// =============================================================================
// A UI, os filtros e os relatórios compartilham o vocabulário PT-BR canônico
// abaixo. O microserviço pode devolver um estado oficial intermediário, que é
// normalizado aqui sem inventar um desfecho fiscal.
//
// REGRA: nada escreve em `nfse_emissions.status` sem passar por aqui.
//
// =============================================================================

/** Vocabulário canônico do Dominex (o mesmo que src/components/fiscal/nfseStatus.tsx conhece). */
export const NFSE_STATUS = {
  RASCUNHO: "rascunho",
  PENDENTE: "pendente",
  PROCESSANDO: "processando",
  AUTORIZADA: "autorizada",
  REJEITADA: "rejeitada",
  /** Houve erro ou retorno incompleto; a situação no fisco ainda não é conhecida. */
  CONFIRMACAO_PENDENTE: "confirmacao_pendente",
  /** Legado: nunca é terminal e deve ser reconciliado como confirmação pendente. */
  FALHOU: "falhou",
  CANCELAMENTO_PENDENTE: "cancelamento_pendente",
  CANCELADA: "cancelada",
} as const;

export type NfseCanonicalStatus = typeof NFSE_STATUS[keyof typeof NFSE_STATUS];

/** Lista dos status canônicos (útil pra validação/allowlist). */
export const NFSE_CANONICAL_STATUSES: readonly string[] = Object.values(
  NFSE_STATUS,
);

/** Status terminais: não mudam mais sozinhos (polling pode parar). */
export const NFSE_TERMINAL_STATUSES: readonly string[] = [
  NFSE_STATUS.AUTORIZADA,
  NFSE_STATUS.REJEITADA,
  NFSE_STATUS.CANCELADA,
];

/**
 * Status do motor/Portal Nacional → canônico PT-BR.
 */
const RAW_TO_CANONICAL: Record<string, string> = {
  aguardando_confirmacao: NFSE_STATUS.CONFIRMACAO_PENDENTE,
  // Sinônimos defensivos de integrações e linhas históricas.
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
  // "failed"/"error" são estados técnicos, não prova de que a prefeitura
  // rejeitou a nota. Mantemos a emissão em reconciliação.
  failed: NFSE_STATUS.CONFIRMACAO_PENDENTE,
  error: NFSE_STATUS.CONFIRMACAO_PENDENTE,
  cancelled: NFSE_STATUS.CANCELADA,
  canceled: NFSE_STATUS.CANCELADA,
};

function normalize(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/**
 * Normaliza um status do motor (ou já canônico) para o vocabulário PT-BR.
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

/** true quando o status canônico é terminal (autorizada|rejeitada|falhou|cancelada). */
export function isNfseTerminal(status: unknown): boolean {
  return NFSE_TERMINAL_STATUSES.includes(normalize(status));
}
