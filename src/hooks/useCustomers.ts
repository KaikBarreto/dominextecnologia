import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Customer, CustomerType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPaginated } from '@/utils/supabasePagination';

// Clientes alimentam selects em várias telas. A lista muda apenas por mutations
// locais (que já invalidam o prefixo `customers`), então refazer o fetch-all a
// cada montagem/foco só multiplica custo sem melhorar a consistência percebida.
const CUSTOMERS_STALE_TIME_MS = 5 * 60 * 1000;

export interface CustomerInput {
  name: string;
  customer_type: CustomerType;
  company_name?: string;
  nome_fantasia?: string;
  document?: string;
  email?: string;
  phone?: string;
  celular?: string;
  address?: string;
  address_number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  birth_date?: string;
  notes?: string;
  origin?: string;
  // Dados fiscais (tomador NFS-e) — todos opcionais
  inscricao_municipal?: string;
  inscricao_estadual?: string;
  street_number?: string;
  ibge_municipality_code?: string;
  // Coordenadas geocodificadas no cadastro/edição (mapa de rota instantâneo).
  latitude?: number;
  longitude?: number;
}

interface UseCustomersOptions {
  /** Carrega a lista completa. Desative em consumidores que usam apenas mutations. */
  loadCustomers?: boolean;
}

export function useCustomers({ loadCustomers = true }: UseCustomersOptions = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();

  const customersQuery = useQuery({
    queryKey: ['customers', user?.id ?? 'anon'],
    queryFn: async () => {
      const data = await fetchAllPaginated<Customer>(
        () => supabase
          .from('customers')
          .select('*')
          .eq('is_deleted', false)
          .order('name')
      );
      return data;
    },
    enabled: loadCustomers && !!user?.id && !loading,
    staleTime: CUSTOMERS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const createCustomer = useMutation({
    mutationFn: async (input: CustomerInput) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('customers')
        .insert({ ...input, company_id } as any)
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
      toast({ variant: 'destructive', title: 'Erro ao criar cliente', description: getErrorMessage(error) });
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
      toast({ variant: 'destructive', title: 'Erro ao atualizar cliente', description: getErrorMessage(error) });
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('customers')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() } as any)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Cliente excluído com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir cliente', description: getErrorMessage(error) });
    },
  });

  return {
    customers: customersQuery.data ?? [],
    isLoading: customersQuery.isLoading,
    isError: customersQuery.isError,
    error: customersQuery.error,
    refetch: customersQuery.refetch,
    createCustomer,
    updateCustomer,
    deleteCustomer,
  };
}
