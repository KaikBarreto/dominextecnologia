import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type ScheduleDevice = 'mobile' | 'desktop';

// Valor cru persistido por slot (mobile/desktop). Historicamente era só o
// período ('day' | 'week' | 'month'). A visão de lista (E4) reusa a MESMA
// coluna/mecanismo em vez de nascer uma preferência nova: o próprio
// Schedule.tsx codifica o par período+exibição num único texto (ex.:
// "day::list") e decodifica na leitura — aqui o hook só guarda string.
interface ScheduleViewModePref {
  mobile: string;
  desktop: string;
}

interface UserPreferencesData {
  schedule_view_mode_mobile: string | null;
  schedule_view_mode_desktop: string | null;
  finance_movements_include_card_purchases: boolean | null;
}

/**
 * Preferências do usuário persistidas no banco (own-row via RLS auth.uid()).
 *
 * Cobre a visualização da Agenda (Dia/Semana/Mês), guardada SEPARADA por
 * aparelho — celular e computador têm slots independentes. `scheduleViewMode` vem
 * `null` no 1º acesso (sem linha em user_preferences), e a tela decide o default.
 *
 * Também cobre `includeCardPurchasesInMovements` (Movimentações Financeiras >
 * Visão Geral): ao contrário do modo da Agenda, esta é a MESMA escolha em
 * qualquer aparelho — o CEO decidiu que essa preferência segue a PESSOA, não
 * o dispositivo. Por isso é uma coluna simples (sem sufixo mobile/desktop).
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
        .select('schedule_view_mode_mobile, schedule_view_mode_desktop, finance_movements_include_card_purchases')
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
            mobile: mobileMode ?? 'day',
            desktop: desktopMode ?? 'month',
          }
        : null,
    [hasPrefs, mobileMode, desktopMode],
  );

  const scheduleViewModeMutation = useMutation({
    mutationFn: async ({ device, mode }: { device: ScheduleDevice; mode: string }) => {
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
        finance_movements_include_card_purchases:
          old?.finance_movements_include_card_purchases ?? null,
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

  const setScheduleViewMode = (device: ScheduleDevice, mode: string) => {
    scheduleViewModeMutation.mutate({ device, mode });
  };

  // Preferência PESSOAL (não por aparelho, ver comentário do topo). `null` no
  // 1º acesso (sem linha em user_preferences) é tratado como "desligado" —
  // mesmo default que o antigo useState local da tela.
  const includeCardPurchasesInMovements =
    prefsQuery.data?.finance_movements_include_card_purchases ?? false;

  const includeCardPurchasesMutation = useMutation({
    mutationFn: async (value: boolean) => {
      if (!user?.id) throw new Error('Usuário não autenticado.');
      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          finance_movements_include_card_purchases: value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

      if (error) throw error;
    },
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserPreferencesData | null>(queryKey);

      queryClient.setQueryData<UserPreferencesData | null>(queryKey, (old) => ({
        schedule_view_mode_mobile: old?.schedule_view_mode_mobile ?? null,
        schedule_view_mode_desktop: old?.schedule_view_mode_desktop ?? null,
        finance_movements_include_card_purchases: value,
      }));

      return { previous };
    },
    onError: (_err, _value, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const setIncludeCardPurchasesInMovements = (value: boolean) => {
    includeCardPurchasesMutation.mutate(value);
  };

  return {
    scheduleViewMode,
    isLoading: prefsQuery.isLoading,
    setScheduleViewMode,
    includeCardPurchasesInMovements,
    setIncludeCardPurchasesInMovements,
  };
}
