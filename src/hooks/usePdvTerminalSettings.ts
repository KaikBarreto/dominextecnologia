import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { PDV_CASH_V2_QUERY_ROOT } from '@/hooks/usePdvCashSessionsV2';

type RpcResult = { data: unknown; error: { code?: string; details?: string; message?: string } | null };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

export interface PdvTerminalSetting {
  id: string;
  name: string;
  stockId: string;
  isActive: boolean;
  sortOrder: number;
}

export interface PdvTerminalStockOption {
  id: string;
  name: string;
  purpose: string;
  isDefault: boolean;
}

interface PdvTerminalSettingsData {
  terminals: PdvTerminalSetting[];
  stocks: PdvTerminalStockOption[];
}

interface SavePdvTerminalInput {
  id?: string | null;
  name: string;
  stockId: string;
  isActive: boolean;
  sortOrder: number;
}

const ROOT = ['pdv-terminal-settings-v2'] as const;

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

function projectTerminal(value: unknown): PdvTerminalSetting {
  const row = record(value);
  return {
    id: requiredText(row.id, 'o caixa salvo'),
    name: requiredText(row.name, 'o nome do caixa'),
    stockId: requiredText(row.stock_id, 'o estoque do caixa'),
    isActive: row.is_active === true,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : Number(row.sort_order ?? 0),
  };
}

export function projectPdvTerminalSettings(value: unknown): PdvTerminalSettingsData {
  const payload = record(value);
  if (!Array.isArray(payload.terminals) || !Array.isArray(payload.stocks)) {
    throw new Error('Não foi possível carregar a configuração dos caixas. Atualize a página e tente novamente.');
  }
  return {
    terminals: payload.terminals.map(projectTerminal),
    stocks: payload.stocks.map((raw) => {
      const stock = record(raw);
      return {
        id: requiredText(stock.id, 'o local de estoque'),
        name: requiredText(stock.name, 'o nome do local de estoque'),
        purpose: typeof stock.purpose === 'string' ? stock.purpose : 'operacional',
        isDefault: stock.is_default === true,
      };
    }),
  };
}

function safeTerminalError(error: RpcResult['error']): Error {
  const detail = `${error?.details ?? ''}`.toLowerCase();
  if (detail.includes('pdv_terminal_name_invalid')) return new Error('Informe um nome de caixa entre 2 e 80 caracteres.');
  if (detail.includes('pdv_terminal_stock_not_found')) return new Error('O local de estoque selecionado não está mais disponível.');
  if (detail.includes('pdv_terminal_in_use')) return new Error('Feche este caixa antes de desativá-lo ou mudar seu estoque.');
  if (detail.includes('pdv_counter_action_denied') || error?.code === '42501') return new Error('Seu perfil não tem permissão para alterar os caixas da loja.');
  return new Error('Não foi possível salvar o caixa. Tente novamente.');
}

export function usePdvTerminalSettings(enabled = true) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = [...ROOT, user?.id ?? null] as const;
  const query = useQuery({
    queryKey,
    enabled: enabled && !!user,
    queryFn: async () => {
      const { data, error } = await rpc('pdv_list_cash_terminal_settings_v2');
      if (error) throw safeTerminalError(error);
      return projectPdvTerminalSettings(data);
    },
  });

  const save = useMutation({
    mutationFn: async (input: SavePdvTerminalInput) => {
      const { data, error } = await rpc('pdv_save_cash_terminal_v2', {
        p_terminal_id: input.id ?? null,
        p_name: input.name,
        p_stock_id: input.stockId,
        p_is_active: input.isActive,
        p_sort_order: input.sortOrder,
      });
      if (error) throw safeTerminalError(error);
      return projectTerminal(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ROOT }),
        queryClient.invalidateQueries({ queryKey: [...PDV_CASH_V2_QUERY_ROOT, 'terminals'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-terminals'] }),
        queryClient.invalidateQueries({ queryKey: ['stocks'] }),
      ]);
    },
  });

  return {
    terminals: query.data?.terminals ?? [],
    stocks: query.data?.stocks ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
    save,
  };
}
