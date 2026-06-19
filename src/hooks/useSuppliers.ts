import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type Supplier = Tables<'suppliers'>;
export type SupplierInsert = TablesInsert<'suppliers'>;
export type SupplierUpdate = TablesUpdate<'suppliers'>;

/** Campos editáveis do fornecedor (sem company_id/created_by — vêm do contexto). */
export interface SupplierInput {
  name: string;
  cpf_cnpj?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export function useSuppliers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { data: suppliers = [], isLoading, error } = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const createSupplier = useMutation({
    mutationFn: async (input: SupplierInput) => {
      // RLS exige company_id no INSERT — sem ele a linha é rejeitada em silêncio.
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');
      const payload: SupplierInsert = {
        ...input,
        company_id: companyId,
        created_by: user?.id ?? null,
      };
      const { data, error } = await supabase
        .from('suppliers')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: 'Fornecedor cadastrado!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao cadastrar fornecedor', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateSupplier = useMutation({
    mutationFn: async ({ id, ...updates }: SupplierInput & { id: string }) => {
      const { error } = await supabase
        .from('suppliers')
        .update(updates as SupplierUpdate)
        .eq('id', id);
      if (error) throw error;
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: 'Fornecedor atualizado!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar fornecedor', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const deleteSupplier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast({ title: 'Fornecedor removido!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover fornecedor', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  return {
    suppliers,
    isLoading,
    error,
    createSupplier,
    updateSupplier,
    deleteSupplier,
  };
}
