import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CustomerContact {
  id: string;
  customer_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useCustomerContacts(customerId?: string) {
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['customer-contacts', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const { data, error } = await supabase
        .from('customer_contacts')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as CustomerContact[];
    },
    enabled: !!customerId,
  });

  const createContact = useMutation({
    mutationFn: async (contact: { customer_id: string; name: string; phone?: string; email?: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('customer_contacts')
        .insert(contact)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-contacts', customerId] }),
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; phone?: string; email?: string; notes?: string }) => {
      const { data, error } = await supabase
        .from('customer_contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-contacts', customerId] }),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customer_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-contacts', customerId] }),
  });

  return { contacts, isLoading, createContact, updateContact, deleteContact };
}
