/**
 * Tipos da conciliação com extrato .OFX — espelham, campo a campo, o
 * contrato das RPCs em `docs/planos/2026-10-17-conciliacao-contrato-rpcs.md`
 * (modo banco) e `docs/planos/2026-10-18-contrato-rpcs-cartao.md` (modo
 * cartão, `supabase/migrations/20261018140000_conciliacao_fatura_cartao.sql`,
 * aplicada em produção).
 *
 * Programamos CONTRA O CONTRATO, não contra o banco: se um campo aqui não
 * bater com o que a RPC devolver de verdade, é o contrato (ou a migration)
 * que está desalinhado, não este arquivo.
 */

/** `financial_transactions.transaction_type` — nunca 'receita'/'despesa'. */
export type TransactionType = 'entrada' | 'saida';

/** Status de uma linha do extrato (`bank_statement_entries.status`). */
export type EntryStatus = 'pending' | 'matched' | 'ignored';

/** Status do import (`bank_statement_imports.status`). */
export type ImportStatus = 'open' | 'finalized';

/**
 * `bank_statement_imports.kind` — define o MODO da conciliação. `'bank'` é o
 * extrato bancário de sempre; `'card'` é a fatura de cartão
 * (20261018140000_conciliacao_fatura_cartao.sql), que não é um saldo de caixa
 * e tem destinos próprios (ver `docs/planos/2026-10-18-contrato-rpcs-cartao.md`).
 */
export type ReconKind = 'bank' | 'card';

/**
 * `reconciliation_matches.match_type`. Os quatro últimos só existem no modo
 * `'card'`: `card_purchase`/`card_purchase_created` são compra (débito na
 * fatura); `card_payment`/`card_payment_created` são o pagamento da fatura
 * visto do lado do cartão (crédito na fatura). Nenhum dos quatro escreve
 * `is_paid = true` num lançamento — essa é a invariante do módulo.
 */
export type MatchType =
  | 'existing'
  | 'created'
  | 'settled'
  | 'transfer'
  | 'card_bill'
  | 'employee_vale'
  | 'card_purchase'
  | 'card_purchase_created'
  | 'card_payment'
  | 'card_payment_created';

/** `reconciliation_matches.confidence`. */
export type MatchConfidence = 'auto' | 'manual';

/**
 * Shape `TxJson` — reutilizado em TODAS as listas de candidato/contexto
 * (`suggested.candidates`, `settle.candidates`, `open_bills`, `ledger_movements`,
 * `reconcile_search_candidates`, `reconcile_list_transfer_legs`).
 *
 * `value_difference` é `entry.effective_amount − signed_amount`; vem `null`
 * nas listas de contexto (não é um match ainda).
 */
export interface ReconTxJson {
  id: string;
  transaction_date: string;
  paid_date: string | null;
  due_date: string | null;
  description: string | null;
  category: string | null;
  notes: string | null;
  amount: number;
  transaction_type: TransactionType;
  signed_amount: number;
  value_difference: number | null;
  account_id: string;
  cost_center_id: string | null;
  transfer_pair_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  is_paid: boolean;
  service_order_id: string | null;
  customer_name: string | null;
  supplier_name: string | null;
  employee_name: string | null;
}

/** `reconcile_list_transfer_legs` — perna de transferência já existente. */
export interface ReconTransferLeg extends ReconTxJson {
  other_account_id: string;
  other_account_name: string;
}

/** Linha vista no painel "sistema" (`ledger_movements`). */
export interface ReconLedgerMovement extends ReconTxJson {
  is_matched: boolean;
  matched_entry_id: string | null;
}

/* ───────────────────────── 1. create_bank_statement_import ───────────────────────── */

/** Entry já em snake_case, no formato que `create_bank_statement_import` espera. */
export interface ReconEntryPayload {
  fitid: string | null;
  dedup_key: string;
  posted_at: string;
  amount: number;
  trn_type: string | null;
  memo: string | null;
  name: string | null;
  sign_suspect: boolean;
}

export interface SkippedSample {
  posted_at: string | null;
  amount: number | null;
  memo: string | null;
  name: string | null;
}

export interface CreateImportResult {
  already_imported: boolean;
  /**
   * `true` quando nada foi inserido e nenhum import foi criado (todas as
   * linhas do arquivo já constavam de um extrato importado antes). Nesse
   * caso `import_id`/`status` vêm `null` — não há import pra abrir.
   * `already_imported` continua `false` aqui (ali existe um import de
   * verdade pra retomar; aqui não existe nenhum).
   */
  nothing_new: boolean;
  import_id: string | null;
  status: ImportStatus | null;
  file_name: string;
  inserted_count: number;
  total_entries: number;
  skipped_count: number;
  skipped_dup_count: number;
  skipped_samples: SkippedSample[];
  pending_count: number;
  opening_balance: number;
  ledger_balance: number;
  acct_warning: boolean;
  acct_warning_previous: string | null;
  sign_suspect_count: number;
}

