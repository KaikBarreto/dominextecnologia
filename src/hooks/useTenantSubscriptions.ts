import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useToast } from '@/hooks/use-toast';

// ─────────────────────────────────────────────────────────────────────────────
// useTenantSubscriptions — fronteira do Supabase para as ASSINATURAS recorrentes
// que o tenant emite ao cliente final (Asaas BYO). Componente NUNCA chama
// supabase/edge direto (regra-lei #4).
//
// Cria via edge `tenant-asaas-create-subscription`.
// Gerencia (cancelar/atualizar) via edge `tenant-asaas-manage-subscription`.
// Listagem lê `tenant_subscriptions` via PostgREST (RLS por company_id).
// ─────────────────────────────────────────────────────────────────────────────

export type SubscriptionCycle =
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'SEMIANNUALLY'
  | 'YEARLY';

export type SubscriptionBillingType = 'PIX' | 'BOLETO' | 'UNDEFINED' | 'CREDIT_CARD';

export type SubscriptionStatus =
  | 'pending'
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'overdue'
  | string;

export interface TenantSubscription {
  id: string;
  company_id: string;
  customer_id: string | null;
  asaas_subscription_id: string | null;
  cycle: string;
  value: number;
  billing_type: string;
  next_due_date: string | null;
  status: string;
  fine_percent: number | null;
  interest_percent: number | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
  source_type: string | null;
  source_id: string | null;
  // joined
  customers: { id: string; name: string } | null;
}

/** Dados do cartão de crédito para assinatura recorrente (NUNCA logar). */
export interface CreditCardInput {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

/** Dados do titular do cartão exigidos pela Asaas para tokenização. */
export interface CreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
}

/** Retorno do edge tenant-asaas-pix-auto-authorize (QR de consentimento). */
export interface PixAutoAuthorization {
  id: string;
  qr_code: string;    // base64 PNG do QR (pode ou não ter prefixo data:image)
  copy_paste: string; // Pix copia e cola
  status: string;
}

export interface CreateSubscriptionInput {
  customer_id: string;
  value: number;
  cycle: SubscriptionCycle;
  billing_type: SubscriptionBillingType;
  next_due_date?: string;
  description?: string;
  fine_percent?: number;
  interest_percent?: number;
  /** Origem da assinatura: 'avulso' (padrão) | 'contract' | 'quote'. */
  source_type?: 'avulso' | 'contract' | 'quote';
  source_id?: string;
  // ── Cartão recorrente (feature dormente — só enviado quando billing_type=CREDIT_CARD) ──
  credit_card?: CreditCardInput;
  credit_card_holder_info?: CreditCardHolderInfo;
  remote_ip?: string;
}

/** Input para autorizar Pix Automático (gera QR de consentimento). */
export interface AuthorizePixAutoInput {
  customer_id: string;
  value: number;
  cycle: SubscriptionCycle;
  next_due_date: string;
  description?: string;
  source_type?: 'avulso' | 'contract' | 'quote';
  source_id?: string;
}

export interface ManageSubscriptionInput {
  subscription_id: string;
  action: 'cancel' | 'update';
  value?: number;
  cycle?: SubscriptionCycle;
  next_due_date?: string;
  description?: string;
}

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

export interface UseTenantSubscriptionsOptions {
  /** Quando fornecido, filtra assinaturas deste cliente. Cache isolado por customerId. */
  customerId?: string;
  /** Quando fornecido, filtra assinaturas desta origem (ex: contrato específico). */
  sourceType?: string;
  sourceId?: string;
}

