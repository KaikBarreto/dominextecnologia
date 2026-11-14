import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  invalidatePdvReportCaches,
  PDV_REPORTS_QUERY_ROOT,
  usePdvAuthorizedQueryScope,
} from '@/hooks/pdvReportCache';

export { invalidatePdvReportCaches, PDV_REPORTS_QUERY_ROOT } from '@/hooks/pdvReportCache';

export type PdvProjectionKind = 'dre_competence' | 'dre_cash' | 'dfc';

export interface PdvProjectionEntry {
  eventId: string;
  eventDate: string;
  sourceLabel: string;
  revenue: number;
  cmv: number | null;
  expense: number;
  cashFlow: number;
}

export interface PdvPartialProjection {
  scope: 'pdv_partial';
  projection: PdvProjectionKind;
  from: string;
  to: string;
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  revenue: number;
  cmv: number | null;
  expense: number;
  result: number | null;
  cashFlow: number;
  entries: PdvProjectionEntry[];
}

export type PdvHistoryEventType =
  | 'financial_transaction'
  | 'cash_session_open'
  | 'cash_session_close'
  | 'delivery'
  | 'return'
  | 'reversal';

export interface PdvHistoryEntry {
  eventId: string;
  eventType: PdvHistoryEventType;
  eventDate: string;
  cashSessionId: string | null;
  cashSessionLabel: string;
  label: string;
  amount: number | null;
  direction: 'entrada' | 'saida' | null;
  deepLink: string;
}

export interface PdvHistoryPage {
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  entries: PdvHistoryEntry[];
}

export interface PdvDocumentEntry {
  id: string;
  documentType: 'order_receipt' | 'delivery_receipt';
  orderId: string;
  deliveryId: string | null;
  createdAt: string;
  deepLink: string;
}

export interface PdvDocumentPage {
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  documents: PdvDocumentEntry[];
}

