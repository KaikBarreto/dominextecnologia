import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface ServiceType {
  id: string;
  name: string;
  color: string;
  description: string | null;
  is_active: boolean;
  requires_equipment: boolean;
  number_prefix: string | null;
  // Campos fiscais (NFS-e por tipo de serviço) — opcionais por tenant.
  codigo_servico: string | null;
  codigo_nbs: string | null;
  iss_aliquota: number | null;
  item_lc116: string | null;
  // Preço padrão para auto-preenchimento de orçamentos (opcional).
  default_price: number | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceTypeInput {
  name: string;
  color: string;
  description?: string;
  is_active?: boolean;
  requires_equipment?: boolean;
  number_prefix?: string;
  // Campos fiscais (NFS-e por tipo de serviço) — opcionais.
  codigo_servico?: string | null;
  codigo_nbs?: string | null;
  iss_aliquota?: number | null;
  item_lc116?: string | null;
  // Preço padrão para auto-preenchimento de orçamentos (opcional).
  default_price?: number | null;
}

export function useServiceTypes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: serviceTypes = [], isLoading } = useQuery({
    queryKey: ['service-types'],
    queryFn: async () => {
      // Defense-in-depth: filtra pela própria empresa no client (RLS continua a fronteira)
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const companyId = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('service_types')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      if (error) throw error;
      return data as unknown as ServiceType[];
    },
  });

  const createServiceType = useMutation({
    mutationFn: async (input: ServiceTypeInput) => {
      const { data, error } = await supabase
        .from('service_types')
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Tipo de serviço criado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(error) });
    },
  });

  const updateServiceType = useMutation({
    mutationFn: async ({ id, ...input }: ServiceTypeInput & { id: string }) => {
      const { data, error } = await supabase
        .from('service_types')
        .update(input as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Tipo de serviço atualizado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(error) });
    },
  });

  /**
   * Gap-fill silencioso dos campos fiscais de um tipo de serviço (sem toast).
   * Usado na emissão de NFS-e: quando o usuário completa códigos que estavam
   * vazios no serviço, gravamos de volta pra próxima emissão já puxar tudo.
   * Falha não atrapalha o fluxo de quem chamou (devolve sucesso/erro).
   */
  const gapFillServiceTypeFiscal = async (
    id: string,
    fields: Partial<Pick<ServiceTypeInput, 'codigo_servico' | 'codigo_nbs' | 'iss_aliquota' | 'item_lc116'>>,
  ): Promise<boolean> => {
    if (Object.keys(fields).length === 0) return true;
    const { error } = await supabase
      .from('service_types')
      .update(fields as any)
      .eq('id', id);
    if (error) return false;
    queryClient.invalidateQueries({ queryKey: ['service-types'] });
    return true;
  };

  const deleteServiceType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('service_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      toast({ title: 'Tipo de serviço removido!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir tipo de serviço', description: getErrorMessage(error) });
    },
  });

  return {
    serviceTypes,
    isLoading,
    createServiceType,
    updateServiceType,
    gapFillServiceTypeFiscal,
    deleteServiceType,
  };
}
