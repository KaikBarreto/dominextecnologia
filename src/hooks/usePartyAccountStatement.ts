import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PartyAccountType = 'customer' | 'supplier';

export interface PartyAccountSummary {
  partyType: PartyAccountType;
  partyId: string;
  openAmount: number;
  availableCredit: number;
  creditLimit: number | null;
  purchaseCapacity: number | null;
  asOf: string;
}

export type PartyAccountSourceType =
  | 'obligation'
  | 'credit'
  | 'adjustment'
  | 'application'
  | 'reversal'
  | 'settlement'
  | 'settlement_reversal'
  | 'legacy_debt_balance'
  | 'legacy_credit_balance';

export interface PartyAccountEntry {
  id: string;
  sourceType: PartyAccountSourceType;
  amount: number;
  occurredOn: string;
  description: string;
  dueDate: string | null;
  isPaid: boolean | null;
  openAmount: number | null;
  accountStatus: 'paid' | 'closed_by_credit' | 'partial' | 'open' | null;
  accountId: string | null;
  cashSessionId: string | null;
  settlementMethod: 'dinheiro' | 'pix' | 'transferencia' | null;
  canReverse: boolean;
}

export interface PartyAccountStatement {
  summary: PartyAccountSummary;
  entries: PartyAccountEntry[];
  totalCount: number;
  limit: number;
  offset: number;
}

export type PartyAccountErrorKind = 'hidden' | 'validation' | 'conflict' | 'not_found' | 'unavailable';

export class PartyAccountDomainError extends Error {
  constructor(
    message: string,
    public readonly kind: PartyAccountErrorKind,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'PartyAccountDomainError';
  }
}

const PARTY_ACCOUNT_ROOT_KEY = ['party-account-v2'] as const;
const HIDDEN_CODES = new Set([
  'pdv_party_account_rollout_disabled',
  'pdv_party_account_module_denied',
  'pdv_party_account_company_denied',
  'pdv_party_account_permission_denied',
]);

const ERROR_MESSAGES: Record<string, string> = {
  pdv_party_account_auth_required: 'Sua sessão expirou. Entre novamente.',
  pdv_party_account_party_not_found: 'Este cadastro não foi encontrado.',
  pdv_party_account_type_invalid: 'O tipo de conta informado é inválido.',
  pdv_party_account_pagination_invalid: 'Não foi possível abrir esta página do extrato.',
  pdv_party_credit_amount_invalid: 'Informe um valor válido, com no máximo duas casas decimais.',
  pdv_party_credit_date_invalid: 'A data não pode estar no futuro.',
  pdv_party_credit_description_invalid: 'Informe uma descrição de até 500 caracteres.',
  pdv_party_credit_reason_invalid: 'Informe o motivo do estorno.',
  pdv_party_credit_in_progress: 'Esta operação ainda está sendo processada. Tente novamente em instantes.',
  pdv_party_credit_not_reversible: 'Este movimento não pode ser estornado.',
  pdv_party_credit_already_reversed: 'Este movimento já foi estornado.',
  pdv_party_credit_insufficient: 'O crédito disponível não é suficiente.',
  pdv_party_credit_target_invalid: 'A conta selecionada não aceita esta aplicação de crédito.',
  pdv_receivable_settlement_forbidden: 'Seu perfil não permite receber contas de clientes.',
  pdv_receivable_reversal_forbidden: 'Seu perfil não permite estornar recebimentos.',
  pdv_receivable_date_in_future: 'A data do recebimento não pode estar no futuro.',
  pdv_receivable_method_invalid: 'Escolha dinheiro, Pix ou transferência.',
  pdv_receivable_account_required: 'Escolha a conta que recebeu o valor.',
  pdv_receivable_account_not_found: 'A conta financeira não está disponível.',
  pdv_receivable_cash_account_invalid: 'Dinheiro deve entrar em uma conta do tipo Caixa.',
  pdv_receivable_bank_account_invalid: 'Pix ou transferência deve entrar em uma conta bancária.',
  pdv_receivable_cash_session_invalid: 'Escolha um caixa aberto nessa conta.',
  pdv_receivable_cash_session_forbidden: 'Você não pode receber no caixa de outro operador.',
  pdv_receivable_allocation_exceeds_balance: 'O valor informado ultrapassa o saldo desta conta.',
  pdv_receivable_already_paid: 'Esta conta já foi recebida.',
  pdv_receivable_settlement_already_reversed: 'Este recebimento já foi estornado.',
  pdv_receivable_settlement_not_found: 'O recebimento não foi encontrado nesta conta.',
  pdv_receivable_reversal_insufficient_custody: 'O caixa não tem dinheiro suficiente para este estorno.',
  pdv_party_account_receivable_mismatch: 'A conta escolhida não pertence a este cliente.',
  pdv_party_account_settlement_not_found: 'O recebimento não pertence a este cliente.',
};

