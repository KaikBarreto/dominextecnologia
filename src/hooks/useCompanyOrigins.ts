import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CompanyOrigin {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  created_at: string | null;
}

function isDuplicateOriginError(e: any): boolean {
  if (!e) return false;
  if (e.code === '23505') return true;
  const msg = String(e.message || '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('company_origins_name_unique');
}

export function useCompanyOrigins() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['company-origins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_origins')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as CompanyOrigin[];
    },
  });

  const createOrigin = useMutation({
    mutationFn: async (input: { name: string; icon?: string; color?: string }) => {
      const { data, error } = await supabase.from('company_origins').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-origins'] }); toast({ title: 'Origem criada!' }); },
    onError: (e: any) => {
      if (isDuplicateOriginError(e)) {
        toast({ variant: 'destructive', title: 'Nome já utilizado', description: 'Já existe uma origem com esse nome. Escolha outro nome.' });
        return;
      }
      toast({ variant: 'destructive', title: 'Erro', description: e.message });
    },
  });

  const updateOrigin = useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; icon?: string; color?: string }) => {
      const { error } = await supabase.from('company_origins').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-origins'] }); toast({ title: 'Origem atualizada!' }); },
    onError: (e: any) => {
      if (isDuplicateOriginError(e)) {
        toast({ variant: 'destructive', title: 'Nome já utilizado', description: 'Já existe uma origem com esse nome. Escolha outro nome.' });
        return;
      }
      toast({ variant: 'destructive', title: 'Erro', description: e.message });
    },
  });

  const deleteOrigin = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_origins').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-origins'] }); toast({ title: 'Origem removida!' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Erro', description: e.message }),
  });

  return { origins: query.data || [], isLoading: query.isLoading, createOrigin, updateOrigin, deleteOrigin };
}
