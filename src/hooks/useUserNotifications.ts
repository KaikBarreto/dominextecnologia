import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Notificação persistida em `user_notifications` (banco).
 *
 * - Realtime subscription filtra por `user_id` server-side pra não receber
 *   eventos alheios (RLS dá double-guard, mas filtro no canal é UX).
 * - Índice parcial em `read_at IS NULL` mantém o badge rápido mesmo com
 *   histórico longo (limit 50 na query principal).
 * - Cleanup automático diário (cron pg_cron) apaga rows >30d OU
 *   `expires_at` no passado — fora do escopo deste hook.
 *
 * Tipagem em interface local até `types.ts` ser regenerado pelo dev-database.
 * Usamos `(supabase.from('user_notifications' as any) as any)` enquanto isso.
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
}

export function useUserNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Padrão Dominex de realtime: guarda o channel em ref pra garantir cleanup
  // mesmo em re-renders agressivos (ver useForcedLogout.ts).
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['user-notifications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [] as UserNotification[];
      const { data, error } = await (
        supabase.from('user_notifications' as any) as any
      )
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as UserNotification[];
    },
    enabled: !!user?.id,
  });

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
      const { error } = await (
        supabase.from('user_notifications' as any) as any
      )
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notifications', user?.id] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await (
        supabase.from('user_notifications' as any) as any
      )
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notifications', user?.id] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (
        supabase.from('user_notifications' as any) as any
      )
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-notifications', user?.id] });
    },
  });

  const unreadCount = notifications.filter((n) => n.read_at === null).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
    dismiss: (id: string) => dismissMutation.mutate(id),
  };
}
