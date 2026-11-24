import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Notificação persistida em `user_notifications` (banco).
 *
 * - Realtime subscription filtra por `user_id` server-side pra não receber
 *   eventos alheios (RLS dá double-guard, mas filtro no canal é UX).
 * - O histórico visual continua limitado a 50 itens, mas o contador vem de
 *   RPC própria e por isso não subconta quando há mais de 50 não lidas.
 * - Cleanup automático diário (cron pg_cron) apaga rows >30d OU
 *   `expires_at` no passado — fora do escopo deste hook.
 *
 * - Mutações passam por RPCs estreitas: o usuário não recebe UPDATE/DELETE
 *   arbitrário sobre a linha persistida para auditoria.
 */
export interface UserNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  action_url: string | null;
  icon: string;
  read_at: string | null;
  created_at: string;
  expires_at: string | null;
  company_id: string | null;
  event_id: string | null;
  category: string;
  priority: string;
  entity_type: string | null;
  entity_id: string | null;
  dismissed_at: string | null;
  in_app_visible: boolean;
}

export function useUserNotifications() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  // Padrão Dominex de realtime: guarda o channel em ref pra garantir cleanup
  // mesmo em re-renders agressivos (ver useForcedLogout.ts).
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['user-notifications', user?.id, companyId],
    queryFn: async () => {
      if (!user?.id || !companyId) {
        return { notifications: [] as UserNotification[], unreadCount: 0 };
      }

      const [notificationsResult, countResult] = await Promise.all([
        supabase
          .from('user_notifications')
          .select('*')
          .eq('company_id', companyId)
          .eq('in_app_visible', true)
          .is('dismissed_at', null)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.rpc('count_unread_user_notifications', { _company_id: companyId }),
      ]);

      if (notificationsResult.error) throw notificationsResult.error;
      if (countResult.error) throw countResult.error;

      const notifications = (notificationsResult.data || []).map((notification) => ({
        ...notification,
        icon: notification.icon ?? 'bell',
      })) as UserNotification[];

      return { notifications, unreadCount: Number(countResult.data ?? 0) };
    },
    enabled: !!user?.id && !!companyId,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // Realtime: invalida query em qualquer INSERT/UPDATE/DELETE do user atual.
  // Filter server-side por `user_id=eq.${user.id}` (RLS já segura, mas o filtro
  // no canal evita receber eventos que iriam ser descartados depois).
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`user_notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['user-notifications', user.id] });
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, queryClient]);

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('mark_user_notification_read', {
        _notification_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notifications', user?.id] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) return;
      const { error } = await supabase.rpc('mark_all_user_notifications_read', {
        _company_id: companyId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notifications', user?.id] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('dismiss_user_notification', {
        _notification_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notifications', user?.id] });
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
    dismiss: (id: string) => dismissMutation.mutate(id),
  };
}
