import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ViewMode } from '@/components/schedule/ScheduleHeader';

type ScheduleDevice = 'mobile' | 'desktop';

interface ScheduleViewModePref {
  mobile: ViewMode;
  desktop: ViewMode;
}

interface UserPreferencesData {
  schedule_view_mode_mobile: string | null;
  schedule_view_mode_desktop: string | null;
}

/**
 * Preferências do usuário persistidas no banco (own-row via RLS auth.uid()).
 *
 * Hoje cobre só a visualização da Agenda (Dia/Semana/Mês), guardada SEPARADA por
 * aparelho — celular e computador têm slots independentes. `scheduleViewMode` vem
 * `null` no 1º acesso (sem linha em user_preferences), e a tela decide o default.
 */
export function useUserPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['user-preferences', user?.id];

  const prefsQuery = useQuery({
    queryKey,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('schedule_view_mode_mobile, schedule_view_mode_desktop')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) throw error;
      return (data as UserPreferencesData) ?? null;
    },
  });

  // Memoizado por valor pra dar identidade estável: o consumidor usa este objeto
  // em deps de effect (hidratação do viewMode) e não pode re-disparar a cada render.
  const mobileMode = prefsQuery.data?.schedule_view_mode_mobile ?? null;
  const desktopMode = prefsQuery.data?.schedule_view_mode_desktop ?? null;
  const hasPrefs = !!prefsQuery.data;
  const scheduleViewMode: ScheduleViewModePref | null = useMemo(
    () =>
      hasPrefs
        ? {
            mobile: (mobileMode as ViewMode) ?? 'day',
            desktop: (desktopMode as ViewMode) ?? 'month',
          }
        : null,
    [hasPrefs, mobileMode, desktopMode],
  );

  const scheduleViewModeMutation = useMutation({
    mutationFn: async ({ device, mode }: { device: ScheduleDevice; mode: ViewMode }) => {
      if (!user?.id) throw new Error('Usuário não autenticado.');
      const column =
        device === 'mobile' ? 'schedule_view_mode_mobile' : 'schedule_view_mode_desktop';

      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          [column]: mode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

      if (error) throw error;
    },
    // Update otimista: a UI não pode piscar entre o clique e o round-trip.
    onMutate: async ({ device, mode }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserPreferencesData | null>(queryKey);
      const column =
        device === 'mobile' ? 'schedule_view_mode_mobile' : 'schedule_view_mode_desktop';

      queryClient.setQueryData<UserPreferencesData | null>(queryKey, (old) => ({
        schedule_view_mode_mobile: old?.schedule_view_mode_mobile ?? null,
        schedule_view_mode_desktop: old?.schedule_view_mode_desktop ?? null,
        [column]: mode,
      }));

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const setScheduleViewMode = (device: ScheduleDevice, mode: ViewMode) => {
    scheduleViewModeMutation.mutate({ device, mode });
  };

  return {
    scheduleViewMode,
    isLoading: prefsQuery.isLoading,
    setScheduleViewMode,
  };
}
