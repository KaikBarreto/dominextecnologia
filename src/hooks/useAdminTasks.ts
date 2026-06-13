import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
 * Filtros aplicados server-side na aba (multi-select).
 * Array vazio / undefined = sem filtro (mostra tudo). Só seleção não-vazia restringe.
 * `search` undefined/'' = sem busca.
 */
export interface TaskFilters {
  type?: AdminTaskType[];
  status?: AdminTaskStatus[];
  priority?: AdminTaskPriority[];
  assigned_to?: string[];
  search?: string;
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

/**
 * Busca texto livre HÍBRIDA, 100% server-side (não pode depender de filtro
 * client-side: admin_tasks pode passar de 1000 rows e o PostgREST trunca em
 * ~1000, escondendo follow-ups além da 1ª página). Casa em:
 *  - title + description da própria tarefa, E
 *  - crm_lead_id ∈ leads (admin_leads) cujo nome ATUAL (company_name /
 *    contact_name / title) casa o termo.
 * Reusada pela query principal E pela contagem de resolvidas (mesmo `.or()`).
 * Retorna `null` quando a busca está vazia.
 */
async function buildSearchOrFilter(search: string | undefined): Promise<string | null> {
  const rawTerm = search?.trim();
  if (!rawTerm) return null;
  // Sanitiza: remove `%` e `,` que quebrariam a sintaxe do `.or()`.
  const term = rawTerm.replace(/[%,]/g, '');
  if (!term) return null;

  // 1) Leads (admin_leads) cujo nome atual casa o termo → coleta IDs pro `.in()`.
  const { data: matchingLeads } = await supabase
    .from('admin_leads')
    .select('id')
    .or(`company_name.ilike.%${term}%,contact_name.ilike.%${term}%,title.ilike.%${term}%`);

  let leadIds = (matchingLeads || []).map(l => l.id);
  // Guarda de segurança: limita a 200 IDs pra não estourar o tamanho da URL do
  // PostgREST. Na prática a busca por nome dificilmente retorna tantos leads.
  const MAX_LEAD_IDS = 200;
  if (leadIds.length > MAX_LEAD_IDS) {
    console.warn(
      `[useAdminTasks] busca "${term}" casou ${leadIds.length} leads; truncando para ${MAX_LEAD_IDS} no filtro de tarefas.`,
    );
    leadIds = leadIds.slice(0, MAX_LEAD_IDS);
  }

  // 2) `.or()` server-side: title/description OU crm_lead_id ∈ leadIds.
  return (
    `title.ilike.%${term}%,description.ilike.%${term}%` +
    (leadIds.length ? `,crm_lead_id.in.(${leadIds.join(',')})` : '')
  );
}

/**
 * Aplica os filtros da tela num builder do PostgREST (usado pela query principal
 * — pendentes + resolvidas — E pela contagem de resolvidas).
 * Multi-select (semântica da tela de Tarefas): só filtra quando a seleção é
 * PARCIAL e não-vazia. `undefined` OU `[]` = sem filtro, mostra tudo.
 * Genérico estrutural porque a query principal usa `select('*')` e a contagem
 * usa `select` com `head: true` — builders de tipos diferentes, mesma API.
 */
function applyTaskFilters<
  Q extends { in(column: string, values: readonly string[]): Q; or(f: string): Q },
>(query: Q, filters: TaskFilters | undefined, searchOrFilter: string | null): Q {
  let q = query;
  if (filters?.type?.length) q = q.in('type', filters.type);
  if (filters?.status?.length) q = q.in('status', filters.status);
  if (filters?.priority?.length) q = q.in('priority', filters.priority);
  if (filters?.assigned_to?.length) q = q.in('assigned_to', filters.assigned_to);
  if (searchOrFilter) q = q.or(searchOrFilter);
  return q;
}

export function useAdminTasks(filters?: TaskFilters, options?: UseAdminTasksOptions) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const showFuture = options?.showFuture ?? false;

  // Janela server-side de resolvidas: começa em 200 (cap INTENCIONAL — proteção
  // contra o corte silencioso de 1000 rows do PostgREST e contra montar milhares
  // de cards de histórico). loadMoreResolved() soma +200. Entra na queryKey:
  // mudar o limite refaz a query principal inteira.
  const [resolvedLimit, setResolvedLimit] = useState(200);
  const loadMoreResolved = useCallback(() => setResolvedLimit(l => l + 200), []);

