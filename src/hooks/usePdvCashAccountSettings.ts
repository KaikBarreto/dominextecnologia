import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { PDV_CASH_V2_QUERY_ROOT } from '@/hooks/usePdvCashSessionsV2';

type RpcResult = { data: unknown; error: { code?: string; details?: string; message?: string } | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

export interface PdvCashAccountOption {
  id: string;
  name: string;
}

export interface PdvCashAccountSettingsData {
  selectedAccount: PdvCashAccountOption | null;
  accounts: PdvCashAccountOption[];
  openSessions: number;
}

const ROOT = ['pdv-cash-account-settings-v2'] as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Não foi possível confirmar ${label}. Atualize a página e tente novamente.`);
  }
  return value;
}

function projectAccount(value: unknown): PdvCashAccountOption {
  const account = record(value);
  return {
    id: requiredText(account.id, 'a conta de dinheiro'),
    name: requiredText(account.name, 'o nome da conta de dinheiro'),
  };
}

export function projectPdvCashAccountSettings(value: unknown): PdvCashAccountSettingsData {
  const payload = record(value);
  if (!Array.isArray(payload.accounts)) {
    throw new Error('Não foi possível carregar a conta de dinheiro do PDV. Atualize a página e tente novamente.');
  }
  const openSessions = typeof payload.open_sessions === 'number'
    ? payload.open_sessions
    : Number(payload.open_sessions);
  if (!Number.isInteger(openSessions) || openSessions < 0) {
    throw new Error('Não foi possível confirmar os caixas abertos. Atualize a página e tente novamente.');
  }
  return {
    selectedAccount: payload.selected_account == null ? null : projectAccount(payload.selected_account),
    accounts: payload.accounts.map(projectAccount),
    openSessions,
  };
}

function safeCashAccountError(error: RpcResult['error']): Error {
  const detail = `${error?.details ?? ''}`.toLowerCase();
  if (detail.includes('pdv_cash_account_required')) return new Error('Escolha a conta que representa o dinheiro em espécie da loja.');
  if (detail.includes('pdv_cash_account_unavailable')) return new Error('A conta selecionada não está mais disponível. Escolha outra conta do tipo Caixa.');
  if (detail.includes('pdv_cash_account_open_session')) return new Error('Feche todos os caixas antes de trocar a conta de dinheiro.');
  if (detail.includes('pdv_counter_action_denied') || error?.code === '42501') return new Error('Seu perfil não tem permissão para alterar a conta de dinheiro do PDV.');
  return new Error('Não foi possível salvar a conta de dinheiro do PDV. Tente novamente.');
}

export function usePdvCashAccountSettings(enabled = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = [...ROOT, user?.id ?? null] as const;
  const query = useQuery({
    queryKey,
    enabled: enabled && !!user,
    queryFn: async () => {
      const { data, error } = await rpc('pdv_get_cash_account_setting_v2');
      if (error) throw safeCashAccountError(error);
      return projectPdvCashAccountSettings(data);
    },
  });

  const save = useMutation({
    mutationFn: async (cashAccountId: string) => {
      const { data, error } = await rpc('pdv_save_cash_account_setting_v2', {
        p_cash_account_id: cashAccountId,
      });
      if (error) throw safeCashAccountError(error);
      return projectAccount(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ROOT }),
        queryClient.invalidateQueries({ queryKey: ['company-settings'] }),
        queryClient.invalidateQueries({ queryKey: [...PDV_CASH_V2_QUERY_ROOT] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-direct-sale-v2'] }),
      ]);
    },
  });

  return {
    selectedAccount: query.data?.selectedAccount ?? null,
    accounts: query.data?.accounts ?? [],
    openSessions: query.data?.openSessions ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
    save,
  };
}
