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
  // Categoria de serviço (agrupamento) — nullable, FK para service_type_categories.
  category_id: string | null;
  // Campos fiscais (NFS-e por tipo de serviço) — opcionais por tenant.
  codigo_servico: string | null;
  /** cTribMun: complemento municipal de 3 dígitos do código de tributação. */
  codigo_tributacao_municipal: string | null;
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
  // Categoria de serviço (agrupamento) — nullable.
  category_id?: string | null;
  // Campos fiscais (NFS-e por tipo de serviço) — opcionais.
  codigo_servico?: string | null;
  /** cTribMun: complemento municipal de 3 dígitos do código de tributação. */
  codigo_tributacao_municipal?: string | null;
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
   * Completa os campos fiscais VAZIOS de um tipo de serviço (sem toast).
   * Usado na emissão de NFS-e: quando o usuário informa na nota um código que
   * ainda não está no cadastro do serviço, gravamos de volta pra próxima
   * emissão já puxar tudo. Falha não atrapalha o fluxo de quem chamou.
   *
   * Regra dura: só preenche buraco. Campo que JÁ tem valor diferente nunca é
   * sobrescrito, mesmo que a nota use outro código — pode ser exceção legítima
   * daquela nota, e trocar o cadastro por causa dela seria pior que não fazer
   * nada. A checagem é feita contra o banco na hora (não contra o cache), pra
   * não sobrescrever algo que outra pessoa acabou de cadastrar.
   */
  const gapFillServiceTypeFiscal = async (
    id: string,
    fields: Partial<
      Pick<
        ServiceTypeInput,
        | 'codigo_servico'
        | 'codigo_tributacao_municipal'
        | 'codigo_nbs'
        | 'iss_aliquota'
        | 'item_lc116'
      >
    >,
  ): Promise<boolean> => {
    const requested = Object.entries(fields).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    );
    if (requested.length === 0) return true;

    // Defense-in-depth: escopo da própria empresa (RLS continua a fronteira).
    const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
    const companyId = await getCurrentUserCompanyId();

    const { data: current, error: readError } = await supabase
      .from('service_types')
      .select('codigo_servico, codigo_tributacao_municipal, codigo_nbs, iss_aliquota, item_lc116')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (readError || !current) return false;

    const row = current as Record<string, unknown>;
    // Vazio é nulo/em branco. Zero NÃO é vazio: alíquota 0% é uma decisão
    // fiscal legítima (serviço isento) e não pode ser sobrescrita.
    const isEmpty = (v: unknown) => v === null || v === undefined || v === '';
    const patch = Object.fromEntries(requested.filter(([k]) => isEmpty(row[k])));
    if (Object.keys(patch).length === 0) return true;

    const { error } = await supabase
      .from('service_types')
      .update(patch as never)
      .eq('id', id)
      .eq('company_id', companyId);
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
