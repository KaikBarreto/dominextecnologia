import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

/**
 * Fronteira Supabase dos formulários públicos de captação de cliente
 * (`lead_capture_forms`). Componente NUNCA chama `supabase.from` direto.
 *
 * Regras do contrato do backend:
 *  - `short_code` é gerado por trigger no servidor — NUNCA enviamos no insert.
 *  - `company_id` + `created_by` são carimbados no insert (RLS escopa por company).
 *  - submissão pública vai por edge (`lead-capture-submit`), NÃO por este hook.
 */

export type LeadCaptureForm = Database['public']['Tables']['lead_capture_forms']['Row'];

/** Whitelist FIXA de campos do formulário (bate com o backend). */
export const LEAD_CAPTURE_FIELDS = [
  'name',
  'customer_type',
  'document',
  'email',
  'phone',
  'celular',
  'company_name',
  'nome_fantasia',
  'zip_code',
  'address',
  'address_number',
  'neighborhood',
  'complement',
  'city',
  'state',
  'notes',
] as const;

export type LeadCaptureFieldKey = (typeof LEAD_CAPTURE_FIELDS)[number];

export interface LeadCaptureFieldSetting {
  enabled: boolean;
  required: boolean;
}

export type LeadCaptureFieldConfig = Partial<Record<LeadCaptureFieldKey, LeadCaptureFieldSetting>>;

export interface LeadCaptureFormInput {
  title: string;
  description?: string | null;
  field_config: LeadCaptureFieldConfig;
  is_active?: boolean;
  expires_at?: string | null;
  require_consent?: boolean;
  consent_text?: string | null;
  max_submissions?: number | null;
}

export function useLeadCaptureForms() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();

  const formsQuery = useQuery({
    queryKey: ['lead-capture-forms', user?.id ?? 'anon'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_capture_forms')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadCaptureForm[];
    },
    enabled: !loading && !!user,
    retry: 2,
  });

  const createForm = useMutation({
    mutationFn: async (input: LeadCaptureFormInput) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data: userData } = await supabase.auth.getUser();
      const created_by = userData.user?.id;
      if (!created_by) throw new Error('Usuário não autenticado');

      // OMITIMOS short_code de propósito — o trigger do servidor o gera.
      const { data, error } = await supabase
        .from('lead_capture_forms')
        .insert({ ...input, company_id, created_by } as any)
        .select()
        .single();
      if (error) throw error;
      return data as LeadCaptureForm;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-capture-forms'] });
      toast({ title: 'Formulário criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar formulário', description: getErrorMessage(error) });
    },
  });

  const updateForm = useMutation({
    mutationFn: async ({ id, ...input }: LeadCaptureFormInput & { id: string }) => {
      const { data, error } = await supabase
        .from('lead_capture_forms')
        .update({ ...input, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as LeadCaptureForm;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-capture-forms'] });
      toast({ title: 'Formulário atualizado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar formulário', description: getErrorMessage(error) });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('lead_capture_forms')
        .update({ is_active, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead-capture-forms'] });
      toast({ title: variables.is_active ? 'Formulário ativado' : 'Formulário desativado' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao alterar status', description: getErrorMessage(error) });
    },
  });

  const deleteForm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lead_capture_forms').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-capture-forms'] });
      toast({ title: 'Formulário excluído com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir formulário', description: getErrorMessage(error) });
    },
  });

  return {
    forms: formsQuery.data ?? [],
    isLoading: formsQuery.isLoading,
    isError: formsQuery.isError,
    refetch: formsQuery.refetch,
    createForm,
    updateForm,
    toggleActive,
    deleteForm,
  };
}