/* ───────────────────────── 2. get_statement_imports ───────────────────────── */

export interface StatementImportSummary {
  id: string;
  account_id: string;
  file_name: string;
  bank_id: string | null;
  acct_id: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  finalized_at: string | null;
  status: ImportStatus;
  ledger_balance: number;
  opening_balance: number;
  total_entries: number;
  /** `true` quando `total_entries === 0` — distingue "tudo resolvido" de "não tem linha nenhuma" (ambos zeram `pending_count`/`difference`). */
  is_empty: boolean;
  pending_count: number;
  matched_count: number;
  ignored_count: number;
  difference: number;
}

/* ───────────────────────── 3. get_bank_reconciliation_state ───────────────────────── */

export interface ReconImportMeta {
  id: string;
  account_id: string;
  account_name: string;
  account_type: string;
  file_name: string;
  bank_id: string | null;
  acct_id: string | null;
  status: ImportStatus;
  kind: ReconKind;
  period_start: string | null;
  period_end: string | null;
  ledger_balance: number;
  ledger_balance_date: string | null;
  opening_balance: number;
  entry_count: number;
  created_at: string;
  finalized_at: string | null;
  /** `reopen_bank_reconciliation` (20261018140000) — null se nunca foi reaberta. */
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_count: number;
}

export interface ReconCurrentMatch {
  match_id: string;
  financial_transaction_id: string;
  match_type: MatchType;
  transfer_pair_id: string | null;
  transfer_pair_created: boolean | null;
  card_bill_id: string | null;
  employee_movement_id: string | null;
  value_difference: number;
  confidence: MatchConfidence;
  created_at: string;
  transaction: ReconTxJson;
}

export interface ReconSuggested {
  ambiguous: boolean;
  candidate_count: number;
  suggested_transaction_id: string | null;
  candidates: ReconTxJson[];
}

export interface ReconSettleCandidates {
  candidate_count: number;
  candidates: ReconTxJson[];
}

/**
 * `entries[].card_payment` — SEM `ambiguous` de propósito: o contrato não
 * devolve esse campo aqui (só `card_purchase`, que reusa `ReconSuggested`,
 * tem). Não inventar o campo no front: ele sempre viria `undefined`.
 */
export interface ReconCardPaymentCandidates {
  candidate_count: number;
  suggested_transaction_id: string | null;
  candidates: ReconTxJson[];
}

export interface ReconEntry {
  id: string;
  fitid: string | null;
  posted_at: string;
  posted_date: string;
  amount: number;
  effective_amount: number;
  trn_type: string | null;
  memo: string | null;
  name: string | null;
  sign_suspect: boolean;
  sign_flipped: boolean;
  sign_flipped_at: string | null;
  status: EntryStatus;
  current_match: ReconCurrentMatch | null;
  suggested: ReconSuggested;
  settle: ReconSettleCandidates;
  /** Vazio (`candidate_count: 0`) no modo banco — custo zero lá, ver migration. */
  card_purchase: ReconSuggested;
  /** Vazio no modo banco e em linha de débito do modo cartão. */
  card_payment: ReconCardPaymentCandidates;
}

/**
 * `get_bank_reconciliation_state().card` — `null` no modo banco. Rótulos: ver
 * `docs/planos/2026-10-18-contrato-rpcs-cartao.md`. NUNCA a palavra "saldo":
 * `bill_total` = "Total da fatura", `reconciled_total` = "Compras lançadas",
 * `difference` = "Falta lançar". `bill_total` pode vir NEGATIVO (fatura só
 * com crédito, nenhuma compra) — tratar na exibição, não imprimir cru.
 */
export interface ReconCardBlock {
  bill_total: number;
  reconciled_total: number;
  difference: number;
  purchases_total: number;
  purchases_linked_total: number;
  purchases_pending_total: number;
  purchases_ignored_total: number;
  purchases_count: number;
  credits_total: number;
  credits_linked_total: number;
  credits_pending_total: number;
  credits_count: number;
  ledger_balance: number | null;
  ledger_matches_entries: boolean;
}

