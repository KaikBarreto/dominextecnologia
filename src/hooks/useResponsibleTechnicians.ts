import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import { getCurrentUserCompanyId } from '@/hooks/useUserCompany';

/**
 * Responsável Técnico (RT).
 *
 * Papel regulatório do PMOC (Lei 13.589/2018). Tem CFT/CREA, modalidade,
 * registro ART/TRT, e pode ter assinatura/carimbo digitalizados (imagens
 * armazenadas no bucket `responsible-technicians-media`).
 *
 * Tabela criada na Onda A da v1.9.0 (plano `docs/planos/2026-05-23-pmoc-v1.9-arquitetura.md`).
 * RLS: scope por `company_id` (Plataforma define regra, Database implementa).
 */
export interface ResponsibleTechnician {
  id: string;
  company_id: string;
  full_name: string;
  cft_crea: string | null;
  modality: string | null;
  registry_number: string | null;
  signature_image_url: string | null;
  stamp_image_url: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ResponsibleTechnicianInput {
  full_name: string;
  cft_crea?: string | null;
  modality?: string | null;
  registry_number?: string | null;
  signature_image_url?: string | null;
  stamp_image_url?: string | null;
  email?: string | null;
  phone?: string | null;
  is_active?: boolean;
  notes?: string | null;
}

interface UseResponsibleTechniciansOptions {
  activeOnly?: boolean;
  search?: string;
}

const STORAGE_BUCKET = 'responsible-technicians-media';

/**
 * Lista, cria, edita e desativa (soft delete) Responsáveis Técnicos do tenant.
 */
export function useResponsibleTechnicians(options: UseResponsibleTechniciansOptions = {}) {
  const { activeOnly = false, search } = options;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();

  const techniciansQuery = useQuery({
    queryKey: ['responsible-technicians', { activeOnly, search: search ?? '', userId: user?.id ?? 'anon' }],
    queryFn: async () => {
      let query = supabase
        .from('responsible_technicians')
        .select('*')
        .order('full_name', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      if (search && search.trim().length > 0) {
        query = query.ilike('full_name', `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ResponsibleTechnician[];
    },
    enabled: !loading,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const createTechnician = useMutation({
    mutationFn: async (input: ResponsibleTechnicianInput) => {
      const company_id = await getCurrentUserCompanyId();
      const payload = {
        ...input,
        company_id,
        is_active: input.is_active ?? true,
        created_by: user?.id ?? null,
      };
      const { data, error } = await supabase
        .from('responsible_technicians')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ResponsibleTechnician;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['responsible-technicians'] });
      toast({ title: 'Responsável técnico cadastrado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao cadastrar responsável técnico',
        description: getErrorMessage(error),
      });
    },
  });

  const updateTechnician = useMutation({
    mutationFn: async ({ id, ...input }: ResponsibleTechnicianInput & { id: string }) => {
      const { data, error } = await supabase
        .from('responsible_technicians')
        .update(input as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ResponsibleTechnician;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['responsible-technicians'] });
      toast({ title: 'Responsável técnico atualizado!' });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar responsável técnico',
        description: getErrorMessage(error),
      });
    },
  });

  /**
   * Soft delete: marca `is_active=false`. Mantém histórico de contratos que
   * referenciam este RT. Database limpa registros antigos via política, não daqui.
   */
  const deactivateTechnician = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('responsible_technicians')
        .update({ is_active: false } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['responsible-technicians'] });
      toast({ title: 'Responsável técnico inativado.' });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao inativar responsável técnico',
        description: getErrorMessage(error),
      });
    },
  });

  /**
   * Reativa um RT antes inativo. (`is_active=true`)
   */
  const reactivateTechnician = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('responsible_technicians')
        .update({ is_active: true } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['responsible-technicians'] });
      toast({ title: 'Responsável técnico reativado.' });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao reativar responsável técnico',
        description: getErrorMessage(error),
      });
    },
  });

  return {
    technicians: techniciansQuery.data ?? [],
    isLoading: techniciansQuery.isLoading,
    isError: techniciansQuery.isError,
    error: techniciansQuery.error,
    refetch: techniciansQuery.refetch,
    createTechnician,
    updateTechnician,
    deactivateTechnician,
    reactivateTechnician,
  };
}

/**
 * Upload de imagem (assinatura ou carimbo) para o bucket `responsible-technicians-media`.
 *
 * Path determinístico: `{company_id}/{rt_id}/{kind}.{ext}`
 * — `kind` é `signature` ou `stamp`.
 *
 * Retorna a `publicUrl` pronta pra salvar em `signature_image_url` / `stamp_image_url`.
 *
 * Por que recebe `companyId` e `technicianId` em vez de pegar do contexto:
 * — pra evitar criar dependências cruzadas; o componente que chama já tem ambos.
 */
export async function uploadResponsibleTechnicianMedia(params: {
  companyId: string;
  technicianId: string;
  kind: 'signature' | 'stamp';
  file: File;
}): Promise<string> {
  const { companyId, technicianId, kind, file } = params;

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const path = `${companyId}/${technicianId}/${kind}.${ext}`;

  // upsert=true pra permitir trocar a imagem sem precisar deletar a anterior.
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
