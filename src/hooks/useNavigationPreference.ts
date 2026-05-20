import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type NavigationStyle = 'sidebar' | 'topbar';

/**
 * Persistência da preferência sidebar/topbar em `profiles.navigation_style`.
 *
 * - Default `'sidebar'` quando o usuário está deslogado ou ainda carregando.
 * - Stale time alto (30min): a preferência muda raramente, não justifica refetch.
 * - `refetchOnMount: false` + `refetchOnWindowFocus: false`: evita flicker do shell
 *   quando o usuário troca de aba ou navega rapidamente.
 * - Filtra por `user_id` (FK pra auth.users), não por `id` (PK do profile).
 */
export function useNavigationPreference() {
  const queryClient = useQueryClient();

  const { data: navigationStyle = 'sidebar' as NavigationStyle, isLoading } = useQuery({
    queryKey: ['navigation-preference'],
    queryFn: async (): Promise<NavigationStyle> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 'sidebar';

      const { data, error } = await supabase
        .from('profiles')
        .select('navigation_style')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[useNavigationPreference] erro ao buscar preferência:', error);
        return 'sidebar';
      }

      const value = data?.navigation_style;
      if (value === 'sidebar' || value === 'topbar') return value;
      return 'sidebar';
    },
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: async (style: NavigationStyle) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('profiles')
        .update({ navigation_style: style })
        .eq('user_id', user.id);

      if (error) throw error;
      return style;
    },
    onMutate: async (style) => {
      await queryClient.cancelQueries({ queryKey: ['navigation-preference'] });
      const previous = queryClient.getQueryData<NavigationStyle>(['navigation-preference']);
      queryClient.setQueryData<NavigationStyle>(['navigation-preference'], style);
      return { previous };
    },
    onSuccess: (style) => {
      const label = style === 'sidebar' ? 'Menu Lateral' : 'Menu Superior';
      toast.success(`Estilo de navegação alterado para ${label}`);
    },
    onError: (error, _style, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['navigation-preference'], context.previous);
      }
      console.error('[useNavigationPreference] erro ao salvar:', error);
      toast.error('Erro ao salvar preferência');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['navigation-preference'] });
    },
  });

  return {
    navigationStyle,
    setNavigationStyle: updateMutation.mutate,
    isLoading,
    isUpdating: updateMutation.isPending,
  };
}
