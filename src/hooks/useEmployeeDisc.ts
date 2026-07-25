// ─────────────────────────────────────────────────────────────────────────────
// useEmployeeDisc — fronteira Supabase do Perfil Comportamental (DISC) no RH.
//
// Componente NUNCA chama supabase.from direto: tudo passa por aqui. Cobre:
//   • listAssessments(employeeId) → histórico de versões (desc por data).
//   • currentProfile(employeeId)  → última aplicação COMPLETED (perfil atual).
//   • generateLink({ employeeId, showResult? }) → cria uma linha pending e devolve
//                                    a URL pública amigável (slug-do-nome-<short_code>).
//                                    showResult=true/false grava show_result_to_employee;
//                                    showResult=undefined omite a coluna (NULL → herda empresa).
//
// A tabela disc_assessments tem RLS de gestor (can_manage_system) + multi-tenant
// (company_id). O public_short_code é gerado por trigger no INSERT — nunca
// enviamos daqui.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { buildSlugSegment } from '@/utils/prettyLinks';
import type { DiscScores } from '@/lib/disc/scoring';
import type { DiscFactor } from '@/lib/disc/questions';

/** Status de uma aplicação DISC. */
export type DiscAssessmentStatus = 'pending' | 'completed';

/** Uma linha de disc_assessments (o que o RH lê). */
export interface DiscAssessment {
  id: string;
  company_id: string;
  employee_id: string;
  public_short_code: string;
  status: DiscAssessmentStatus;
  answers: Record<string, number> | null;
  scores: DiscScores | null;
  primary_type: DiscFactor | null;
  secondary_type: DiscFactor | null;
  profile_code: string | null;
  locale: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
}