  const query = useQuery({
    queryKey: ['admin-tasks', filters, showFuture, resolvedLimit],
    // Mantém os dados anteriores durante o refetch (ex.: "Carregar mais") — sem piscar.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Sub-busca de leads + `.or()` da busca híbrida. Roda UMA vez por fetch.
      const searchOrFilter = await buildSearchOrFilter(filters?.search);

      // Skips por construção: filtro de status parcial que exclui "resolvido"
      // pula a query de resolvidas; que inclui só "resolvido" pula o loop de
      // pendentes.
      const statusFilter = filters?.status?.length ? filters.status : null;
      const wantsPendentes = !statusFilter || statusFilter.some(s => s !== 'resolvido');
      const wantsResolvidas = !statusFilter || statusFilter.includes('resolvido');

      const PAGE_SIZE = 1000;
      const MAX_PAGES = 30; // guarda contra loop infinito (30k rows)
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (Brasil = UTC-3)

      // PENDENTES (status != resolvido), paginadas via .range() — o PostgREST
      // corta qualquer SELECT em 1000 rows SILENCIOSAMENTE.
      const pendentes: AdminTaskRow[] = [];
      for (let page = 0; wantsPendentes && page < MAX_PAGES; page++) {
        // Builders do supabase-js são mutáveis — reconstruir do zero a cada página.
        let pendingQuery = applyTaskFilters(
          supabase.from('admin_tasks').select('*').neq('status', 'resolvido'),
          filters,
          searchOrFilter,
        );
        if (!showFuture) {
          pendingQuery = pendingQuery.or(`due_date.is.null,due_date.lte.${today}`);
        }

        const from = page * PAGE_SIZE;
        const { data: pageData, error: pageError } = await pendingQuery
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('followup_step', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (pageError) throw pageError;
        if (!pageData?.length) break;
        pendentes.push(...pageData);
        if (pageData.length < PAGE_SIZE) break; // página incompleta = acabou
      }

      // RESOLVIDAS: só as `resolvedLimit` mais recentes (resolved_at desc). O
      // total REAL vem da query de contagem separada (admin-tasks-resolved-count).
      let resolvidas: AdminTaskRow[] = [];
      if (wantsResolvidas) {
        const { data: resolvedData, error: resolvedError } = await applyTaskFilters(
          supabase.from('admin_tasks').select('*').eq('status', 'resolvido'),
          filters,
          searchOrFilter,
        )
          .order('resolved_at', { ascending: false })
          .limit(resolvedLimit);
        if (resolvedError) throw resolvedError;
        resolvidas = resolvedData || [];
      }

      const rows: AdminTaskRow[] = [...pendentes, ...resolvidas];

      // Resolve relações em lote (perfis por user_id; leads por admin_leads).
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

  // TOTAL REAL de resolvidas: a query principal traz só as `resolvedLimit` mais
  // recentes, então o length local NÃO é o total. `head: true` não transfere
  // linhas — só o header com o COUNT. Respeita os MESMOS filtros server-side,
  // inclusive a busca híbrida. Skip quando o filtro de status exclui "resolvido".
  const wantsResolvedCount = !filters?.status?.length || filters.status.includes('resolvido');
  const { data: resolvedTotal } = useQuery({
    queryKey: ['admin-tasks-resolved-count', filters],
    queryFn: async () => {
      const searchOrFilter = await buildSearchOrFilter(filters?.search);
      const { count, error } = await applyTaskFilters(
        supabase
          .from('admin_tasks')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'resolvido'),
        filters,
        searchOrFilter,
      );
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 5 * 60 * 1000,
    enabled: wantsResolvedCount,
  });

  // Há mais resolvidas no servidor além das já carregadas na query principal?
  const resolvedLoadedCount = useMemo(
    () => (query.data || []).filter(t => t.status === 'resolvido').length,
    [query.data],
  );
  const hasMoreResolved = resolvedTotal !== undefined && resolvedTotal > resolvedLoadedCount;

  // Realtime: qualquer mudança em admin_tasks revalida a lista + as contagens.
  useEffect(() => {
    const channel = supabase
      .channel('admin-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_tasks' }, () => {
        qc.invalidateQueries({ queryKey: ['admin-tasks'] });
        qc.invalidateQueries({ queryKey: ['admin-tasks-count'] });
        qc.invalidateQueries({ queryKey: ['admin-tasks-resolved-count'] });
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
      qc.invalidateQueries({ queryKey: ['admin-tasks-resolved-count'] });
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
      qc.invalidateQueries({ queryKey: ['admin-tasks-resolved-count'] });
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
      qc.invalidateQueries({ queryKey: ['admin-tasks-resolved-count'] });
      toast({ title: 'Tarefa removida!' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  return {
    tasks: query.data || [],
    isLoading: query.isLoading,
    /** true durante qualquer refetch da query principal (ex.: loadMoreResolved). */
    isFetching: query.isFetching,
    createTask,
    updateTask,
    deleteTask,
    /** Total REAL de resolvidas no servidor (undefined enquanto carrega/skipado). */
    resolvedTotal,
    /** Existem resolvidas no servidor além das carregadas na lista. */
    hasMoreResolved,
    /** Carrega +200 resolvidas do servidor (refaz a query principal). */
    loadMoreResolved,
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

export const EMPTY_TASK_FILTERS: TaskFilters = {
  type: [], status: [], priority: [], assigned_to: [], search: '',
};

export function countActiveTaskFilters(filters: TaskFilters): number {
  return (
    (filters.type?.length ? 1 : 0) +
    (filters.status?.length ? 1 : 0) +
    (filters.priority?.length ? 1 : 0) +
    (filters.assigned_to?.length ? 1 : 0)
  );
}
