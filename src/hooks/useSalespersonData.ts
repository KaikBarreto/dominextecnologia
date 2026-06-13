import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { brtDateOnlyToTimestamp } from '@/lib/date-br';

export type SalespersonRole = 'sdr' | 'closer';

export interface Salesperson {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  salary: number;
  monthly_goal: number;
  is_active: boolean;
  no_commission: boolean;
  referral_code: string | null;
  notes: string | null;
  photo_url: string | null;
  role: SalespersonRole;
  created_at: string;
  updated_at: string;
}

/** Linha enxuta da view `salespeople_basic` — usada nos selects do diálogo de venda. */
export interface SalespersonBasic {
  id: string;
  name: string | null;
  email: string | null;
  photo_url: string | null;
  is_active: boolean | null;
  role: SalespersonRole | null;
  user_id: string | null;
}

export interface SalespersonSale {
  id: string;
  /** SEMPRE o CLOSER da venda. */
  salesperson_id: string;
  /** SDR que originou o lead (opcional). */
  sdr_id: string | null;
  company_id: string | null;
  customer_name: string | null;
  customer_origin: string | null;
  customer_company: string | null;
  amount: number;
  paid_amount: number;
  /** Comissão TOTAL da venda (closer + sdr). */
  commission_amount: number;
  /** Parcela do closer. */
  closer_commission: number | null;
  /** Parcela do SDR (0 quando venda solo). */
  sdr_commission: number | null;
  billing_cycle: 'monthly' | 'annual';
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface SalespersonAdvance {
  id: string;
  salesperson_id: string;
  amount: number;
  description: string | null;
  reference_month: string | null;
  created_at: string;
  created_by: string | null;
}

export interface SalespersonPayment {
  id: string;
  salesperson_id: string;
  salary_amount: number;
  commission_amount: number;
  advances_deducted: number;
  total_amount: number;
  reference_month: string;
  notes: string | null;
  paid_at: string;
  created_by: string | null;
}

export interface CommissionBreakdown {
  /** Comissão total da venda (closer + sdr). */
  total: number;
  /** Parcela que vai pro closer. */
  closerCommission: number;
  /** Parcela que vai pro SDR (0 quando venda solo). */
  sdrCommission: number;
}

/**
 * Quebra de comissão (regra travada pelo CEO).
 *
 * - mensal: total = amount * 0.5
 *     - COM SDR  → closer 0.25 / sdr 0.25
 *     - SEM SDR  → closer 0.50 / sdr 0
 * - anual:  total = amount * 0.2
 *     - COM SDR  → closer 0.10 / sdr 0.10
 *     - SEM SDR  → closer 0.20 / sdr 0
 *
 * @param amount       valor da venda (o "primeiro mensal" / valor informado).
 * @param billingCycle 'monthly' | 'annual'.
 * @param hasSdr       se a venda tem SDR associado (true/false ou um sdrId).
 */
export function calculateCommission(
  amount: number,
  billingCycle: 'monthly' | 'annual',
  hasSdr: boolean | string | null | undefined = false,
): CommissionBreakdown {
  const value = Number(amount) || 0;
  if (value <= 0) return { total: 0, closerCommission: 0, sdrCommission: 0 };

  const withSdr = typeof hasSdr === 'string' ? !!hasSdr.trim() : !!hasSdr;
  const totalRate = billingCycle === 'annual' ? 0.2 : 0.5;
  const total = value * totalRate;

  if (withSdr) {
    const half = total / 2;
    return { total, closerCommission: half, sdrCommission: half };
  }
  return { total, closerCommission: total, sdrCommission: 0 };
}

/**
 * Comissão que UMA pessoa recebe por UMA venda, considerando o duplo papel:
 * se a pessoa é o closer, ganha `closer_commission`; se é o SDR, ganha
 * `sdr_commission`. (Na prática o mesmo vendedor não é closer E sdr da mesma
 * venda, mas somar os dois ramos é seguro e cobre qualquer caso.)
 *
 * Fallback p/ vendas legadas sem as colunas de quebra: usa `commission_amount`
 * inteiro quando a pessoa é o closer.
 */
export function commissionForPerson(sale: SalespersonSale, personId: string): number {
  let total = 0;
  if (sale.salesperson_id === personId) {
    total += sale.closer_commission ?? sale.commission_amount ?? 0;
  }
  if (sale.sdr_id && sale.sdr_id === personId) {
    total += sale.sdr_commission ?? 0;
  }
  return total;
}

/** Vendas em que a pessoa participou — como closer OU como SDR. */
export function salesForPerson(sales: SalespersonSale[], personId: string): SalespersonSale[] {
  return sales.filter((s) => s.salesperson_id === personId || s.sdr_id === personId);
}

// ==================== Queries ====================

export function useSalespeople(activeOnly = false) {
  return useQuery({
    queryKey: ['salespeople', { activeOnly }],
    queryFn: async () => {
      let q = supabase.from('salespeople').select('*').order('name');
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Salesperson[];
    },
  });
}

/**
 * Lista enxuta de vendedores via view `salespeople_basic` (inclui `role`).
 * Usada nos selects do diálogo de venda (Closer / SDR).
 */
export function useSalespeopleBasic(activeOnly = true) {
  return useQuery({
    queryKey: ['salespeople_basic', { activeOnly }],
    queryFn: async () => {
      let q = supabase
        .from('salespeople_basic')
        .select('id, name, email, photo_url, is_active, role, user_id')
        .order('name');
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as SalespersonBasic[];
    },
  });
}

export function useSalesperson(id: string | undefined) {
  return useQuery({
    queryKey: ['salesperson', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from('salespeople').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as Salesperson | null;
    },
    enabled: !!id,
  });
}

export function useSalespersonSales(salespersonId: string | undefined) {
  return useQuery({
    queryKey: ['salesperson_sales', salespersonId],
    queryFn: async () => {
      if (!salespersonId) return [];
      // Vendas em que a pessoa participou como CLOSER (salesperson_id) OU
      // como SDR (sdr_id) — o duplo papel precisa aparecer na tela do vendedor.
      const data = await fetchAllPaginated<SalespersonSale>(() =>
        supabase
          .from('salesperson_sales')
          .select('*')
          .or(`salesperson_id.eq.${salespersonId},sdr_id.eq.${salespersonId}`)
          .order('created_at', { ascending: false })
      );
      return data;
    },
    enabled: !!salespersonId,
  });
}

export function useSalespersonAdvances(salespersonId: string | undefined) {
  return useQuery({
    queryKey: ['salesperson_advances', salespersonId],
    queryFn: async () => {
      if (!salespersonId) return [];
      const data = await fetchAllPaginated<SalespersonAdvance>(() =>
        supabase.from('salesperson_advances').select('*').eq('salesperson_id', salespersonId).order('created_at', { ascending: false })
      );
      return data;
    },
    enabled: !!salespersonId,
  });
}

export function useSalespersonPayments(salespersonId: string | undefined) {
  return useQuery({
    queryKey: ['salesperson_payments', salespersonId],
    queryFn: async () => {
      if (!salespersonId) return [];
      const data = await fetchAllPaginated<SalespersonPayment>(() =>
        supabase.from('salesperson_payments').select('*').eq('salesperson_id', salespersonId).order('reference_month', { ascending: false })
      );
      return data;
    },
    enabled: !!salespersonId,
  });
}

export function useAllSalespersonSales() {
  return useQuery({
    queryKey: ['all_salesperson_sales'],
    queryFn: async () => {
      const data = await fetchAllPaginated<SalespersonSale>(() =>
        supabase.from('salesperson_sales').select('*').order('created_at', { ascending: false })
      );
      return data;
    },
  });
}

export function useAllSalespersonAdvances() {
  return useQuery({
    queryKey: ['all_salesperson_advances'],
    queryFn: async () => {
      const data = await fetchAllPaginated<SalespersonAdvance>(() =>
        supabase.from('salesperson_advances').select('*').order('created_at', { ascending: false })
      );
      return data;
    },
  });
}

export function useAllSalespersonPayments() {
  return useQuery({
    queryKey: ['all_salesperson_payments'],
    queryFn: async () => {
      const data = await fetchAllPaginated<SalespersonPayment>(() =>
        supabase.from('salesperson_payments').select('*').order('reference_month', { ascending: false })
      );
      return data;
    },
  });
}

// ==================== Mutations ====================

export function useSaveSalesperson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Salesperson> & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { data, error } = await supabase.from('salespeople').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('salespeople').insert(rest as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salespeople'] });
      toast.success('Vendedor salvo com sucesso');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar vendedor'),
  });
}

