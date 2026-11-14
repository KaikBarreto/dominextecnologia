import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapPdvPreorderError } from "@/hooks/usePdvPreorders";

export interface PdvPreorderCatalogMaterial {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string | null;
  sale_price: number | null;
  image_url: string | null;
  archived_at: string | null;
  group: { id: string; name: string; color: string | null } | null;
  available_by_stock: Array<{ stock_id: string; available_quantity: number }>;
}

export interface PdvPreorderCatalogParty {
  id: string;
  name: string;
}

export interface PdvPreorderCatalog {
  materials: PdvPreorderCatalogMaterial[];
  customers: PdvPreorderCatalogParty[];
  stocks: PdvPreorderCatalogParty[];
  terminals: Array<PdvPreorderCatalogParty & { stock_id: string }>;
}

interface CatalogPayload {
  materials?: Array<Record<string, unknown>>;
  customers?: Array<Record<string, unknown>>;
  stocks?: Array<Record<string, unknown>>;
  terminals?: Array<Record<string, unknown>>;
}

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string; details?: string } | null;
};
type RpcCaller = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<RpcResult>;
const pdvRpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

const nullableText = (value: unknown) =>
  typeof value === "string" ? value : null;
const nullableNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function projectGroup(value: unknown): PdvPreorderCatalogMaterial["group"] {
  if (!value || typeof value !== "object") return null;
  const group = value as Record<string, unknown>;
  if (typeof group.id !== "string" || typeof group.name !== "string")
    return null;
  return { id: group.id, name: group.name, color: nullableText(group.color) };
}

function projectAvailability(
  value: unknown,
): PdvPreorderCatalogMaterial["available_by_stock"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const available = nullableNumber(row.available_quantity);
    return typeof row.stock_id === "string" && available != null
      ? [{ stock_id: row.stock_id, available_quantity: available }]
      : [];
  });
}

/**
 * Projeta novamente no cliente para que uma resposta futura do servidor não
 * propague por acidente campos que esta tela não deve manter em memória.
 */
export function projectPdvPreorderCatalog(
  payload: CatalogPayload | null,
): PdvPreorderCatalog {
  return {
    materials: (payload?.materials ?? []).flatMap((item) => {
      if (typeof item.id !== "string" || typeof item.name !== "string")
        return [];
      return [
        {
          id: item.id,
          name: item.name,
          sku: nullableText(item.sku),
          barcode: nullableText(item.barcode),
          unit: nullableText(item.unit),
          sale_price: nullableNumber(item.sale_price),
          image_url: nullableText(item.image_url),
          archived_at: nullableText(item.archived_at),
          group: projectGroup(item.group),
          available_by_stock: projectAvailability(item.available_by_stock),
        },
      ];
    }),
    customers: (payload?.customers ?? []).flatMap((item) =>
      typeof item.id === "string" && typeof item.name === "string"
        ? [{ id: item.id, name: item.name }]
        : [],
    ),
    stocks: (payload?.stocks ?? []).flatMap((item) =>
      typeof item.id === "string" && typeof item.name === "string"
        ? [{ id: item.id, name: item.name }]
        : [],
    ),
    terminals: (payload?.terminals ?? []).flatMap((item) =>
      typeof item.id === "string" && typeof item.name === "string" && typeof item.stock_id === "string"
        ? [{ id: item.id, name: item.name, stock_id: item.stock_id }]
        : [],
    ),
  };
}

export function usePdvPreorderCatalog(enabled = true) {
  return useQuery({
    queryKey: ["pdv-preorders", "catalog"],
    queryFn: async () => {
      const [catalog, terminals] = await Promise.all([
        pdvRpc("pdv_get_preorder_catalog_v2"),
        pdvRpc("pdv_list_preorder_terminals_v3"),
      ]);
      if (catalog.error) throw mapPdvPreorderError(catalog.error);
      if (terminals.error) throw mapPdvPreorderError(terminals.error);
      return projectPdvPreorderCatalog({
        ...((catalog.data ?? {}) as CatalogPayload),
        terminals: Array.isArray(terminals.data) ? terminals.data as Array<Record<string, unknown>> : [],
      });
    },
    enabled,
    staleTime: 30_000,
  });
}