const ALLOWED_SOURCE_TYPES = new Set<PartyAccountSourceType>([
  'obligation', 'credit', 'adjustment', 'application', 'reversal',
  'settlement', 'settlement_reversal',
  'legacy_debt_balance', 'legacy_credit_balance',
]);

type RpcResponse = { data: unknown; error: null | { message?: string; details?: string; code?: string } };
type RpcCaller = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResponse>;

const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Projeção defensiva: nenhum documento, contato, custo ou metadata do RPC entra no estado da UI. */
export function projectPartyAccountSummary(value: unknown): PartyAccountSummary {
  const row = record(value);
  const partyType = row.party_type === 'supplier' ? 'supplier' : 'customer';
  return {
    partyType,
    partyId: text(row.party_id),
    openAmount: finiteNumber(row.open_amount),
    availableCredit: finiteNumber(row.available_credit),
    creditLimit: nullableNumber(row.credit_limit),
    purchaseCapacity: nullableNumber(row.purchase_capacity),
    asOf: text(row.as_of),
  };
}

export function projectPartyAccountStatement(value: unknown): PartyAccountStatement {
  const payload = record(value);
  const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
  const entries = rawEntries.flatMap((value): PartyAccountEntry[] => {
    const row = record(value);
    const sourceType = text(row.source_type) as PartyAccountSourceType;
    const id = text(row.id);
    if (!id || !ALLOWED_SOURCE_TYPES.has(sourceType)) return [];
    const status = text(row.account_status);
    return [{
      id,
      sourceType,
      amount: finiteNumber(row.amount),
      occurredOn: text(row.occurred_on),
      description: text(row.description, 'Movimento sem descrição'),
      dueDate: row.due_date == null ? null : text(row.due_date),
      isPaid: typeof row.is_paid === 'boolean' ? row.is_paid : null,
      openAmount: nullableNumber(row.open_amount),
      accountStatus: ['paid', 'closed_by_credit', 'partial', 'open'].includes(status)
        ? status as PartyAccountEntry['accountStatus']
        : null,
      accountId: row.account_id == null ? null : text(row.account_id),
      cashSessionId: row.cash_session_id == null ? null : text(row.cash_session_id),
      settlementMethod: ['dinheiro', 'pix', 'transferencia'].includes(text(row.settlement_method))
        ? text(row.settlement_method) as PartyAccountEntry['settlementMethod']
        : null,
      canReverse: row.can_reverse === true,
    }];
  });
  return {
    summary: projectPartyAccountSummary(payload.summary),
    entries,
    totalCount: Math.max(0, Math.trunc(finiteNumber(payload.total_count))),
    limit: Math.max(1, Math.trunc(finiteNumber(payload.limit, 10))),
    offset: Math.max(0, Math.trunc(finiteNumber(payload.offset))),
  };
}

function errorCode(error: { message?: string; details?: string; code?: string }): string {
  const combined = `${error.details ?? ''} ${error.message ?? ''}`;
  const code = combined.match(/code=(pdv_[a-z0-9_]+)/i)?.[1]
    ?? combined.match(/\b(PDV_[A-Z0-9_]+)\b/)?.[1]
    ?? error.code
    ?? 'pdv_party_account_unavailable';
  return code.toLowerCase();
}

