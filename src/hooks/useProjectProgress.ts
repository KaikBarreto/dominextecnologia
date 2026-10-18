import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Uma linha da RPC `public.project_progress_summary()` (Onda 1 de "Projetos",
 * migration 20261017182000_projetos_onda1_progresso_e_limpeza.sql).
 *
 * 🔴 `active_count` É O DENOMINADOR do progresso, não "cards em aberto": ele
 * conta TODO card não-perdido, GANHOS INCLUSIVE.
 *     progresso = done_count / active_count          ✅
 *     progresso = done_count / (done_count+active_count)  ❌ ERRADO
 * Use `projectProgressPct` (src/lib/projectProgress.ts) pra converter isto
 * num percentual — nunca faça a divisão aqui/na tela.
 */
export interface ProjectProgressRow {
  project_id: string;
  done_count: number;
  active_count: number;
  lost_count: number;
  has_won_stage: boolean;
}

const NO_PROGRESS: ProjectProgressRow[] = [];

/**
 * Progresso de TODAS as obras da empresa, numa chamada só (requisito: a
 * listagem de projetos não pode disparar uma RPC por linha). A RPC não
 * recebe argumento — o filtro de tenant é a própria fronteira dela
 * (`WHERE company_id = get_user_company_id(auth.uid())`), então aqui é só
 * ler e indexar por `project_id`.
 */
export function useProjectProgress() {
  const { data: rows = NO_PROGRESS, isLoading, error } = useQuery({
    queryKey: ['project_progress'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('project_progress_summary');
      if (error) throw error;
      return (data ?? []) as ProjectProgressRow[];
    },
  });

  const byProjectId = useMemo(() => new Map(rows.map((r) => [r.project_id, r])), [rows]);

  const getProgress = (projectId: string): ProjectProgressRow | null =>
    byProjectId.get(projectId) ?? null;

  return { rows, isLoading, error, getProgress };
}
