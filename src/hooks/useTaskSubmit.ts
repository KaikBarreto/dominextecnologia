import { useCallback } from 'react';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { generateRecurrenceDates } from '@/lib/taskRecurrence';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { getErrorMessage } from '@/utils/errorMessages';
import type { TaskFormData } from '@/components/schedule/TaskFormDialog';

/**
 * Fonte ÚNICA do submit de tarefa (entry_type='tarefa' em service_orders),
 * cobrindo CRIAÇÃO e EDIÇÃO "esta e as futuras".
 *
 * Antes vivia inline em Schedule.handleTaskSubmit. Foi extraído para cá para
 * ser reaproveitado também pela aba Tarefas do cliente (CustomerDetail), sem
 * duplicar a lógica de regeneração da série.
 *
 * Regras da edição de série ("esta e as futuras"):
 *  1) Atualiza a própria tarefa editada (campos + recorrência).
 *  2) Apaga as FUTURAS não-concluídas da série antiga (>= baseDate, exceto a
 *     própria editada). Passadas e já concluídas permanecem intactas.
 *  3) Regenera as futuras com a nova frequência.
 *
 * Datas ancoradas a yyyy-MM-dd (timezone America/Sao_Paulo já é tratado em
 * generateRecurrenceDates). Toasts e invalidação de ['service-orders'] feitos
 * aqui dentro — o chamador não precisa repetir.
 */

// Status considerados "concluídos" para preservar ocorrências passadas na edição.
const isCompletedStatus = (status?: string | null) => status === 'concluida';

