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
  // BDI cost fields
  unit_hourly_rate?: number;
  unit_hours?: number;
  unit_labor_cost?: number;
  unit_materials_cost?: number;
  unit_extras_cost?: number;
  unit_total_cost?: number;
  profit_rate?: number;
  bdi?: number;
  price_override?: number | null;
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
  proposal_template_id?: string;
  // BDI fields
  tax_rate?: number;
  admin_indirect_rate?: number;
  profit_rate?: number;
  km_cost?: number;
  distance_km?: number;
  displacement_cost?: number;
  bdi?: number;
  total_cost?: number;
  total_price?: number;
  price_override?: number;
  final_price?: number;
  include_gifts?: boolean;
  card_discount_rate?: number;
  card_installments?: number;
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
  proposal_template_id: string | null;
  token: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  converted_to_os_id: string | null;
  final_price: number | null;
  // BDI fields (optional for backward compatibility in older UI mocks)
  tax_rate?: number | null;
  admin_indirect_rate?: number | null;
  profit_rate?: number | null;
  km_cost?: number | null;
  distance_km?: number | null;
  displacement_cost?: number | null;
  bdi?: number | null;
  total_cost?: number | null;
  total_price?: number | null;
  price_override?: number | null;
  include_gifts?: boolean | null;
  card_discount_rate?: number | null;
  card_installments?: number | null;
  customers?: { name: string; email: string | null; phone: string | null };
  quote_items?: QuoteItem[];
  proposal_templates?: { slug: string; name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  expirado: 'Expirado',
  convertido: 'Convertido',
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  enviado: 'bg-info text-info-foreground',
  aprovado: 'bg-success text-success-foreground',
  rejeitado: 'bg-destructive text-destructive-foreground',
  expirado: 'bg-warning text-warning-foreground',
  convertido: 'bg-primary text-primary-foreground',
};

export { STATUS_LABELS, STATUS_COLORS };

function buildItemPayload(item: QuoteItem, quoteId: string, idx: number) {
  return {
    quote_id: quoteId,
    position: idx,
    item_type: item.item_type,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.quantity * item.unit_price,
    inventory_id: item.inventory_id || null,
    service_type_id: item.service_type_id || null,
    unit_hourly_rate: item.unit_hourly_rate ?? 0,
    unit_hours: item.unit_hours ?? 0,
    unit_labor_cost: item.unit_labor_cost ?? 0,
    unit_materials_cost: item.unit_materials_cost ?? 0,
    unit_extras_cost: item.unit_extras_cost ?? 0,
    unit_total_cost: item.unit_total_cost ?? 0,
    profit_rate: item.profit_rate ?? 10,
    bdi: item.bdi ?? 0.68,
    price_override: item.price_override ?? null,
  };
}

