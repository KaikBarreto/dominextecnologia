import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { EMPTY_PROCESS_GRAPH, type ProcessGraph, type ProcessMeta } from '@/lib/flowchart/types';

/**
 * Processo (Fluxograma) — mesma ideia do organograma (`useOrgCharts`), gravado
 * em `processes.data` (grafo) e `processes.meta` (cabeçalho/SIPOC do processo).
 */
export interface Process {
  id: string;
  name: string;
  data: ProcessGraph;
  meta: ProcessMeta;
  status: 'draft' | 'published';
  version: number;
  public_short_code: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeGraph(raw: unknown): ProcessGraph {
  if (!raw || typeof raw !== 'object') return EMPTY_PROCESS_GRAPH;
  const g = raw as Partial<ProcessGraph>;
  return {
    nodes: Array.isArray(g.nodes) ? (g.nodes as ProcessGraph['nodes']) : [],
    edges: Array.isArray(g.edges) ? (g.edges as ProcessGraph['edges']) : [],
  };
}

function normalizeMeta(raw: unknown): ProcessMeta {
  if (!raw || typeof raw !== 'object') return {};
  const m = raw as Partial<ProcessMeta>;
  return {
    objective: typeof m.objective === 'string' ? m.objective : undefined,
    scope: typeof m.scope === 'string' ? m.scope : undefined,
    trigger: typeof m.trigger === 'string' ? m.trigger : undefined,
    ownerEmployeeId: typeof m.ownerEmployeeId === 'string' ? m.ownerEmployeeId : undefined,
    ownerLabel: typeof m.ownerLabel === 'string' ? m.ownerLabel : undefined,
    inputs: Array.isArray(m.inputs) ? m.inputs.filter((v): v is string => typeof v === 'string') : undefined,
    outputs: Array.isArray(m.outputs) ? m.outputs.filter((v): v is string => typeof v === 'string') : undefined,
    frequency: typeof m.frequency === 'string' ? m.frequency : undefined,
    area: typeof m.area === 'string' ? m.area : undefined,
    indicators: Array.isArray(m.indicators)
      ? m.indicators.filter((v): v is string => typeof v === 'string')
      : undefined,
  };
}

function toProcess(row: any): Process {
  return {
    id: row.id,
    name: row.name,
    data: normalizeGraph(row.data),
    meta: normalizeMeta(row.meta),
    status: row.status === 'published' ? 'published' : 'draft',
    version: typeof row.version === 'number' ? row.version : 1,
    public_short_code: row.public_short_code ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT_COLUMNS = 'id, name, data, meta, status, version, public_short_code, created_at, updated_at';

/**
 * FRONTEIRA Supabase dos processos (tabela `processes`, RLS multi-tenant).
 * CRUD: listar por empresa, criar(name), renomear, excluir, e salvar grafo/meta
 * (jsonb) por id. Componentes NUNCA chamam supabase.from direto.
 */
export function useProcesses() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const processesQuery = useQuery({
    queryKey: ['processes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select(SELECT_COLUMNS)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map(toProcess);
    },
  });

  const createProcess = useMutation({
    mutationFn: async (name: string) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('processes')
        .insert({
          name,
          company_id,
          created_by: userData.user?.id ?? null,
          data: EMPTY_PROCESS_GRAPH as any,
          meta: {} as any,
        } as any)
        .select(SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    // Semeia o novo processo no cache ANTES do refetch, para o deep-link
    // (navegação pós-criação) já encontrar o short_code e montar o link amigável.
    onSuccess: (row: any) => {
      if (row?.id) {
        qc.setQueryData<Process[]>(['processes'], (prev) => {
          const next = prev ? [...prev] : [];
          if (!next.some((p) => p.id === row.id)) {
            next.push(toProcess(row));
          }
          return next;
        });
      }
      qc.invalidateQueries({ queryKey: ['processes'] });
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const renameProcess = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('processes').update({ name } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const deleteProcess = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('processes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processes'] }),
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  // Auto-save do grafo. Otimista: atualiza o cache local sem refetch, SEM
  // invalidate (invalidate faz o canvas piscar).
  const saveGraph = useMutation({
    mutationFn: async ({ id, graph }: { id: string; graph: ProcessGraph }) => {
      const { error } = await supabase
        .from('processes')
        .update({ data: graph as any } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_res, { id, graph }) => {
      qc.setQueryData<Process[]>(['processes'], (prev) =>
        (prev || []).map((p) => (p.id === id ? { ...p, data: graph } : p)),
      );
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: getErrorMessage(e) }),
  });

  // Auto-save do cabeçalho (meta/SIPOC). Mesmo padrão otimista do saveGraph.
  const saveMeta = useMutation({
    mutationFn: async ({ id, meta }: { id: string; meta: ProcessMeta }) => {
      const { error } = await supabase
        .from('processes')
        .update({ meta: meta as any } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_res, { id, meta }) => {
      qc.setQueryData<Process[]>(['processes'], (prev) =>
        (prev || []).map((p) => (p.id === id ? { ...p, meta } : p)),
      );
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: getErrorMessage(e) }),
  });

  return {
    processes: processesQuery.data || [],
    isLoading: processesQuery.isLoading,
    createProcess,
    renameProcess,
    deleteProcess,
    saveGraph,
    saveMeta,
  };
}
