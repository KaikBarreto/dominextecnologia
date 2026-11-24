import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { PortalCall } from '@/lib/portalCalls';

export const PORTAL_CALLS_QUERY_KEY = ['portal-calls'] as const;

interface UsePortalCallsOptions {
  customerId?: string;
  contractId?: string;
  equipmentId?: string;
  enabled?: boolean;
}

function getServiceOrderId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const id = (value as Record<string, unknown>).service_order_id;
  return typeof id === 'string' ? id : null;
}

function portalCallErrorMessage(error: unknown, action: 'convert' | 'close'): string {
  const code = typeof error === 'object' && error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code === '42501') return 'Você não tem permissão para atualizar este chamado.';
  if (code === 'P0002') return 'Este chamado não foi encontrado ou não está mais disponível.';
  if (code === '23514' || code === 'P0001') {
    return action === 'convert'
      ? 'Este chamado já foi analisado. Atualize a lista para conferir a situação atual.'
      : 'Este chamado não pode mais ser encerrado sem gerar uma OS.';
  }
  return action === 'convert'
    ? 'Não foi possível criar a OS agora. O chamado continua aguardando análise; tente novamente.'
    : 'Não foi possível encerrar o chamado agora. Tente novamente.';
}

export function usePortalCalls(options: UsePortalCallsOptions = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { customerId, contractId, equipmentId, enabled = true } = options;

  const query = useQuery({
    queryKey: [...PORTAL_CALLS_QUERY_KEY, { customerId, contractId, equipmentId }],
    enabled: Boolean(user) && enabled,
    queryFn: async (): Promise<PortalCall[]> => {
      let request = supabase
        .from('portal_calls')
        .select(`
          *,
          customer:customers(id, name, phone, celular),
          equipment:equipment(id, name, brand, model),
          contract:contracts(id, name),
          service_order:service_orders(id, order_number, status, scheduled_date)
        `)
        .order('created_at', { ascending: false });
      if (customerId) request = request.eq('customer_id', customerId);
      if (contractId) request = request.eq('contract_id', contractId);
      if (equipmentId) request = request.eq('equipment_id', equipmentId);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as unknown as PortalCall[];
    },
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PORTAL_CALLS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['service-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }),
    ]);
  };

  const convertCall = useMutation({
    mutationFn: async (callId: string): Promise<{ serviceOrderId: string }> => {
      const { data, error } = await supabase.rpc('convert_portal_call_to_service_order', {
        p_call_id: callId,
      });
      if (error) throw error;
      const serviceOrderId = getServiceOrderId(data);
      if (!serviceOrderId) throw new Error('portal_call_conversion_missing_service_order');
      return { serviceOrderId };
    },
    onSuccess: async () => {
      await invalidate();
      toast({
        title: 'OS criada a partir do chamado',
        description: 'O chamado foi vinculado à nova ordem de serviço.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível criar a OS',
        description: portalCallErrorMessage(error, 'convert'),
        variant: 'destructive',
      });
    },
  });

  const closeCall = useMutation({
    mutationFn: async (callId: string): Promise<void> => {
      const { error } = await supabase.rpc('close_portal_call_without_os', {
        p_call_id: callId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidate();
      toast({
        title: 'Chamado encerrado',
        description: 'O chamado foi encerrado sem gerar uma ordem de serviço.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Não foi possível encerrar o chamado',
        description: portalCallErrorMessage(error, 'close'),
        variant: 'destructive',
      });
    },
  });

  const calls = query.data ?? [];
  return {
    calls,
    awaitingReviewCount: calls.filter((call) => call.status === 'aguardando_analise').length,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    convertCall,
    closeCall,
  };
}
