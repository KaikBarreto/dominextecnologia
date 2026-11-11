import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidatePdvReportCaches } from '@/hooks/pdvReportCache';

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

export interface PdvCashV2Terminal {
  id: string;
  name: string;
  /** Histórico antigo só precisa de id/nome; a lista operacional sempre traz o estoque. */
  stockId: string | null;
}

export interface PdvCashV2Session {
  id: string;
  companyId: string;
  terminalId: string;
  openedBy: string | null;
  openedAt: string;
  openingAmount: number;
  cashAccountId: string;
  cashAccountName: string;
  contractVersion: 2;
  status: 'aberta' | 'fechada';
  closedAt: string | null;
  countedAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  notes: string | null;
  wasReopened: boolean;
}

export interface PdvCashV2ReportEntry {
  id: string;
  kind: string;
  amount: number;
  createdAt: string;
  description: string | null;
  notes: string | null;
  paymentMethod: string | null;
}

export interface PdvCashV2SessionReport {
  sessionId: string;
  terminalName: string;
  operatorName: string;
  closedByName: string;
  openedAt: string;
  closedAt: string;
  cashAccountName: string;
  openingAmount: number;
  expectedAmount: number;
  countedAmount: number;
  difference: number;
  cashReceipts: number;
  cashPayments: number;
  supplies: number;
  withdrawals: number;
  refunds: number;
  finalPosition: number;
  notes: string | null;
  entries: PdvCashV2ReportEntry[];
}

export interface PdvCashReopenV2Result {
  sourceSessionId: string;
  sessionId: string;
  terminalId: string;
  operatorId: string;
  openingAmount: number;
  openedAt: string;
}

export interface PdvCashV2Snapshot {
  accountId: string;
  accountName: string;
  accountActive: boolean;
  balance: number;
  custody: number;
  available: number | null;
  openSessions: number;
  openLegacySessions: number;
  reconciliationRequired: boolean;
}

export interface PdvCashCloseV2Result {
  sessionId: string;
  expectedAmount: number;
  countedAmount: number;
  difference: number;
  closingReturn: number;
  adjustmentKind: 'shortage' | 'surplus' | null;
  closedAt: string;
}

export type PdvCashV2EventKind =
  | 'supply'
  | 'withdrawal'
  | 'cash_receipt'
  | 'cash_payment';

export interface PdvCashHistoryFilters {
  terminalId: string | null;
  operatorId: string | null;
  page: number;
  pageSize: number;
}

interface RawSession {
  id: string;
  company_id: string;
  terminal_id: string;
  opened_by: string | null;
  opened_at: string;
  opening_amount: number;
  cash_account_id?: string | null;
  cash_account_name_snapshot?: string | null;
  contract_version?: number | null;
  status: string;
  closed_at: string | null;
  counted_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  notes: string | null;
  was_reopened?: boolean;
}

interface RawProjectedSession extends RawSession {
  terminal_name: string;
  operator_name: string;
}

export const PDV_CASH_V2_QUERY_ROOT = ['pdv-cash-sessions-v2'] as const;
const ROOT = PDV_CASH_V2_QUERY_ROOT;

export async function invalidatePdvCashV2Caches(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [...ROOT, 'open'] }),
    queryClient.invalidateQueries({ queryKey: [...ROOT, 'history'] }),
    queryClient.invalidateQueries({ queryKey: [...ROOT, 'snapshot'] }),
    queryClient.invalidateQueries({ queryKey: [...ROOT, 'maintenance-presence'] }),
    queryClient.invalidateQueries({ queryKey: ['pdv-cash-sessions'] }),
    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['account-balances'] }),
    invalidatePdvReportCaches(queryClient),
  ]);
}

export type PdvCashV2Gate = 'loading' | 'error' | 'unknown' | 'legacy' | 'v2';
export type PdvCashV2Route = 'loading' | 'blocked' | 'legacy' | 'maintenance' | 'v2';

