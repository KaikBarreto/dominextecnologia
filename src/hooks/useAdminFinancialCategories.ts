import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AdminFinancialCategory {
  id: string;
  name: string;
  label: string;
  type: 'income' | 'expense';
  color: string;
  icon: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
}

export function useAdminFinancialCategories() {
  return useQuery({
    queryKey: ['admin-financial-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_financial_categories' as any)
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as unknown as AdminFinancialCategory[];
    },
  });
}

export function useSaveAdminFinancialCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<AdminFinancialCategory> & { id?: string }) => {
      const { id, ...rest } = payload;
      if (id) {
        const { error } = await supabase.from('admin_financial_categories' as any).update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('admin_financial_categories' as any).insert(rest as any);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-financial-categories'] }); toast.success('Categoria salva'); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });
}

export function useDeleteAdminFinancialCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('admin_financial_categories' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-financial-categories'] }); toast.success('Categoria removida'); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });
}