export function useTaskSubmit() {
  const { serviceOrders, updateServiceOrder, deleteServiceOrder } = useServiceOrders();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Insere em service_orders uma lista de datas como tarefas da mesma série
  // (mesmo recurrence_group_id) + replica os responsáveis em cada ocorrência.
  // Reaproveitado pela criação e pela regeneração de futuras na edição.
  const insertTaskOccurrences = useCallback(
    async (
      data: TaskFormData,
      dates: string[],
      groupId: string | null,
      company_id: string,
    ) => {
      const inserts = dates.map(date => normalizeOptionalForeignKeys({
        entry_type: 'tarefa',
        task_title: data.task_title,
        task_type_id: data.task_type_id || null,
        service_type_id: data.service_type_id || null,
        customer_id: data.customer_id || null,
        technician_id: data.technician_id || null,
        team_id: data.team_id || null,
        scheduled_date: date,
        scheduled_time: data.scheduled_time || null,
        duration_minutes: data.duration_minutes || 60,
        description: data.description || null,
        os_type: 'visita_tecnica',
        status: 'pendente',
        recurrence_type: data.recurrence_type || null,
        recurrence_interval: data.recurrence_interval || null,
        recurrence_end_date: data.recurrence_end_date || null,
        recurrence_group_id: groupId,
        company_id,
      } as any, ['task_type_id', 'service_type_id', 'customer_id', 'technician_id', 'team_id']));

      const { data: created, error } = await supabase.from('service_orders').insert(inserts as any).select('id');
      if (error) throw error;

      if (created && data.assignee_user_ids && data.assignee_user_ids.length > 0) {
        const assigneeRows = created.flatMap((row: any) =>
          data.assignee_user_ids!.map(uid => ({ service_order_id: row.id, user_id: uid }))
        );
        await supabase.from('service_order_assignees').insert(assigneeRows);
      }
      return created?.length ?? 0;
    },
    [],
  );

  /**
   * Submete uma tarefa.
   * @param data dados do formulário
   * @param editingTask tarefa em edição (null = criação)
   */
  const submitTask = useCallback(
    async (data: TaskFormData, editingTask: any | null) => {
      // ─────────────────── EDIÇÃO ───────────────────
      if (editingTask) {
        const editId = editingTask.id;
        const existingGroupId = (editingTask.recurrence_group_id as string | null) || null;
        const wantsRecurrence = !!data.recurrence_type;
        const baseDate = data.scheduled_date || editingTask.scheduled_date || format(new Date(), 'yyyy-MM-dd');
        // group_id final: reusa o da série; cria um novo se virou série agora; null se desligou.
        const groupId = wantsRecurrence ? (existingGroupId || crypto.randomUUID()) : null;

        // 1) Atualiza a própria tarefa editada (campos + recorrência) via hook.
        try {
          await updateServiceOrder.mutateAsync({
            id: editId,
            task_title: data.task_title,
            task_type_id: data.task_type_id || null,
            service_type_id: data.service_type_id || null,
            customer_id: data.customer_id || null,
            technician_id: data.technician_id || null,
            team_id: data.team_id || null,
            scheduled_date: baseDate,
            scheduled_time: data.scheduled_time || null,
            duration_minutes: data.duration_minutes || 60,
            description: data.description || null,
            recurrence_type: data.recurrence_type || null,
            recurrence_interval: data.recurrence_interval || null,
            recurrence_end_date: data.recurrence_end_date || null,
            recurrence_group_id: groupId,
            assignee_user_ids: data.assignee_user_ids || [],
          } as any);
        } catch (error) {
          // O próprio updateServiceOrder já mostra o toast de erro.
          return;
        }

        // Sem recorrência ativada e sem série anterior → UPDATE simples, terminou.
        if (!wantsRecurrence && !existingGroupId) {
          return;
        }

        // Recorrência ativa (nova série OU série existente) → "esta e as futuras".
        try {
          // 2) Apaga as FUTURAS não-concluídas da série antiga (>= baseDate, exceto
          //    a própria tarefa editada). Passadas e já concluídas permanecem.
          if (existingGroupId) {
            const futureToDelete = serviceOrders.filter((o: any) =>
              o.recurrence_group_id === existingGroupId &&
              o.id !== editId &&
              !isCompletedStatus(o.status) &&
              (o.scheduled_date || '') >= baseDate
            );
            for (const o of futureToDelete) {
              await deleteServiceOrder.mutateAsync(o.id);
            }
          }

          // 3) Regenera as futuras com a nova frequência (a 1ª data = baseDate já é a editada).
          if (wantsRecurrence) {
            const futureDates = generateRecurrenceDates(baseDate, {
              recurrence_type: data.recurrence_type,
              recurrence_interval: data.recurrence_interval,
              recurrence_end_date: data.recurrence_end_date,
              recurrence_weekdays: data.recurrence_weekdays,
            }).filter(d => d !== baseDate);

            if (futureDates.length > 0) {
              const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
              const company_id = await getCurrentUserCompanyId();
              await insertTaskOccurrences(data, futureDates, groupId, company_id);
            }
          }

          toast({ title: 'Série atualizada!', description: 'Esta tarefa e as próximas foram atualizadas.' });
          queryClient.invalidateQueries({ queryKey: ['service-orders'] });
        } catch (error) {
          toast({ variant: 'destructive', title: 'Erro ao atualizar a série', description: getErrorMessage(error) });
        }
        return;
      }

      // ─────────────────── CRIAÇÃO ───────────────────
      const groupId = data.recurrence_type ? crypto.randomUUID() : null;
      const startDate = data.scheduled_date || format(new Date(), 'yyyy-MM-dd');
      const dates = generateRecurrenceDates(startDate, {
        recurrence_type: data.recurrence_type,
        recurrence_interval: data.recurrence_interval,
        recurrence_end_date: data.recurrence_end_date,
        recurrence_weekdays: data.recurrence_weekdays,
      });

      try {
        const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
        const company_id = await getCurrentUserCompanyId();
        const count = await insertTaskOccurrences(data, dates, groupId, company_id);
        toast({ title: `${count} tarefa(s) criada(s)!` });
        queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      } catch (error) {
        toast({ variant: 'destructive', title: 'Erro ao criar tarefa', description: getErrorMessage(error) });
      }
    },
    [serviceOrders, updateServiceOrder, deleteServiceOrder, insertTaskOccurrences, toast, queryClient],
  );

  return { submitTask, insertTaskOccurrences, isCompletedStatus };
}
