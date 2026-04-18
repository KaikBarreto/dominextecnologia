import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { toast } from 'sonner';

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
  created_at: string;
  updated_at: string;
}

export interface SalespersonSale {
  id: string;
  salesperson_id: string;
  company_id: string | null;
  customer_name: string | null;
  customer_origin: string | null;
  customer_company: string | null;
  amount: number;
  paid_amount: number;
  commission_amount: number;
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

/** Comissão padrão: 50% mensal / 20% anual */
export function calculateCommission(amount: number, billingCycle: 'monthly' | 'annual'): number {
  if (!amount || amount <= 0) return 0;
  return billingCycle === 'annual' ? amount * 0.2 : amount * 0.5;
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
      const data = await fetchAllPaginated<SalespersonSale>(() =>
        supabase.from('salesperson_sales').select('*').eq('salesperson_id', salespersonId).order('created_at', { ascending: false })
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
      const commission = payload.commission_amount ?? calculateCommission(
        Number(payload.amount || 0),
        (payload.billing_cycle as any) || 'monthly'
      );
      const { data, error } = await supabase
        .from('salesperson_sales')
        .insert({
          ...payload,
          commission_amount: commission,
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

export function useCreateAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<Partial<SalespersonAdvance>, 'id' | 'created_at'> & { salesperson_id: string; amount: number }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await supabase
        .from('salesperson_advances')
        .insert({ ...payload, created_by: user?.id || null } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_advances'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_advances'] });
      toast.success('Vale registrado');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao registrar vale'),
  });
}

export function useDeleteAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('salesperson_advances').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_advances'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_advances'] });
      toast.success('Vale removido');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover vale'),
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<Partial<SalespersonPayment>, 'id' | 'paid_at'> & {
      salesperson_id: string;
      reference_month: string;
      salary_amount: number;
      commission_amount: number;
      advances_deducted: number;
      total_amount: number;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await supabase
        .from('salesperson_payments')
        .insert({ ...payload, created_by: user?.id || null } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salesperson_payments'] });
      qc.invalidateQueries({ queryKey: ['all_salesperson_payments'] });
      toast.success('Pagamento registrado');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao registrar pagamento'),
  });
}