export interface ReconciliationState {
  import: ReconImportMeta;
  /** Atalho de topo — espelha `import.kind`, pra UI não precisar descer. */
  kind: ReconKind;
  statement_balance: number;
  reconciled_balance: number;
  difference: number;
  can_finalize: boolean;
  /** `reopen_bank_reconciliation` — `true` só quando `import.status === 'finalized'`. */
  can_reopen: boolean;
  total_entries: number;
  /** `true` quando `total_entries === 0` — distingue "tudo resolvido" de "não tem linha nenhuma" (ambos zeram `pending_count`/`difference`). */
  is_empty: boolean;
  pending_count: number;
  matched_count: number;
  ignored_count: number;
  sign_suspect_count: number;
  sign_flipped_count: number;
  matched_value_difference_total: number;
  matched_value_difference_count: number;
  entries: ReconEntry[];
  open_bills: ReconTxJson[];
  ledger_movements: ReconLedgerMovement[];
  /** `null` no modo banco. Preenchido no modo `'card'` — ver `ReconCardBlock`. */
  card: ReconCardBlock | null;
}

/* ───────────────────────── 4. reconcile_search_candidates ───────────────────────── */

export interface SearchCandidatesResult {
  query: string | null;
  tolerance: number;
  effective_amount: number;
  realized: ReconTxJson[];
  open_bills: ReconTxJson[];
}

/* ───────────────────────── 5. reconcile_list_card_bills ───────────────────────── */

export interface ReconCardBillCandidate {
  id: string;
  account_id: string;
  account_name: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  status: string;
  bill_total: number;
  amount_paid: number;
  remaining: number;
  is_closed: boolean;
  covers_remaining: boolean;
  line_amount: number;
}

export interface ListCardBillsResult {
  effective_amount: number;
  bills: ReconCardBillCandidate[];
}

/* ───────────────────────── 6. reconcile_list_transfer_legs ───────────────────────── */

export interface ListTransferLegsResult {
  legs: ReconTransferLeg[];
}

/* ───────────────────────── 7..18 resultados de mutation ───────────────────────── */

export interface MatchExistingResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  match_type: 'existing' | 'transfer';
  transfer_pair_id: string | null;
  value_difference: number;
}

export interface SettleTransactionResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  match_type: 'settled';
  paid_date: string;
  account_id: string;
  value_difference: number;
}

export interface CreateTransactionResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  match_type: 'created';
  transaction_type: TransactionType;
  amount: number;
  category: string | null;
  paid_date: string;
}

export interface CreateTransferResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  other_leg_transaction_id: string | null;
  match_type: 'transfer';
  transfer_pair_id: string;
  transfer_pair_created: boolean;
  reused_existing_pair: boolean;
  other_account_id: string;
  amount: number;
  paid_date: string;
}

/** `pay_credit_card_bill(...)` — núcleo reusado por `reconcile_pay_card_bill` E `reconcile_card_pay_bill`. */
export interface PayCreditCardBillResult {
  bill_id: string;
  status: string;
  amount_paid: number;
  bill_total: number;
  paid_at: string | null;
  transfer_pair_id: string | null;
  payment_transaction_id: string;
  card_leg_transaction_id: string;
  purchases_settled: number;
  purchases_settled_amount: number;
  unallocated_amount: number;
}

export interface PayCardBillResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  match_type: 'card_bill';
  card_bill_id: string;
  paid_date: string;
  amount: number;
  bill: PayCreditCardBillResult;
}

/* ───────────────────────── modo cartão: resultados de mutation ───────────────────────── */

/**
 * `reconcile_create_card_purchase` — a compra nasce `is_paid: false`,
 * `paid_date: null` (devolvidos LITERAIS de propósito: é a prova, na própria
 * resposta, de que a compra nasceu em aberto). `credit_card_bill_date` é
 * calculado NO SERVIDOR; a tela nunca manda essa data.
 */
export interface CreateCardPurchaseResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  match_type: 'card_purchase_created';
  transaction_type: 'saida';
  amount: number;
  category: string | null;
  transaction_date: string;
  credit_card_bill_date: string;
  is_paid: false;
  paid_date: null;
}

/** `reconcile_match_card_purchase` — só registra o vínculo; `is_paid` não muda. */
export interface MatchCardPurchaseResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  match_type: 'card_purchase';
  value_difference: number;
  credit_card_bill_date: string;
  is_paid: boolean;
  paid_date: string | null;
}

/**
 * `reconcile_match_card_bill_payment` — casa a linha de CRÉDITO da fatura com
 * um pagamento já registrado. `covers_bill: false` ⇒ pagamento parcial, que
 * não quita compra nenhuma (avisar antes de confirmar quando for criado por
 * `reconcile_card_pay_bill`; aqui o pagamento já existia, então é só relato).
 */
