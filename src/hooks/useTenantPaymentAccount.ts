import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

// ─────────────────────────────────────────────────────────────────────────────
// useTenantPaymentAccount — fronteira do Supabase para a conta de recebimentos
// (Asaas BYO) do TENANT. Componente NUNCA chama supabase/edge direto (regra-lei).
//
// Onda 1 (recebimento do cliente final): o tenant cola a própria API key do
// Asaas na aba Integrações. A chave viaja SÓ até a edge `tenant-asaas-provision`
// (guardada no Vault server-side); o frontend nunca a persiste nem a relê.
//
// A tabela `tenant_payment_accounts` (RLS por company_id) guarda apenas o
// STATUS/refs — nunca o segredo. Este hook lê o status via PostgREST (leitura
// direta, protegida por RLS) e dispara provision/deactivate via edge.
// ─────────────────────────────────────────────────────────────────────────────

export type TenantPaymentStatus = 'pending' | 'active' | 'rejected' | 'disabled';

export interface TenantPaymentAccount {
  id: string;
  company_id: string;
  provider: string;
  mode: string;
  status: TenantPaymentStatus;
  asaas_account_id: string | null;
  wallet_id: string | null;
  auto_post_to_finance: boolean;
  auto_post_fees: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Extrai a mensagem PT-BR de erro de uma edge function. O `FunctionsHttpError`
 * do supabase-js guarda o corpo da resposta (não-2xx) em `error.context`
 * (Response), não em `data` — memória do time. Sem ler o context, o usuário só
 * veria um erro genérico.
 */
async function extractEdgeError(error: unknown, data: unknown, fallback: string): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    return (data as { error: string }).error;
  }
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx === 'object' && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* corpo não-JSON — ignora */
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function useTenantPaymentAccount() {
  const queryClient = useQueryClient();
  const { companyId } = useUserCompany();

  const queryKey = ['tenant-payment-account', companyId];

  const query = useQuery({
    queryKey,
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<TenantPaymentAccount | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('tenant_payment_accounts')
        .select(
          'id, company_id, provider, mode, status, asaas_account_id, wallet_id, auto_post_to_finance, auto_post_fees, created_at, updated_at',
        )
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return (data as TenantPaymentAccount | null) ?? null;
    },
  });

  // Ativar/revalidar colando a chave. Retorna a msg PT-BR no reject pra a UI
  // exibir (o hook NÃO dispara toast aqui — quem chama decide).
  const provision = useMutation({
    mutationFn: async (input: { apiKey: string }) => {
      const { data, error } = await supabase.functions.invoke('tenant-asaas-provision', {
        body: { action: 'activate', api_key: input.apiKey.trim() },
      });
      if (error) throw new Error(await extractEdgeError(error, data, 'Não foi possível ativar os recebimentos.'));
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      return data as { status: TenantPaymentStatus };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deactivate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('tenant-asaas-provision', {
        body: { action: 'deactivate' },
      });
      if (error) throw new Error(await extractEdgeError(error, data, 'Não foi possível desativar os recebimentos.'));
      return data as { status: TenantPaymentStatus };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Grava a flag auto_post_to_finance via UPDATE direto (RLS policy "Company can
  // manage own payment account" já cobre). Invalida a query no sucesso.
  const setAutoPostToFinanceMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error('Empresa não identificada.');
      const { error } = await supabase
        .from('tenant_payment_accounts')
        .update({ auto_post_to_finance: enabled })
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Grava a flag auto_post_fees via UPDATE direto. Espelha exatamente
  // setAutoPostToFinanceMutation — mesma RLS policy, mesma invalidação.
  const setAutoPostFeesMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!companyId) throw new Error('Empresa não identificada.');
      const { error } = await supabase
        .from('tenant_payment_accounts')
        .update({ auto_post_fees: enabled })
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const account = query.data ?? null;

  return {
    account,
    status: (account?.status ?? null) as TenantPaymentStatus | null,
    isActive: account?.status === 'active',
    isLoading: query.isLoading,
    companyId,
    /** Espelha `tenant_payment_accounts.auto_post_to_finance` (DEFAULT true). */
    autoPostToFinance: account?.auto_post_to_finance ?? true,
    setAutoPostToFinance: setAutoPostToFinanceMutation,
    /** Espelha `tenant_payment_accounts.auto_post_fees` (DEFAULT true). */
    autoPostFees: account?.auto_post_fees ?? true,
    setAutoPostFees: setAutoPostFeesMutation,
    provision,
    deactivate,
  };
}