export function selectPdvCashV2Gate(input: {
  loading: boolean;
  error: unknown;
  capability?: { enabled: boolean } | null;
}): PdvCashV2Gate {
  if (input.loading) return 'loading';
  if (input.error) return 'error';
  if (!input.capability || typeof input.capability.enabled !== 'boolean') return 'unknown';
  return input.capability.enabled ? 'v2' : 'legacy';
}

export function selectPdvCashV2Route(input: {
  capabilityGate: PdvCashV2Gate;
  maintenanceLoading: boolean;
  maintenanceError: unknown;
  hasOpenV2Session?: boolean;
}): PdvCashV2Route {
  if (input.capabilityGate === 'loading') return 'loading';
  if (input.capabilityGate === 'error' || input.capabilityGate === 'unknown') return 'blocked';
  if (input.capabilityGate === 'v2') return 'v2';
  if (input.maintenanceLoading) return 'loading';
  if (input.maintenanceError || typeof input.hasOpenV2Session !== 'boolean') return 'blocked';
  // O writer legado aceitava contexto inferido e foi retirado da API. Uma
  // empresa ainda sem rollout v2 falha fechada em vez de voltar ao primeiro
  // Caixa aberto encontrado.
  return input.hasOpenV2Session ? 'maintenance' : 'blocked';
}

export function usePdvCashV2Capability(enabled: boolean) {
  const query = useQuery({
    queryKey: [...ROOT, 'capability'],
    enabled,
    queryFn: async (): Promise<{ enabled: boolean; contractVersion: number }> => {
      // Rollout transitório: o writer de venda direta v2 depende exatamente do
      // contrato de custódia v2. Enquanto não existe flag própria de caixa, esta
      // capacidade canônica habilita o mesmo contrato tanto no modo simples
      // quanto no modo balcão, sem depender de `pdv_mode`.
      const { data, error } = await rpc('pdv_get_direct_sale_capability_v2');
      if (error) throw mapPdvCashV2Error(error);
      const value = record(data);
      if (typeof value.enabled !== 'boolean' || numericStrict(value.contract_version, 'versão do contrato') !== 2) {
        throw new Error('O servidor retornou uma capacidade de caixa inválida.');
      }
      return { enabled: value.enabled, contractVersion: 2 };
    },
    staleTime: 30_000,
    retry: false,
  });
  return {
    ...query,
    gate: selectPdvCashV2Gate({
      loading: query.isLoading,
      error: query.error,
      capability: query.data,
    }),
  };
}

export function usePdvCashV2MaintenancePresence(input: {
  enabled: boolean;
  userId: string | null;
}) {
  return useQuery({
    queryKey: [...ROOT, 'maintenance-presence', 'company', input.userId],
    enabled: input.enabled && !!input.userId,
    queryFn: async (): Promise<boolean> => {
      // A RPC devolve somente a presença empresarial, sem nome, terminal ou
      // valor. Assim um caixa v2 de A bloqueia o writer legado de B sem vazar
      // detalhes de outro operador e sem SELECT direto na tabela.
      const { data, error } = await rpc('pdv_has_open_cash_session_v2');
      if (error) throw mapPdvCashV2Error(error);
      if (typeof data !== 'boolean') {
        throw new Error('O servidor retornou um estado de caixa inválido.');
      }
      return data;
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    retry: false,
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numericStrict(value: unknown, field: string): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) {
    throw new Error(`O servidor retornou ${field} inválido no caixa.`);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`O servidor retornou ${field} inválido no caixa.`);
  }
  return parsed;
}

function booleanStrict(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`O servidor retornou ${field} inválido no caixa.`);
  }
  return value;
}

function nullableNumericStrict(value: unknown, field: string): number | null {
  if (value === null) return null;
  return numericStrict(value, field);
}

function textStrict(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`O servidor retornou ${field} inválido no caixa.`);
  }
  return value;
}

function dateStrict(value: unknown, field: string): string {
  const date = textStrict(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(date) || !Number.isFinite(Date.parse(date))) {
    throw new Error(`O servidor retornou ${field} inválida no caixa.`);
  }
  return date;
}

