import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Notificação do painel master Auctus, persistida em `admin_notifications`.
 *
 * A RLS (Fase 1) já filtra o que cada usuário lê:
 *   - `target_user_id = auth.uid()`  → notificação direcionada (ex.: novo lead
 *     roteado pro vendedor dono via rodízio); OU
 *   - `target_user_id IS NULL AND is_admin_user(auth.uid())` → aviso geral do
 *     painel (reconciliação Asaas, etc.), visível a qualquer admin.
 * Por isso o SELECT não precisa (e não deve) filtrar por usuário no client — a
 * fronteira de segurança é o banco; o hook só ordena e conta.
 *
 * Tipagem em interface local até `types.ts` ser regenerado pelo dev-database
 * (coluna `target_user_id` recém-adicionada). Usamos o mesmo padrão de cast do
 * `useUserNotifications` enquanto isso.
 */
export interface AdminNotification {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  data: Record<string, any> | null;
  is_read: boolean;
  target_user_id: string | null;
  created_at: string;
}

export function useAdminNotifications() {
  const { user, isAdminUser } = useAuth();
  const queryClient = useQueryClient();

  // Só busca pra usuário do painel admin (master ou vendedor vinculado). Usuário
  // de tenant nunca lê `admin_notifications` (a RLS bloquearia, mas evitamos o
  // request à toa).
  const enabled = !!user?.id && isAdminUser;

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['admin-notifications', user?.id],
    enabled,
    // Sem realtime (o painel admin não usa canais hoje); revalida a cada 60s e
    // no foco da aba pra o vendedor ver o lead novo do rodízio sem F5.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await (
        supabase.from('admin_notifications' as any) as any
      )
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as AdminNotification[];
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (
        supabase.from('admin_notifications' as any) as any
      )
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications', user?.id] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      // A policy de UPDATE self-scope só deixa marcar o que o usuário já enxerga;
      // filtrar `is_read=false` reduz o número de linhas tocadas.
      const { error } = await (
        supabase.from('admin_notifications' as any) as any
      )
        .update({ is_read: true })
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications', user?.id] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
  };
}