export function useQuotes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const quotesQuery = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*, customers(name, email, phone), quote_items(*), proposal_templates(slug, name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Quote[];
    },
  });

  const createQuote = useMutation({
    mutationFn: async (input: QuoteInput) => {
      const { items, displacement_cost, ...quoteData } = input as any;

      const { data: quote, error } = await supabase
        .from('quotes')
        .insert({ ...quoteData, created_by: user?.id } as any)
        .select()
        .single();

      if (error) throw error;

      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('quote_items')
          .insert(items.map((item, idx) => buildItemPayload(item, quote.id, idx)));

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
    mutationFn: async ({ id, items, displacement_cost, ...quoteData }: QuoteInput & { id: string } & { displacement_cost?: any }) => {
      const { error } = await supabase
        .from('quotes')
        .update(quoteData as any)
        .eq('id', id);

      if (error) throw error;

      // Replace items
      await supabase.from('quote_items').delete().eq('quote_id', id);

      if (items && items.length > 0) {
        const { error: itemsError } = await supabase
          .from('quote_items')
          .insert(items.map((item, idx) => buildItemPayload(item, id, idx)));

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

  const duplicateQuote = useMutation({
    mutationFn: async (source: Quote) => {
      const { data: newQuote, error } = await supabase
        .from('quotes')
        .insert({
          customer_id: source.customer_id,
          prospect_name: source.prospect_name,
          prospect_phone: source.prospect_phone,
          prospect_email: source.prospect_email,
          discount_type: source.discount_type,
          discount_value: source.discount_value,
          subtotal: source.subtotal,
          discount_amount: source.discount_amount,
          total_value: source.total_value,
          notes: source.notes,
          terms: source.terms,
          assigned_to: source.assigned_to,
          created_by: user?.id,
          status: 'rascunho',
          tax_rate: source.tax_rate,
          admin_indirect_rate: source.admin_indirect_rate,
          profit_rate: source.profit_rate,
          km_cost: source.km_cost,
          distance_km: source.distance_km,
          bdi: source.bdi,
        } as any)
        .select()
        .single();
      if (error) throw error;

      const sourceItems = source.quote_items ?? [];
      if (sourceItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('quote_items')
          .insert(sourceItems.map((item, idx) => buildItemPayload(item, newQuote.id, idx)));
        if (itemsError) throw itemsError;
      }
      return newQuote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({ title: 'Orçamento duplicado como rascunho!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao duplicar', description: err.message, variant: 'destructive' });
    },
  });

  const createFinancialFromQuote = useMutation({
    mutationFn: async (q: Quote) => {
      const { error } = await supabase.from('financial_transactions').insert({
        transaction_type: 'receita' as any,
        amount: q.total_value ?? 0,
        description: `Orçamento #${q.quote_number}`,
        customer_id: q.customer_id,
        is_paid: false,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Conta a receber gerada!' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao gerar financeiro', description: err.message, variant: 'destructive' });
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

  // KPI calculations — also handle auto-expiration client-side
  const quotes = (quotesQuery.data ?? []).map(q => {
    if (q.status === 'enviado' && q.valid_until) {
      const today = new Date().toISOString().split('T')[0];
      if (q.valid_until < today) {
        supabase.from('quotes').update({ status: 'expirado' }).eq('id', q.id);
        return { ...q, status: 'expirado' };
      }
    }
    return q;
  });

  const totalOpen = quotes.filter(q => q.status === 'enviado').reduce((s, q) => s + (q.total_value ?? 0), 0);
  const totalApproved = quotes.filter(q => q.status === 'aprovado').length;
  const totalSent = quotes.filter(q => ['enviado', 'aprovado', 'rejeitado'].includes(q.status)).length;
  const conversionRate = totalSent > 0 ? Math.round((totalApproved / totalSent) * 100) : 0;
  const avgTicket = totalApproved > 0
    ? quotes.filter(q => q.status === 'aprovado').reduce((s, q) => s + (q.total_value ?? 0), 0) / totalApproved
    : 0;

  // BDI KPIs
  const quotesWithCost = quotes.filter(q => (q.total_cost ?? 0) > 0);
  const avgMarginPct = (() => {
    if (quotesWithCost.length === 0) return 0;
    const margins = quotesWithCost.map(q => {
      const cost = Number(q.total_cost ?? 0);
      const price = Number(q.final_price ?? q.total_value ?? 0);
      return cost > 0 ? ((price - cost) / price) * 100 : 0;
    });
    return Math.round(margins.reduce((a, b) => a + b, 0) / margins.length);
  })();
  const totalCostSum = quotes.reduce((s, q) => s + Number(q.total_cost ?? 0), 0);

  return {
    quotes,
    isLoading: quotesQuery.isLoading,
    createQuote,
    updateQuote,
    updateStatus,
    deleteQuote,
    duplicateQuote,
    createFinancialFromQuote,
    fetchQuoteByToken,
    respondByToken,
    kpis: { totalOpen, conversionRate, avgTicket, total: quotes.length, avgMarginPct, totalCostSum },
  };
}
