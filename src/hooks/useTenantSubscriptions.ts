import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';

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

export type SubscriptionBillingType = 'PIX' | 'BOLETO' | 'UNDEFINED' | 'CREDIT_CARD' | 'PIX_AUTO';

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
  /** Preenchida = assinatura arquivada (sumiu da lista, mas continua no histórico). */
  archived_at: string | null;
  /**
   * Consentimento de Pix Automático. `pix_auto_status` fora de
   * cancelled/expired/rejected com `pix_auto_authorization_id` preenchido = o
   * cliente AINDA pode ser debitado, mesmo com a assinatura cancelada aqui.
   */
  pix_auto_authorization_id: string | null;
  pix_auto_status: string | null;
  category: string | null;
  cost_center_id: string | null;
  max_payments: number | null;
  fine_type: 'PERCENTAGE' | 'FIXED' | null;
  fine_value: number | null;
  checkout_url: string | null;
  checkout_status: string | null;
  deleted_at: string | null;
  /** Derivado no servidor. `true` bloqueia a exclusão e preserva o histórico. */
  has_financial_history?: boolean;
  charge_count?: number;
  can_delete?: boolean;
  // joined
  customers: { id: string; name: string } | null;
}

/** `pix_auto_status` que já significam consentimento morto (espelha a edge e a RPC). */
const CLOSED_PIX_AUTO_STATUSES = new Set(['cancelled', 'expired', 'rejected']);

/**
 * A assinatura ainda tem um consentimento de Pix Automático VIVO na Asaas?
 *
 * Cancelar antes da correção de 2026-09-19 marcava 'cancelled' aqui sem revogar
 * nada lá — o cliente seguia debitável por uma assinatura que sumiu da tela.
 * Quando isto é true, a saída é cancelar de novo (o cancel corrigido revoga),
 * não arquivar: arquivar esconderia justamente o que precisa ser resolvido.
 */
export function hasLivePixConsent(sub: TenantSubscription): boolean {
  return (
    !!sub.pix_auto_authorization_id &&
    !CLOSED_PIX_AUTO_STATUSES.has(sub.pix_auto_status ?? 'pending')
  );
}

/** Resultado comum dos fluxos que exigem ação posterior do pagador. */
export interface SubscriptionCheckoutResult {
  subscription?: Partial<TenantSubscription> | null;
  checkout_url: string;
  checkout_kind: 'asaas' | 'pix_auto';
}

export interface CreateSubscriptionInput {
  customer_id: string;
  value: number;
  cycle: SubscriptionCycle;
  billing_type: SubscriptionBillingType;
  next_due_date?: string;
  description?: string;
  /** Categoria do recebível recorrente no Financeiro. Vazia/omitida = usa o
   *  default da conta de recebimento (comportamento de hoje). */
  category?: string;
  /** Centro de custo do recebível recorrente no Financeiro, aplicado a CADA
   *  ciclo. Ausente/null = sem centro (sempre opcional, sem default de conta).
   *  Ignorado no Pix Automático (fluxo próprio que ainda não lê nem categoria). */
  cost_center_id?: string | null;
  /** Multa em % do valor de cada cobrança. Só faz sentido quando `fine_type`
   *  é 'PERCENTAGE' (ou ausente). No modo 'FIXED' o valor vai em `fine_value`
   *  e este campo NÃO é enviado. */
  fine_percent?: number;
  /** Multa em R$ (valor fixo). Só é lida pela edge quando `fine_type` = 'FIXED'. */
  fine_value?: number;
  /** Como a Asaas cobra a multa (`fine.type`). Ausente = 'PERCENTAGE'
   *  (comportamento histórico). */
  fine_type?: 'PERCENTAGE' | 'FIXED';
  interest_percent?: number;
  /** Origem da assinatura: 'avulso' (padrão) | 'contract' | 'quote'. */
  source_type?: 'avulso' | 'contract' | 'quote';
  source_id?: string;
  /** Número máximo de ciclos (cobranças) desta assinatura. Ausente/undefined =
   *  contínua (a Asaas gera cobranças indefinidamente até cancelar). Mapeia pra
   *  `maxPayments` no POST /subscriptions da Asaas e é persistido no espelho
   *  local para edição e projeção do DRE. */
  max_payments?: number;
}

