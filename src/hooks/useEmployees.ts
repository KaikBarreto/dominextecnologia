import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface Employee {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  salary: number;
  hire_date: string | null;
  address: string | null;
  pix_key: string | null;
  photo_url: string | null;
  user_id: string | null;
  is_active: boolean;
  monthly_cost: number | null;
  monthly_cost_breakdown: Record<string, number> | null;
  created_at: string;
  updated_at: string;
}

export function useEmployees() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Employee[];
    },
  });

  const createEmployee = useMutation({
    mutationFn: async (input: Partial<Omit<Employee, 'id' | 'created_at' | 'updated_at'>>) => {
      const { data, error } = await supabase.from('employees').insert(input as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast({ title: 'Funcionário criado!' }); },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao criar funcionário', description: getErrorMessage(e) }),
  });

  const updateEmployee = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Employee> & { id: string }) => {
      const { data, error } = await supabase.from('employees').update(input as any).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast({ title: 'Funcionário atualizado!' }); },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao atualizar funcionário', description: getErrorMessage(e) }),
  });

  const deleteEmployee = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employees').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast({ title: 'Funcionário excluído!' }); },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao excluir funcionário', description: getErrorMessage(e) }),
  });

  return {
    employees: employeesQuery.data || [],
    isLoading: employeesQuery.isLoading,
    createEmployee, updateEmployee, deleteEmployee,
  };
}
