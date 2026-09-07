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
  | 'estorno'
  | 'consumo';

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
  /** Local de estoque onde o movimento aconteceu (stock_id). */
  stock: { name: string } | null;
  /**
   * Local da OUTRA perna do movimento, quando `movement_type === 'transferencia'`
   * (amarrado por `related_movement_id`). `null` quando não é transferência ou
   * quando a contraparte não é visível pelo RLS do usuário atual.
   */
  counterpartStock: { name: string } | null;
}

/**
 * Histórico de movimentações de estoque (Kardex) da empresa.
 *
 * RLS já filtra por company_id. Ordenado por created_at desc.
 *
 * Os joins de criador e fornecedor são resolvidos em LOTE (não via PostgREST
 * embed): `created_by` aponta pra auth.users, então o perfil só sai com query
 * separada em profiles por user_id (regra-lei do projeto). Material, fornecedor,
 * nº da OS e local de estoque (stock_id) seguem o mesmo padrão de lookup leve.
 * Em transferências, a outra perna do movimento é resolvida via
 * `related_movement_id` pra expor origem e destino.
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

      // ----- Local (stocks) por stock_id -----
      const stockMap = new Map<string, { name: string }>();
      const stockIds = new Set(rows.map((m) => m.stock_id).filter((v): v is string => !!v));

      // ----- Contraparte da transferência (outra perna) por related_movement_id -----
      // A tabela amarra as duas pernas de uma transferência pelo related_movement_id
      // (FK pra própria inventory_movements). Resolvemos em lote o stock_id da
      // contraparte; se ela não estiver visível pelo RLS do usuário, o map fica
      // sem a entrada e a contraparte cai pra null sem quebrar nada.
      const relatedIds = [
        ...new Set(rows.map((m) => m.related_movement_id).filter((v): v is string => !!v)),
      ];
      const relatedStockIdMap = new Map<string, string>();
      if (relatedIds.length > 0) {
        const { data: relatedMovements } = await supabase
          .from('inventory_movements')
          .select('id, stock_id')
          .in('id', relatedIds);
        (relatedMovements || []).forEach((r) => {
          relatedStockIdMap.set(r.id, r.stock_id);
          stockIds.add(r.stock_id);
        });
      }

      if (stockIds.size > 0) {
        const { data: stockRows } = await supabase
          .from('stocks')
          .select('id, name')
          .in('id', [...stockIds]);
        (stockRows || []).forEach((s) => {
          stockMap.set(s.id, { name: s.name });
        });
      }

      return rows.map((m) => {
        const relatedStockId = m.related_movement_id
          ? relatedStockIdMap.get(m.related_movement_id) ?? null
          : null;
        return {
          ...m,
          material: m.inventory_id ? materialMap.get(m.inventory_id) ?? null : null,
          creator: m.created_by ? creatorMap.get(m.created_by) ?? null : null,
          supplier: m.supplier_id ? supplierMap.get(m.supplier_id) ?? null : null,
          orderNumber: m.service_order_id ? orderMap.get(m.service_order_id) ?? null : null,
          stock: stockMap.get(m.stock_id) ?? null,
          counterpartStock: relatedStockId ? stockMap.get(relatedStockId) ?? null : null,
        };
      }) as InventoryMovementWithRelations[];
    },
  });

  return {
    movements: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