export function projectPdvCashV2Session(payload: unknown): PdvCashV2Session {
  const row = payload as RawSession;
  if (!row || typeof row !== 'object') {
    throw new Error('O servidor retornou uma sessão inválida no caixa.');
  }
  if (row.status !== 'aberta' && row.status !== 'fechada') {
    throw new Error('O servidor retornou status inválido no caixa.');
  }
  if (numericStrict(row.contract_version, 'versão do contrato') !== 2) {
    throw new Error('O servidor retornou uma versão de caixa incompatível.');
  }
  return {
    id: textStrict(row.id, 'identificador da sessão'),
    companyId: textStrict(row.company_id, 'empresa da sessão'),
    terminalId: textStrict(row.terminal_id, 'terminal da sessão'),
    openedBy: row.opened_by,
    openedAt: dateStrict(row.opened_at, 'data de abertura'),
    openingAmount: numericStrict(row.opening_amount, 'valor de abertura'),
    cashAccountId: textStrict(row.cash_account_id, 'conta congelada da sessão'),
    cashAccountName: textStrict(row.cash_account_name_snapshot, 'nome congelado da conta'),
    contractVersion: 2,
    status: row.status,
    closedAt: row.closed_at === null ? null : dateStrict(row.closed_at, 'data de fechamento'),
    countedAmount: nullableNumericStrict(row.counted_amount, 'valor contado'),
    expectedAmount: nullableNumericStrict(row.expected_amount, 'valor esperado'),
    difference: nullableNumericStrict(row.difference, 'diferença do fechamento'),
    notes: row.notes,
    wasReopened: row.was_reopened === true,
  };
}

export function projectPdvCashV2SessionList(payload: unknown): {
  rows: PdvCashV2Session[];
  operators: Record<string, string>;
  hasMore: boolean;
} {
  const value = record(payload);
  if (!Array.isArray(value.rows) || typeof value.has_more !== 'boolean') {
    throw new Error('O servidor retornou uma lista de caixas inválida.');
  }
  const operators: Record<string, string> = {};
  const rows = value.rows.map((raw) => {
    const projected = record(raw) as unknown as RawProjectedSession;
    const session = projectPdvCashV2Session(projected);
    textStrict(projected.terminal_name, 'nome do terminal');
    if (session.openedBy) {
      operators[session.openedBy] = textStrict(projected.operator_name, 'nome do operador');
    }
    return session;
  });
  return { rows, operators, hasMore: value.has_more };
}

export function projectPdvCashV2Terminals(payload: unknown): PdvCashV2Terminal[] {
  if (!Array.isArray(payload)) {
    throw new Error('O servidor retornou uma lista de terminais inválida.');
  }
  return payload.map((raw) => {
    const terminal = record(raw);
    return {
      id: textStrict(terminal.id, 'terminal'),
      name: textStrict(terminal.name, 'nome do terminal'),
      stockId: typeof terminal.stock_id === 'string' && terminal.stock_id.trim()
        ? terminal.stock_id
        : null,
    };
  });
}

export function projectPdvCashV2Snapshot(payload: unknown): PdvCashV2Snapshot {
  const value = record(payload);
  return {
    accountId: textStrict(value.account_id, 'conta do cofre'),
    accountName: textStrict(value.account_name, 'nome do cofre'),
    accountActive: booleanStrict(value.account_active, 'estado da conta'),
    balance: numericStrict(value.balance, 'saldo do cofre'),
    custody: numericStrict(value.custody, 'valor em custódia'),
    available: nullableNumericStrict(value.available, 'saldo disponível'),
    openSessions: numericStrict(value.open_v2_sessions, 'quantidade de caixas abertos'),
    openLegacySessions: numericStrict(value.open_legacy_sessions, 'quantidade de caixas antigos'),
    reconciliationRequired: booleanStrict(value.reconciliation_required, 'estado de conciliação'),
  };
}

