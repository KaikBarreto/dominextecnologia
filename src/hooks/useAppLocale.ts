import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { DEFAULT_LOCALE, isLocaleCode, type LocaleCode } from '@/lib/i18n/locales';
import { detectMachineLocale } from '@/lib/i18n/detectLocale';

// ─────────────────────────────────────────────────────────────────────────────
// i18n do APP LOGADO — resolução do IDIOMA em cascata (Fase 0, só o motor).
//
// O app roda em rota SEM prefixo (diferente do site, que resolve pela URL), então
// o idioma vem das fontes abaixo, na ordem de prioridade:
//   1) user_preferences.language  (escolha EXPLÍCITA do usuário, own-row no banco)
//   2) detectMachineLocale()       (navigator.language → en|es|fr; pt e unmapped → null)
//   3) company_settings.language  (padrão da empresa, semeado no cadastro)
//   4) 'pt-br'                    (fallback global)
//
// Ou seja: se o usuário nunca escolheu um idioma, o app usa o da máquina
// automaticamente (en/es/fr). Se a máquina não mapeia (de, ja, pt…), usa o da
// empresa. Só a escolha explícita via seletor (setUserLanguage) grava no banco
// e sobrepõe tudo. A detecção de máquina é em runtime, sem persistência.
//
// Enquanto qualquer fonte carrega, o resultado é 'pt-br' — nunca bloqueia render.
// ─────────────────────────────────────────────────────────────────────────────

interface UseAppLocaleResult {
  locale: LocaleCode;
  isLoading: boolean;
  setUserLanguage: (language: LocaleCode) => Promise<void>;
}

/** Normaliza um valor cru do banco pra um LocaleCode válido (ou null). */
function toLocale(value: string | null | undefined): LocaleCode | null {
  return isLocaleCode(value) ? value : null;
}

export function useAppLocale(): UseAppLocaleResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { settings, isLoading: companyLoading } = useCompanySettings();

  const queryKey = ['user-language', user?.id ?? null];

  // Idioma do usuário (own-row). Query enxuta e independente das outras prefs
  // pra não acoplar ao useUserPreferences (que hoje só cobre a Agenda).
  const userLangQuery = useQuery({
    queryKey,
    enabled: !!user?.id,
    queryFn: async (): Promise<LocaleCode | null> => {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('language')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return toLocale((data as { language?: string | null } | null)?.language);
    },
  });

  const userLanguage = userLangQuery.data ?? null;
  // Detecção de máquina: avaliada em runtime, sem persistência.
  // Retorna null se o navigator.language não mapear claramente (de, pt, ja…).
  const machineLanguage = useMemo(() => detectMachineLocale(), []);
  const companyLanguage = toLocale(settings?.language);

  // Cascata: explícito → máquina → empresa → fallback global
  const locale: LocaleCode = userLanguage ?? machineLanguage ?? companyLanguage ?? DEFAULT_LOCALE;

  // isLoading só enquanto NÃO temos ainda nenhuma fonte resolvida. Como o default
  // é pt-br, o render nunca espera — mas expomos o flag pra quem quiser evitar
  // um flash de idioma (ex.: pintar spinner com o idioma certo).
  const isLoading =
    (!!user?.id && userLangQuery.isLoading) || companyLoading;

  const setLanguageMutation = useMutation({
    mutationFn: async (language: LocaleCode) => {
      if (!user?.id) throw new Error('Usuário não autenticado.');
      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          language,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    // Otimista: a troca de idioma aplica na hora, sem esperar o round-trip.
    onMutate: async (language) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<LocaleCode | null>(queryKey);
      queryClient.setQueryData<LocaleCode | null>(queryKey, language);
      return { previous };
    },
    onError: (_err, _language, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const setUserLanguage = useMemo(
    () => async (language: LocaleCode) => {
      await setLanguageMutation.mutateAsync(language);
    },
    [setLanguageMutation],
  );

  return { locale, isLoading, setUserLanguage };
}