export interface MatchCardBillPaymentResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  match_type: 'card_payment';
  card_bill_id: string;
  transfer_pair_id: string | null;
  value_difference: number;
  bill_total: number;
  bill_amount_paid: number;
  bill_remaining: number;
  bill_status: string;
  covers_bill: boolean;
}

/**
 * `reconcile_card_pay_bill` — registra o pagamento da fatura a partir da
 * própria linha de crédito, escolhendo a conta pagadora. `covers_remaining:
 * false` nas faturas de `reconcile_list_card_bills` ⇒ avisar ANTES de
 * confirmar que pagamento parcial não quita compra nenhuma.
 */
export interface CardPayBillResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  match_type: 'card_payment_created';
  card_bill_id: string;
  payment_account_id: string;
  paid_date: string;
  amount: number;
  covers_bill: boolean;
  bill: PayCreditCardBillResult;
}

/** `reconcile_search_card_purchases` — busca manual do modo cartão: compras E pagamentos de fatura já registrados. */
export interface SearchCardPurchasesResult {
  query: string | null;
  tolerance: number;
  effective_amount: number;
  purchases: ReconTxJson[];
  payments: ReconTxJson[];
}

export interface CreateEmployeeMovementResult {
  match_id: string;
  entry_id: string;
  financial_transaction_id: string;
  employee_movement_id: string;
  match_type: 'employee_vale';
  paid_date: string;
  amount: number;
  created: boolean;
}

export interface FlipSignResult {
  flipped: boolean;
  changed_count: number;
  requested_count: number;
  imports: { import_id: string; opening_balance: number }[];
}

export interface IgnoreEntryResult {
  entry_id: string;
  status: 'ignored';
}

export interface IgnoreBatchResult {
  ignored_count: number;
  requested_count: number;
}

export interface UnignoreBatchResult {
  unignored_count: number;
  requested_count: number;
}

/**
 * O que `reconcile_unmatch_entry` desfez — vira a copy em PT-BR do toast.
 * `card_purchase_deleted` é a compra criada por `reconcile_create_card_purchase`
 * sendo apagada (ela nasceu `is_paid = false`, então apagar não mexe em caixa
 * já reconhecido). `card_payment_created` reusa `card_bill_payment_reverted` —
 * mesmo estorno de `revert_credit_card_bill_payment`.
 */
export type UndoneKind =
  | 'none'
  | 'link'
  | 'settlement_reverted'
  | 'transaction_deleted'
  | 'transfer_pair_deleted'
  | 'card_bill_payment_reverted'
  | 'employee_vale_deleted'
  | 'card_purchase_deleted';

export interface UnmatchEntryResult {
  entry_id: string;
  status: 'pending';
  match_type: MatchType | null;
  deleted_count: number;
  undone: UndoneKind;
  card_bill_revert: unknown | null;
}

export interface FinalizeResult {
  import_id: string;
  status: 'finalized';
  reconciled_balance: number;
  difference: number;
  finalized_at: string;
}

/**
 * `reopen_bank_reconciliation` — inverso exato de `finalize_bank_reconciliation`.
 * NÃO desfaz conciliação nenhuma: matches, lançamentos criados e baixas
 * continuam como estão. Vale pros dois modos (`kind`), não só cartão.
 */
export interface ReopenReconciliationResult {
  import_id: string;
  status: 'open';
  kind: ReconKind;
  reopened_at: string;
  reopened_by: string | null;
  reopen_count: number;
  was_finalized_at: string | null;
  reconciled_balance: number;
  difference: number;
  pending_count: number;
  total_entries: number;
  can_finalize: boolean;
}

/* ───────────────────────── estado controlado pelo pai ───────────────────────── */

/**
 * Estado da aba "Conciliação", controlado pelo `FinanceMovimentacoes`
 * (preserva entre troca de aba) e reencontrado no banco após reload
 * (`get_statement_imports` acha o import `open`).
 */
export interface ReconciliationTabState {
  accountId: string | null;
  importId: string | null;
}

/**
 * Destino que o painel de ações pode oferecer para uma linha pendente.
 * Os quatro `card_*` só existem no modo `'card'` — `'settle'`, `'transfer'`
 * e `'employee_vale'` não existem lá (a RPC recusa; ver invariante do módulo).
 */
export type ReconDestination =
  | 'settle'
  | 'create'
  | 'transfer'
  | 'card_bill'
  | 'employee_vale'
  | 'search'
  | 'candidates'
  | 'card_purchase_match'
  | 'card_purchase_create'
  | 'card_payment_match'
  | 'card_payment_create';