export function projectPdvCashCloseV2Result(payload: unknown): PdvCashCloseV2Result {
  const value = record(payload);
  return {
    sessionId: textStrict(value.session_id, 'identificador da sessão'),
    expectedAmount: numericStrict(value.expected_amount, 'valor esperado'),
    countedAmount: numericStrict(value.counted_amount, 'valor contado'),
    difference: numericStrict(value.difference, 'diferença do fechamento'),
    closingReturn: numericStrict(value.closing_return, 'retorno ao cofre'),
    adjustmentKind: value.adjustment_kind === 'shortage' || value.adjustment_kind === 'surplus'
      ? value.adjustment_kind
      : null,
    closedAt: dateStrict(value.closed_at, 'data de fechamento'),
  };
}

function errorCode(error: unknown): string {
  const raw = record(error) as RpcError;
  return /(?:^|[;\s])(?:code=)?([a-z][a-z0-9_]{5,})/i.exec(raw.details ?? '')?.[1] ?? '';
}

export function mapPdvCashV2Error(error: unknown): Error {
  const raw = record(error) as RpcError;
  const code = errorCode(error);
  const byCode: Record<string, string> = {
    PDV_AUTH_REQUIRED: 'Sua sessão expirou. Entre novamente para continuar.',
    PDV_SUBSCRIPTION_INACTIVE: 'A assinatura da empresa não permite operar o caixa agora.',
    PDV_MODULE_INACTIVE: 'O módulo PDV e Loja não está ativo nesta empresa.',
    PDV_SCREEN_FORBIDDEN: 'Você não tem permissão para operar o caixa.',
    PDV_TREASURY_ACCOUNT_NOT_CONFIGURED: 'Configure a conta do cofre antes de abrir o caixa.',
    PDV_TREASURY_AVAILABLE_INSUFFICIENT: 'O cofre não possui dinheiro disponível para esse valor.',
    PDV_TERMINAL_SESSION_ALREADY_OPEN: 'Este terminal já possui um caixa aberto.',
    PDV_OPERATOR_SESSION_ALREADY_OPEN: 'Você já possui um caixa aberto.',
    PDV_CASH_SESSION_FORBIDDEN: 'Você não pode movimentar o caixa de outro operador.',
    PDV_CASH_FINANCE_EVENT_FORBIDDEN: 'Você não tem permissão para lançar receitas ou despesas no caixa.',
    PDV_CASH_HISTORY_FORBIDDEN: 'Você não tem permissão para consultar o histórico de caixa.',
    PDV_CASH_REOPEN_FORBIDDEN: 'Você não tem permissão para reabrir caixas.',
    PDV_CASH_REOPEN_REASON_INVALID: 'Informe um motivo entre 3 e 500 caracteres.',
    PDV_CASH_REOPEN_SOURCE_NOT_CLOSED: 'Somente um caixa fechado pode ser reaberto.',
    PDV_CASH_REOPEN_OPERATOR_INACTIVE: 'O operador original não está ativo para continuar este caixa.',
    PDV_CASH_ALREADY_REOPENED: 'Este caixa já foi reaberto.',
    PDV_CASH_REOPEN_NOT_LATEST: 'Existe um caixa mais recente neste terminal ou para este operador.',
    PDV_CASH_CUSTODY_INSUFFICIENT: 'A gaveta não possui dinheiro suficiente para essa saída.',
    PDV_CASH_RECONCILIATION_REQUIRED: 'A custódia precisa ser conciliada antes de continuar.',
    PDV_CASH_CLOSE_NOT_BALANCED: 'O caixa não pôde ser fechado porque a custódia não zerou.',
  };
  const mapped = byCode[code] ?? byCode[code.toUpperCase()];
  if (mapped) return new Error(mapped);

  const safeMessages = [
    'Este terminal já possui um caixa aberto.',
    'Você já possui um caixa aberto.',
    'O valor de abertura é maior que o disponível no cofre.',
    'O valor é maior que o dinheiro disponível nesta gaveta.',
    'Você não pode movimentar o caixa de outro operador.',
    'Você não pode fechar o caixa de outro operador.',
  ];
  const safe = safeMessages.find((message) => raw.message?.includes(message));
  return new Error(safe ?? 'Não foi possível concluir a operação do caixa. Tente novamente.');
}

export function createPdvCashV2AttemptId(kind: 'open' | 'event' | 'close' | 'reopen'): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `pdv-cash-${kind}-${id}`;
}

