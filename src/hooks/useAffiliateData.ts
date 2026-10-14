import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Programa de Afiliados — camada de dados (portado do EcoSistema em 2026-10-14).
 *
 * Fronteira do Supabase pro programa: nenhuma tela de afiliado chama
 * `supabase.from('affiliates'...)` direto. As tabelas já estão no `types.ts`
 * gerado, então aqui não há cast — o que der erro de tipo é erro de verdade.
 *
 * Isolamento: as policies de self-scope (`current_affiliate_id()`) fazem o
 * afiliado logado ler SÓ a própria ficha, as próprias comissões/repasses e as
 * empresas/pagamentos da carteira dele. Estes hooks servem as duas audiências
 * (admin e afiliado) com as MESMAS queries de propósito — quem filtra é a RLS,
 * não o client. Filtro de client aqui é UX; segurança é a RLS.
 */

export interface Affiliate {
  id: string;
  name: string;
  /**
   * Código amigável derivado do nome (ex: "paulo-silva"), preenchido por trigger
   * no banco e ESTÁVEL (não muda quando o nome é editado — o link já pode estar
   * na rua). Pode ser null em registro que escape do backfill; nesse caso links
   * e URLs caem no `id`.
   */
  slug: string | null;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  first_payment_pct: number;
  recurring_pct: number;
  /**
   * Duração da recorrência: quantas RECORRÊNCIAS (pagamentos) depois da primeira
   * venda ainda geram comissão. `null` = sem prazo. `0` = só a primeira venda.
   *
   * ⚠️ É contagem de PAGAMENTOS, não janela de meses de calendário — decisão do
   * Tech Lead em 2026-10-14. Num cliente mensal dá no mesmo (N recorrências = N
   * meses); num anual, contar eventos evita zerar o afiliado na renovação do ano
   * 2, e um cliente que atrasa/pausa não queima cota do afiliado. A régua que
   * vale mora no trigger `affiliate_commission_on_payment()`; isto aqui é só o
   * tipo.
   */
  recurring_months: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Affiliate + métricas agregadas pela listagem (nº de clientes + saldo a pagar). */
export interface AffiliateWithMetrics extends Affiliate {
  client_count: number;
  pending_balance: number;
}

export type AffiliateCommissionKind = 'first' | 'recurring';
export type AffiliateCommissionStatus = 'pending' | 'paid' | 'voided';

export interface AffiliateCommission {
  id: string;
  affiliate_id: string;
  company_id: string | null;
  company_payment_id: string | null;
  kind: AffiliateCommissionKind;
  base_amount: number;
  pct_applied: number;
  commission_amount: number;
  reference_month: string | null;
  status: AffiliateCommissionStatus;
  affiliate_payment_id: string | null;
  created_at: string | null;
  /** Resolvido por lookup em `companies.name` — não é coluna da tabela. */
  company_name: string | null;
}

export interface AffiliatePortfolioCompany {
  id: string;
  name: string | null;
  subscription_status: string | null;
  subscription_value: number | null;
  subscription_expires_at: string | null;
  subscription_plan: string | null;
  billing_cycle: string | null;
}

/**
 * Pagamento de um cliente da carteira. Note que o Dominex NÃO tem
 * `company_payments.voided` (divergência vs. EcoSistema): estorno aqui é DELETE
 * da linha, via `delete_company_payment_with_rollback`. Logo não existe
 * "pagamento estornado" pra exibir — ele simplesmente deixa de existir, e a
 * comissão dele vira `voided` por trigger.
 */
export interface AffiliateCompanyPayment {
  id: string;
  company_id: string | null;
  payment_date: string | null;
  type: string | null;
  amount: number | null;
  payment_method: string | null;
}

/**
 * Um pagamento do cliente + a comissão que ESTE afiliado ganhou nele.
 * `commission_*` fica null quando o pagamento não gerou comissão pro afiliado —
 * pagamento anterior ao vínculo, afiliado inativo na época, pct zerado, ou cota
 * de recorrência já esgotada. A UI mostra "—" nesses casos.
 */
export interface AffiliateClientPaymentRow extends AffiliateCompanyPayment {
  commission_amount: number | null;
  commission_pct: number | null;
  commission_kind: AffiliateCommissionKind | null;
}

export interface AffiliatePayment {
  id: string;
  affiliate_id: string;
  total_amount: number;
  reference_month: string | null;
  payment_method: string | null;
  paid_at: string | null;
  admin_transaction_id: string | null;
  created_at: string | null;
}

/** Soma das comissões pendentes. Helper puro, reusado pela listagem e pelo detalhe. */
export function sumPendingBalance(
  commissions: Pick<AffiliateCommission, 'commission_amount' | 'status'>[],
): number {
  return commissions
    .filter((c) => c.status === 'pending')
    .reduce((acc, c) => acc + (Number(c.commission_amount) || 0), 0);
}

/** Rótulo PT-BR do tipo de comissão. Fonte única — não repetir string na tela. */
export function commissionKindLabel(kind: AffiliateCommissionKind): string {
  return kind === 'first' ? 'Primeira venda' : 'Recorrência';
}

/**
 * Rótulo PT-BR da duração da recorrência, pra ficha e listagem.
 * `null` → "sem prazo"; `0` → "só a primeira venda"; N → "N recorrências".
 */
export function recurringDurationLabel(months: number | null): string {
  if (months === null || months === undefined) return 'Sem prazo';
  if (months === 0) return 'Só a primeira venda';
  return `${months} ${months === 1 ? 'recorrência' : 'recorrências'}`;
}

/**
 * Lista todos os afiliados e agrega, por afiliado:
 *  - `client_count`: nº de companies com `affiliate_id` = ele
 *  - `pending_balance`: Σ `commission_amount` com status `pending`
 *
 * Três queries em vez de um join porque o PostgREST não agrega; são tabelas
 * pequenas (afiliados são dezenas, não milhares) e o `.in()` fecha em 1 ida.
 */
export function useAffiliates() {
  return useQuery({
    queryKey: ['affiliates-list'],
    queryFn: async (): Promise<AffiliateWithMetrics[]> => {
      const { data: affiliates, error } = await supabase
        .from('affiliates')
        .select('*')
        .order('name');
      if (error) throw error;

      const list = (affiliates ?? []) as Affiliate[];
      if (list.length === 0) return [];

      const affiliateIds = list.map((a) => a.id);

      const { data: companies, error: compError } = await supabase
        .from('companies')
        .select('id, affiliate_id')
        .in('affiliate_id', affiliateIds);
      if (compError) throw compError;

      const clientCountByAffiliate = new Map<string, number>();
      for (const c of companies ?? []) {
        if (!c.affiliate_id) continue;
        clientCountByAffiliate.set(
          c.affiliate_id,
          (clientCountByAffiliate.get(c.affiliate_id) ?? 0) + 1,
        );
      }

      const { data: pending, error: pendError } = await supabase
        .from('affiliate_commissions')
        .select('affiliate_id, commission_amount')
        .in('affiliate_id', affiliateIds)
        .eq('status', 'pending');
      if (pendError) throw pendError;

      const pendingByAffiliate = new Map<string, number>();
      for (const row of pending ?? []) {
        pendingByAffiliate.set(
          row.affiliate_id,
          (pendingByAffiliate.get(row.affiliate_id) ?? 0) + (Number(row.commission_amount) || 0),
        );
      }

      return list.map((a) => ({
        ...a,
        client_count: clientCountByAffiliate.get(a.id) ?? 0,
        pending_balance: pendingByAffiliate.get(a.id) ?? 0,
      }));
    },
  });
}

// UUID canônico, case-insensitive. Decide se o parâmetro da rota/link é id ou slug.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 1 afiliado por UUID OU slug amigável. Link/URL antigo com uuid continua
 * resolvendo — o slug é adição, não troca.
 */
export function useAffiliate(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: ['affiliate', idOrSlug],
    enabled: !!idOrSlug,
    queryFn: async (): Promise<Affiliate | null> => {
      if (!idOrSlug) return null;
      const query = supabase.from('affiliates').select('*');
      const { data, error } = UUID_REGEX.test(idOrSlug)
        ? await query.eq('id', idOrSlug).maybeSingle()
        : await query.ilike('slug', idOrSlug).maybeSingle();
      if (error) throw error;
      return (data as Affiliate) ?? null;
    },
  });
}