export function toPartyAccountError(error: unknown): PartyAccountDomainError {
  if (error instanceof PartyAccountDomainError) return error;
  const source = error && typeof error === 'object'
    ? error as { message?: string; details?: string; code?: string }
    : {};
  const code = errorCode(source);
  const kind: PartyAccountErrorKind = HIDDEN_CODES.has(code)
    ? 'hidden'
    : code.includes('invalid') || code.includes('required')
      ? 'validation'
      : code.includes('in_progress') || code.includes('already_')
        ? 'conflict'
        : code.includes('not_') || code.includes('not_found')
          ? 'not_found'
          : 'unavailable';
  // Nunca reutilizar mensagem desconhecida do banco: ela pode conter RPC,
  // constraint, tabela ou SQLSTATE. Só diferenciamos falha de transporte sem
  // ecoar o texto técnico recebido.
  const fallback = /fetch|network|load failed|conex[aã]o/i.test(source.message ?? '')
    ? 'Não foi possível conectar agora. Verifique sua internet e tente novamente.'
    : 'Não foi possível atualizar esta conta agora. Tente novamente.';
  return new PartyAccountDomainError(ERROR_MESSAGES[code] ?? fallback, kind, code);
}

async function callRpc<T>(name: string, args: Record<string, unknown>, project: (value: unknown) => T): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw toPartyAccountError(error);
  return project(data);
}

const projectMutationResult = (value: unknown) => {
  const row = record(value);
  return {
    ok: row.ok === true,
    entryId: text(row.entry_id),
    availableCredit: finiteNumber(row.available_credit),
    idempotent: row.idempotent === true,
  };
};

export interface PostPartyCreditInput {
  entryKind: 'credit' | 'adjustment';
  amount: number;
  occurredOn: string;
  description: string;
  idempotencyKey: string;
}

export interface ApplyPartyCreditInput {
  financialTransactionId: string;
  amount: number;
  occurredOn: string;
  description: string;
  idempotencyKey: string;
}

export interface ReversePartyCreditInput {
  entryId: string;
  reason: string;
  idempotencyKey: string;
}

export interface PartyReceivableOptions {
  accounts: Array<{ id: string; name: string; type: 'caixa' | 'banco' }>;
  cashSessions: Array<{ id: string; cashAccountId: string; label: string }>;
}

export interface SettlePartyReceivableInput {
  receivableId: string;
  amount: number;
  method: 'dinheiro' | 'pix' | 'transferencia';
  accountId: string;
  cashSessionId: string | null;
  receivedOn: string;
  notes: string;
  idempotencyKey: string;
}

export interface ReversePartySettlementInput {
  settlementTransactionId: string;
  accountId: string;
  cashSessionId: string | null;
  reason: string;
  idempotencyKey: string;
}

function projectReceivableOptions(value: unknown): PartyReceivableOptions {
  const root = record(value);
  const accounts: PartyReceivableOptions['accounts'] = (
    Array.isArray(root.accounts) ? root.accounts : []
  ).flatMap((value): PartyReceivableOptions['accounts'] => {
    const row = record(value);
    const type = text(row.type);
    const id = text(row.id);
    const name = text(row.name);
    if (!id || !name || (type !== 'caixa' && type !== 'banco')) return [];
    return [{ id, name, type }];
  });
  const cashSessions = (Array.isArray(root.cash_sessions) ? root.cash_sessions : []).flatMap((value) => {
    const row = record(value);
    const id = text(row.id);
    const cashAccountId = text(row.cash_account_id);
    const label = text(row.label);
    return id && cashAccountId && label ? [{ id, cashAccountId, label }] : [];
  });
  return { accounts, cashSessions };
}