type RpcError = { code?: string; message?: string; details?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;
export class PdvReportContractError extends Error {
  constructor() {
    super('O relatório recebido está incompleto. Atualize a tela e tente novamente.');
  }
}

const recordOf = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);
const textOf = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const finiteNumber = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new PdvReportContractError();
  return value;
};
const nullableFiniteNumber = (value: unknown): number | null => value === null ? null : finiteNumber(value);
const integer = (value: unknown): number => {
  const parsed = finiteNumber(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new PdvReportContractError();
  return parsed;
};
const civilDate = (value: unknown): string => {
  const text = textOf(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new PdvReportContractError();
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== text) throw new PdvReportContractError();
  return text;
};
const instant = (value: unknown): string => {
  const text = textOf(value);
  if (!text || !Number.isFinite(Date.parse(text))) throw new PdvReportContractError();
  return text;
};

const SOURCE_LABELS: Record<string, string> = {
  delivery_v2: 'Entrega reconhecida',
  pdv_card_fee: 'Taxa de cartão',
  pdv_cash_shortage: 'Quebra de caixa',
  pdv_cash_surplus: 'Sobra de caixa',
  settlement_application_v2: 'Recebimento aplicado',
  payment_reversal_application_v2: 'Estorno de recebimento',
  zero_value_delivery_cmv_v2: 'Entrega bonificada',
  pdv_receivable_settlement: 'Recebimento do PDV',
  pdv_receivable_reversal: 'Estorno de recebimento',
  pdv_refund: 'Reembolso',
  pdv_supplier_payment: 'Pagamento a fornecedor',
  legacy_financial: 'Movimento legado do PDV',
};

export function pdvProjectionSourceLabel(value: unknown): string {
  const source = textOf(value);
  return source ? SOURCE_LABELS[source] ?? 'Outro evento do PDV' : 'Outro evento do PDV';
}

function pageMeta(root: Record<string, unknown>, rowCount: number) {
  const totalCount = integer(root.total_count);
  const limit = integer(root.limit);
  const offset = integer(root.offset);
  if (
    limit < 1
    || rowCount > limit
    || offset + rowCount > totalCount
    || root.has_more !== (offset + rowCount < totalCount)
  ) throw new PdvReportContractError();
  return { totalCount, limit, offset, hasMore: root.has_more as boolean };
}

function mapReportError(error: RpcError): Error {
  const detailCode = /(?:^|\s)code=([a-z0-9_]+)/i.exec(error.details ?? '')?.[1] ?? '';
  if (error.code === '42501' || /denied|forbidden|auth_required/i.test(detailCode)) {
    return new Error('Seu perfil não permite consultar este relatório.');
  }
  if (error.code === '22023' || /input_invalid/i.test(detailCode)) {
    return new Error('Revise o período e os filtros do relatório.');
  }
  if (!error.code && /fetch|network|connection/i.test(error.message ?? '')) {
    return new Error('Não foi possível acessar o servidor. Verifique sua conexão.');
  }
  return new Error('Não foi possível carregar o relatório agora. Tente novamente.');
}

async function call(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await rpc(name, args);
  if (error) throw mapReportError(error);
  return data;
}

export function projectPdvPartialProjection(payload: unknown): PdvPartialProjection {
  const root = recordOf(payload);
  if (
    root.scope !== 'pdv_partial'
    || root.initial_balance !== null
    || root.opening_availability !== null
    || root.closing_availability !== null
    || root.availability_status !== 'not_calculated_for_partial_projection'
    || !Array.isArray(root.entries)
    || typeof root.has_more !== 'boolean'
  ) throw new PdvReportContractError();
  const projection = root.projection;
  if (projection !== 'dre_competence' && projection !== 'dre_cash' && projection !== 'dfc') {
    throw new PdvReportContractError();
  }
  const page = pageMeta(root, root.entries.length);
  return {
    scope: 'pdv_partial',
    projection,
    from: civilDate(root.from),
    to: civilDate(root.to),
    ...page,
    revenue: finiteNumber(root.revenue),
    cmv: nullableFiniteNumber(root.cmv),
    expense: finiteNumber(root.expense),
    result: nullableFiniteNumber(root.result),
    cashFlow: finiteNumber(root.cash_flow),
    entries: root.entries.map((entry) => {
      const row = recordOf(entry);
      const eventId = textOf(row.event_id);
      if (!eventId) throw new PdvReportContractError();
      return {
        eventId,
        eventDate: civilDate(row.event_date),
        sourceLabel: pdvProjectionSourceLabel(row.source_type),
        revenue: finiteNumber(row.revenue),
        cmv: nullableFiniteNumber(row.cmv),
        expense: finiteNumber(row.expense),
        cashFlow: finiteNumber(row.cash_flow),
      };
    }),
  };
}

export function projectPdvHistory(payload: unknown): PdvHistoryPage {
  const root = recordOf(payload);
  if (root.scope !== 'pdv_global_history' || !Array.isArray(root.entries) || typeof root.has_more !== 'boolean') {
    throw new PdvReportContractError();
  }
  const page = pageMeta(root, root.entries.length);
  return {
    ...page,
    entries: root.entries.map((entry) => {
      const row = recordOf(entry);
      const eventId = textOf(row.event_id);
      if (!eventId) throw new PdvReportContractError();
      const rawType = textOf(row.event_type);
      if (rawType !== 'financial_transaction' && rawType !== 'cash_session_open' && rawType !== 'cash_session_close'
        && rawType !== 'delivery' && rawType !== 'return' && rawType !== 'reversal') {
        throw new PdvReportContractError();
      }
      const label = textOf(row.label);
      const cashSessionLabel = textOf(row.cash_session_label);
      if (!label || !cashSessionLabel) throw new PdvReportContractError();
      const rawDirection = textOf(row.direction);
      if (rawDirection !== null && rawDirection !== 'entrada' && rawDirection !== 'saida') {
        throw new PdvReportContractError();
      }
      const direction: PdvHistoryEntry['direction'] = rawDirection === 'entrada'
        ? 'entrada'
        : rawDirection === 'saida'
          ? 'saida'
          : null;
      return {
        eventId,
        eventType: rawType,
        eventDate: civilDate(row.event_date),
        cashSessionId: textOf(row.cash_session_id),
        cashSessionLabel,
        label,
        amount: nullableFiniteNumber(row.amount),
        direction,
        deepLink: textOf(row.deep_link) ?? '',
      };
    }),
  };
}

export function projectPdvDocuments(payload: unknown): PdvDocumentPage {
  const root = recordOf(payload);
  if (root.scope !== 'pdv_document_index' || !Array.isArray(root.documents) || typeof root.has_more !== 'boolean') {
    throw new PdvReportContractError();
  }
  const page = pageMeta(root, root.documents.length);
  return {
    ...page,
    documents: root.documents.map((entry) => {
      const row = recordOf(entry);
      const id = textOf(row.id);
      const orderId = textOf(row.order_id);
      if (!id || !orderId || (row.document_type !== 'delivery_receipt' && row.document_type !== 'order_receipt')) {
        throw new PdvReportContractError();
      }
      return {
        id,
        documentType: row.document_type,
        orderId,
        deliveryId: textOf(row.delivery_id),
        createdAt: instant(row.created_at),
        deepLink: textOf(row.deep_link) ?? '',
      };
    }),
  };
}

export function usePdvPartialProjection(params: {
  projection: PdvProjectionKind;
  from: string;
  to: string;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  const { projection, from, to, limit = 50, offset = 0, enabled = true } = params;
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: [...PDV_REPORTS_QUERY_ROOT, ...scope.key, 'projection', projection, from, to, limit, offset],
    queryFn: async () => projectPdvPartialProjection(await call('pdv_partial_projection_report_v3', {
      p_projection: projection,
      p_from: from,
      p_to: to,
      p_limit: limit,
      p_offset: offset,
    })),
    enabled: enabled && scope.ready && Boolean(from && to),
    staleTime: 30_000,
  });
}

export function usePdvGlobalHistory(params: {
  from: string;
  to: string;
  cashSessionId?: string | null;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  const { from, to, cashSessionId = null, limit = 25, offset = 0, enabled = true } = params;
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: [...PDV_REPORTS_QUERY_ROOT, ...scope.key, 'history', from, to, cashSessionId, limit, offset],
    queryFn: async () => projectPdvHistory(await call('pdv_global_event_history_v3', {
      p_from: from,
      p_to: to,
      p_cash_session_id: cashSessionId,
      p_limit: limit,
      p_offset: offset,
    })),
    enabled: enabled && scope.ready && Boolean(from && to),
    staleTime: 15_000,
  });
}

export function usePdvDocumentIndex(params: { limit?: number; offset?: number; enabled?: boolean } = {}) {
  const { limit = 25, offset = 0, enabled = true } = params;
  const scope = usePdvAuthorizedQueryScope();
  return useQuery({
    queryKey: [...PDV_REPORTS_QUERY_ROOT, ...scope.key, 'documents', limit, offset],
    queryFn: async () => projectPdvDocuments(await call('pdv_document_index_v3', {
      p_limit: limit,
      p_offset: offset,
    })),
    enabled: enabled && scope.ready,
    staleTime: 30_000,
  });
}
