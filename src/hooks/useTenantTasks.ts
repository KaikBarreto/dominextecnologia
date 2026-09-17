/**
 * useTenantTasks — fronteira única do Supabase para a tabela `tenant_tasks`.
 *
 * Expõe:
 * - `tasks`            — todas as tarefas da empresa (qualquer status).
 * - `pendingTasks`     — só status='pendente', ordenadas por task_date ASC.
 * - `pendingCount`     — contagem de pendentes (badge).
 * - `todayAndOverdue`  — pendentes com task_date <= hoje (fuso da empresa).
 * - `today`            — "hoje" (YYYY-MM-DD) no fuso da EMPRESA. FONTE ÚNICA:
 *                        `TasksDrawer` e `DailyTasksPopup` consomem daqui, não
 *                        recalculam. Antes, os três arquivos tinham a mesma
 *                        função copiada e fixa em America/Sao_Paulo, então
 *                        empresa em Cuiabá via tarefa marcada "Atrasada" e o
 *                        popup diário resetava ~1h antes da meia-noite local.
 * - `isLoading`
 * - `createTask`       — inclui company_id + created_by no payload.
 * - `completeTask(id)` — status='concluida', completed_at=now, completed_by=user.
 * - `deleteTask(id)`
 *
 * Regras do repo:
 * - Componente NUNCA chama supabase.from direto — sempre via este hook.
 * - company_id OBRIGATÓRIO no INSERT (RLS bloqueia silenciosamente se faltar).
 * - O dia é o da EMPRESA (`company_settings.timezone`, via useAppLocaleContext),
 *   nunca o do aparelho e nunca Brasília chumbado. `todayInTz` cai no padrão
 *   sem lançar quando o fuso é nulo ou inválido.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { todayInTz } from '@/lib/timezone';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type TenantTask = Tables<'tenant_tasks'>;

export type TenantTaskInsert = Pick<
  TablesInsert<'tenant_tasks'>,
  'title' | 'task_date' | 'description' | 'assigned_to'
>;

// ── hook ─────────────────────────────────────────────────────────────────────

const QUERY_KEY = ['tenant-tasks'] as const;

export function useTenantTasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { timezone } = useAppLocaleContext();

  // ── query principal ──────────────────────────────────────────────────────
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_tasks')
        .select('*')
        .order('task_date', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TenantTask[];
    },
    enabled: !!user,
  });

  // ── derivados ────────────────────────────────────────────────────────────
  const pendingTasks = tasks.filter((t) => t.status === 'pendente');

  const pendingCount = pendingTasks.length;

  const today = todayInTz(timezone);
  const todayAndOverdue = pendingTasks.filter((t) => t.task_date <= today);

  // ── mutations ────────────────────────────────────────────────────────────
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const createTask = useMutation({
    mutationFn: async (input: TenantTaskInsert) => {
      const company_id = await getCurrentUserCompanyId();
      const { data: authData } = await supabase.auth.getUser();
      const created_by = authData.user?.id ?? null;

      const { error } = await supabase.from('tenant_tasks').insert({
        title: input.title,
        task_date: input.task_date,
        description: input.description ?? null,
        assigned_to: input.assigned_to ?? null,
        company_id,
        created_by,
        status: 'pendente',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      // Não emite toast aqui — o componente pode precisar de i18n localizado.
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar tarefa',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const completeTask = useMutation({
    mutationFn: async (id: string) => {
      const { data: authData } = await supabase.auth.getUser();
      const completed_by = authData.user?.id ?? null;

      const { error } = await supabase
        .from('tenant_tasks')
        .update({
          status: 'concluida',
          completed_at: new Date().toISOString(),
          completed_by,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Erro ao concluir tarefa',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tenant_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir tarefa',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  return {
    tasks,
    pendingTasks,
    pendingCount,
    todayAndOverdue,
    /** "Hoje" no fuso da empresa (YYYY-MM-DD). Use isto, não recalcule. */
    today,
    isLoading,
    createTask,
    completeTask,
    deleteTask,
  };
}
