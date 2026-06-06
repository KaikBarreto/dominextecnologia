import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import type { Database } from '@/integrations/supabase/types';

// ── Tipos do domínio (vêm dos enums gerados em types.ts) ───────────────────
export type AdminTaskType = Database['public']['Enums']['admin_task_type'];
export type AdminTaskStatus = Database['public']['Enums']['admin_task_status'];
export type AdminTaskPriority = Database['public']['Enums']['admin_task_priority'];

type AdminTaskRow = Database['public']['Tables']['admin_tasks']['Row'];

/** Perfil resumido (responsável / criador / quem concluiu). */
export interface AdminTaskProfile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

/** Lead vinculado (somente follow-ups têm `crm_lead_id`). */
export interface AdminTaskLead {
  id: string;
  title: string;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
}

/** Task com relações resolvidas (perfis + lead) prontas pra UI. */
export interface AdminTask extends AdminTaskRow {
  assigned_profile: AdminTaskProfile | null;
  creator_profile: AdminTaskProfile | null;
  crm_lead: AdminTaskLead | null;
}

/**
 * Filtros aplicados client-side na aba (multi-select).
 * Array vazio / undefined = sem filtro (mostra tudo). Só seleção não-vazia restringe.
 */
export interface TaskFilters {
  type: AdminTaskType[];
  status: AdminTaskStatus[];
  priority: AdminTaskPriority[];
  assigned_to: string[];
  search: string;
}

// ── Configs de apresentação (cores/labels) reaproveitadas pelos componentes ─
// follow-up = roxo/violeta pra destacar dos demais tipos (régua de UI).
export const TASK_TYPE_CONFIG: Record<AdminTaskType, { label: string; className: string }> = {
  chamado: { label: 'Chamado', className: 'bg-blue-600 text-white border-blue-600' },
  implantacao: { label: 'Implantação', className: 'bg-purple-600 text-white border-purple-600' },
  bug: { label: 'Bug', className: 'bg-red-600 text-white border-red-600' },
  financeiro: { label: 'Financeiro', className: 'bg-emerald-600 text-white border-emerald-600' },
  melhoria: { label: 'Melhoria', className: 'bg-amber-600 text-white border-amber-600' },
  'follow-up': { label: 'Follow-up', className: 'bg-violet-600 text-white border-violet-600' },
};

export const TASK_STATUS_CONFIG: Record<AdminTaskStatus, { label: string; className: string }> = {
  novo: { label: 'A Fazer', className: 'bg-blue-600 text-white' },
  em_andamento: { label: 'Em andamento', className: 'bg-amber-600 text-white' },
  aguardando: { label: 'Aguardando', className: 'bg-orange-600 text-white' },
  resolvido: { label: 'Resolvido', className: 'bg-emerald-600 text-white' },
};

export const TASK_PRIORITY_CONFIG: Record<AdminTaskPriority, { label: string; className: string }> = {
  baixa: { label: 'Baixa', className: 'bg-slate-600 text-white' },
  media: { label: 'Média', className: 'bg-blue-600 text-white' },
  alta: { label: 'Alta', className: 'bg-red-600 text-white' },
  urgente: { label: 'Urgente', className: 'bg-destructive text-destructive-foreground' },
};

export const TASK_TYPE_OPTIONS: AdminTaskType[] = [
  'chamado', 'implantacao', 'bug', 'financeiro', 'melhoria', 'follow-up',
];
export const TASK_STATUS_OPTIONS: AdminTaskStatus[] = [
  'novo', 'em_andamento', 'aguardando', 'resolvido',
];
export const TASK_PRIORITY_OPTIONS: AdminTaskPriority[] = [
  'urgente', 'alta', 'media', 'baixa',
];

interface UseAdminTasksOptions {
  /**
   * Quando `false` (default), esconde tarefas com `due_date` futura (> hoje) que
   * ainda não foram resolvidas. Tarefas sem due_date (NULL) e tarefas resolvidas
   * sempre aparecem. Motivação: cada lead novo gera 10 follow-ups escalonados no
   * futuro — sem o filtro o quadro vira poluição.
   */
  showFuture?: boolean;
}

