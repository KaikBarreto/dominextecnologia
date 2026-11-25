import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { assertRowsAffected } from '@/lib/supabaseMutation';

export const CONTACT_MUTATION_TIMEOUT_MS = 15_000;

export class ContactMutationTimeoutError extends Error {
  constructor() {
    super('Tempo limite excedido ao salvar o contato.');
    this.name = 'ContactMutationTimeoutError';
  }
}

export async function runContactMutation<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = CONTACT_MUTATION_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new ContactMutationTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve(request(controller.signal)),
      deadline,
    ]);
  } catch (error) {
    if (timedOut || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new ContactMutationTimeoutError();
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export interface CustomerContact {
  id: string;
  customer_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  birth_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useCustomerContacts(customerId?: string) {
  const queryClient = useQueryClient();

  const contactsQuery = useQuery({
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
  const contacts = contactsQuery.data ?? [];
  const isLoading = contactsQuery.isLoading;

  const createContact = useMutation({
    mutationFn: async (contact: { id?: string; customer_id: string; name: string; phone?: string; email?: string; position?: string; birth_date?: string | null; notes?: string }) => {
      const { data, error } = await runContactMutation((signal) => supabase
        .from('customer_contacts')
        .upsert(contact, { onConflict: 'id' })
        .abortSignal(signal)
        .select()
        .single());
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-contacts', customerId] }),
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; phone?: string; email?: string; position?: string; birth_date?: string | null; notes?: string }) => {
      const { data, error } = await runContactMutation((signal) => supabase
        .from('customer_contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .abortSignal(signal)
        .select()
        .single());
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-contacts', customerId] }),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const result = await runContactMutation((signal) => supabase
        .from('customer_contacts')
        .delete({ count: 'exact' })
        .eq('id', id)
        .abortSignal(signal));
      assertRowsAffected(result, 'delete');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer-contacts', customerId] }),
  });

  return {
    contacts,
    isLoading,
    isError: contactsQuery.isError,
    error: contactsQuery.error,
    refetch: contactsQuery.refetch,
    createContact,
    updateContact,
    deleteContact,
  };
}
