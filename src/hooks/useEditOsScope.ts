import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * "Editar OS em campo" — encapsula a RPC atômica `edit_service_order_scope`,
 * a ÚNICA forma de gravar o escopo (equipamentos + checklists) de uma OS avulsa.
 *
 * Regra-lei #4: componente nunca chama `supabase.rpc` direto — sempre por aqui.
 *
 * `items` é o ESTADO DESEJADO COMPLETO do escopo. A RPC substitui tudo:
 *   - `equipment_id: null` = checklists avulsos (nível OS).
 *   - `form_template_ids: []` = equipamento presente sem checklist.
 *   - vários templates no mesmo equip = vários pares equip×template.
 * A RPC APAGA respostas órfãs de templates que saíram do escopo — por isso a UI
 * confirma antes quando a remoção destrói respostas já preenchidas.
 */
export interface EditOsScopeItem {
  equipment_id: string | null;
  form_template_ids: string[];
}

export interface EditOsScopeResult {
  removed: number;
  inserted: number;
  responses_deleted: number;
  scope: { id: string; equipment_id: string | null; form_template_id: string | null }[];
}

export interface EditOsScopeVars {
  serviceOrderId: string;
  items: EditOsScopeItem[];
}

export function useEditOsScope() {
  const queryClient = useQueryClient();

  const editScope = useMutation<EditOsScopeResult, Error, EditOsScopeVars>({
    mutationFn: async ({ serviceOrderId, items }) => {
      // Cast do nome: a RPC existe no schema/types, mas o union de nomes do client
      // pode não resolvê-la em algumas regenerações (mesmo padrão de useContracts).
      const { data, error } = await supabase.rpc('edit_service_order_scope' as any, {
        _service_order_id: serviceOrderId,
        _items: items as any,
      });
      if (error) throw error;
      return data as unknown as EditOsScopeResult;
    },
    onSuccess: (_data, { serviceOrderId }) => {
      // Listagem/kanban de OS + a junção da OS específica.
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      queryClient.invalidateQueries({ queryKey: ['service-order', serviceOrderId] });
      queryClient.invalidateQueries({ queryKey: ['service-order-equipment', serviceOrderId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  return { editScope };
}
