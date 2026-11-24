import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
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
  sourceType: string;
  sourceLabel: string;
  /** Número da venda/pedido quando a entrada é um grupo de entrega; null nos demais eventos. */
  orderNumber: number | null;
  itemCount: number;
  revenue: number;
  cmv: number | null;
  expense: number;
  cashFlow: number;
  details: PdvProjectionDetail[];
}

export interface PdvProjectionDetail {
  description: string;
  quantity: number;
  revenue: number;
  cmv: number | null;
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

/**
 * A expedição só existe no balcão com expedição. Fora dele, o link de retirada
 * levaria ao redirecionamento do guard, então abrimos o pedido na lista de pedidos.
 */
export function resolvePdvHistoryDeepLink(deepLink: string, dispatchAvailable: boolean): string {
  if (dispatchAvailable) return deepLink;
  const match = /^\/pdv\/expedicao(?=$|[?#])(.*)$/.exec(deepLink);
  return match ? `/pdv/pedidos${match[1]}` : deepLink;
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

class PdvReportReadError extends Error {}

function mapReportError(error: RpcError): Error {
  const detailCode = /(?:^|\s)code=([a-z0-9_]+)/i.exec(error.details ?? '')?.[1] ?? '';
  if (error.code === '42501' || /denied|forbidden|auth_required/i.test(detailCode)) {
    return new PdvReportReadError('Seu perfil não permite consultar este relatório.');
  }
  if (error.code === '22023' || /input_invalid/i.test(detailCode)) {
    return new PdvReportReadError('Revise o período e os filtros do relatório.');
  }
  if (!error.code && /fetch|network|connection/i.test(error.message ?? '')) {
    return new PdvReportReadError('Não foi possível acessar o servidor. Verifique sua conexão.');
  }
  return new PdvReportReadError('Não foi possível carregar o relatório agora. Tente novamente.');
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
      const orderNumber = nullableFiniteNumber(row.order_number);
      const itemCount = finiteNumber(row.item_count);
      if (!Number.isInteger(itemCount) || itemCount < 1 || !Array.isArray(row.details)) {
        throw new PdvReportContractError();
      }
      const details = row.details.map((raw): PdvProjectionDetail => {
        const detail = recordOf(raw);
        const description = textOf(detail.description);
        if (!description) throw new PdvReportContractError();
        return {
          description,
          quantity: finiteNumber(detail.quantity),
          revenue: finiteNumber(detail.revenue),
          cmv: nullableFiniteNumber(detail.cmv),
        };
      });
      return {
        eventId,
        eventDate: civilDate(row.event_date),
        sourceType: textOf(row.source_type) ?? '',
        sourceLabel: pdvProjectionSourceLabel(row.source_type),
        orderNumber,
        itemCount,
        revenue: finiteNumber(row.revenue),
        cmv: nullableFiniteNumber(row.cmv),
        expense: finiteNumber(row.expense),
        cashFlow: finiteNumber(row.cash_flow),
        details,
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
    queryFn: async () => projectPdvPartialProjection(await call('pdv_partial_projection_report_v4', {
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

const PDV_EXPORT_PAGE_SIZE = 500;
const PDV_EXPORT_MAX_ENTRIES = 10_000;
class PdvExportCancelled extends Error {}

type ProjectionExportParams = { projection: PdvProjectionKind; from: string; to: string };
type HistoryExportParams = { from: string; to: string; cashSessionId?: string | null };
type ExportPage<T> = { totalCount: number; limit: number; offset: number; hasMore: boolean; entries: T[] };
class PdvReportExportError extends Error {}

async function collectPdvExport<T>(
  readPage: (offset: number) => Promise<ExportPage<T> & { summary: string }>,
  identity: (entry: T) => string,
  isCurrent: () => boolean,
): Promise<T[]> {
  const entries: T[] = [];
  const ids = new Set<string>();
  let expectedSummary: string | null = null;
  const checkCurrent = () => { if (!isCurrent()) throw new PdvExportCancelled(); };
  for (let pageNumber = 0; pageNumber < PDV_EXPORT_MAX_ENTRIES / PDV_EXPORT_PAGE_SIZE; pageNumber += 1) {
    checkCurrent();
    const page = await readPage(entries.length);
    checkCurrent();
    if (page.totalCount > PDV_EXPORT_MAX_ENTRIES) {
      throw new PdvReportExportError('Este período ultrapassa o limite de 10 mil eventos para exportação. Escolha um período menor.');
    }
    const pageIds = page.entries.map(identity);
    if ((expectedSummary !== null && page.summary !== expectedSummary)
      || page.offset !== entries.length || page.limit !== PDV_EXPORT_PAGE_SIZE
      || (page.hasMore && page.entries.length !== page.limit)
      || pageIds.some((id) => ids.has(id)) || new Set(pageIds).size !== pageIds.length) {
      throw new PdvReportExportError('Os eventos do período mudaram durante a exportação. Atualize o relatório e tente novamente.');
    }
    expectedSummary = page.summary;
    pageIds.forEach((id) => ids.add(id));
    entries.push(...page.entries);
    if (!page.hasMore) return entries;
  }
  throw new PdvReportExportError('Não foi possível concluir a exportação neste período. Escolha um período menor e tente novamente.');
}

/** Só publica o conjunto completo; paginação e autorização permanecem no servidor. */
export function fetchPdvProjectionExport(params: ProjectionExportParams, isCurrent: () => boolean) {
  return collectPdvExport(async (offset) => {
    const page = projectPdvPartialProjection(await call('pdv_partial_projection_report_v4', {
      p_projection: params.projection, p_from: params.from, p_to: params.to,
      p_limit: PDV_EXPORT_PAGE_SIZE, p_offset: offset,
    }));
    if (page.projection !== params.projection || page.from !== params.from || page.to !== params.to) throw new PdvReportContractError();
    return { ...page, summary: JSON.stringify([page.totalCount, page.revenue, page.cmv, page.expense, page.result, page.cashFlow]) };
  }, (entry) => entry.eventId, isCurrent);
}

export function fetchPdvHistoryExport(params: HistoryExportParams, isCurrent: () => boolean) {
  return collectPdvExport(async (offset) => {
    const page = projectPdvHistory(await call('pdv_global_event_history_v3', {
      p_from: params.from, p_to: params.to, p_cash_session_id: params.cashSessionId ?? null,
      p_limit: PDV_EXPORT_PAGE_SIZE, p_offset: offset,
    }));
    return { ...page, summary: String(page.totalCount) };
  }, (entry) => `${entry.eventType}:${entry.eventId}`, isCurrent);
}

function usePdvScopedExport<T>(paramsKey: string, enabled: boolean, load: (isCurrent: () => boolean) => Promise<T[]>) {
  const scope = usePdvAuthorizedQueryScope();
  const contextKey = JSON.stringify([scope.key, scope.ready, paramsKey, enabled]);
  const activeAttempt = useRef<symbol | null>(null);
  const current = useRef({ key: contextKey, ready: scope.ready && enabled });
  if (current.current.key !== contextKey) activeAttempt.current = null;
  current.current = { key: contextKey, ready: scope.ready && enabled };
  const mounted = useRef(true);
  const [state, setState] = useState<{ key: string; pending: boolean; error: string | null }>({ key: contextKey, pending: false, error: null });
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; activeAttempt.current = null; };
  }, []);

  async function exportEntries(onComplete: (entries: T[]) => void) {
    if (!current.current.ready || current.current.key !== contextKey) return;
    const attempt = Symbol('pdv-report-export');
    activeAttempt.current = attempt;
    const isCurrent = () => mounted.current && current.current.ready
      && current.current.key === contextKey && activeAttempt.current === attempt;
    setState({ key: contextKey, pending: true, error: null });
    try {
      const entries = await load(isCurrent);
      if (isCurrent()) {
        onComplete(entries);
        setState({ key: contextKey, pending: false, error: null });
      }
    } catch (error) {
      if (isCurrent()) setState({ key: contextKey, pending: false, error: error instanceof PdvReportReadError || error instanceof PdvReportContractError || error instanceof PdvReportExportError ? error.message : 'Não foi possível exportar o relatório. Tente novamente.' });
    }
  }

  return {
    exportEntries,
    isPending: state.key === contextKey && state.pending && activeAttempt.current !== null,
    error: state.key === contextKey ? state.error : null,
    ready: current.current.ready,
  };
}

export function usePdvProjectionExport(params: ProjectionExportParams & { enabled?: boolean }) {
  return usePdvScopedExport(JSON.stringify(['projection', params.projection, params.from, params.to]), params.enabled !== false,
    (isCurrent) => fetchPdvProjectionExport(params, isCurrent));
}

export function usePdvHistoryExport(params: HistoryExportParams & { enabled?: boolean }) {
  return usePdvScopedExport(JSON.stringify(['history', params.from, params.to, params.cashSessionId ?? null]), params.enabled !== false,
    (isCurrent) => fetchPdvHistoryExport(params, isCurrent));
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
