import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCompany } from '@/hooks/useUserCompany';
import {
  filterVisibleNotices,
  type NoticeDismissal,
  type NoticeScope,
  type SystemNotice,
} from '@/lib/systemNotices';

/**
 * Avisos do sistema vistos pelo TENANT.
 *
 * Quem decide o que o tenant pode ler é a RLS (`admin_notices_select_tenant`);
 * `filterVisibleNotices` é a 2ª camada e resolve o que a RLS não sabe (dispensa
 * por usuário e escopo de tela).
 *
 * ⚠️ NÃO usar no painel master: lá o super_admin passa pela policy de admin e
 * enxerga TODOS os avisos, de todas as empresas. O `SystemNoticeBanners` passa
 * `enabled = !isAdminUser` — o hook não pode sair do caminho de render (regra
 * dos hooks), então a desativação vem por parâmetro, não por early return.
 *
 * Tipagem em interface local (`SystemNotice`) até o `types.ts` ser regenerado
 * pelo dev-database. Mesmo padrão de `useUserNotifications`.
 */
export function useSystemNotices(scope: NoticeScope, enabled = true) {
  const { user } = useAuth();
  const { companyId, isLoading: companyLoading } = useUserCompany();
  const queryClient = useQueryClient();

  const { data: notices = [], isLoading: noticesLoading } = useQuery({
    queryKey: ['system-notices'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('admin_notices' as any) as any)
        .select(
          'id, title, message, variant, scope, is_dismissible, is_active, starts_at, ends_at, target_audience, target_ids, action_label, action_url, created_at, updated_at',
        )
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as SystemNotice[];
    },
    // Espera a empresa resolver: sem ela, o recorte por tenant não dá pra
    // afirmar e a lista cacheada sairia sem os avisos direcionados.
    enabled: enabled && !!user?.id && !companyLoading,
    staleTime: 1000 * 60 * 5,
  });

  const { data: dismissals = [] } = useQuery({
    queryKey: ['system-notice-dismissals', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('admin_notice_dismissals' as any) as any)
        .select('notice_id, dismissed_at');
      if (error) throw error;
      return (data || []) as NoticeDismissal[];
    },
    enabled: enabled && !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const visible = useMemo(
    () =>
      filterVisibleNotices(notices, {
        userId: user?.id ?? null,
        companyId,
        scope,
        dismissals,
      }),
    [notices, user?.id, companyId, scope, dismissals],
  );

  const dismiss = useMutation({
    mutationFn: async (noticeId: string) => {
      if (!user?.id) return;
      // Upsert: redispensar um aviso que foi editado só atualiza dismissed_at.
      const { error } = await (supabase.from('admin_notice_dismissals' as any) as any).upsert(
        { notice_id: noticeId, user_id: user.id, dismissed_at: new Date().toISOString() },
        { onConflict: 'notice_id,user_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-notice-dismissals', user?.id] });
    },
  });

  return {
    notices: visible,
    isLoading: noticesLoading || companyLoading,
    dismiss: dismiss.mutate,
  };
}