export function useDeleteSalesperson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('salespeople').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salespeople'] });
      toast.success('Vendedor removido');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover vendedor'),
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<Partial<SalespersonSale>, 'id' | 'created_at'> & { salesperson_id: string }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const cycle = (payload.billing_cycle as 'monthly' | 'annual') || 'monthly';
      const sdrId = payload.sdr_id || null;

      // A quebra de comissão é a fonte da verdade. Se o caller já mandou as
      // parcelas (ex: ajuste manual), respeita; senão calcula pela regra.
      const breakdown = calculateCommission(Number(payload.amount || 0), cycle, sdrId);
      const total = payload.commission_amount ?? breakdown.total;
      const closer = payload.closer_commission ?? breakdown.closerCommission;
      const sdr = payload.sdr_commission ?? breakdown.sdrCommission;

      const { data, error } = await supabase
        .from('salesperson_sales')
        .insert({
          ...payload,
          sdr_id: sdrId,
          billing_cycle: cycle,
          commission_amount: total,
          closer_commission: closer,
          sdr_commission: sdr,
          created_by: user?.id || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_sales'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_sales'] });
      toast.success('Venda registrada');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao registrar venda'),
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('salesperson_sales').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_sales'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_sales'] });
      toast.success('Venda removida');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover venda'),
  });
}