/** Input para autorizar Pix Automático (gera QR de consentimento). */
export interface AuthorizePixAutoInput {
  customer_id: string;
  value: number;
  cycle: SubscriptionCycle;
  next_due_date: string;
  description?: string;
  /** Categoria do recebível recorrente no Financeiro, aplicada a CADA débito.
   *  Destino contábil não depende do meio de pagamento: o Pix Automático grava
   *  a mesma coluna `tenant_subscriptions.category` que a assinatura comum, e o
   *  webhook lê de lá nos dois casos. */
  category?: string;
  /** Centro de custo do recebível recorrente. Mesma coluna e mesmo caminho de
   *  webhook da assinatura comum. */
  cost_center_id?: string | null;
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
  billing_type?: SubscriptionBillingType;
  category?: string | null;
  cost_center_id?: string | null;
  max_payments?: number | null;
  fine_type?: 'PERCENTAGE' | 'FIXED';
  fine_value?: number;
  fine_percent?: number;
  interest_percent?: number;
  updatePendingPayments?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// MethodNotEnabledError — lançado quando o edge devolve HTTP 409 com
// { code: "method_not_enabled", method: "credit_card" | "pix_auto" }.
// O SubscriptionDialog inspeciona instanceof + .code para exibir o painel
// de passo a passo em vez do toast de erro genérico.
// ─────────────────────────────────────────────────────────────────────────────
export class MethodNotEnabledError extends Error {
  readonly code = 'method_not_enabled' as const;
  readonly method: 'credit_card' | 'pix_auto';
  constructor(message: string, method: 'credit_card' | 'pix_auto') {
    super(message);
    this.name = 'MethodNotEnabledError';
    this.method = method;
  }
}

interface EdgeErrorBody {
  error?: string;
  code?: string;
  method?: string;
}

async function extractEdgeError(
  error: unknown,
  data: unknown,
  fallback: string,
): Promise<{ message: string; body?: EdgeErrorBody }> {
  // 1. Tenta ler do corpo da resposta (error.context = Response em não-2xx)
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx === 'object' && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json() as EdgeErrorBody;
      return { message: body?.error ? String(body.error) : fallback, body };
    } catch {
      /* corpo não-JSON — ignora */
    }
  }
  // 2. Tenta ler de data (respostas 2xx com campo error)
  if (data && typeof data === 'object' && 'error' in data && (data as EdgeErrorBody).error) {
    const body = data as EdgeErrorBody;
    return { message: String(body.error), body };
  }
  // 3. Erro JS comum
  if (error instanceof Error && error.message) return { message: error.message };
  return { message: fallback };
}

export interface UseTenantSubscriptionsOptions {
  /** Quando fornecido, filtra assinaturas deste cliente. Cache isolado por customerId. */
  customerId?: string;
  /** Quando fornecido, filtra assinaturas desta origem (ex: contrato específico). */
  sourceType?: string;
  sourceId?: string;
  /** true = lista SÓ as arquivadas (aba "Arquivadas"). Padrão: só as não arquivadas. */
  includeArchived?: boolean;
}

