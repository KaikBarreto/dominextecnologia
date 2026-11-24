import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder } from '@/types/database';
import { fetchAllPaginated } from '@/utils/supabasePagination';

export type CustomerTask = ServiceOrder & {
  task_title?: string | null;
  task_type_id?: string | null;
  recurrence_group_id?: string | null;
  recurrence_type?: string | null;
  recurrence_interval?: number | null;
  recurrence_end_date?: string | null;
  recurrence_indeterminate?: boolean | null;
  recurrence_weekdays?: number[] | null;
  lead_id?: string | null;
  _assignee_user_ids: string[];
};

type CustomerTaskRow = Omit<CustomerTask, '_assignee_user_ids'>;

/**
 * Consulta enxuta das tarefas de um cliente.
 *
 * A ficha não pode depender da carga global de todas as OSs da empresa para
 * decidir se o cliente tem tarefas. Além de ficar lenta em tenants grandes,
 * uma falha nessa carga era apresentada como lista vazia. A chave permanece
 * sob a raiz canônica `service-orders`, portanto as mutations existentes
 * continuam invalidando esta leitura.
 */
export function useCustomerTasks(customerId?: string, enabled = true) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: ['service-orders', 'customer-tasks', companyId, customerId],
    enabled: enabled && Boolean(companyId && customerId),
    queryFn: async () => {
      const tasks = await fetchAllPaginated<CustomerTaskRow>(() => supabase
        .from('service_orders')
        .select('*')
        .eq('company_id', companyId!)
        .eq('customer_id', customerId!)
        .eq('entry_type', 'tarefa')
        .order('created_at', { ascending: false })
        .order('id'));

      const taskIds = tasks.map((task) => task.id);
      const assigneeMap = new Map<string, string[]>();

      if (taskIds.length > 0) {
        const chunks: string[][] = [];
        for (let index = 0; index < taskIds.length; index += 200) {
          chunks.push(taskIds.slice(index, index + 200));
        }

        const assigneeBatches = await Promise.all(chunks.map((chunk) =>
          fetchAllPaginated<{ service_order_id: string; user_id: string }>(() => supabase
            .from('service_order_assignees')
            .select('service_order_id, user_id')
            .in('service_order_id', chunk)
            .order('service_order_id')
            .order('user_id')),
        ));

        assigneeBatches.flat().forEach((assignee) => {
          const current = assigneeMap.get(assignee.service_order_id) ?? [];
          current.push(assignee.user_id);
          assigneeMap.set(assignee.service_order_id, current);
        });
      }

      return tasks.map((task) => ({
        ...task,
        _assignee_user_ids: assigneeMap.get(task.id) ?? [],
      })) as CustomerTask[];
    },
    staleTime: 30_000,
  });

  return {
    tasks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
