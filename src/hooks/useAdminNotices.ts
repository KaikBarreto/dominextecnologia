import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import type { SystemNotice } from '@/lib/systemNotices';

/**
 * CRUD dos avisos do sistema no painel master (Auctus).
 *
 * Quem pode escrever é decidido pela RLS de `admin_notices`:
 * `super_admin` OU admin com a permissão `admin_avisos` (Forma A, permissão
 * específica — não `is_admin_user()`). O gate de UI é 2ª camada.
 *
 * Tipagem em interface local até o `types.ts` ser regenerado pelo dev-database
 * (mesmo padrão de `useUserNotifications`).
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

export function useAdminNotices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notices = [], isLoading } = useQuery({
    queryKey: ['admin-notices'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('admin_notices' as any) as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AdminNotice[];
    },
  });

  // Quantas pessoas já dispensaram cada aviso. Serve de indicador de leitura
  // (a policy `admin_notice_dismissals_select_admin` libera só a leitura).
  const { data: dismissCount = {} } = useQuery({
    queryKey: ['admin-notice-dismiss-count'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('admin_notice_dismissals' as any) as any).select(
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
    queryClient.invalidateQueries({ queryKey: ['admin-notices'] });
    queryClient.invalidateQueries({ queryKey: ['admin-notice-dismiss-count'] });
  };

  const createNotice = useMutation({
    mutationFn: async (input: AdminNoticeInput) => {
      const { error } = await (supabase.from('admin_notices' as any) as any).insert({
        ...input,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Aviso publicado' });
    },
    onError: (error) =>
      toast({ title: 'Erro ao publicar aviso', description: getErrorMessage(error), variant: 'destructive' }),
  });

  const updateNotice = useMutation({
    mutationFn: async ({ id, ...input }: AdminNoticeInput & { id: string }) => {
      const { error } = await (supabase.from('admin_notices' as any) as any)
        .update(input)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Aviso atualizado' });
    },
    onError: (error) =>
      toast({ title: 'Erro ao atualizar aviso', description: getErrorMessage(error), variant: 'destructive' }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await (supabase.from('admin_notices' as any) as any)
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      invalidate();
      toast({ title: variables.isActive ? 'Aviso ativado' : 'Aviso desativado' });
    },
    onError: (error) =>
      toast({ title: 'Erro ao alterar o aviso', description: getErrorMessage(error), variant: 'destructive' }),
  });

  const deleteNotice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('admin_notices' as any) as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Aviso excluído' });
    },
    onError: (error) =>
      toast({ title: 'Erro ao excluir aviso', description: getErrorMessage(error), variant: 'destructive' }),
  });

  return {
    notices,
    isLoading,
    dismissCount,
    createNotice: createNotice.mutate,
    updateNotice: updateNotice.mutate,
    toggleActive: toggleActive.mutate,
    deleteNotice: deleteNotice.mutate,
    isSaving: createNotice.isPending || updateNotice.isPending,
  };
}