/** Extrato de comissões do afiliado, com o nome da empresa resolvido por lookup. */
export function useAffiliateCommissions(affiliateId: string | undefined) {
  return useQuery({
    queryKey: ['affiliate-commissions', affiliateId],
    enabled: !!affiliateId,
    queryFn: async (): Promise<AffiliateCommission[]> => {
      if (!affiliateId) return [];
      const { data, error } = await supabase
        .from('affiliate_commissions')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Omit<AffiliateCommission, 'company_name'>[];
      if (rows.length === 0) return [];

      const companyIds = Array.from(
        new Set(rows.map((r) => r.company_id).filter((v): v is string => !!v)),
      );

      const nameById = new Map<string, string | null>();
      if (companyIds.length > 0) {
        const { data: companies, error: compError } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds);
        if (compError) throw compError;
        for (const c of companies ?? []) nameById.set(c.id, c.name);
      }

      return rows.map((r) => ({
        ...r,
        company_name: r.company_id ? (nameById.get(r.company_id) ?? null) : null,
      }));
    },
  });
}

/** Carteira: empresas onde `affiliate_id` = o afiliado. */
export function useAffiliatePortfolio(affiliateId: string | undefined) {
  return useQuery({
    queryKey: ['affiliate-portfolio', affiliateId],
    enabled: !!affiliateId,
    queryFn: async (): Promise<AffiliatePortfolioCompany[]> => {
      if (!affiliateId) return [];
      const { data, error } = await supabase
        .from('companies')
        .select(
          'id, name, subscription_status, subscription_value, subscription_expires_at, subscription_plan, billing_cycle',
        )
        .eq('affiliate_id', affiliateId)
        .order('name');
      if (error) throw error;
      return (data ?? []) as AffiliatePortfolioCompany[];
    },
  });
}

