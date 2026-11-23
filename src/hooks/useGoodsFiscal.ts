import { useEffect, useRef } from "react";
import { GOODS_FISCAL_ROOT, useGoodsFiscalAccess } from "@/hooks/useGoodsFiscalAccess";
import { goodsFiscalError } from "@/lib/fiscal/goodsErrors";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GoodsDirection = "entrada" | "saida";
export type GoodsSourceType =
  "manual" | "pdv_sale" | "pdv_purchase" | "inventory_purchase";
export type GoodsModel = 55 | 65;

export interface GoodsFiscalSource {
  sourceType: Exclude<GoodsSourceType, "manual">;
  sourceId: string;
  number: number;
  partyName: string | null;
  issuedAt: string;
  total: number;
  itemCount: number;
  originLabel: string;
}

export interface GoodsFiscalParty {
  id?: string | null;
  name: string;
  document: string;
  stateRegistration?: string | null;
  email?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  municipalityCode?: string | null;
}

export interface GoodsFiscalItem {
  id: string;
  sourceItemId?: string | null;
  inventoryId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  unit?: string | null;
  ncm?: string | null;
  cest?: string | null;
  gtin?: string | null;
  origin?: string | null;
  cfopEntryInternal?: string | null;
  cfopEntryInterstate?: string | null;
  cfopExitInternal?: string | null;
  cfopExitInterstate?: string | null;
  icmsCode?: string | null;
  icmsRate?: number | null;
  icmsReductionRate?: number | null;
  pisCst?: string | null;
  cofinsCst?: string | null;
  ipiCst?: string | null;
  pisRate?: number | null;
  cofinsRate?: number | null;
  ipiRate?: number | null;
  taxUnit?: string | null;
  ibsCbsCst?: string | null;
}

export interface GoodsFiscalPayment {
  method: string;
  amount: number;
  change?: number;
  deferred?: boolean;
}

export interface GoodsFiscalDraft {
  id?: string | null;
  model: GoodsModel;
  direction: GoodsDirection;
  stockId?: string | null;
  seriesId?: string | null;
  carrierId?: string | null;
  sourceType: GoodsSourceType;
  sourceId?: string | null;
  nature: string;
  finalConsumer?: boolean;
  party: GoodsFiscalParty | null;
  items: GoodsFiscalItem[];
  payments: GoodsFiscalPayment[];
  freightMode: number;
  notes: string;
}

type RpcResult = { data: unknown; error: { message?: string } | null };
type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function projectGoodsSource(row: unknown): GoodsFiscalSource | null {
  const value = asObject(row);
  const sourceType = text(value.source_type) as GoodsFiscalSource["sourceType"];
  const sourceId = text(value.source_id);
  if (
    !sourceId ||
    !["pdv_sale", "pdv_purchase", "inventory_purchase"].includes(sourceType)
  )
    return null;
  return {
    sourceType,
    sourceId,
    number: number(value.number),
    partyName: text(value.party_name) || null,
    issuedAt: text(value.issued_at),
    total: number(value.total),
    itemCount: number(value.item_count),
    originLabel: text(value.origin_label),
  };
}