export function useTenantSubscriptions(options?: UseTenantSubscriptionsOptions) {
  const queryClient = useQueryClient();
  const { companyId } = useUserCompany();
  const { toast } = useToast();
  const { customerId, sourceType, sourceId } = options ?? {};

  const listKey = sourceType && sourceId
    ? ['tenant-subscriptions', companyId, 'source', sourceType, sourceId]
    : customerId
      ? ['tenant-subscriptions', companyId, 'customer', customerId]
      : ['tenant-subscriptions', companyId];

  const list = useQuery({
    queryKey: listKey,
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<TenantSubscription[]> => {
      if (!companyId) return [];
      let query = supabase
        .from('tenant_subscriptions')
        .select(
          'id, company_id, customer_id, asaas_subscription_id, cycle, value, billing_type, next_due_date, status, fine_percent, interest_percent, description, created_by, created_at, source_type, source_id, customers(id, name)',
        )
        .eq('company_id', companyId);
      if (customerId) {
        query = query.eq('customer_id', customerId);
      }
      if (sourceType) {
        query = query.eq('source_type', sourceType);
      }
      if (sourceId) {
        query = query.eq('source_id', sourceId);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as TenantSubscription[]) ?? [];
    },
  });

  const invalidate = () => {
    // Invalida TODAS as queries de assinaturas desta empresa (lista geral + filtros).
    queryClient.invalidateQueries({ queryKey: ['tenant-subscriptions', companyId] });
  };

  const createSubscription = useMutation({
    mutationFn: async (input: CreateSubscriptionInput): Promise<void> => {
      const body: Record<string, unknown> = {
        customer_id: input.customer_id,
        value: input.value,
        cycle: input.cycle,
        billing_type: input.billing_type,
      };
      if (input.next_due_date) body.next_due_date = input.next_due_date;
      if (input.description?.trim()) body.description = input.description.trim();
      if (input.fine_percent !== undefined) body.fine_percent = input.fine_percent;
      if (input.interest_percent !== undefined) body.interest_percent = input.interest_percent;
      if (input.source_type) body.source_type = input.source_type;
      if (input.source_id) body.source_id = input.source_id;
      // ── Cartão recorrente (feature dormente) ─────────────────────────────────
      // INVARIANTE: dados de cartão nunca são logados. Enviados direto ao edge e
      // nunca persistidos no banco (o edge guarda apenas o token no Vault).
      if (input.billing_type === 'CREDIT_CARD' && input.credit_card) {
        body.credit_card = input.credit_card;
      }
      if (input.credit_card_holder_info) {
        body.credit_card_holder_info = input.credit_card_holder_info;
      }
      if (input.remote_ip !== undefined) body.remote_ip = input.remote_ip;

      const { data, error } = await supabase.functions.invoke(
        'tenant-asaas-create-subscription',
        { body },
      );
      if (error) {
        throw new Error(
          await extractEdgeError(error, data, 'Não foi possível criar a assinatura.'),
        );
      }
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Assinatura criada', description: 'A assinatura recorrente foi configurada.' });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar assinatura',
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    },
  });

  // ── authorizePixAuto ────────────────────────────────────────────────────────
  // Chama o edge tenant-asaas-pix-auto-authorize e retorna o objeto
  // { authorization: { id, qr_code, copy_paste, status } }. O QR gerado é
  // exibido ao usuário para consentimento — a assinatura só começa a debitar
  // após o cliente autorizar pelo app do banco. Feature dormente: o edge devolve
  // 400 PT-BR se pix_auto_enabled=false na conta do tenant.
  const authorizePixAuto = useMutation({
    mutationFn: async (input: AuthorizePixAutoInput): Promise<PixAutoAuthorization> => {
      const body: Record<string, unknown> = {
        customer_id: input.customer_id,
        value: input.value,
        cycle: input.cycle,
        next_due_date: input.next_due_date,
      };
      if (input.description?.trim()) body.description = input.description.trim();
      if (input.source_type) body.source_type = input.source_type;
      if (input.source_id) body.source_id = input.source_id;

      const { data, error } = await supabase.functions.invoke(
        'tenant-asaas-pix-auto-authorize',
        { body },
      );
      if (error) {
        throw new Error(
          await extractEdgeError(error, data, 'Não foi possível iniciar o Pix Automático.'),
        );
      }
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      const authorization = (data as { authorization?: PixAutoAuthorization })?.authorization;
      if (!authorization) throw new Error('Resposta inesperada do servidor. Tente novamente.');
      return authorization;
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao iniciar Pix Automático',
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    },
  });

  const manageSubscription = useMutation({
    mutationFn: async (input: ManageSubscriptionInput): Promise<void> => {
      const body: Record<string, unknown> = {
        subscription_id: input.subscription_id,
        action: input.action,
      };
      if (input.value !== undefined) body.value = input.value;
      if (input.cycle) body.cycle = input.cycle;
      if (input.next_due_date) body.next_due_date = input.next_due_date;
      if (input.description?.trim()) body.description = input.description.trim();

      const { data, error } = await supabase.functions.invoke(
        'tenant-asaas-manage-subscription',
        { body },
      );
      if (error) {
        throw new Error(
          await extractEdgeError(error, data, 'Não foi possível atualizar a assinatura.'),
        );
      }
      if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
    },
    onSuccess: (_, vars) => {
      invalidate();
      const msg =
        vars.action === 'cancel'
          ? 'Assinatura cancelada com sucesso.'
          : 'Assinatura atualizada com sucesso.';
      toast({ title: vars.action === 'cancel' ? 'Assinatura cancelada' : 'Assinatura atualizada', description: msg });
    },
    onError: (err, vars) => {
      toast({
        variant: 'destructive',
        title: vars.action === 'cancel' ? 'Erro ao cancelar' : 'Erro ao atualizar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    },
  });

  return {
    subscriptions: list.data ?? [],
    isLoading: list.isLoading,
    companyId,
    createSubscription,
    manageSubscription,
    authorizePixAuto,
  };
}