/** Monta a URL pública amigável de uma aplicação. */
export function buildDiscPublicUrl(employeeName: string, shortCode: string): string {
  const slug = buildSlugSegment([employeeName], shortCode);
  return `${window.location.origin}/avaliacao/${slug}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// useCompanyDiscProfiles — carrega em lote os perfis DISC de TODOS os
// funcionários da empresa (gestores lêem graças ao RLS existente).
//
// Retorna, por employee_id:
//   • latestCompleted → última aplicação com status='completed' (ou null)
//   • latestPending   → link mais recente ainda pendente (ou null)
//
// Client-side reduz pro mais recente por funcionário (ORDER BY completed_at
// desc vem do banco; depois agrupa). O hook não filtra por funcionário —
// carrega tudo de uma vez pra evitar N queries no grid.
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeDiscSummary {
  latestCompleted: DiscAssessment | null;
  latestPending: DiscAssessment | null;
}

export function useCompanyDiscProfiles() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['disc-assessments-company'],
    queryFn: async (): Promise<DiscAssessment[]> => {
      const { data, error } = await supabase
        .from('disc_assessments')
        .select(
          'id, company_id, employee_id, public_short_code, status, scores, primary_type, secondary_type, profile_code, locale, completed_at, created_by, created_at, answers',
        )
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DiscAssessment[];
    },
  });

  // Agrupa as avaliações por employee_id e seleciona a mais recente por status.
  const profilesByEmployee = useMemo<Record<string, EmployeeDiscSummary>>(() => {
    const map: Record<string, EmployeeDiscSummary> = {};
    for (const a of query.data ?? []) {
      if (!map[a.employee_id]) {
        map[a.employee_id] = { latestCompleted: null, latestPending: null };
      }
      const entry = map[a.employee_id];
      if (a.status === 'completed' && !entry.latestCompleted) {
        entry.latestCompleted = a;
      } else if (a.status === 'pending' && !entry.latestPending) {
        entry.latestPending = a;
      }
    }
    return map;
  }, [query.data]);

  // generateLink reutiliza a mesma lógica do hook individual — cria uma linha
  // pending para o funcionário especificado e invalida o cache da empresa.
  // showResult: true/false → grava show_result_to_employee; undefined → omite (NULL = herda empresa).
  const generateLink = useMutation({
    mutationFn: async ({
      employeeId: targetEmployeeId,
      showResult,
    }: {
      employeeId: string;
      showResult?: boolean | null;
    }): Promise<DiscAssessment> => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data: userData } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = {
        company_id,
        employee_id: targetEmployeeId,
        status: 'pending',
        created_by: userData.user?.id ?? null,
      };
      // Só inclui a coluna se o chamador passou um valor explícito (true/false).
      // undefined → omite → NULL no banco → herda config da empresa via COALESCE.
      if (showResult !== undefined && showResult !== null) {
        payload.show_result_to_employee = showResult;
      }
      const { data, error } = await supabase
        .from('disc_assessments')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as DiscAssessment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disc-assessments-company'] });
    },
    onError: (e: Error) =>
      toast({
        variant: 'destructive',
        title: getErrorMessage(e),
      }),
  });

  return {
    profilesByEmployee,
    isLoading: query.isLoading,
    generateLink,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// useEmployeeDiscHistory — TODAS as avaliações CONCLUÍDAS de um funcionário,
// ordenadas por completed_at desc. É a fonte da aba "Histórico" da página de
// Perfil Comportamental: linha do tempo + radar de evolução (uma camada por
// avaliação). RLS de gestor + multi-tenant já garantem que só vêm as da empresa.
//
// Diferente de useEmployeeDisc (que traz também os pending): aqui filtramos só
// status='completed' com scores válidos — o que a evolução consegue plotar.
// ─────────────────────────────────────────────────────────────────────────────
export function useEmployeeDiscHistory(employeeId: string | null) {
  const query = useQuery({
    queryKey: ['disc-assessments-history', employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<DiscAssessment[]> => {
      const { data, error } = await supabase
        .from('disc_assessments')
        .select(
          'id, company_id, employee_id, public_short_code, status, scores, primary_type, secondary_type, profile_code, locale, completed_at, created_by, created_at, answers',
        )
        .eq('employee_id', employeeId!)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as DiscAssessment[];
    },
  });

  // Só as concluídas COM scores plotáveis (defensivo contra linha corrompida).
  const history = useMemo(
    () => (query.data ?? []).filter((a) => !!a.scores && !!a.profile_code),
    [query.data],
  );

  return {
    history,
    isLoading: query.isLoading,
  };
}

export function useEmployeeDisc(employeeId: string | null) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Histórico completo (todas as versões daquele funcionário), mais recente primeiro.
  const assessmentsQuery = useQuery({
    queryKey: ['disc-assessments', employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<DiscAssessment[]> => {
      const { data, error } = await supabase
        .from('disc_assessments')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('completed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DiscAssessment[];
    },
  });

  const assessments = assessmentsQuery.data ?? [];

  // Perfil atual = última aplicação concluída.
  const currentProfile = assessments.find((a) => a.status === 'completed') ?? null;
  // Link pendente aberto (aguardando resposta), se houver.
  const pendingAssessment = assessments.find((a) => a.status === 'pending') ?? null;

  // Gera um novo link (nova aplicação pending). Retorna a linha criada com o
  // public_short_code (gerado por trigger). A URL é montada pelo chamador via
  // buildDiscPublicUrl(employeeName, short_code).
  // showResult: true/false → grava show_result_to_employee; undefined → omite (NULL = herda empresa).
  const generateLink = useMutation({
    mutationFn: async ({
      employeeId: targetEmployeeId,
      showResult,
    }: {
      employeeId: string;
      showResult?: boolean | null;
    }): Promise<DiscAssessment> => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data: userData } = await supabase.auth.getUser();
      const payload: Record<string, unknown> = {
        company_id,
        employee_id: targetEmployeeId,
        status: 'pending',
        created_by: userData.user?.id ?? null,
      };
      // Só inclui a coluna se o chamador passou um valor explícito (true/false).
      // undefined → omite → NULL no banco → herda config da empresa via COALESCE.
      if (showResult !== undefined && showResult !== null) {
        payload.show_result_to_employee = showResult;
      }
      const { data, error } = await supabase
        .from('disc_assessments')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as DiscAssessment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disc-assessments', employeeId] });
    },
    onError: (e: Error) =>
      toast({
        variant: 'destructive',
        title: getErrorMessage(e),
      }),
  });

  return {
    assessments,
    currentProfile,
    pendingAssessment,
    isLoading: assessmentsQuery.isLoading,
    generateLink,
  };
}