/**
 * Histórico de pagamentos de UM cliente da carteira, com a comissão que ESTE
 * afiliado ganhou em cada um. Junta `company_payments` com
 * `affiliate_commissions` por `company_payment_id`.
 */
export function useAffiliateClientHistory(
  affiliateId: string | undefined,
  companyId: string | undefined,
) {
  return useQuery({
    queryKey: ['affiliate-client-history', affiliateId, companyId],
    enabled: !!affiliateId && !!companyId,
    queryFn: async (): Promise<AffiliateClientPaymentRow[]> => {
      if (!affiliateId || !companyId) return [];

      const { data: payments, error: payError } = await supabase
        .from('company_payments')
        .select('id, company_id, payment_date, type, amount, payment_method')
        .eq('company_id', companyId)
        .order('payment_date', { ascending: false });
      if (payError) throw payError;

      const rows = (payments ?? []) as AffiliateCompanyPayment[];
      if (rows.length === 0) return [];

      const { data: commissions, error: commError } = await supabase
        .from('affiliate_commissions')
        .select('company_payment_id, commission_amount, pct_applied, kind')
        .eq('affiliate_id', affiliateId)
        .eq('company_id', companyId);
      if (commError) throw commError;

      const commByPaymentId = new Map<
        string,
        { commission_amount: number; pct_applied: number; kind: AffiliateCommissionKind }
      >();
      for (const c of commissions ?? []) {
        if (c.company_payment_id) {
          commByPaymentId.set(c.company_payment_id, {
            commission_amount: Number(c.commission_amount) || 0,
            pct_applied: Number(c.pct_applied) || 0,
            kind: c.kind as AffiliateCommissionKind,
          });
        }
      }

      return rows.map((p) => {
        const comm = commByPaymentId.get(p.id);
        return {
          ...p,
          commission_amount: comm ? comm.commission_amount : null,
          commission_pct: comm ? comm.pct_applied : null,
          commission_kind: comm ? comm.kind : null,
        };
      });
    },
  });
}