export function projectGoodsSnapshot(
  payload: unknown,
): Omit<GoodsFiscalDraft, "model" | "nature" | "freightMode" | "notes"> {
  const root = asObject(payload);
  const rawParty = asObject(root.party);
  const party: GoodsFiscalParty | null = Object.keys(rawParty).length
    ? {
        id: text(rawParty.id) || null,
        name: text(rawParty.name),
        document: text(rawParty.document),
        stateRegistration: text(rawParty.stateRegistration) || null,
        email: text(rawParty.email) || null,
        address: text(rawParty.address) || null,
        addressNumber: text(rawParty.addressNumber) || null,
        complement: text(rawParty.complement) || null,
        neighborhood: text(rawParty.neighborhood) || null,
        city: text(rawParty.city) || null,
        state: text(rawParty.state) || null,
        zipCode: text(rawParty.zipCode) || null,
        municipalityCode: text(rawParty.municipalityCode) || null,
      }
    : null;
  const items = Array.isArray(root.items)
    ? root.items.map((entry, index): GoodsFiscalItem => {
        const item = asObject(entry);
        return {
          id: crypto.randomUUID(),
          sourceItemId: text(item.sourceItemId) || null,
          inventoryId: text(item.inventoryId) || null,
          description: text(item.description) || `Item ${index + 1}`,
          quantity: number(item.quantity),
          unitPrice: number(item.unitPrice),
          discount: number(item.discount),
          total: number(item.total),
          unit: text(item.unit) || null,
          ncm: text(item.ncm) || null,
          cest: text(item.cest) || null,
          gtin: text(item.gtin) || null,
          origin: text(item.origin) || null,
          cfopEntryInternal: text(item.cfopEntryInternal) || null,
          cfopEntryInterstate: text(item.cfopEntryInterstate) || null,
          cfopExitInternal: text(item.cfopExitInternal) || null,
          cfopExitInterstate: text(item.cfopExitInterstate) || null,
          icmsCode: text(item.icmsCode) || null,
          pisCst: text(item.pisCst) || null,
          icmsRate: item.icmsRate == null ? null : number(item.icmsRate),
          icmsReductionRate: item.icmsReductionRate == null ? null : number(item.icmsReductionRate),
          cofinsCst: text(item.cofinsCst) || null,
          ipiCst: text(item.ipiCst) || null,
          pisRate: item.pisRate == null ? null : number(item.pisRate),
          cofinsRate: item.cofinsRate == null ? null : number(item.cofinsRate),
          ipiRate: item.ipiRate == null ? null : number(item.ipiRate),
          taxUnit: text(item.taxUnit) || null,
          ibsCbsCst: text(item.ibsCbsCst) || null,
        };
      })
    : [];
  const payments = Array.isArray(root.payments)
    ? root.payments.map((entry) => {
        const payment = asObject(entry);
        return {
          method: text(payment.method),
          amount: number(payment.amount),
          change: number(payment.change),
          deferred: payment.deferred === true,
        };
      })
    : [];
  return {
    id: null,
    direction: root.direction === "entrada" ? "entrada" : "saida",
    stockId: text(root.stockId) || null,
    seriesId: text(root.seriesId) || null,
    carrierId: text(root.carrierId) || null,
    sourceType: text(root.sourceType) as GoodsSourceType,
    sourceId: text(root.sourceId) || null,
    finalConsumer:
      typeof root.finalConsumer === "boolean" ? root.finalConsumer : undefined,
    party,
    items,
    payments,
  };
}

export function useGoodsFiscalSources(direction: GoodsDirection, query: string, enabled: boolean) {
  const access = useGoodsFiscalAccess();
  const result = useQuery({
    queryKey: [...access.key, 'sources', direction, query], enabled: enabled && access.allowed,
    queryFn: async () => {
      const { data, error } = await rpc('fiscal_list_goods_sources', { p_direction: direction, p_query: query || null, p_limit: 50 });
      if (error) throw new Error('Não foi possível carregar os documentos de origem. Verifique seu acesso fiscal.');
      return (Array.isArray(data) ? data : []).map(projectGoodsSource).filter((entry): entry is GoodsFiscalSource => entry !== null);
    }, staleTime: 15_000,
  });
  return { ...result, data: access.allowed && enabled ? result.data : undefined };
}

// Respostas de uma identidade anterior nunca são entregues ao formulário atual.
function useFiscalGuard() {
  const access = useGoodsFiscalAccess();
  const current = useRef({access,epoch:0});
  if (current.current.access.scopeId !== access.scopeId || current.current.access.allowed !== access.allowed) current.current={access,epoch:current.current.epoch+1};
  else current.current.access=access;
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;current.current.epoch++;};},[]);
  return () => {
    const before=current.current;
    const epoch=before.epoch;
    if (!mounted.current || !before.access.allowed) throw new Error('Você não tem acesso à emissão fiscal.');
    return () => { if (!mounted.current || !current.current.access.allowed || current.current.epoch !== epoch) throw new Error('Seu contexto de acesso mudou. Abra a nota novamente.'); };
  };
}
export function useGoodsFiscalSourceImport() {
  const guard = useFiscalGuard();
  return useMutation({ mutationFn: async (source: Pick<GoodsFiscalSource, 'sourceType' | 'sourceId'>) => {
    const assertCurrent = guard();
    const snapshotResult = await rpc('fiscal_get_goods_source_snapshot', {
      p_source_type: source.sourceType,
      p_source_id: source.sourceId,
    });
    assertCurrent();
    if (snapshotResult.error) throw new Error('Não foi possível importar esta venda ou compra. Confira a confirmação e o acesso fiscal.');
    const stockResult = await rpc('fiscal_resolve_source_stock', {
      p_source_type: source.sourceType,
      p_source_id: source.sourceId,
    });
    assertCurrent();
    if (stockResult.error) throw new Error('Não foi possível identificar o local de estoque desta venda ou compra.');
    return {
      ...projectGoodsSnapshot(snapshotResult.data),
      stockId: text(stockResult.data) || null,
    };
  }});
}

