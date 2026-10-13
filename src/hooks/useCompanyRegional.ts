import { useCompanySettings } from '@/hooks/useCompanySettings';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '@/lib/i18n/regionalDefaults';
import { DEFAULT_COUNTRY_CODE } from '@/lib/i18n/countries';

// ─────────────────────────────────────────────────────────────────────────────
// i18n do APP LOGADO — moeda e fuso são da EMPRESA (não do usuário): o mesmo
// dinheiro/horário não pode aparecer diferente pra dois usuários da mesma empresa.
//
// Fase 0: só LEITURA. O setter (Configurações → Regional) vem na fase da UI.
// Defaults: BRL / America/Sao_Paulo enquanto carrega ou se a empresa não definiu.
// ─────────────────────────────────────────────────────────────────────────────

interface UseCompanyRegionalResult {
  countryCode: string;
  currency: string;
  timezone: string;
  isLoading: boolean;
}

export function useCompanyRegional(): UseCompanyRegionalResult {
  const { settings, isLoading } = useCompanySettings();

  return {
    countryCode: settings?.country_code || DEFAULT_COUNTRY_CODE,
    currency: settings?.currency || DEFAULT_CURRENCY,
    timezone: settings?.timezone || DEFAULT_TIMEZONE,
    isLoading,
  };
}