/** Histórico de repasses já feitos ao afiliado. */
export function useAffiliatePayments(affiliateId: string | undefined) {
  return useQuery({
    queryKey: ['affiliate-payments', affiliateId],
    enabled: !!affiliateId,
    queryFn: async (): Promise<AffiliatePayment[]> => {
      if (!affiliateId) return [];
      const { data, error } = await supabase
        .from('affiliate_payments')
        .select('*')
        .eq('affiliate_id', affiliateId)
        .order('paid_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AffiliatePayment[];
    },
  });
}

/**
 * Chaves que um repasse invalida. Centralizado porque as duas mutations de
 * pagamento (mês e saldo) afetam exatamente o mesmo conjunto — e esquecer uma
 * deixa a UI mentindo até o F5.
 */
async function refetchAfterPayout(
  queryClient: ReturnType<typeof useQueryClient>,
  affiliateId: string,
) {
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ['affiliate-commissions', affiliateId] }),
    queryClient.refetchQueries({ queryKey: ['affiliate-payments', affiliateId] }),
    queryClient.refetchQueries({ queryKey: ['affiliate-client-history', affiliateId] }),
    queryClient.refetchQueries({ queryKey: ['affiliate', affiliateId] }),
    queryClient.refetchQueries({ queryKey: ['affiliates-list'] }),
  ]);
}

/** Traduz o erro cru da RPC de repasse pra PT-BR. */
function payoutErrorMessage(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? '');
  if (msg.includes('affiliate month already paid')) return 'Este mês já foi pago';
  if (msg.includes('no pending commissions')) return 'Não há comissões pendentes para pagar';
  if (msg.includes('affiliate not found')) return 'Afiliado não encontrado';
  if (msg.includes('not authorized')) return 'Você não tem permissão para pagar comissões';
  return 'Erro ao registrar o repasse';
}

/**
 * Fecha UM mês de competência: marca como pagas as comissões pendentes daquele
 * mês e cria 1 repasse carimbado com ele (+ a despesa no financeiro do painel).
 *
 * ⚠️ Fuso: `referenceMonth` tem que ser a string 'YYYY-MM-01' que veio da
 * comissão, passada CRUA pra RPC. Nunca `new Date('YYYY-MM-01')` — em BRT isso
 * volta um mês.
 */
export function usePayAffiliateMonth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      affiliateId: string;
      referenceMonth: string; // 'YYYY-MM-01'
      paymentMethod: string;
    }) => {
      const { error } = await supabase.rpc('pay_affiliate_month', {
        p_affiliate_id: params.affiliateId,
        p_reference_month: params.referenceMonth,
        p_payment_method: params.paymentMethod,
      });
      if (error) throw error;
      return params.affiliateId;
    },
    onSuccess: async (affiliateId) => {
      await refetchAfterPayout(queryClient, affiliateId);
      toast.success('Mês pago');
    },
    onError: (e) => {
      console.error('Erro ao pagar o mês do afiliado:', e);
      toast.error(payoutErrorMessage(e));
    },
  });
}

/**
 * Paga o saldo pendente inteiro (ou só as comissões escolhidas). O repasse sai
 * com `reference_month` nulo — é fechamento por saldo, não por competência.
 */
export function usePayAffiliateBalance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      affiliateId: string;
      paymentMethod: string;
      /** Quando omitido, paga TODO o saldo pendente. */
      commissionIds?: string[];
    }) => {
      const { error } = await supabase.rpc('pay_affiliate_balance', {
        p_affiliate_id: params.affiliateId,
        p_payment_method: params.paymentMethod,
        p_reference_month: null,
        p_commission_ids: params.commissionIds ?? null,
      });
      if (error) throw error;
      return params.affiliateId;
    },
    onSuccess: async (affiliateId) => {
      await refetchAfterPayout(queryClient, affiliateId);
      toast.success('Repasse registrado');
    },
    onError: (e) => {
      console.error('Erro ao pagar o saldo do afiliado:', e);
      toast.error(payoutErrorMessage(e));
    },
  });
}

