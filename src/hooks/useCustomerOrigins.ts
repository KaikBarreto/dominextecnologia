import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CustomerOrigin {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

export function useCustomerOrigins() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const originsQuery = useQuery({
    queryKey: ['customer-origins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_origins' as any)
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as CustomerOrigin[];
    },
  });

  const createOrigin = useMutation({
    mutationFn: async (input: { name: string; icon?: string; color?: string }) => {
      const { data, error } = await supabase
        .from('customer_origins' as any)
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-origins'] });
      toast({ title: 'Origem criada!' });
    },
    onError: (err: any) => toast({ variant: 'destructive', title: 'Erro', description: err.message }),
  });

  const updateOrigin = useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; icon?: string; color?: string; is_active?: boolean }) => {
      const { error } = await supabase
        .from('customer_origins' as any)
        .update(input)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-origins'] });
      toast({ title: 'Origem atualizada!' });
    },
    onError: (err: any) => toast({ variant: 'destructive', title: 'Erro', description: err.message }),
  });

  const deleteOrigin = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customer_origins' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-origins'] });
      toast({ title: 'Origem removida!' });
    },
    onError: (err: any) => toast({ variant: 'destructive', title: 'Erro', description: err.message }),
  });

  const activeOrigins = (originsQuery.data || []).filter(o => o.is_active);

  return {
    origins: originsQuery.data || [],
    activeOrigins,
    isLoading: originsQuery.isLoading,
    createOrigin,
    updateOrigin,
    deleteOrigin,
  };
}
