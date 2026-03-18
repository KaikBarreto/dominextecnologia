import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type PmocContract = Tables<'pmoc_contracts'> & {
  customers?: Tables<'customers'> | null;
};
export type PmocContractInsert = TablesInsert<'pmoc_contracts'>;
export type PmocContractUpdate = TablesUpdate<'pmoc_contracts'>;

export function usePmocContracts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: contracts = [], isLoading, error } = useQuery({
    queryKey: ['pmoc_contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pmoc_contracts')
        .select(`
          *,
          customers (id, name, document, phone, email)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as PmocContract[];
    },
  });

  const createContract = useMutation({
    mutationFn: async (contract: PmocContractInsert) => {
      const { data, error } = await supabase
        .from('pmoc_contracts')
        .insert(contract)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc_contracts'] });
      toast({ title: 'Contrato PMOC criado com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar contrato', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateContract = useMutation({
    mutationFn: async ({ id, ...updates }: PmocContractUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('pmoc_contracts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc_contracts'] });
      toast({ title: 'Contrato atualizado com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar contrato', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const deleteContract = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pmoc_contracts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pmoc_contracts'] });
      toast({ title: 'Contrato removido com sucesso!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao remover contrato', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Statistics
  const activeContracts = contracts.filter(c => c.is_active);
  const totalMonthlyValue = activeContracts.reduce((acc, c) => acc + (c.monthly_value || 0), 0);

  return {
    contracts,
    isLoading,
    error,
    createContract,
    updateContract,
    deleteContract,
    stats: {
      total: contracts.length,
      active: activeContracts.length,
      inactive: contracts.length - activeContracts.length,
      totalMonthlyValue,
    },
  };
}