/** Campos editáveis de um afiliado. `slug` e `user_id` NÃO entram de propósito:
 *  o slug é gerado e estável no banco, e o vínculo de login é operação à parte. */
export interface AffiliateFormInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  first_payment_pct?: number;
  recurring_pct?: number;
  recurring_months?: number | null;
  is_active?: boolean;
  notes?: string | null;
}

export function useCreateAffiliate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AffiliateFormInput) => {
      const { data: affiliate, error } = await supabase
        .from('affiliates')
        .insert([data])
        .select()
        .single();
      if (error) throw error;
      return affiliate as Affiliate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliates-list'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate'] });
      toast.success('Afiliado criado');
    },
    onError: (e) => {
      console.error('Erro ao criar afiliado:', e);
      const msg = String((e as { message?: string })?.message ?? '');
      // `affiliates.email` é UNIQUE — colisão tem mensagem própria, senão o CEO
      // só vê "erro ao criar" e não sabe que o e-mail já está em uso.
      toast.error(
        msg.includes('affiliates_email_key') || msg.includes('duplicate key')
          ? 'Já existe um afiliado com esse e-mail'
          : 'Erro ao criar afiliado',
      );
    },
  });
}

export function useUpdateAffiliate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: AffiliateFormInput & { id: string }) => {
      const { id, ...updateData } = data;
      const { error } = await supabase.from('affiliates').update(updateData).eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['affiliates-list'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate', id] });
      toast.success('Afiliado atualizado');
    },
    onError: (e) => {
      console.error('Erro ao atualizar afiliado:', e);
      toast.error('Erro ao atualizar afiliado');
    },
  });
}

/**
 * Exclui o afiliado. As comissões e repasses dele vão junto (FK CASCADE), e as
 * empresas da carteira só perdem o vínculo (`affiliate_id` vira null) — nenhuma
 * empresa é apagada. Como o histórico de comissão morre, a UI tem que avisar
 * disso antes de confirmar; pra afiliado que só saiu, desativar é o certo.
 */
export function useDeleteAffiliate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('affiliates').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['affiliates-list'] });
      queryClient.invalidateQueries({ queryKey: ['affiliate'] });
      toast.success('Afiliado excluído');
    },
    onError: (e) => {
      console.error('Erro ao excluir afiliado:', e);
      toast.error('Erro ao excluir afiliado');
    },
  });
}

// ---------------------------------------------------------------------------
// ACESSO DO AFILIADO (login próprio)
// ---------------------------------------------------------------------------
/**
 * O afiliado é um parceiro EXTERNO com login próprio e NUNCA é admin do painel:
 * o acesso dele vem SÓ do vínculo `affiliates.user_id = auth.uid()` (lido por
 * `current_affiliate_id()` nas policies de self-scope). Nenhuma linha em
 * `admin_permissions` é criada — uma linha lá o tornaria `is_admin_user()` no
 * SQL e abriria as policies amplas do painel master pra ele.
 *
 * Toda a operação de identidade roda server-side na edge `manage-admin-users`,
 * atrás do gate `Authorization` + `has_role(caller,'super_admin')`. Aqui só
 * chamamos e traduzimos o erro — o client nunca toca `auth.users`.
 *
 * ⚠️ E-mail de LOGIN: `auth.users` não é legível por RLS no client, então a edge
 * alinha `affiliates.email` ao e-mail usado na criação do acesso. É esse campo
 * que a UI mostra como "e-mail de acesso" — por isso o modal avisa que o e-mail
 * informado passa a ser o e-mail do afiliado.
 */

/** Lê a mensagem PT-BR que a edge devolveu (corpo não-2xx vem em `error.context`). */
async function extractEdgeError(error: unknown, data: unknown, fallback: string): Promise<string> {
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    return String((data as { error: string }).error);
  }
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* corpo não-JSON — cai no fallback */
    }
  }
  return fallback;
}

