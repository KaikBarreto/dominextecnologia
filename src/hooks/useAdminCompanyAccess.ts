import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getInvokeErrorMessage } from '@/utils/errorMessages';

export interface AdminCompanyAccessUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

async function invokeCompanyAccess<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-company-access', { body });

  if (error) {
    const edgeMessage = await getInvokeErrorMessage(error);
    throw new Error(edgeMessage || 'Não foi possível concluir a operação de acesso.');
  }
  if (data?.error) throw new Error(String(data.error));

  return data as T;
}

export function useAdminCompanyAccessUsers(companyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-company-access-users', companyId],
    enabled: enabled && !!companyId,
    queryFn: async () => {
      const response = await invokeCompanyAccess<{ users?: AdminCompanyAccessUser[] }>({
        action: 'list_users',
        company_id: companyId,
      });
      return response.users ?? [];
    },
  });
}

export function useGenerateAdminCompanyResetLink() {
  return useMutation({
    mutationFn: async ({ companyId, userId }: { companyId: string; userId: string }) => {
      const response = await invokeCompanyAccess<{ link?: string }>({
        action: 'generate_reset_link',
        company_id: companyId,
        user_id: userId,
      });

      if (!response.link) throw new Error('Não foi possível gerar o link de redefinição.');
      return response.link;
    },
  });
}