export interface PdvCashV2Attempt {
  signature: string;
  key: string;
}

export type PdvCashV2AttemptKind = 'open' | 'event' | 'close' | 'reopen';

export interface PdvCashV2AttemptRegistry {
  resolve: (
    kind: PdvCashV2AttemptKind,
    scope: string,
    payload: Record<string, unknown>,
  ) => PdvCashV2Attempt;
  complete: (
    kind: PdvCashV2AttemptKind,
    scope: string,
    payload: Record<string, unknown>,
  ) => void;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function resolvePdvCashV2Attempt(
  previous: PdvCashV2Attempt | null,
  kind: PdvCashV2AttemptKind,
  payload: Record<string, unknown>,
): PdvCashV2Attempt {
  const signature = canonicalJson(payload);
  if (previous?.signature === signature) return previous;
  return { signature, key: createPdvCashV2AttemptId(kind) };
}

export function createPdvCashV2AttemptRegistry(): PdvCashV2AttemptRegistry {
  const attempts = new Map<string, PdvCashV2Attempt>();
  const registryKey = (
    kind: PdvCashV2AttemptKind,
    scope: string,
    payload: Record<string, unknown>,
  ) => `${kind}:${scope}:${canonicalJson(payload)}`;

  return {
    resolve(kind, scope, payload) {
      const key = registryKey(kind, scope, payload);
      const previous = attempts.get(key) ?? null;
      const attempt = resolvePdvCashV2Attempt(previous, kind, payload);
      attempts.set(key, attempt);
      return attempt;
    },
    complete(kind, scope, payload) {
      attempts.delete(registryKey(kind, scope, payload));
    },
  };
}

export function usePdvCashV2AttemptRegistry(): PdvCashV2AttemptRegistry {
  const registry = useRef<PdvCashV2AttemptRegistry | null>(null);
  if (!registry.current) registry.current = createPdvCashV2AttemptRegistry();
  return registry.current;
}

export function buildPdvOpenCashV2AttemptPayload(input: {
  terminalId: string;
  cashAccountId: string;
  openingAmount: number;
}) {
  return { ...input };
}

export function buildPdvCashEventV2AttemptPayload(input: {
  sessionId: string;
  cashAccountId: string;
  kind: PdvCashV2EventKind;
  amount: number;
  description?: string | null;
  notes: string | null;
}) {
  return { ...input };
}

export function buildPdvCloseCashV2AttemptPayload(input: {
  sessionId: string;
  cashAccountId: string;
  countedAmount: number;
  notes: string | null;
}) {
  return { ...input };
}

export function buildPdvOpenCashV2Args(input: {
  terminalId: string;
  cashAccountId: string;
  openingAmount: number;
  attemptId: string;
}) {
  return {
    p_terminal_id: input.terminalId,
    p_cash_account_id: input.cashAccountId,
    p_opening_amount: input.openingAmount,
    p_idempotency_key: input.attemptId,
  };
}

export function buildPdvCashEventV2Args(input: {
  sessionId: string;
  cashAccountId: string;
  kind: PdvCashV2EventKind;
  amount: number;
  description?: string | null;
  notes: string | null;
  attemptId: string;
}) {
  const fallbackDescription: Record<PdvCashV2EventKind, string> = {
    supply: 'Dinheiro adicionado ao caixa',
    withdrawal: 'Dinheiro retirado do caixa',
    cash_receipt: 'Receita lançada no caixa',
    cash_payment: 'Despesa paga pelo caixa',
  };
  return {
    p_session_id: input.sessionId,
    p_cash_account_id: input.cashAccountId,
    p_entry_kind: input.kind,
    p_amount: input.amount,
    p_description: input.description?.trim() || fallbackDescription[input.kind],
    p_notes: input.notes,
    p_idempotency_key: input.attemptId,
  };
}

export function buildPdvCloseCashV2Args(input: {
  sessionId: string;
  cashAccountId: string;
  countedAmount: number;
  notes: string | null;
  attemptId: string;
}) {
  return {
    p_session_id: input.sessionId,
    p_cash_account_id: input.cashAccountId,
    p_counted_amount: input.countedAmount,
    p_notes: input.notes,
    p_idempotency_key: input.attemptId,
  };
}

export function buildPdvReopenCashV2AttemptPayload(input: {
  sourceSessionId: string;
  cashAccountId: string;
  reason: string;
}) {
  return { ...input, reason: input.reason.trim() };
}

export function buildPdvReopenCashV2Args(input: {
  sourceSessionId: string;
  cashAccountId: string;
  reason: string;
  attemptId: string;
}) {
  return {
    p_source_session_id: input.sourceSessionId,
    p_cash_account_id: input.cashAccountId,
    p_reason: input.reason.trim(),
    p_idempotency_key: input.attemptId,
  };
}

export function projectPdvCashReopenV2Result(payload: unknown): PdvCashReopenV2Result {
  const value = record(payload);
  if (value.ok !== true) throw new Error('O servidor não confirmou a reabertura do caixa.');
  return {
    sourceSessionId: textStrict(value.source_session_id, 'caixa anterior'),
    sessionId: textStrict(value.session_id, 'novo caixa'),
    terminalId: textStrict(value.terminal_id, 'terminal'),
    operatorId: textStrict(value.operator_id, 'operador'),
    openingAmount: numericStrict(value.opening_amount, 'valor de reabertura'),
    openedAt: dateStrict(value.opened_at, 'data de reabertura'),
  };
}

export function projectPdvCashV2SessionReport(payload: unknown): PdvCashV2SessionReport {
  const value = record(payload);
  if (!Array.isArray(value.entries)) {
    throw new Error('O servidor retornou os movimentos do relatório em formato inválido.');
  }
  return {
    sessionId: textStrict(value.session_id, 'caixa do relatório'),
    terminalName: textStrict(value.terminal_name, 'terminal do relatório'),
    operatorName: textStrict(value.operator_name, 'operador do relatório'),
    closedByName: textStrict(value.closed_by_name, 'responsável pelo fechamento'),
    openedAt: dateStrict(value.opened_at, 'abertura do relatório'),
    closedAt: dateStrict(value.closed_at, 'fechamento do relatório'),
    cashAccountName: textStrict(value.cash_account_name, 'conta do relatório'),
    openingAmount: numericStrict(value.opening_amount, 'abertura do relatório'),
    expectedAmount: numericStrict(value.expected_amount, 'valor esperado do relatório'),
    countedAmount: numericStrict(value.counted_amount, 'valor contado do relatório'),
    difference: numericStrict(value.difference, 'diferença do relatório'),
    cashReceipts: numericStrict(value.cash_receipts, 'recebimentos do relatório'),
    cashPayments: numericStrict(value.cash_payments, 'pagamentos do relatório'),
    supplies: numericStrict(value.supplies, 'suprimentos do relatório'),
    withdrawals: numericStrict(value.withdrawals, 'sangrias do relatório'),
    refunds: numericStrict(value.refunds, 'estornos do relatório'),
    finalPosition: numericStrict(value.final_position, 'posição final do relatório'),
    notes: value.notes === null ? null : textStrict(value.notes, 'observação do relatório'),
    entries: value.entries.map((raw): PdvCashV2ReportEntry => {
      const entry = record(raw);
      return {
        id: textStrict(entry.id, 'movimento do relatório'),
        kind: textStrict(entry.kind, 'tipo do movimento do relatório'),
        amount: numericStrict(entry.amount, 'valor do movimento do relatório'),
        createdAt: dateStrict(entry.created_at, 'data do movimento do relatório'),
        description: entry.description === null ? null : textStrict(entry.description, 'descrição do movimento'),
        notes: entry.notes === null ? null : textStrict(entry.notes, 'observação do movimento'),
        paymentMethod: entry.payment_method === null ? null : textStrict(entry.payment_method, 'forma de pagamento'),
      };
    }),
  };
}

export async function fetchPdvCashSessionReportV2(sessionId: string): Promise<PdvCashV2SessionReport> {
  const { data, error } = await rpc('pdv_cash_session_report_v2', { p_session_id: sessionId });
  if (error) throw mapPdvCashV2Error(error);
  const report = projectPdvCashV2SessionReport(data);
  if (report.sessionId !== sessionId) {
    throw new Error('O servidor retornou o relatório de outro caixa. Atualize a tela.');
  }
  return report;
}

export function projectPdvCashHistoryV2Page(payload: unknown): {
  terminals: PdvCashV2Terminal[];
  rows: PdvCashV2Session[];
  operators: Record<string, string>;
  hasMore: boolean;
  canManageOthers: boolean;
} {
  const value = record(payload);
  const sessions = projectPdvCashV2SessionList({ rows: value.rows, has_more: value.has_more });
  return {
    terminals: projectPdvCashV2Terminals(value.terminals),
    rows: sessions.rows,
    operators: sessions.operators,
    hasMore: sessions.hasMore,
    canManageOthers: booleanStrict(value.can_manage_others, 'permissão de operadores'),
  };
}

export function usePdvCashHistoryV2(input: {
  enabled: boolean;
  userId: string | null;
  history: PdvCashHistoryFilters;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...ROOT, 'history-page', input.userId, input.history],
    enabled: input.enabled && !!input.userId,
    queryFn: async () => {
      const { data, error } = await rpc('pdv_cash_history_v2', {
        p_terminal_id: input.history.terminalId,
        p_operator_id: input.history.operatorId,
        p_page: input.history.page,
        p_page_size: input.history.pageSize,
      });
      if (error) throw mapPdvCashV2Error(error);
      return projectPdvCashHistoryV2Page(data);
    },
  });

  const reopenSession = useMutation({
    mutationFn: async (vars: Parameters<typeof buildPdvReopenCashV2Args>[0]) => {
      const { data, error } = await rpc('pdv_reopen_cash_session_v2', buildPdvReopenCashV2Args(vars));
      if (error) throw mapPdvCashV2Error(error);
      return projectPdvCashReopenV2Result(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...ROOT] }),
        queryClient.invalidateQueries({ queryKey: ['financial-transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['account-balances'] }),
        invalidatePdvReportCaches(queryClient),
      ]);
    },
  });

  return {
    terminals: query.data?.terminals ?? [],
    history: query.data?.rows ?? [],
    operators: query.data?.operators ?? {},
    hasMoreHistory: query.data?.hasMore ?? false,
    canManageOthers: query.data?.canManageOthers ?? false,
    isLoading: query.isLoading,
    isHistoryLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
    reopenSession,
  };
}

