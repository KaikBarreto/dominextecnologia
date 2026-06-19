import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type InventoryMovementRow = Tables<'inventory_movements'>;

/** Tipos de movimento aceitos pelo CHECK do banco. */
export type MovementType =
  | 'entrada'
  | 'saida'
  | 'ajuste'
  | 'transferencia'
  | 'estorno';

export interface MovementCreator {
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface InventoryMovementWithRelations extends InventoryMovementRow {
  /** Material resolvido por inventory_id (name + sku). */
  material: { name: string; sku: string | null } | null;
  /** Criador resolvido em lote por profiles.user_id (regra-lei: join por user_id). */
  creator: MovementCreator | null;
  /** Fornecedor resolvido por supplier_id (quando houver). */
  supplier: { name: string } | null;
  /** Nº da OS de origem (quando houver service_order_id). */
  orderNumber: number | null;
}

/**
 * Histórico de movimentações de estoque (Kardex) da empresa.
 *
 * RLS já filtra por company_id. Ordenado por created_at desc.
 *
 * Os joins de criador e fornecedor são resolvidos em LOTE (não via PostgREST
 * embed): `created_by` aponta pra auth.users, então o perfil só sai com query
 * separada em profiles por user_id (regra-lei do projeto). Material, fornecedor
 * e nº da OS seguem o mesmo padrão de lookup leve.
 */
export function useInventoryMovements() {
  const query = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = (data || []) as InventoryMovementRow[];

      if (rows.length === 0) return [] as InventoryMovementWithRelations[];

      // ----- Material (inventory) por inventory_id -----
      const inventoryIds = [
        ...new Set(rows.map((m) => m.inventory_id).filter((v): v is string => !!v)),
      ];
      const materialMap = new Map<string, { name: string; sku: string | null }>();
      if (inventoryIds.length > 0) {
        const { data: invRows } = await supabase
          .from('inventory')
          .select('id, name, sku')
          .in('id', inventoryIds);
        (invRows || []).forEach((i) => {
          materialMap.set(i.id, { name: i.name, sku: i.sku ?? null });
        });
      }

      // ----- Criador (profiles) em lote por user_id -----
      const creatorIds = [
        ...new Set(rows.map((m) => m.created_by).filter((v): v is string => !!v)),
      ];
      const creatorMap = new Map<string, MovementCreator>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, avatar_url')
          .in('user_id', creatorIds);
        (profiles || []).forEach((p) => {
          creatorMap.set(p.user_id, {
            full_name: p.full_name ?? null,
            email: p.email ?? null,
            avatar_url: p.avatar_url ?? null,
          });
        });
      }

      // ----- Fornecedor (suppliers) por supplier_id -----
      const supplierIds = [
        ...new Set(rows.map((m) => m.supplier_id).filter((v): v is string => !!v)),
      ];
      const supplierMap = new Map<string, { name: string }>();
      if (supplierIds.length > 0) {
        const { data: sups } = await supabase
          .from('suppliers')
          .select('id, name')
          .in('id', supplierIds);
        (sups || []).forEach((s) => {
          supplierMap.set(s.id, { name: s.name });
        });
      }

      // ----- Nº da OS (service_orders) por service_order_id -----
      const orderIds = [
        ...new Set(rows.map((m) => m.service_order_id).filter((v): v is string => !!v)),
      ];
      const orderMap = new Map<string, number>();
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('service_orders')
          .select('id, order_number')
          .in('id', orderIds);
        (orders || []).forEach((o) => {
          if (o.order_number != null) orderMap.set(o.id, o.order_number);
        });
      }

      return rows.map((m) => ({
        ...m,
        material: m.inventory_id ? materialMap.get(m.inventory_id) ?? null : null,
        creator: m.created_by ? creatorMap.get(m.created_by) ?? null : null,
        supplier: m.supplier_id ? supplierMap.get(m.supplier_id) ?? null : null,
        orderNumber: m.service_order_id ? orderMap.get(m.service_order_id) ?? null : null,
      })) as InventoryMovementWithRelations[];
    },
  });

  return {
    movements: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
