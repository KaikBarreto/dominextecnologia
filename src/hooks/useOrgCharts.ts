import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

// ── Modelo do grafo (React Flow) gravado em org_charts.data ────────────────────
// Guardamos só o essencial: id, tipo, posição e o `data` do nó (sem campos
// transitórios do React Flow como `selected`/`dragging`/`measured`).
export interface OrgNodeData {
  // Index signature exigida pelo React Flow v12 (Node<T extends Record<string, unknown>>).
  [key: string]: unknown;
  kind: 'employee' | 'manual';
  /** Presente quando kind === 'employee'. Nome/cargo/foto resolvem NO RENDER por este id. */
  employeeId?: string;
  /** Snapshot de nome (fallback se o funcionário for removido, ou nome do nó manual). */
  name: string;
  /** Snapshot de cargo (fallback / cargo do nó manual). */
  role?: string;
  /** Rótulo do setor (opcional). */
  sector?: string;
  /** Cor do setor escolhida pelo usuário (hex). Única cor fora dos tokens permitida. */
  sectorColor?: string;
}

export interface OrgNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: OrgNodeData;
}

export interface OrgEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface OrgChartGraph {
  nodes: OrgNode[];
  edges: OrgEdge[];
}

export interface OrgChart {
  id: string;
  name: string;
  data: OrgChartGraph;
  /** Código curto público (12 chars base32) — usado no deep-link amigável. */
  public_short_code: string | null;
  created_at: string;
  updated_at: string;
}

const EMPTY_GRAPH: OrgChartGraph = { nodes: [], edges: [] };

function normalizeGraph(raw: unknown): OrgChartGraph {
  if (!raw || typeof raw !== 'object') return EMPTY_GRAPH;
  const g = raw as Partial<OrgChartGraph>;
  return {
    nodes: Array.isArray(g.nodes) ? (g.nodes as OrgNode[]) : [],
    edges: Array.isArray(g.edges) ? (g.edges as OrgEdge[]) : [],
  };
}

/**
 * FRONTEIRA Supabase dos organogramas (tabela org_charts, RLS multi-tenant).
 * CRUD: listar por empresa, criar(name), renomear, excluir, e salvar o grafo
 * (jsonb) por id. Componentes NUNCA chamam supabase.from direto.
 */
export function useOrgCharts() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const chartsQuery = useQuery({
    queryKey: ['org-charts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_charts')
        .select('id, name, data, public_short_code, created_at, updated_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        data: normalizeGraph(row.data),
        public_short_code: row.public_short_code ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })) as OrgChart[];
    },
  });

  const createChart = useMutation({
    mutationFn: async (name: string) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('org_charts')
        .insert({
          name,
          company_id,
          created_by: userData.user?.id ?? null,
          data: EMPTY_GRAPH as any,
        } as any)
        .select('id, name, data, public_short_code, created_at, updated_at')
        .single();
      if (error) throw error;
      return data;
    },
    // Semeia o novo organograma no cache ANTES do refetch, para o deep-link
    // (navegação pós-criação) já encontrar o short_code e montar o link amigável.
    onSuccess: (row: any) => {
      if (row?.id) {
        qc.setQueryData<OrgChart[]>(['org-charts'], (prev) => {
          const next = prev ? [...prev] : [];
          if (!next.some((c) => c.id === row.id)) {
            next.push({
              id: row.id,
              name: row.name,
              data: normalizeGraph(row.data),
              public_short_code: row.public_short_code ?? null,
              created_at: row.created_at,
              updated_at: row.updated_at,
            });
          }
          return next;
        });
      }
      qc.invalidateQueries({ queryKey: ['org-charts'] });
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const renameChart = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('org_charts').update({ name } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-charts'] }),
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  const deleteChart = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('org_charts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-charts'] }),
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  // Auto-save do grafo. Retorna a promise pra quem quiser encadear (selo de status).
  const saveGraph = useMutation({
    mutationFn: async ({ id, graph }: { id: string; graph: OrgChartGraph }) => {
      const { error } = await supabase
        .from('org_charts')
        .update({ data: graph as any } as any)
        .eq('id', id);
      if (error) throw error;
    },
    // Otimista: atualiza o cache local sem refetch (evita "piscar" o canvas).
    onSuccess: (_res, { id, graph }) => {
      qc.setQueryData<OrgChart[]>(['org-charts'], (prev) =>
        (prev || []).map((c) => (c.id === id ? { ...c, data: graph } : c)),
      );
    },
    onError: (e: Error) =>
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: getErrorMessage(e) }),
  });

  return {
    charts: chartsQuery.data || [],
    isLoading: chartsQuery.isLoading,
    createChart,
    renameChart,
    deleteChart,
    saveGraph,
  };
}
