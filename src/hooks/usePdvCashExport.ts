import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import type {
  CashExportEntry,
  CashExportItem,
  CashExportPayload,
  CashExportSession,
} from '@/lib/pdv/cashExport/types';

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

const EXPORT_ERRORS: Record<string, string> = {
  PDV_CASH_SESSION_REQUIRED: 'Escolha o caixa que será exportado.',
  PDV_CASH_EXPORT_PERIOD_REQUIRED: 'Informe a data inicial e a data final.',
  PDV_CASH_EXPORT_PERIOD_INVALID: 'O período é inválido. A data inicial não pode ser depois da final.',
  PDV_CASH_EXPORT_PERIOD_TOO_LONG: 'O período pode ter no máximo 92 dias. Escolha um período menor.',
  PDV_CASH_EXPORT_TOO_MANY_SESSIONS: 'Há caixas demais neste período (mais de 200). Escolha um período menor ou um caixa específico.',
  PDV_CASH_SESSION_FORBIDDEN: 'Você não tem permissão para exportar o caixa de outro operador.',
  PDV_CASH_HISTORY_FORBIDDEN: 'Você não tem permissão para consultar o histórico de caixa.',
};

const GENERIC_ERROR = 'Não foi possível buscar as movimentações do caixa. Tente novamente.';

/** Traduz o erro do servidor (código no `details` ou na mensagem, ou SQLSTATE) para PT-BR. */
export function mapPdvCashExportError(error: unknown): Error {
  const raw = (error && typeof error === 'object' ? error : {}) as RpcError;
  const haystack = `${raw.details ?? ''} ${raw.message ?? ''}`;
  const code = Object.keys(EXPORT_ERRORS).find((key) => haystack.includes(key));
  if (code) return new Error(EXPORT_ERRORS[code]);
  if (raw.code === 'P0002') return new Error('Este caixa ainda não foi fechado. Feche o caixa para exportar.');
  if (raw.code === '42501') return new Error('Você não tem permissão para exportar este caixa.');
  return new Error(GENERIC_ERROR);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function projectItem(raw: unknown): CashExportItem {
  const row = record(raw);
  return {
    name: text(row.name) ?? 'Item',
    unit: text(row.unit),
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    discount: num(row.discount),
    total: num(row.total),
  };
}

function projectEntry(raw: unknown): CashExportEntry {
  const row = record(raw);
  const amount = Math.abs(num(row.amount));
  const direction = row.direction === 'out' ? 'out' : 'in';
  return {
    id: text(row.id) ?? '',
    kind: text(row.kind) ?? '',
    direction,
    amount,
    signedAmount: row.signed_amount == null ? (direction === 'out' ? -amount : amount) : num(row.signed_amount),
    occurredAt: text(row.occurred_at) ?? '',
    paymentMethod: text(row.payment_method),
    description: text(row.description),
    notes: text(row.notes),
    authorName: text(row.author_name),
    affectsDrawer: row.affects_drawer === true,
    isClosingAdjustment: row.is_closing_adjustment === true,
    orderId: text(row.order_id),
    orderNumber: nullableNum(row.order_number),
    orderStatus: text(row.order_status),
    orderTotal: nullableNum(row.order_total),
    customerName: text(row.customer_name),
    salespersonName: text(row.salesperson_name),
    isCancelled: row.is_cancelled === true,
    cancelledReason: text(row.cancelled_reason),
    isOrderPrimary: row.is_order_primary === true,
    items: Array.isArray(row.items) ? row.items.map(projectItem) : [],
  };
}

export function projectPdvCashExportSession(raw: unknown): CashExportSession {
  const row = record(raw);
  const sessionId = text(row.session_id);
  if (!sessionId) throw new Error('O servidor retornou um caixa inválido. Atualize a tela e tente novamente.');
  const summary = record(row.sales_summary);
  return {
    sessionId,
    terminalId: text(row.terminal_id),
    terminalName: text(row.terminal_name) ?? 'Caixa',
    openedBy: text(row.opened_by),
    operatorName: text(row.operator_name) ?? 'Operador',
    closedBy: text(row.closed_by),
    closedByName: text(row.closed_by_name),
    openedAt: text(row.opened_at) ?? '',
    closedAt: text(row.closed_at),
    status: text(row.status) ?? 'fechada',
    wasReopened: row.was_reopened === true,
    cashAccountName: text(row.cash_account_name),
    openingAmount: num(row.opening_amount),
    expectedAmount: num(row.expected_amount),
    countedAmount: num(row.counted_amount),
    difference: num(row.difference),
    cashReceipts: num(row.cash_receipts),
    cashPayments: num(row.cash_payments),
    supplies: num(row.supplies),
    withdrawals: num(row.withdrawals),
    refunds: num(row.refunds),
    finalPosition: num(row.final_position),
    notes: text(row.notes),
    salesSummary: {
      ordersCount: num(summary.orders_count),
      cancelledOrdersCount: num(summary.cancelled_orders_count),
      ordersTotal: num(summary.orders_total),
      byPaymentMethod: Array.isArray(summary.by_payment_method)
        ? summary.by_payment_method.map((item) => {
          const method = record(item);
          return { paymentMethod: text(method.payment_method) ?? '', amount: num(method.amount) };
        })
        : [],
    },
    entries: Array.isArray(row.entries) ? row.entries.map(projectEntry) : [],
  };
}

export function projectPdvCashExportPeriod(raw: unknown): CashExportPayload {
  const row = record(raw);
  return {
    from: text(row.from),
    to: text(row.to),
    timezone: text(row.timezone),
    sessions: Array.isArray(row.sessions) ? row.sessions.map(projectPdvCashExportSession) : [],
  };
}

/** Um caixa fechado, com todas as movimentações (vendas em qualquer forma de pagamento inclusive). */
export async function fetchPdvCashSessionExport(sessionId: string): Promise<CashExportPayload> {
  const { data, error } = await rpc('pdv_cash_session_export_v1', { p_session_id: sessionId });
  if (error) throw mapPdvCashExportError(error);
  const session = projectPdvCashExportSession(data);
  return { from: null, to: null, timezone: null, sessions: [session] };
}

export interface PdvCashExportPeriodParams {
  /** yyyy-MM-dd, interpretado pelo servidor no fuso da empresa. */
  from: string;
  to: string;
  terminalId?: string | null;
  operatorId?: string | null;
}

export async function fetchPdvCashPeriodExport(params: PdvCashExportPeriodParams): Promise<CashExportPayload> {
  const { data, error } = await rpc('pdv_cash_export_period_v1', {
    p_from: params.from,
    p_to: params.to,
    p_terminal_id: params.terminalId ?? null,
    p_operator_id: params.operatorId ?? null,
  });
  if (error) throw mapPdvCashExportError(error);
  return projectPdvCashExportPeriod(data);
}

/** Nome da empresa para o cabeçalho do documento. */
export function usePdvCashExportCompanyName(enabled: boolean): string {
  const { companyId } = useUserCompany();
  const scope = usePdvAuthorizedQueryScope();
  const { data } = useQuery({
    queryKey: ['pdv-cash-export-company-name', companyId, ...scope.key],
    enabled: scope.ready && enabled && !!companyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data: company, error } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId as string)
        .maybeSingle();
      if (error) throw error;
      return company?.name ?? null;
    },
  });
  return data?.trim() || 'Empresa';
}
