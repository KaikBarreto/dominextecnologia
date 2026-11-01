import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { SystemNotice } from '@/lib/systemNotices';

/**
 * CRUD dos avisos do sistema no painel master (Auctus).
 *
 * Quem pode escrever é decidido pela RLS de `admin_notices`: somente
 * `super_admin`, a mesma régua da rota master-only. O gate de UI é 2ª camada.
 */
export type AdminNoticeInput = {
  title: string;
  message: string;
  variant: SystemNotice['variant'];
  scope: SystemNotice['scope'];
  is_dismissible: boolean;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  target_audience: SystemNotice['target_audience'];
  target_ids: string[];
  action_label: string | null;
  action_url: string | null;
};

export interface AdminNotice extends SystemNotice {
  created_by: string | null;
}

const noticeError = (action: string) => `Não foi possível ${action}. Tente novamente em alguns instantes.`;

export function useAdminNotices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const noticesQuery = useQuery({
    queryKey: ['admin', 'notices'],
    queryFn: async () => {
      const { data, error } = await supabase.from('admin_notices')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AdminNotice[];
    },
  });

  // Quantas pessoas já dispensaram cada aviso. Serve de indicador de leitura
  // (a policy `admin_notice_dismissals_select_admin` libera só a leitura).
  const dismissalsQuery = useQuery({
    queryKey: ['admin', 'notices', 'dismiss-count'],
    queryFn: async () => {
      const { data, error } = await supabase.from('admin_notice_dismissals').select(
        'notice_id',
      );
      if (error) throw error;
      const acc: Record<string, number> = {};
      for (const row of (data || []) as { notice_id: string }[]) {
        acc[row.notice_id] = (acc[row.notice_id] ?? 0) + 1;
      }
      return acc;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'notices'] });
  };

  const createNotice = useMutation({
    mutationFn: async (input: AdminNoticeInput) => {
      const { error } = await supabase.from('admin_notices').insert({
        ...input,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Aviso publicado' });
    },
    onError: () =>
      toast({ title: 'Erro ao publicar aviso', description: noticeError('publicar o aviso'), variant: 'destructive' }),
  });

  const updateNotice = useMutation({
    mutationFn: async ({ id, ...input }: AdminNoticeInput & { id: string }) => {
      const { error } = await supabase.from('admin_notices')
        .update(input)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Aviso atualizado' });
    },
    onError: () =>
      toast({ title: 'Erro ao atualizar aviso', description: noticeError('atualizar o aviso'), variant: 'destructive' }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('admin_notices')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      invalidate();
      toast({ title: variables.isActive ? 'Aviso ativado' : 'Aviso desativado' });
    },
    onError: () =>
      toast({ title: 'Erro ao alterar o aviso', description: noticeError('alterar o aviso'), variant: 'destructive' }),
  });

  const deleteNotice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_notices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Aviso excluído' });
    },
    onError: () =>
      toast({ title: 'Erro ao excluir aviso', description: noticeError('excluir o aviso'), variant: 'destructive' }),
  });

  return {
    notices: noticesQuery.data ?? [],
    isLoading: noticesQuery.isLoading || dismissalsQuery.isLoading,
    isError: noticesQuery.isError || dismissalsQuery.isError,
    refetch: async () => Promise.all([noticesQuery.refetch(), dismissalsQuery.refetch()]),
    dismissCount: dismissalsQuery.data ?? {},
    createNotice: createNotice.mutateAsync,
    updateNotice: updateNotice.mutateAsync,
    toggleActive: toggleActive.mutateAsync,
    deleteNotice: deleteNotice.mutateAsync,
    isSaving: createNotice.isPending || updateNotice.isPending,
    isMutating: createNotice.isPending || updateNotice.isPending || toggleActive.isPending || deleteNotice.isPending,
  };
}