export function useAdminTasks({ showFuture = false }: UseAdminTasksOptions = {}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['admin-tasks', showFuture],
    queryFn: async () => {
      let q = supabase
        .from('admin_tasks')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('followup_step', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      // Default: esconde tarefas com due_date futura ainda pendentes; preserva
      // as sem due_date (NULL) e as já resolvidas (resolved_at != null).
      if (!showFuture) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (Brasil = UTC-3, corte por dia)
        q = q.or(`due_date.is.null,due_date.lte.${today},resolved_at.not.is.null`);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows: AdminTaskRow[] = data || [];

      // Resolve relações em lote (perfis por user_id; leads por id).
      const userIds = [
        ...new Set(
          rows.flatMap(t => [t.assigned_to, t.created_by]).filter((v): v is string => !!v),
        ),
      ];
      const leadIds = [...new Set(rows.map(t => t.crm_lead_id).filter((v): v is string => !!v))];

      const [profilesRes, leadsRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', userIds)
          : Promise.resolve({ data: [] as { user_id: string; full_name: string; avatar_url: string | null }[] }),
        leadIds.length > 0
          ? supabase
              .from('admin_leads')
              .select('id, title, company_name, contact_name, phone')
              .in('id', leadIds)
          : Promise.resolve({ data: [] as { id: string; title: string; company_name: string | null; contact_name: string | null; phone: string | null }[] }),
      ]);

      const profilesMap = new Map<string, AdminTaskProfile>(
        (profilesRes.data || []).map(p => [
          p.user_id,
          { user_id: p.user_id, full_name: p.full_name, avatar_url: p.avatar_url ?? null },
        ]),
      );
      const leadsMap = new Map<string, AdminTaskLead>(
        (leadsRes.data || []).map(l => [
          l.id,
          {
            id: l.id,
            title: l.title,
            company_name: l.company_name ?? null,
            contact_name: l.contact_name ?? null,
            phone: l.phone ?? null,
          },
        ]),
      );

      return rows.map<AdminTask>(t => ({
        ...t,
        assigned_profile: t.assigned_to ? profilesMap.get(t.assigned_to) ?? null : null,
        creator_profile: t.created_by ? profilesMap.get(t.created_by) ?? null : null,
        crm_lead: t.crm_lead_id ? leadsMap.get(t.crm_lead_id) ?? null : null,
      }));
    },
  });

  // Realtime: qualquer mudança em admin_tasks revalida a lista + a contagem.
  useEffect(() => {
    const channel = supabase
      .channel('admin-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_tasks' }, () => {
        qc.invalidateQueries({ queryKey: ['admin-tasks'] });
        qc.invalidateQueries({ queryKey: ['admin-tasks-count'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const createTask = useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string | null;
      type: AdminTaskType;
      priority: AdminTaskPriority;
      due_date?: string | null;
      assigned_to?: string | null;
    }) => {
      const payload: Database['public']['Tables']['admin_tasks']['Insert'] = {
        ...input,
        created_by: user?.id ?? null,
      };
      const { data, error } = await supabase.from('admin_tasks').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tasks'] });
      qc.invalidateQueries({ queryKey: ['admin-tasks-count'] });
      toast({ title: 'Tarefa criada!' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...input }: Partial<AdminTask> & { id: string }) => {
      // Remove relações resolvidas no client antes de mandar pro banco.
      const { assigned_profile: _ap, creator_profile: _cp, crm_lead: _cl, ...rest } = input;
      const patch: Database['public']['Tables']['admin_tasks']['Update'] = { ...rest };

      if (input.status === 'resolvido') {
        // Entrando em 'resolvido': carimba data + quem concluiu (se não vier explícito).
        if (patch.resolved_at === undefined) patch.resolved_at = new Date().toISOString();
        if (patch.completed_by === undefined) patch.completed_by = user?.id ?? null;
      } else if (input.status !== undefined) {
        // Saindo de 'resolvido' pra qualquer outro status: limpa o carimbo.
        patch.resolved_at = null;
        patch.completed_by = null;
      }

      const { error } = await supabase.from('admin_tasks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tasks'] });
      qc.invalidateQueries({ queryKey: ['admin-tasks-count'] });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tasks'] });
      qc.invalidateQueries({ queryKey: ['admin-tasks-count'] });
      toast({ title: 'Tarefa removida!' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  return {
    tasks: query.data || [],
    isLoading: query.isLoading,
    createTask,
    updateTask,
    deleteTask,
  };
}

/** Contagem de tarefas com status 'novo' — alimenta o badge da aba Tarefas. */
export function useAdminTasksCount() {
  return useQuery({
    queryKey: ['admin-tasks-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('admin_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'novo');
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000,
  });
}

/** Aplica os filtros de tela (multi-select + busca) sobre a lista já carregada. */
export function filterAdminTasks(tasks: AdminTask[], filters: TaskFilters): AdminTask[] {
  const q = filters.search.trim().toLowerCase();
  return tasks.filter(t => {
    if (filters.type.length > 0 && !filters.type.includes(t.type)) return false;
    if (filters.status.length > 0 && !filters.status.includes(t.status)) return false;
    if (filters.priority.length > 0 && !filters.priority.includes(t.priority)) return false;
    if (filters.assigned_to.length > 0 && (!t.assigned_to || !filters.assigned_to.includes(t.assigned_to))) return false;
    if (q) {
      const hay = [
        t.title,
        t.description ?? '',
        t.crm_lead?.company_name ?? '',
        t.crm_lead?.contact_name ?? '',
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  type: [], status: [], priority: [], assigned_to: [], search: '',
};

export function countActiveTaskFilters(filters: TaskFilters): number {
  return (
    (filters.type.length > 0 ? 1 : 0) +
    (filters.status.length > 0 ? 1 : 0) +
    (filters.priority.length > 0 ? 1 : 0) +
    (filters.assigned_to.length > 0 ? 1 : 0)
  );
}