/** Invalida tudo que depende do vínculo de acesso (ficha + listagem). */
function invalidateAccess(queryClient: ReturnType<typeof useQueryClient>, affiliateId: string) {
  queryClient.invalidateQueries({ queryKey: ['affiliate', affiliateId] });
  // A ficha também é consultada por SLUG — invalida o prefixo pra pegar as duas
  // chaves ('affiliate', uuid) e ('affiliate', slug).
  queryClient.invalidateQueries({ queryKey: ['affiliate'] });
  queryClient.invalidateQueries({ queryKey: ['affiliates-list'] });
}

export interface CreateAffiliateAccessInput {
  affiliateId: string;
  email: string;
  password: string;
  fullName?: string;
}

/**
 * Cria a conta de login do afiliado e grava o vínculo `affiliates.user_id`.
 * Idempotente no servidor: afiliado que já tem acesso devolve 409 em vez de
 * sobrescrever (sobrescrever órfãaria a conta anterior).
 */
export function useCreateAffiliateAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAffiliateAccessInput) => {
      const { data, error } = await supabase.functions.invoke('manage-admin-users', {
        body: {
          action: 'create_affiliate_access',
          affiliate_id: input.affiliateId,
          email: input.email,
          password: input.password,
          full_name: input.fullName,
        },
      });
      if (error || data?.error) {
        throw new Error(
          await extractEdgeError(error, data, 'Não foi possível criar o acesso do afiliado'),
        );
      }
      return { affiliateId: input.affiliateId, userId: data?.user_id as string | undefined };
    },
    onSuccess: ({ affiliateId }) => {
      invalidateAccess(queryClient, affiliateId);
      toast.success('Acesso criado');
    },
    onError: (e) => {
      console.error('Erro ao criar acesso do afiliado:', e);
      toast.error((e as Error)?.message || 'Não foi possível criar o acesso do afiliado');
    },
  });
}

/**
 * Redefine a senha do afiliado. O `user_id` é resolvido NO SERVIDOR pelo
 * `affiliate_id` — a edge não aceita `user_id` cru aqui, senão a action viraria
 * "trocar a senha de qualquer usuário do sistema".
 */
export function useResetAffiliatePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { affiliateId: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke('manage-admin-users', {
        body: {
          action: 'reset_affiliate_password',
          affiliate_id: input.affiliateId,
          password: input.password,
        },
      });
      if (error || data?.error) {
        throw new Error(await extractEdgeError(error, data, 'Não foi possível redefinir a senha'));
      }
      return input.affiliateId;
    },
    onSuccess: (affiliateId) => {
      invalidateAccess(queryClient, affiliateId);
      toast.success('Senha redefinida');
    },
    onError: (e) => {
      console.error('Erro ao redefinir a senha do afiliado:', e);
      toast.error((e as Error)?.message || 'Não foi possível redefinir a senha');
    },
  });
}

/**
 * Remove o login do afiliado. O histórico de comissões e repasses NÃO é
 * apagado — só o vínculo cai. A conta de auth só é apagada quando existe
 * unicamente pro afiliado (sem `admin_permissions`, sem `user_roles` e sem
 * `profiles.company_id`); do contrário é conta de gente de verdade e a edge
 * apenas desvincula (`deleted: false`).
 */
export function useRevokeAffiliateAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (affiliateId: string) => {
      const { data, error } = await supabase.functions.invoke('manage-admin-users', {
        body: { action: 'revoke_affiliate_access', affiliate_id: affiliateId },
      });
      if (error || data?.error) {
        throw new Error(await extractEdgeError(error, data, 'Não foi possível remover o acesso'));
      }
      return { affiliateId, deleted: !!data?.deleted };
    },
    onSuccess: ({ affiliateId, deleted }) => {
      invalidateAccess(queryClient, affiliateId);
      toast.success(
        deleted
          ? 'Acesso removido'
          : 'Acesso removido. A conta foi mantida porque também é usada em outro lugar do sistema.',
      );
    },
    onError: (e) => {
      console.error('Erro ao remover o acesso do afiliado:', e);
      toast.error((e as Error)?.message || 'Não foi possível remover o acesso');
    },
  });
}
