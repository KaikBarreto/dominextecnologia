import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mapPdvCashV2Error } from '@/hooks/usePdvCashSessionsV2';

export type PdvCashV2DetailEntryKind =
  | 'opening'
  | 'cash_receipt'
  | 'cash_payment'
  | 'supply'
  | 'withdrawal'
  | 'refund'
  | 'closing_return'
  | 'shortage'
  | 'surplus'
  | 'reversal';

export interface PdvCashV2DetailEntry {
  id: string;
  kind: PdvCashV2DetailEntryKind;
  /** Delta assinado da gaveta: entrada positiva; saída negativa. */
  amount: number;
  createdAt: string;
  createdBy: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reversalOfId: string | null;
  description: string | null;
  notes: string | null;
  paymentMethod: string | null;
  transactionType: 'entrada' | 'saida' | null;
  financialTransactionId: string | null;
  /** Pedido confirmado no servidor pelo vínculo pagamento -> financeiro. */
  orderId: string | null;
}

export interface PdvCashV2SessionDetail {
  sessionId: string;
  /** Dinheiro físico esperado agora, já incluindo reversões compensatórias. */
  position: number;
  openingAmount: number;
  cashReceipts: number;
  cashPayments: number;
  supplies: number;
  withdrawals: number;
  refunds: number;
  entries: PdvCashV2DetailEntry[];
}

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

const ENTRY_KINDS = new Set<PdvCashV2DetailEntryKind>([
  'opening',
  'cash_receipt',
  'cash_payment',
  'supply',
  'withdrawal',
  'refund',
  'closing_return',
  'shortage',
  'surplus',
  'reversal',
]);

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`O servidor retornou ${field} inválido no caixa.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`O servidor retornou ${field} inválido no caixa.`);
  }
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return text(value, field);
}

function numeric(value: unknown, field: string): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) {
    throw new Error(`O servidor retornou ${field} inválido no caixa.`);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`O servidor retornou ${field} inválido no caixa.`);
  }
  return parsed;
}

function date(value: unknown, field: string): string {
  const parsed = text(value, field);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
    throw new Error(`O servidor retornou ${field} inválida no caixa.`);
  }
  return parsed;
}

function projectEntry(payload: unknown): PdvCashV2DetailEntry {
  const value = record(payload, 'movimento');
  const kind = text(value.kind, 'tipo do movimento') as PdvCashV2DetailEntryKind;
  if (!ENTRY_KINDS.has(kind)) {
    throw new Error('O servidor retornou tipo de movimento inválido no caixa.');
  }
  const rawTransactionType = value.transaction_type;
  if (rawTransactionType !== null && rawTransactionType !== 'entrada' && rawTransactionType !== 'saida') {
    throw new Error('O servidor retornou tipo financeiro inválido no caixa.');
  }
  const transactionType = rawTransactionType as PdvCashV2DetailEntry['transactionType'];
  return {
    id: text(value.id, 'identificador do movimento'),
    kind,
    amount: numeric(value.amount, 'valor do movimento'),
    createdAt: date(value.created_at, 'data do movimento'),
    createdBy: nullableText(value.created_by, 'responsável do movimento'),
    sourceType: nullableText(value.source_type, 'origem do movimento'),
    sourceId: nullableText(value.source_id, 'identificador da origem'),
    reversalOfId: nullableText(value.reversal_of_id, 'movimento revertido'),
    description: nullableText(value.description, 'descrição do movimento'),
    notes: nullableText(value.notes, 'observação do movimento'),
    paymentMethod: nullableText(value.payment_method, 'forma de pagamento'),
    transactionType,
    financialTransactionId: nullableText(
      value.financial_transaction_id,
      'lançamento financeiro do movimento',
    ),
    orderId: nullableText(value.order_id, 'pedido do movimento'),
  };
}

export function projectPdvCashV2SessionDetail(payload: unknown): PdvCashV2SessionDetail {
  const value = record(payload, 'detalhe da sessão');
  if (!Array.isArray(value.entries)) {
    throw new Error('O servidor retornou os movimentos do caixa em formato inválido.');
  }
  const entries = value.entries.map(projectEntry);
  return {
    sessionId: text(value.session_id, 'identificador da sessão'),
    position: numeric(value.position, 'posição da gaveta'),
    openingAmount: numeric(value.opening_amount, 'valor de abertura'),
    cashReceipts: numeric(value.cash_receipts, 'recebimentos em dinheiro'),
    cashPayments: numeric(value.cash_payments, 'pagamentos em dinheiro'),
    supplies: numeric(value.supplies, 'dinheiro adicionado'),
    withdrawals: numeric(value.withdrawals, 'dinheiro retirado'),
    refunds: numeric(value.refunds, 'estornos em dinheiro'),
    entries,
  };
}

export function usePdvCashSessionDetailV2(sessionId: string | null) {
  const query = useQuery({
    queryKey: ['pdv-cash-sessions-v2', 'detail', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await rpc('pdv_cash_session_detail_v2', {
        p_session_id: sessionId,
      });
      if (error) throw mapPdvCashV2Error(error);
      const detail = projectPdvCashV2SessionDetail(data);
      if (detail.sessionId !== sessionId) {
        throw new Error('O servidor retornou o detalhe de outro caixa. Atualize a tela.');
      }
      return detail;
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    retry: false,
  });

  return {
    detail: query.data ?? null,
    entries: query.data?.entries ?? [],
    isLoading: !!sessionId && query.isLoading,
    isError: !!sessionId && query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
