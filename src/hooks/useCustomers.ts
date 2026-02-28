import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Customer, CustomerType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

export interface CustomerInput {
  name: string;
  customer_type: CustomerType;
  company_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  address?: string;
  complement?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  birth_date?: string;
  notes?: string;
}

export function useCustomers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Customer[];
    },
  });

  const createCustomer = useMutation({
    mutationFn: async (input: CustomerInput) => {
      const { data, error } = await supabase
        .from('customers')
        .insert(input)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Cliente criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao criar cliente', 
        description: error.message 
      });
    },
  });

  const updateCustomer = useMutation({
    mutationFn: async ({ id, ...input }: CustomerInput & { id: string }) => {
      const { data, error } = await supabase
        .from('customers')
        .update(input)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Cliente atualizado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao atualizar cliente', 
        description: error.message 
      });
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Cliente excluído com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ 
        variant: 'destructive', 
        title: 'Erro ao excluir cliente', 
        description: error.message 
      });
    },
  });

  return {
    customers: customersQuery.data ?? [],
    isLoading: customersQuery.isLoading,
    error: customersQuery.error,
    createCustomer,
    updateCustomer,
    deleteCustomer,
  };
}