/** Invalida as queries do financeiro admin (mesmas keys da tela de Financeiro). */
function invalidateAdminFinancials(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin-financial-transactions'] });
  qc.invalidateQueries({ queryKey: ['admin-financial-transactions-all'] });
}

export function useCreateAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<Partial<SalespersonAdvance>, 'id' | 'created_at'> & {
        salesperson_id: string;
        amount: number;
        /** Nome do vendedor — só pra montar a descrição da despesa (não vai pro insert do vale). */
        salesperson_name: string;
      },
    ) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { salesperson_name, ...insertData } = payload;

      // 1) Cria o vale
      const { data: advance, error } = await supabase
        .from('salesperson_advances')
        .insert({ ...insertData, created_by: user?.id || null } as any)
        .select()
        .single();
      if (error) throw error;

      // 2) Lança a despesa correspondente no financeiro admin.
      //    transaction_date ancorado ao meio-dia BRT pra não cair no dia anterior:
      //    - reference_month é date-only ("yyyy-MM-dd") → ancora via helper;
      //    - created_at já é timestamp real → usa direto, sem reformatar.
      const txnDate = advance.reference_month
        ? brtDateOnlyToTimestamp(advance.reference_month)
        : advance.created_at;
      const { error: finError } = await supabase.from('admin_financial_transactions').insert([
        {
          type: 'expense',
          category: 'advance',
          amount: payload.amount,
          description: `Vale - ${salesperson_name}: ${payload.description || 'Vale/Adiantamento'}`,
          reference_id: advance.id,
          reference_type: 'salesperson_advance',
          transaction_date: txnDate || undefined,
          created_by: user?.id || null,
        },
      ]);
      if (finError) throw finError;

      return advance;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_advances'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_advances'] });
      invalidateAdminFinancials(qc);
      toast.success('Vale registrado');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao registrar vale'),
  });
}

