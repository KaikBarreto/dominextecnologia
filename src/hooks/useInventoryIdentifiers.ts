import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type InventoryIdentifierType = 'sku' | 'barcode' | 'gtin' | 'qr' | 'internal' | 'alias';

export interface ResolvedInventoryIdentifier {
  identifierId: string;
  identifierType: InventoryIdentifierType;
  code: string;
  unitLabel: string;
  unitFactor: number;
  isPrimary: boolean;
  material: {
    id: string;
    name: string;
    sku: string | null;
    unit: string;
    salePrice: number | null;
    archivedAt: string | null;
  };
}

export interface SavedInventoryIdentifier {
  identifierId: string;
  inventoryId: string;
  identifierType: InventoryIdentifierType;
  code: string;
  unitLabel: string;
  unitFactor: number;
  isPrimary: boolean;
  isActive: boolean;
}

interface RpcError {
  code?: string;
  message?: string;
  details?: string;
}

type RpcResult = { data: unknown; error: RpcError | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const callRpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

const TYPE_SET = new Set<InventoryIdentifierType>(['sku', 'barcode', 'gtin', 'qr', 'internal', 'alias']);
const text = (value: unknown) => typeof value === 'string' ? value : null;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export class InventoryIdentifierError extends Error {
  constructor(message: string, public readonly domainCode: string) {
    super(message);
    this.name = 'InventoryIdentifierError';
  }
}

function detailCode(details?: string): string {
  return /(?:^|\s)code=([a-z0-9_]+)/i.exec(details ?? '')?.[1] ?? 'inventory_identifier_unknown';
}

export function mapInventoryIdentifierError(error: RpcError): InventoryIdentifierError {
  const code = detailCode(error.details);
  const messages: Record<string, string> = {
    inventory_identifier_auth_required: 'Sua sessão expirou. Entre novamente.',
    inventory_identifier_company_required: 'Seu usuário não possui uma empresa ativa.',
    inventory_identifier_subscription_denied: 'O acesso da empresa está indisponível.',
    inventory_identifier_screen_denied: 'Você não tem permissão para localizar materiais por código.',
    inventory_identifier_write_denied: 'Você não tem permissão para alterar códigos de materiais.',
    inventory_identifier_code_required: 'Informe um código válido.',
    inventory_identifier_type_invalid: 'O tipo de código informado é inválido.',
    inventory_identifier_factor_invalid: 'O fator da embalagem deve ser maior que zero.',
    inventory_identifier_material_not_found: 'Material não encontrado.',
    inventory_identifier_not_found: 'Identificador não encontrado.',
    inventory_identifier_collision: 'Este código já está em uso nesta empresa.',
    inventory_identifier_ambiguous: 'Este código corresponde a mais de uma embalagem. Selecione o tipo do código.',
  };
  return new InventoryIdentifierError(messages[code] ?? 'Não foi possível processar o código do material.', code);
}

export function projectResolvedInventoryIdentifier(payload: unknown): ResolvedInventoryIdentifier | null {
  if (payload == null) return null;
  if (typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const material = value.material && typeof value.material === 'object'
    ? value.material as Record<string, unknown>
    : null;
  const identifierId = text(value.identifier_id);
  const identifierType = text(value.identifier_type);
  const code = text(value.code);
  const unitLabel = text(value.unit_label);
  const unitFactor = number(value.unit_factor);
  const materialId = material ? text(material.id) : null;
  const materialName = material ? text(material.name) : null;
  if (!identifierId || !identifierType || !TYPE_SET.has(identifierType as InventoryIdentifierType)
      || !code || !unitLabel || unitFactor == null || unitFactor <= 0
      || !materialId || !materialName) return null;
  return {
    identifierId,
    identifierType: identifierType as InventoryIdentifierType,
    code,
    unitLabel,
    unitFactor,
    isPrimary: value.is_primary === true,
    material: {
      id: materialId,
      name: materialName,
      sku: text(material?.sku),
      unit: text(material?.unit) ?? 'un',
      salePrice: number(material?.sale_price),
      archivedAt: text(material?.archived_at),
    },
  };
}

function projectSavedInventoryIdentifier(payload: unknown): SavedInventoryIdentifier {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const identifierId = text(value.identifier_id);
  const inventoryId = text(value.inventory_id);
  const identifierType = text(value.identifier_type);
  const code = text(value.code);
  const unitLabel = text(value.unit_label);
  const unitFactor = number(value.unit_factor);
  if (!identifierId || !inventoryId || !identifierType
      || !TYPE_SET.has(identifierType as InventoryIdentifierType)
      || !code || !unitLabel || unitFactor == null || unitFactor <= 0) {
    throw new InventoryIdentifierError('O servidor retornou um identificador inválido.', 'inventory_identifier_invalid_response');
  }
  return {
    identifierId,
    inventoryId,
    identifierType: identifierType as InventoryIdentifierType,
    code,
    unitLabel,
    unitFactor,
    isPrimary: value.is_primary === true,
    isActive: value.is_active === true,
  };
}

async function rpc(name: string, args?: Record<string, unknown>) {
  const { data, error } = await callRpc(name, args);
  if (error) throw mapInventoryIdentifierError(error);
  return data;
}

export function useInventoryIdentifiers() {
  const queryClient = useQueryClient();
  const resolve = useMutation({
    mutationFn: async ({ code, identifierType }: { code: string; identifierType?: InventoryIdentifierType | null }) =>
      projectResolvedInventoryIdentifier(await rpc('inventory_resolve_identifier_v2', {
        p_code: code,
        p_identifier_type: identifierType ?? null,
      })),
  });
  const generateInternal = useMutation({
    mutationFn: async ({ inventoryId }: { inventoryId: string }) =>
      projectSavedInventoryIdentifier(await rpc('inventory_generate_internal_identifier_v2', {
      p_inventory_id: inventoryId,
    })),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-identifiers', variables.inventoryId] });
    },
  });
  const save = useMutation({
    mutationFn: async (input: {
      identifierId?: string | null;
      inventoryId: string;
      identifierType: InventoryIdentifierType;
      code: string;
      unitLabel: string;
      unitFactor?: number;
      isPrimary?: boolean;
      isActive?: boolean;
    }) => projectSavedInventoryIdentifier(await rpc('inventory_save_identifier_v2', {
      p_identifier_id: input.identifierId ?? null,
      p_inventory_id: input.inventoryId,
      p_identifier_type: input.identifierType,
      p_code: input.code,
      p_unit_label: input.unitLabel,
      p_unit_factor: input.unitFactor ?? 1,
      p_is_primary: input.isPrimary ?? false,
      p_is_active: input.isActive ?? true,
    })),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-identifiers', variables.inventoryId] });
    },
  });
  return { resolve, generateInternal, save };
}
