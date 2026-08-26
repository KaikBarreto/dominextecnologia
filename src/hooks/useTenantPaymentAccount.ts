import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useToast } from '@/hooks/use-toast';

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
  default_fine_percent: number;
  default_interest_percent: number;
  // ── Preferências de cobrança (adicionadas na migration tenant_subscriptions_e_juros_multa) ──
  default_due_days: number;
  default_discount_percent: number | null;
  default_discount_days: number | null;
  default_description: string | null;
  allow_pix: boolean;
  allow_boleto: boolean;
  allow_card: boolean;
  default_max_installments: number;
  default_finance_account_id: string | null;
  default_income_category: string | null;
  default_fee_category: string;
  // ── Meios recorrentes avançados (migration cobrancas_cartao_recorrente_pix_auto) ──
  // Feature dormente: default false; ligada por tenant pelo super_admin após Asaas habilitar.
  card_recurring_enabled: boolean;
  pix_auto_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Subconjunto de campos que `setChargePreferences` aceita atualizar. */
export type ChargePreferencesInput = Partial<
  Pick<
    TenantPaymentAccount,
    | 'default_due_days'
    | 'default_discount_percent'
    | 'default_discount_days'
    | 'default_description'
    | 'allow_pix'
    | 'allow_boleto'
    | 'allow_card'
    | 'default_max_installments'
    | 'default_finance_account_id'
    | 'default_income_category'
    | 'default_fee_category'
  >
>;

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
  const { toast } = useToast();

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
          // colunas originais + preferências de cobrança + flags de meios recorrentes avançados
          'id, company_id, provider, mode, status, asaas_account_id, wallet_id, auto_post_to_finance, auto_post_fees, default_fine_percent, default_interest_percent, default_due_days, default_discount_percent, default_discount_days, default_description, allow_pix, allow_boleto, allow_card, default_max_installments, default_finance_account_id, default_income_category, default_fee_category, card_recurring_enabled, pix_auto_enabled, created_at, updated_at',
        )
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as TenantPaymentAccount | null) ?? null;
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

  // Grava multa (%) e juros ao mês (%) via UPDATE direto. Mesma RLS policy.
  // Toast de erro PT-BR fica na camada da UI — o hook só lança o erro.
  const setLateFeesMutation = useMutation({
    mutationFn: async ({ finePercent, interestPercent }: { finePercent: number; interestPercent: number }) => {
      if (!companyId) throw new Error('Empresa não identificada.');
      const { error } = await supabase
        .from('tenant_payment_accounts')
        .update({
          default_fine_percent: finePercent,
          default_interest_percent: interestPercent,
        })
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Grava qualquer subconjunto das preferências de cobrança (meios habilitados,
  // vencimento, desconto, descrição, parcelas, conta/categoria do financeiro).
  // Mesma RLS policy "Company can manage own payment account".
  // Toast de erro PT-BR disparado aqui (UI não precisa repetir).
  const setChargePreferencesMutation = useMutation({
    mutationFn: async (partial: ChargePreferencesInput) => {
      if (!companyId) throw new Error('Empresa não identificada.');
      if (Object.keys(partial).length === 0) return;
      const { error } = await supabase
        .from('tenant_payment_accounts')
        .update(partial as Record<string, unknown>)
        .eq('company_id', companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar. Tente novamente.',
      });
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
    /** Espelha `tenant_payment_accounts.default_fine_percent` (DEFAULT 2.00). */
    defaultFinePercent: account?.default_fine_percent ?? 2,
    /** Espelha `tenant_payment_accounts.default_interest_percent` (DEFAULT 1.00). */
    defaultInterestPercent: account?.default_interest_percent ?? 1,
    setLateFees: setLateFeesMutation,
    // ── Preferências de cobrança ────────────────────────────────────────────
    /** Prazo de vencimento padrão em dias (DEFAULT 0). */
    defaultDueDays: account?.default_due_days ?? 0,
    /** Desconto por antecipação em % (NULL = sem desconto). */
    defaultDiscountPercent: account?.default_discount_percent ?? null,
    /** Dias antes do vencimento para desconto (NULL = sem limite). */
    defaultDiscountDays: account?.default_discount_days ?? null,
    /** Descrição/instrução padrão que aparece na cobrança. */
    defaultDescription: account?.default_description ?? null,
    /** Pix habilitado nas cobranças (DEFAULT true). */
    allowPix: account?.allow_pix ?? true,
    /** Boleto habilitado nas cobranças (DEFAULT true). */
    allowBoleto: account?.allow_boleto ?? true,
    /** Cartão habilitado nas cobranças (DEFAULT true). */
    allowCard: account?.allow_card ?? true,
    /** Número máximo de parcelas no cartão. Fallback 12 (padrão sensato de cartão)
     *  quando o dado ainda não veio da conta — evita esconder o seletor de parcelas. */
    defaultMaxInstallments: account?.default_max_installments ?? 12,
    /** ID da conta bancária onde a receita cai (NULL = sem vinculação). */
    defaultFinanceAccountId: account?.default_finance_account_id ?? null,
    /** Categoria de receita padrão para lançamentos (NULL = sem categoria). */
    defaultIncomeCategory: account?.default_income_category ?? null,
    /** Categoria de despesa para as taxas da Asaas (DEFAULT 'Tarifas e Taxas'). */
    defaultFeeCategory: account?.default_fee_category ?? 'Tarifas e Taxas',
    setChargePreferences: setChargePreferencesMutation,
    // ── Flags de meios recorrentes avançados (feature dormente — DEFAULT false) ────
    /** Cartão recorrente (assinatura tokenizada) habilitado para este tenant. */
    cardRecurringEnabled: account?.card_recurring_enabled ?? false,
    /** Pix Automático (débito recorrente com consentimento) habilitado para este tenant. */
    pixAutoEnabled: account?.pix_auto_enabled ?? false,
    provision,
    deactivate,
  };
}