export function useDeleteAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Remove a despesa espelhada primeiro pra não deixar lançamento órfão.
      await supabase
        .from('admin_financial_transactions')
        .delete()
        .eq('reference_id', id)
        .eq('reference_type', 'salesperson_advance');

      const { error } = await supabase.from('salesperson_advances').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_advances'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_advances'] });
      invalidateAdminFinancials(qc);
      toast.success('Vale removido');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover vale'),
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<Partial<SalespersonPayment>, 'id'> & {
        salesperson_id: string;
        reference_month: string;
        salary_amount: number;
        commission_amount: number;
        advances_deducted: number;
        total_amount: number;
        /** Nome do vendedor — só pra montar a descrição das despesas. */
        salesperson_name: string;
        /** Data em que o pagamento foi feito (vira paid_at e transaction_date das despesas). */
        paid_at?: string;
      },
    ) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { salesperson_name, ...insertData } = payload;

      // 1) Cria o pagamento (paid_at escolhido pelo admin; default DB = now()).
      const { data: payment, error } = await supabase
        .from('salesperson_payments')
        .insert({ ...insertData, created_by: user?.id || null } as any)
        .select()
        .single();
      if (error) throw error;

      // Data do financeiro = paid_at do pagamento, DIRETO (ISO completo).
      // O paid_at já nasce ancorado ao meio-dia BRT (ver SalespersonPaymentControl),
      // então não reformatar pra 'yyyy-MM-dd' (isso reintroduziria o off-by-one).
      const txnDate = payment.paid_at || undefined;
      const monthLabel = format(new Date(`${payment.reference_month}T00:00:00`), 'MM/yyyy');

      // 2) Despesa de SALÁRIO LÍQUIDO (desconta vales já lançados como despesa
      //    quando criados, pra não duplicar no financeiro).
      const netSalary = Math.max(0, payload.salary_amount - payload.advances_deducted);
      if (netSalary > 0) {
        const { error: salErr } = await supabase.from('admin_financial_transactions').insert([
          {
            type: 'expense',
            category: 'salary',
            amount: netSalary,
            description: `Salário - ${salesperson_name} (${monthLabel})`,
            reference_id: payment.id,
            reference_type: 'salesperson_payment_salary',
            transaction_date: txnDate,
            created_by: user?.id || null,
          },
        ]);
        if (salErr) throw salErr;
      }

      // 3) Despesa de COMISSÃO.
      if (payload.commission_amount > 0) {
        const { error: commErr } = await supabase.from('admin_financial_transactions').insert([
          {
            type: 'expense',
            category: 'commission',
            amount: payload.commission_amount,
            description: `Comissões - ${salesperson_name} (${monthLabel})`,
            reference_id: payment.id,
            reference_type: 'salesperson_payment_commission',
            transaction_date: txnDate,
            created_by: user?.id || null,
          },
        ]);
        if (commErr) throw commErr;
      }

      return payment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_payments'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_payments'] });
      invalidateAdminFinancials(qc);
      toast.success('Pagamento registrado');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao registrar pagamento'),
  });
}

/** Atualiza a data (paid_at) de um pagamento já feito e propaga pro transaction_date das despesas vinculadas. */
export function useUpdatePaymentDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paidAt }: { id: string; paidAt: string }) => {
      // paidAt chega como ISO completo já ancorado ao meio-dia BRT (ver
      // SalespersonPaymentControl). Usa direto, sem reformatar pra 'yyyy-MM-dd'.
      const { error } = await supabase
        .from('salesperson_payments')
        .update({ paid_at: paidAt })
        .eq('id', id);
      if (error) throw error;

      // Propaga pro financeiro: salário + comissão deste pagamento.
      const { error: salErr } = await supabase
        .from('admin_financial_transactions')
        .update({ transaction_date: paidAt })
        .eq('reference_id', id)
        .in('reference_type', ['salesperson_payment_salary', 'salesperson_payment_commission']);
      if (salErr) throw salErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_payments'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_payments'] });
      invalidateAdminFinancials(qc);
      toast.success('Data do pagamento atualizada');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao atualizar data'),
  });
}

/** Remove um pagamento e as despesas espelhadas (salário + comissão) no financeiro admin. */
export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('admin_financial_transactions')
        .delete()
        .eq('reference_id', id)
        .in('reference_type', ['salesperson_payment_salary', 'salesperson_payment_commission']);

      const { error } = await supabase.from('salesperson_payments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_payments'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_payments'] });
      invalidateAdminFinancials(qc);
      toast.success('Pagamento removido');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover pagamento'),
  });
}
