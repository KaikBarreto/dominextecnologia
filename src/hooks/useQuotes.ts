import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface QuoteItem {
  id?: string;
  position: number;
  item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  inventory_id?: string | null;
  service_type_id?: string | null;
}

export interface QuoteInput {
  customer_id?: string;
  prospect_name?: string;
  prospect_phone?: string;
  prospect_email?: string;
  status?: string;
  valid_until?: string;
  discount_type?: string;
  discount_value?: number;
  subtotal?: number;
  discount_amount?: number;
  total_value?: number;
  notes?: string;
  terms?: string;
  assigned_to?: string;
  items: QuoteItem[];
}

export interface Quote {
  id: string;
  quote_number: number;
  customer_id: string | null;
  prospect_name: string | null;
  prospect_phone: string | null;
  prospect_email: string | null;
  status: string;
  valid_until: string | null;
  discount_type: string | null;
  discount_value: number | null;
  subtotal: number | null;
  discount_amount: number | null;
  total_value: number | null;
  notes: string | null;
  terms: string | null;
  assigned_to: string | null;
  token: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: { name: string; email: string | null; phone: string | null };
  quote_items?: QuoteItem[];
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  expirado: 'Expirado',
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  enviado: 'bg-info text-info-foreground',
  aprovado: 'bg-success text-success-foreground',
  rejeitado: 'bg-destructive text-destructive-foreground',
  expirado: 'bg-warning text-warning-foreground',
};

export { STATUS_LABELS, STATUS_COLORS };

export function useQuotes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const quotesQuery = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*, customers(name, email, phone)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Quote[];
    },
  });

  const createQuote = useMutation({
    mutationFn: async (input: QuoteInput) => {
      const { items, ...quoteData } = input;

      const { data: quote, error } = await supabase
        .from('quotes')
        .insert({ ...quoteData, created_by: user?.id })
        .select()
        .single();

      if (error) throw error;

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('quote_items')
          .insert(items.map((item, idx) => ({
            quote_id: quote.id,
            position: idx,
            item_type: item.item_type,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.quantity * item.unit_price,
            inventory_id: item.inventory_id || null,
            service_type_id: item.service_type_id || null,
          })));

        if (itemsError) throw itemsError;
      }

      return quote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({ title: 'Orçamento criado com sucesso!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao criar orçamento', description: err.message, variant: 'destructive' });
    },
  });

  const updateQuote = useMutation({
    mutationFn: async ({ id, items, ...quoteData }: QuoteInput & { id: string }) => {
      const { error } = await supabase
        .from('quotes')
        .update(quoteData)
        .eq('id', id);

      if (error) throw error;

      // Replace items
      await supabase.from('quote_items').delete().eq('quote_id', id);

      if (items && items.length > 0) {
        const { error: itemsError } = await supabase
          .from('quote_items')
          .insert(items.map((item, idx) => ({
            quote_id: id,
            position: idx,
            item_type: item.item_type,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.quantity * item.unit_price,
            inventory_id: item.inventory_id || null,
            service_type_id: item.service_type_id || null,
          })));

        if (itemsError) throw itemsError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({ title: 'Orçamento atualizado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao atualizar orçamento', description: err.message, variant: 'destructive' });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('quotes')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({ title: 'Status atualizado!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao atualizar status', description: err.message, variant: 'destructive' });
    },
  });

  const deleteQuote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({ title: 'Orçamento excluído!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao excluir orçamento', description: err.message, variant: 'destructive' });
    },
  });

  const fetchQuoteByToken = async (token: string) => {
    const { data, error } = await supabase
      .from('quotes')
      .select('*, customers(name, email, phone), quote_items(*)')
      .eq('token', token)
      .single();

    if (error) throw error;
    return data as Quote;
  };

  const respondByToken = async (token: string, status: 'aprovado' | 'rejeitado') => {
    const { error } = await supabase
      .from('quotes')
      .update({ status })
      .eq('token', token);

    if (error) throw error;
  };

  // KPI calculations
  const quotes = quotesQuery.data ?? [];
  const totalOpen = quotes.filter(q => q.status === 'enviado').reduce((s, q) => s + (q.total_value ?? 0), 0);
  const totalApproved = quotes.filter(q => q.status === 'aprovado').length;
  const totalSent = quotes.filter(q => ['enviado', 'aprovado', 'rejeitado'].includes(q.status)).length;
  const conversionRate = totalSent > 0 ? Math.round((totalApproved / totalSent) * 100) : 0;
  const avgTicket = totalApproved > 0
    ? quotes.filter(q => q.status === 'aprovado').reduce((s, q) => s + (q.total_value ?? 0), 0) / totalApproved
    : 0;

  return {
    quotes,
    isLoading: quotesQuery.isLoading,
    createQuote,
    updateQuote,
    updateStatus,
    deleteQuote,
    fetchQuoteByToken,
    respondByToken,
    kpis: { totalOpen, conversionRate, avgTicket, total: quotes.length },
  };
}
