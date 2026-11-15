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
}

export interface GoodsFiscalDraft {
  id?: string | null;
  model: GoodsModel;
  direction: GoodsDirection;
  sourceType: GoodsSourceType;
  sourceId?: string | null;
  nature: string;
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
          icmsRate: number(item.icmsRate) || null,
          icmsReductionRate: number(item.icmsReductionRate) || null,
          cofinsCst: text(item.cofinsCst) || null,
          ipiCst: text(item.ipiCst) || null,
          pisRate: number(item.pisRate) || null,
          cofinsRate: number(item.cofinsRate) || null,
          ipiRate: number(item.ipiRate) || null,
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
        };
      })
    : [];
  return {
    id: null,
    direction: root.direction === "entrada" ? "entrada" : "saida",
    sourceType: text(root.sourceType) as GoodsSourceType,
    sourceId: text(root.sourceId) || null,
    party,
    items,
    payments,
  };
}

export function useGoodsFiscalSources(
  direction: GoodsDirection,
  query: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["goods-fiscal-sources", direction, query],
    enabled,
    queryFn: async () => {
      const { data, error } = await rpc("fiscal_list_goods_sources", {
        p_direction: direction,
        p_query: query || null,
        p_limit: 50,
      });
      if (error)
        throw new Error(
          error.message || "Não foi possível carregar os documentos de origem.",
        );
      return (Array.isArray(data) ? data : [])
        .map(projectGoodsSource)
        .filter((entry): entry is GoodsFiscalSource => entry !== null);
    },
    staleTime: 15_000,
  });
}

export function useGoodsFiscalSourceImport() {
  return useMutation({
    mutationFn: async (source: GoodsFiscalSource) => {
      const { data, error } = await rpc("fiscal_get_goods_source_snapshot", {
        p_source_type: source.sourceType,
        p_source_id: source.sourceId,
      });
      if (error)
        throw new Error(
          error.message || "Não foi possível importar este documento.",
        );
      return projectGoodsSnapshot(data);
    },
  });
}

export function useGoodsFiscalDocuments(model: GoodsModel) {
  const table = model === 55 ? "nfe_documents" : "nfce_documents";
  return useQuery({
    queryKey: ["goods-fiscal-documents", model],
    queryFn: async () => {
      const client = supabase.from as unknown as (name: string) => {
        select: (columns: string) => {
          order: (
            column: string,
            opts: { ascending: boolean },
          ) => Promise<RpcResult>;
        };
      };
      const { data, error } = await client(table)
        .select(
          "id, status, official_status, environment, series, number, access_key, draft_payload, source_type, source_id, processed_xml_path, danfe_pdf_path, danfce_pdf_path, last_error_message, created_at, updated_at",
        )
        .order("created_at", { ascending: false });
      if (error)
        throw new Error(error.message || "Não foi possível carregar as notas.");
      return Array.isArray(data) ? data.map(asObject) : [];
    },
  });
}

export function useSaveGoodsFiscalDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      draft,
      emit,
    }: {
      draft: GoodsFiscalDraft;
      emit: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "fiscal-goods-document",
        { body: { action: emit ? "emit" : "save_draft", draft } },
      );
      if (error)
        throw new Error(error.message || "Não foi possível salvar a nota.");
      const response = asObject(data);
      if (response.error)
        throw new Error(
          text(response.message) || "Não foi possível salvar a nota.",
        );
      return response;
    },
    onSuccess: (_, input) =>
      client.invalidateQueries({
        queryKey: ["goods-fiscal-documents", input.draft.model],
      }),
  });
}

export function useGoodsFiscalDocumentAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      model: GoodsModel;
      documentId: string;
      action: "consult" | "artifact" | "cancel";
      kind?: "xml" | "pdf";
      reason?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "fiscal-goods-document",
        { body: input },
      );
      if (error)
        throw new Error(
          error.message || "Não foi possível concluir a ação fiscal.",
        );
      const response = asObject(data);
      if (response.error)
        throw new Error(
          text(response.message) || "Não foi possível concluir a ação fiscal.",
        );
      return response;
    },
    onSuccess: (_, input) =>
      client.invalidateQueries({
        queryKey: ["goods-fiscal-documents", input.model],
      }),
  });
}