export function usePdvCashSessionsV2(input: {
  enabled: boolean;
  cashAccountId: string | null;
  userId: string | null;
  canManageOthers: boolean;
  history: PdvCashHistoryFilters;
}) {
  const queryClient = useQueryClient();
  const enabled = input.enabled && !!input.userId;
  const snapshotEnabled = enabled && !!input.cashAccountId;

  const terminalsQuery = useQuery({
    queryKey: [...ROOT, 'terminals'],
    enabled,
    queryFn: async (): Promise<PdvCashV2Terminal[]> => {
      const { data, error } = await rpc('pdv_list_cash_terminals_v2');
      if (error) throw mapPdvCashV2Error(error);
      return projectPdvCashV2Terminals(data);
    },
    staleTime: 5 * 60 * 1000,
  });

  const openSessionsQuery = useQuery({
    queryKey: [...ROOT, 'open', input.userId, input.canManageOthers],
    enabled,
    queryFn: async () => {
      const { data, error } = await rpc('pdv_list_cash_sessions_v2', {
        p_status: 'aberta',
        p_terminal_id: null,
        p_operator_id: null,
        p_page: 0,
        p_page_size: 100,
      });
      if (error) throw mapPdvCashV2Error(error);
      return projectPdvCashV2SessionList(data);
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  const historyQuery = useQuery({
    queryKey: [...ROOT, 'history', input.userId, input.canManageOthers, input.history],
    enabled,
    queryFn: async () => {
      const { data, error } = await rpc('pdv_list_cash_sessions_v2', {
        p_status: 'fechada',
        p_terminal_id: input.history.terminalId,
        p_operator_id: input.history.operatorId,
        p_page: input.history.page,
        p_page_size: input.history.pageSize,
      });
      if (error) throw mapPdvCashV2Error(error);
      return projectPdvCashV2SessionList(data);
    },
  });

  const snapshotQuery = useQuery({
    queryKey: [...ROOT, 'snapshot', input.cashAccountId],
    enabled: snapshotEnabled,
    queryFn: async (): Promise<PdvCashV2Snapshot> => {
      const { data, error } = await rpc('pdv_cash_snapshot_v2', {
        p_cash_account_id: input.cashAccountId,
      });
      if (error) throw mapPdvCashV2Error(error);
      return projectPdvCashV2Snapshot(data);
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });

  const invalidate = () => invalidatePdvCashV2Caches(queryClient);

  const openSession = useMutation({
    mutationFn: async (vars: Parameters<typeof buildPdvOpenCashV2Args>[0]) => {
      const { data, error } = await rpc('pdv_open_cash_session_v2', buildPdvOpenCashV2Args(vars));
      if (error) throw mapPdvCashV2Error(error);
      const result = record(data);
      if (result.ok !== true) {
        throw new Error('A abertura requer conciliação antes de continuar.');
      }
      return {
        sessionId: textStrict(result.session_id, 'identificador da sessão'),
        terminalId: textStrict(result.terminal_id, 'terminal da sessão'),
        openingAmount: numericStrict(result.opening_amount, 'valor de abertura'),
        openedAt: dateStrict(result.opened_at, 'data de abertura'),
      };
    },
    onSuccess: invalidate,
  });

  const recordEvent = useMutation({
    mutationFn: async (vars: Parameters<typeof buildPdvCashEventV2Args>[0]) => {
      const { data, error } = await rpc('pdv_record_cash_event_v2', buildPdvCashEventV2Args(vars));
      if (error) throw mapPdvCashV2Error(error);
      const value = record(data);
      if (value.ok !== true) throw new Error('O servidor não confirmou o movimento do caixa.');
      return {
        entryId: textStrict(value.entry_id, 'identificador do movimento'),
        sessionId: textStrict(value.session_id, 'identificador da sessão'),
        amount: numericStrict(value.amount, 'valor do movimento'),
        custodyAfter: numericStrict(value.custody_after, 'saldo da gaveta'),
      };
    },
    onSuccess: invalidate,
  });

  const closeSession = useMutation({
    mutationFn: async (vars: Parameters<typeof buildPdvCloseCashV2Args>[0]): Promise<PdvCashCloseV2Result> => {
      const { data, error } = await rpc('pdv_close_cash_session_v2', buildPdvCloseCashV2Args(vars));
      if (error) throw mapPdvCashV2Error(error);
      return projectPdvCashCloseV2Result(data);
    },
    onSuccess: invalidate,
  });

  return {
    terminals: terminalsQuery.data ?? [],
    openSessions: openSessionsQuery.data?.rows ?? [],
    history: historyQuery.data?.rows ?? [],
    hasMoreHistory: historyQuery.data?.hasMore ?? false,
    operators: {
      ...(openSessionsQuery.data?.operators ?? {}),
      ...(historyQuery.data?.operators ?? {}),
    },
    snapshot: snapshotQuery.data ?? null,
    isLoading: terminalsQuery.isLoading || openSessionsQuery.isLoading
      || (snapshotEnabled && snapshotQuery.isLoading),
    isHistoryLoading: historyQuery.isLoading,
    isError: terminalsQuery.isError || openSessionsQuery.isError
      || (snapshotEnabled && snapshotQuery.isError),
    error: terminalsQuery.error ?? openSessionsQuery.error ?? snapshotQuery.error ?? null,
    refetch: async () => {
      await Promise.all([
        terminalsQuery.refetch(),
        openSessionsQuery.refetch(),
        historyQuery.refetch(),
        snapshotQuery.refetch(),
      ]);
    },
    openSession,
    recordEvent,
    closeSession,
  };
}
