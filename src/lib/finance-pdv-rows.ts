/**
 * Regras da tela de Contas para lançamentos que nasceram no PDV.
 *
 * O banco só deixa o PDV alterar essas linhas: um UPDATE direto do Financeiro
 * não encontra linha nenhuma e a tela mostrava "Registro não encontrado".
 * Por isso a baixa, a edição e a exclusão delas seguem o caminho do PDV.
 */

/** Linha do financeiro que precisa passar pelos fluxos do PDV, e não pelo UPDATE/DELETE comum. */
export function isPdvFinancialRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return r.origin === 'pdv'
    || r.pdv_financial_role != null
    || r.pdv_settlement_group_id != null
    || r.pdv_cash_session_id != null;
}

/**
 * Lançamento cancelado (venda do PDV cancelada, por exemplo) continua no banco
 * para o histórico, mas não é conta a receber nem a pagar. Visão geral, DRE,
 * calendário e painel já o ignoram; a lista de Contas mostrava a dívida de uma
 * venda cancelada como "Vencida", com a baixa disponível.
 */
export function withoutCancelledAccounts<T extends { cancelled_at?: string | null }>(rows: T[]): T[];
export function withoutCancelledAccounts<T extends { cancelled_at?: string | null }>(rows: T[] | undefined): T[] | undefined;
export function withoutCancelledAccounts<T extends { cancelled_at?: string | null }>(rows: T[] | undefined): T[] | undefined {
  return rows?.filter(row => !row.cancelled_at);
}

export type AccountSettlementRoute =
  | { kind: 'finance' }
  /** Fiado/saldo do PDV: a baixa é feita na conta do cliente (caixa e saldo dele juntos). */
  | { kind: 'pdv_customer_account'; customerId: string }
  | { kind: 'pdv_unavailable' };

/** Por onde "marcar como recebido/pago" deve seguir para esta conta. */
export function accountSettlementRoute(row: {
  transaction_type?: string | null;
  customer_id?: string | null;
}): AccountSettlementRoute {
  if (!isPdvFinancialRow(row)) return { kind: 'finance' };
  return row.transaction_type === 'entrada' && row.customer_id
    ? { kind: 'pdv_customer_account', customerId: row.customer_id }
    : { kind: 'pdv_unavailable' };
}