export function useTenantSubscriptions(options?: UseTenantSubscriptionsOptions) {
  const queryClient = useQueryClient();
  const { companyId } = useUserCompany();
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.subscriptions;
  const { customerId, sourceType, sourceId, includeArchived } = options ?? {};

  // `includeArchived` entra na CHAVE: sem isso a aba "Arquivadas" serviria o
  // cache da lista normal (e vice-versa) e pareceria que arquivar não fez nada.
  const archivedKey = includeArchived ? 'archived' : 'active';
  const listKey = sourceType && sourceId
    ? ['tenant-subscriptions', companyId, 'source', sourceType, sourceId, archivedKey]
    : customerId
      ? ['tenant-subscriptions', companyId, 'customer', customerId, archivedKey]
      : ['tenant-subscriptions', companyId, archivedKey];

  const list = useQuery({
    queryKey: listKey,
    enabled: !!companyId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<TenantSubscription[]> => {
      if (!companyId) return [];
      let query = supabase
        .from('tenant_subscriptions')
        .select(
          'id, company_id, customer_id, asaas_subscription_id, cycle, value, billing_type, next_due_date, status, fine_percent, fine_type, fine_value, interest_percent, description, category, cost_center_id, max_payments, checkout_url, checkout_status, deleted_at, created_by, created_at, source_type, source_id, archived_at, pix_auto_authorization_id, pix_auto_status, customers(id, name)',
        )
        .eq('company_id', companyId)
        .is('deleted_at', null);
      // Arquivada some da lista principal. Sem este filtro, arquivar não muda
      // nada na tela e a função simplesmente não existe pro usuário.
      query = includeArchived
        ? query.not('archived_at', 'is', null)
        : query.is('archived_at', null);
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
      const rows = (data as unknown as TenantSubscription[]) ?? [];
      if (rows.length === 0) return rows;

      // A RPC usa a empresa do JWT e conta TODA cobrança (inclusive pendente).
      // É somente uma dica de UX; a edge revalida banco + Asaas ao excluir.
      const { data: capabilities, error: capabilitiesError } = await supabase
        .rpc('get_tenant_subscription_delete_capabilities');
      if (capabilitiesError) throw capabilitiesError;
      const summary = new Map(
        (capabilities ?? []).map((item) => [item.subscription_id, item]),
      );

      return rows.map((row) => {
        const item = summary.get(row.id);
        const chargeCount = Number(item?.charge_count ?? 0);
        return {
          ...row,
          charge_count: chargeCount,
          has_financial_history: chargeCount > 0,
          can_delete: item?.can_delete === true,
        };
      });
    },
  });

  const invalidate = async () => {
    // Invalida TODAS as queries de assinaturas desta empresa (lista geral +
    // filtros + as duas abas, ativa e arquivada). O prefixo cobre o sufixo
    // archivedKey, então arquivar/desarquivar atualiza os dois lados de uma vez.
    const queryKey = ['tenant-subscriptions', companyId];
    await queryClient.invalidateQueries({ queryKey });
    // `staleTime` é de 30s. O refetch explícito evita a lista antiga ficar
    // visível até sair e voltar da aba depois de criar/editar/excluir.
    await queryClient.refetchQueries({ queryKey, type: 'active' });
  };

  const createSubscription = useMutation({
    mutationFn: async (input: CreateSubscriptionInput): Promise<SubscriptionCheckoutResult | null> => {
      const body: Record<string, unknown> = {
        customer_id: input.customer_id,
        value: input.value,
        cycle: input.cycle,
        billing_type: input.billing_type,
      };
      if (input.next_due_date) body.next_due_date = input.next_due_date;
      if (input.description?.trim()) body.description = input.description.trim();
      // Campo enviado só quando preenchido — a edge ainda pode ignorá-lo até a
      // coluna `category` em tenant_subscriptions e o suporte no edge subirem.
      if (input.category?.trim()) body.category = input.category.trim();
      // Centro de custo escolhido pelo usuário nesta assinatura. Sem default
      // de conta — ausente/null é "sem centro".
      if (input.cost_center_id) body.cost_center_id = input.cost_center_id;
      // Multa: campos SEPARADOS de propósito (mesmo desenho da cobrança avulsa,
      // release 1.24.51). Em % o payload é byte-a-byte o de antes (sem
      // `fine_type`), então nada muda pra quem não usa multa em reais. Em R$ o
      // percentual NÃO é enviado: se este front rodar contra uma edge antiga
      // (janela de deploy), ela não acha `fine_percent`, cai no padrão da conta
      // e a multa em reais é apenas ignorada. Reaproveitar `fine_percent` com
      // um flag faria a edge antiga cobrar "R$ 50" como "50%".
      if (input.fine_percent !== undefined) body.fine_percent = input.fine_percent;
      if (input.fine_value !== undefined) body.fine_value = input.fine_value;
      if (input.fine_type !== undefined) body.fine_type = input.fine_type;
      if (input.interest_percent !== undefined) body.interest_percent = input.interest_percent;
      if (input.source_type) body.source_type = input.source_type;
      if (input.source_id) body.source_id = input.source_id;
      if (input.max_payments !== undefined) body.max_payments = input.max_payments;
      const { data, error } = await supabase.functions.invoke(
        'tenant-asaas-create-subscription',
        { body },
      );
      if (error || (data && typeof data === 'object' && 'error' in data && (data as EdgeErrorBody).error)) {
        const { message, body } = await extractEdgeError(error, data, 'Não foi possível criar a assinatura.');
        if (body?.code === 'method_not_enabled') {
          const method = body.method === 'pix_auto' ? 'pix_auto' : 'credit_card';
          throw new MethodNotEnabledError(message, method);
        }
        throw new Error(message);
      }
      const response = data as Partial<SubscriptionCheckoutResult> | null;
      return response?.checkout_url
        ? {
            subscription: response.subscription ?? null,
            checkout_url: String(response.checkout_url),
            checkout_kind: response.checkout_kind === 'pix_auto' ? 'pix_auto' : 'asaas',
          }
        : null;
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: 'Assinatura criada', description: 'A assinatura recorrente foi configurada.' });
    },
    onError: (err) => {
      // MethodNotEnabledError é tratado no SubscriptionDialog — não exibir toast aqui.
      if (err instanceof MethodNotEnabledError) return;
      toast({
        variant: 'destructive',
        title: 'Erro ao criar assinatura',
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    },
  });

  // ── authorizePixAuto ────────────────────────────────────────────────────────
  // Chama o edge tenant-asaas-pix-auto-authorize e retorna somente o link
  // público Dominex. O QR existe apenas no checkout do pagador; o painel do
  // gestor não expõe o consentimento bancário. Feature dormente: o edge devolve
  // 400 PT-BR se pix_auto_enabled=false na conta do tenant.
  const authorizePixAuto = useMutation({
    mutationFn: async (input: AuthorizePixAutoInput): Promise<SubscriptionCheckoutResult> => {
      const body: Record<string, unknown> = {
        customer_id: input.customer_id,
        value: input.value,
        cycle: input.cycle,
        next_due_date: input.next_due_date,
      };
      if (input.description?.trim()) body.description = input.description.trim();
      // Categoria e centro de custo viajam TAMBÉM no Pix Automático: eles são o
      // destino contábil do recebível, não uma configuração do meio de
      // pagamento. Antes a tela escondia os dois campos nesta forma e o que o
      // usuário tinha digitado era descartado em silêncio no envio.
      if (input.category?.trim()) body.category = input.category.trim();
      if (input.cost_center_id) body.cost_center_id = input.cost_center_id;
      if (input.source_type) body.source_type = input.source_type;
      if (input.source_id) body.source_id = input.source_id;

      const { data, error } = await supabase.functions.invoke(
        'tenant-asaas-pix-auto-authorize',
        { body },
      );
      if (error || (data && typeof data === 'object' && 'error' in data && (data as EdgeErrorBody).error)) {
        const { message, body } = await extractEdgeError(error, data, 'Não foi possível iniciar o Pix Automático.');
        if (body?.code === 'method_not_enabled') {
          throw new MethodNotEnabledError(message, 'pix_auto');
        }
        throw new Error(message);
      }
      const response = data as Partial<SubscriptionCheckoutResult> | null;
      if (!response?.checkout_url) throw new Error('A autorização foi criada, mas o link de checkout não foi retornado.');
      return {
        subscription: response.subscription ?? null,
        checkout_url: String(response.checkout_url),
        checkout_kind: 'pix_auto',
      };
    },
    onSuccess: async () => {
      await invalidate();
      toast({ title: 'Link criado', description: 'Envie o checkout para o cliente autorizar a assinatura.' });
    },
    onError: (err) => {
      // MethodNotEnabledError é tratado no SubscriptionDialog — não exibir toast aqui.
      if (err instanceof MethodNotEnabledError) return;
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
      if (input.description !== undefined) body.description = input.description.trim();
      if (input.billing_type) body.billing_type = input.billing_type;
      if (input.category !== undefined) body.category = input.category?.trim() || null;
      if (input.cost_center_id !== undefined) body.cost_center_id = input.cost_center_id;
      if (input.max_payments !== undefined) body.max_payments = input.max_payments;
      if (input.fine_type) body.fine_type = input.fine_type;
      if (input.fine_value !== undefined) body.fine_value = input.fine_value;
      if (input.fine_percent !== undefined) body.fine_percent = input.fine_percent;
      if (input.interest_percent !== undefined) body.interest_percent = input.interest_percent;
      if (input.action === 'update') {
        body.updatePendingPayments = input.updatePendingPayments ?? true;
      }

      const { data, error } = await supabase.functions.invoke(
        'tenant-asaas-manage-subscription',
        { body },
      );
      if (error || (data && typeof data === 'object' && 'error' in data && (data as EdgeErrorBody).error)) {
        const { message } = await extractEdgeError(error, data, 'Não foi possível atualizar a assinatura.');
        throw new Error(message);
      }
    },
    onSuccess: async (_, vars) => {
      await invalidate();
      if (vars.action === 'cancel') {
        toast({ title: t.toast.cancelSuccessTitle, description: t.toast.cancelSuccessDescription });
      } else {
        toast({ title: t.toast.updateSuccessTitle, description: t.toast.updateSuccessDescription });
      }
    },
    onError: (err, vars) => {
      toast({
        variant: 'destructive',
        title: vars.action === 'cancel' ? t.toast.cancelErrorTitle : t.toast.updateErrorTitle,
        description: err instanceof Error ? err.message : t.toast.genericError,
      });
    },
  });

  const deleteSubscription = useMutation({
    mutationFn: async (subscriptionId: string): Promise<void> => {
      const { data, error } = await supabase.functions.invoke(
        'tenant-asaas-manage-subscription',
        { body: { subscription_id: subscriptionId, action: 'delete' } },
      );
      if (error || (data && typeof data === 'object' && 'error' in data && (data as EdgeErrorBody).error)) {
        const { message } = await extractEdgeError(
          error,
          data,
          'Não foi possível excluir a assinatura.',
        );
        throw new Error(message);
      }
    },
    onSuccess: async () => {
      await invalidate();
      toast({
        title: 'Assinatura excluída',
        description: 'A recorrência sem pagamentos foi removida.',
      });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: err instanceof Error ? err.message : t.toast.genericError,
      });
    },
  });

  // ── archive / unarchive: some da lista SEM destruir a linha. ────────────────
  // Arquivar (e não excluir) porque esta tabela é o ÚNICO lugar que guarda o
  // pix_auto_authorization_id, e o webhook resolve o tenant POR ELE: apagar a
  // linha deixaria um evento atrasado da Asaas sem casa. A edge ainda revoga o
  // consentimento antes de arquivar, se ainda houver um vivo.
  const archiveSubscription = useMutation({
    mutationFn: async (
      input: { subscription_id: string; action: 'archive' | 'unarchive' },
    ): Promise<void> => {
      const { data, error } = await supabase.functions.invoke(
        'tenant-asaas-manage-subscription',
        { body: { subscription_id: input.subscription_id, action: input.action } },
      );
      if (error || (data && typeof data === 'object' && 'error' in data && (data as EdgeErrorBody).error)) {
        const { message } = await extractEdgeError(
          error,
          data,
          input.action === 'archive'
            ? t.toast.archiveErrorDescription
            : t.toast.unarchiveErrorDescription,
        );
        throw new Error(message);
      }
    },
    onSuccess: (_, vars) => {
      invalidate();
      toast({
        title: vars.action === 'archive' ? t.toast.archiveSuccessTitle : t.toast.unarchiveSuccessTitle,
        description:
          vars.action === 'archive'
            ? t.toast.archiveSuccessDescription
            : t.toast.unarchiveSuccessDescription,
      });
    },
    onError: (err, vars) => {
      toast({
        variant: 'destructive',
        title: vars.action === 'archive' ? t.toast.archiveErrorTitle : t.toast.unarchiveErrorTitle,
        description: err instanceof Error ? err.message : t.toast.genericError,
      });
    },
  });

  // ── bulkCancel: cancela várias assinaturas de uma vez (seleção múltipla). ────
  // Chama a mesma edge (uma requisição por assinatura, em paralelo) e devolve
  // um resumo. NÃO usa manageSubscription.mutateAsync diretamente pra não
  // disparar N toasts individuais — só o toast-resumo no final.
  const bulkCancel = useMutation({
    mutationFn: async (subscriptionIds: string[]): Promise<{ ok: number; fail: number }> => {
      const results = await Promise.allSettled(
        subscriptionIds.map((subscription_id) =>
          supabase.functions.invoke('tenant-asaas-manage-subscription', {
            body: { subscription_id, action: 'cancel' },
          }).then(({ data, error }) => {
            if (error || (data && typeof data === 'object' && 'error' in data && (data as EdgeErrorBody).error)) {
              throw new Error('cancel failed');
            }
          }),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      invalidate();
      if (fail === 0) {
        toast({ title: t.toast.bulkCancelSuccessTitle, description: t.toast.bulkCancelSuccessDescription(ok) });
      } else {
        toast({
          variant: 'destructive',
          title: t.toast.bulkCancelPartialTitle,
          description: t.toast.bulkCancelPartialDescription(ok, fail),
        });
      }
    },
    onError: () => {
      toast({ variant: 'destructive', title: t.toast.cancelErrorTitle, description: t.toast.genericError });
    },
  });

  return {
    subscriptions: list.data ?? [],
    isLoading: list.isLoading,
    companyId,
    createSubscription,
    manageSubscription,
    deleteSubscription,
    archiveSubscription,
    authorizePixAuto,
    bulkCancel,
  };
}