export function useGoodsFiscalDocuments(model: GoodsModel, sourceId?: string | null) {
  const access = useGoodsFiscalAccess();
  const query = useQuery({
    queryKey: [...access.key, 'documents', model, sourceId ?? 'all'], enabled: access.allowed,
    queryFn: async () => {
      // Tipos gerados são atualizados junto da migration; os dois modelos têm coluna de PDF própria.
      type Builder = { eq: (column: string, value: string) => Builder; order: (column: string, options: { ascending: boolean }) => Builder; limit: (count: number) => Promise<RpcResult> };
      const client = supabase as unknown as { from: (name: string) => { select: (fields: string) => Builder } };
      let builder = client.from(model === 55 ? 'nfe_documents' : 'nfce_documents')
        .select(`id,status,official_status,environment,series,number,access_key,protocol,draft_payload,stock_id,source_type,source_id,processed_xml_path,${model === 55 ? 'danfe_pdf_path' : 'danfce_pdf_path'},last_error_code,last_error_message,created_at,updated_at`)
        .eq('company_id', access.companyId!);
      if (sourceId) builder = builder.eq('source_type', 'pdv_sale').eq('source_id', sourceId);
      const { data, error } = await builder.order('created_at', { ascending: false }).limit(sourceId ? 1 : 100);
      if (error) throw new Error('Não foi possível carregar as notas fiscais.');
      return Array.isArray(data) ? data.map(asObject) : [];
    }, refetchInterval: (q) => Array.isArray(q.state.data) && q.state.data.some((d) => ['queued','preparing','signed','transmitting','uncertain','cancellation_pending'].includes(String(d.status))) ? 5000 : false,
  });
  return { ...query, data: access.allowed ? query.data : undefined };
}

async function invokeGoods(body: unknown) {
  const { data, error } = await supabase.functions.invoke('fiscal-goods-document', { body });
  if (error) {
    const response = (error as unknown as { context?: Response }).context;
    const payload = response && typeof response.clone === 'function' ? await response.clone().json().catch(() => ({})) : {};
    throw new Error(goodsFiscalError(payload));
  }
  const result = asObject(data);
  if (result.error) throw new Error(goodsFiscalError(result));
  return result;
}
export function useSaveGoodsFiscalDocument() {
  const client = useQueryClient(); const guard = useFiscalGuard();
  return useMutation({ mutationFn: async ({ draft, emit }: { draft: GoodsFiscalDraft; emit: boolean }) => {
    const assertCurrent = guard();
    const result = await invokeGoods({ action: emit ? 'emit' : 'save_draft', draft });
    assertCurrent(); return result;
  }, onSettled: () => {
    void client.invalidateQueries({ queryKey: GOODS_FISCAL_ROOT });
    void client.invalidateQueries({ queryKey: ['fiscal-inventory'] });
  }, retry: false });
}
export function useGoodsFiscalDocumentAction() {
  const client = useQueryClient(); const guard = useFiscalGuard();
  return useMutation({ mutationFn: async (input: { model: GoodsModel; documentId: string; action: 'consult' | 'artifact' | 'cancel' | 'revise' | 'resume'; kind?: 'xml' | 'pdf'; reason?: string }) => {
    const assertCurrent = guard(); const result = await invokeGoods(input); assertCurrent(); return result;
  }, onSettled: () => {
    void client.invalidateQueries({ queryKey: GOODS_FISCAL_ROOT });
    void client.invalidateQueries({ queryKey: ['fiscal-inventory'] });
  }, retry: false });
}
