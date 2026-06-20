import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface CustomerOrigin {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Conjunto inicial de origens, criado de uma vez pra empresa nova.
 * São linhas NORMAIS — totalmente editáveis e excluíveis pelo usuário.
 * Base universal herdada das origens fixas antigas do CRM.
 */
export const DEFAULT_CUSTOMER_ORIGINS: Array<Pick<CustomerOrigin, 'name' | 'icon' | 'color'>> = [
  { name: 'Indicação', icon: 'Users', color: '#22C55E' },
  { name: 'Site', icon: 'Globe', color: '#3B82F6' },
  { name: 'Telefone', icon: 'Phone', color: '#0EA5E9' },
  { name: 'WhatsApp', icon: 'MessageCircle', color: '#10B981' },
  { name: 'Google', icon: 'Search', color: '#EAB308' },
  { name: 'Instagram', icon: 'Instagram', color: '#EC4899' },
  { name: 'Facebook', icon: 'Facebook', color: '#6366F1' },
  { name: 'Parceiro', icon: 'Handshake', color: '#A855F7' },
  { name: 'Feira/Evento', icon: 'CalendarDays', color: '#F97316' },
  { name: 'Outro', icon: 'Tag', color: '#6B7280' },
];

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
    onError: (err) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) }),
  });

  const seedDefaultOrigins = useMutation({
    mutationFn: async () => {
      // Idempotência: só semeia quando o catálogo está vazio.
      const existing = originsQuery.data ?? [];
      if (existing.length > 0) return [];

      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const rows = DEFAULT_CUSTOMER_ORIGINS.map((o) => ({
        ...o,
        is_active: true,
        company_id,
      }));
      const { data, error } = await supabase
        .from('customer_origins' as any)
        .insert(rows as any)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-origins'] });
      toast({ title: 'Origens padrão criadas!' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) }),
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
    onError: (err) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) }),
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
    onError: (err) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) }),
  });

  const activeOrigins = (originsQuery.data || []).filter(o => o.is_active);

  return {
    origins: originsQuery.data || [],
    activeOrigins,
    isLoading: originsQuery.isLoading,
    createOrigin,
    seedDefaultOrigins,
    updateOrigin,
    deleteOrigin,
  };
}