export function usePartyAccountStatement({
  partyType,
  partyId,
  page = 1,
  pageSize = 10,
  segment = 'accounts',
  receivablesEnabled = false,
  enabled = true,
}: {
  partyType: PartyAccountType;
  partyId: string;
  page?: number;
  pageSize?: number;
  segment?: 'accounts' | 'balance';
  receivablesEnabled?: boolean;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const offset = Math.max(0, page - 1) * pageSize;
  const query = useQuery({
    queryKey: [...PARTY_ACCOUNT_ROOT_KEY, partyType, partyId, segment, pageSize, offset],
    enabled: enabled && Boolean(partyId),
    queryFn: () => callRpc('pdv_party_account_statement_v3', {
      p_party_type: partyType,
      p_party_id: partyId,
      p_segment: segment,
      p_limit: pageSize,
      p_offset: offset,
    }, projectPartyAccountStatement),
    retry: (failureCount, error) => failureCount < 1
      && error instanceof PartyAccountDomainError
      && error.kind === 'unavailable',
    staleTime: 30_000,
  });

  const receivableOptions = useQuery({
    queryKey: [...PARTY_ACCOUNT_ROOT_KEY, 'receivable-options', partyId],
    enabled: enabled && receivablesEnabled && partyType === 'customer' && Boolean(partyId),
    queryFn: () => callRpc('pdv_party_receivable_options_v3', {
      p_customer_id: partyId,
    }, projectReceivableOptions),
    staleTime: 30_000,
    retry: false,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PARTY_ACCOUNT_ROOT_KEY }),
      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['pdv-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
      queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
    ]);
  };

  const postCredit = useMutation({
    mutationFn: (input: PostPartyCreditInput) => callRpc('pdv_post_party_credit_v2', {
      p_party_type: partyType,
      p_party_id: partyId,
      p_entry_kind: input.entryKind,
      p_amount: input.amount,
      p_occurred_on: input.occurredOn,
      p_description: input.description.trim(),
      p_idempotency_key: input.idempotencyKey,
    }, projectMutationResult),
    onSuccess: invalidate,
  });

  const applyCredit = useMutation({
    mutationFn: (input: ApplyPartyCreditInput) => callRpc('pdv_apply_party_credit_v2', {
      p_party_type: partyType,
      p_party_id: partyId,
      p_financial_transaction_id: input.financialTransactionId,
      p_amount: input.amount,
      p_occurred_on: input.occurredOn,
      p_description: input.description.trim(),
      p_idempotency_key: input.idempotencyKey,
    }, projectMutationResult),
    onSuccess: invalidate,
  });

  const reverseCredit = useMutation({
    mutationFn: (input: ReversePartyCreditInput) => callRpc('pdv_reverse_party_credit_entry_v2', {
      p_entry_id: input.entryId,
      p_reason: input.reason.trim(),
      p_idempotency_key: input.idempotencyKey,
    }, projectMutationResult),
    onSuccess: invalidate,
  });

  const settleReceivable = useMutation({
    mutationFn: (input: SettlePartyReceivableInput) => callRpc('pdv_party_settle_receivables_v2', {
      p_customer_id: partyId,
      p_allocations: [{ receivable_id: input.receivableId, amount: input.amount }],
      p_method: input.method,
      p_account_id: input.accountId,
      p_session_id: input.method === 'dinheiro' ? input.cashSessionId : null,
      p_received_on: input.receivedOn,
      p_notes: input.notes.trim(),
      p_idempotency_key: input.idempotencyKey,
    }, projectMutationResult),
    onSuccess: invalidate,
  });

  const reverseSettlement = useMutation({
    mutationFn: (input: ReversePartySettlementInput) => callRpc('pdv_party_reverse_receivable_settlement_v2', {
      p_customer_id: partyId,
      p_settlement_transaction_id: input.settlementTransactionId,
      p_account_id: input.accountId,
      p_session_id: input.cashSessionId,
      p_reason: input.reason.trim(),
      p_idempotency_key: input.idempotencyKey,
    }, projectMutationResult),
    onSuccess: invalidate,
  });

  return {
    ...query,
    statement: query.data ?? null,
    isHidden: query.error instanceof PartyAccountDomainError && query.error.kind === 'hidden',
    postCredit,
    applyCredit,
    reverseCredit,
    receivableOptions,
    settleReceivable,
    reverseSettlement,
  };
}
