import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { assertRowsAffected } from '@/lib/supabaseMutation';

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
  dre_bucket?: string | null;
  affects_result?: boolean | null;
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
        assertRowsAffected(
          await supabase.from('admin_financial_categories' as any).update(rest, { count: 'exact' }).eq('id', id),
          'update',
        );
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
      assertRowsAffected(
        await supabase.from('admin_financial_categories' as any).delete({ count: 'exact' }).eq('id', id),
        'delete',
      );
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-financial-categories'] }); toast.success('Categoria removida'); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });
}
