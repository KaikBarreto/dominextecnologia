import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PDV_CASH_V2_QUERY_ROOT } from '@/hooks/usePdvCashSessionsV2';

type RpcError = { code?: string; details?: string; message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

const rpc = supabase.rpc.bind(supabase) as unknown as RpcCaller;

export interface PdvSetupResult {
  configured: boolean;
  cashAccountCreated: boolean;
  terminalCreated: boolean;
  needsStock: boolean;
  needsCashClose: boolean;
}

function projectSetup(value: unknown): PdvSetupResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('O servidor não confirmou a preparação do caixa. Atualize a página e tente novamente.');
  }
  const payload = value as Record<string, unknown>;
  // O contrato legado só confirma prontidão por configured=true. Ao enviar
  // qualquer flag moderna, o servidor precisa confirmar ambas como booleanos.
  const hasModernFlags = Object.prototype.hasOwnProperty.call(payload, 'needs_stock')
    || Object.prototype.hasOwnProperty.call(payload, 'needs_cash_close');
  if (typeof payload.configured !== 'boolean'
    || typeof payload.cash_account_created !== 'boolean'
    || typeof payload.terminal_created !== 'boolean'
    || (hasModernFlags
      ? typeof payload.needs_stock !== 'boolean' || typeof payload.needs_cash_close !== 'boolean'
      : payload.configured !== true)) {
    throw new Error('O servidor não confirmou a preparação do caixa. Atualize a página e tente novamente.');
  }
  return {
    configured: payload.configured === true,
    cashAccountCreated: payload.cash_account_created === true,
    terminalCreated: payload.terminal_created === true,
    needsStock: payload.needs_stock === true,
    needsCashClose: payload.needs_cash_close === true,
  };
}

function safeSetupError(error: RpcError): Error {
  const detail = `${error?.details ?? ''}`.toLowerCase();
  if (detail.includes('pdv_setup_user_inactive')) {
    return new Error('Seu acesso está desativado. Peça ao administrador para conferir seu cadastro.');
  }
  if (detail.includes('pdv_setup_auth_required')) {
    return new Error('Sua sessão expirou. Entre novamente para preparar o caixa.');
  }
  if (detail.includes('pdv_setup_company_denied') || detail.includes('pdv_setup_company_required')) {
    return new Error('Seu usuário não está vinculado a uma empresa ativa.');
  }
  if (detail.includes('pdv_setup_stock_required')) {
    return new Error('Cadastre um local de estoque para preparar o primeiro caixa.');
  }
  if (detail.includes('pdv_setup_module_denied')) {
    return new Error('O módulo PDV (Loja) não está disponível para esta empresa.');
  }
  if (detail.includes('pdv_setup_subscription_denied') || detail.includes('pdv_setup_entitlement_denied')) {
    return new Error('A assinatura da empresa não permite preparar o PDV agora.');
  }
  if (detail.includes('pdv_setup_permission_denied') || error?.code === '42501') {
    return new Error('Somente um administrador ou gestor pode preparar o primeiro caixa.');
  }
  return new Error('Não foi possível preparar o caixa agora. Tente novamente.');
}

export function usePdvEnsureSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await rpc('pdv_ensure_setup');
      if (error) throw safeSetupError(error);
      return projectSetup(data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-settings'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-terminal-settings-v2'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-cash-account-settings-v2'] }),
        queryClient.invalidateQueries({ queryKey: ['pdv-direct-sale-v2'] }),
        queryClient.invalidateQueries({ queryKey: [...PDV_CASH_V2_QUERY_ROOT] }),
      ]);
    },
  });
}
