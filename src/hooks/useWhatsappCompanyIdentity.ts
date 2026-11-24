import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { resolveWhatsappCompanyValues } from '@/lib/whatsappMessageTemplates';

export type WhatsappCompanyValues = ReturnType<typeof resolveWhatsappCompanyValues>;

/**
 * Nome, CNPJ e telefone reais da empresa, resolvidos pela MESMA regra que o
 * enviador usa (`resolveWhatsappCompanyValues`). A tela mostra esses valores ao
 * lado das variáveis fixas e na prévia. Carregando ou com erro: devolve
 * `undefined` e a tela funciona sem os valores.
 */
export function useWhatsappCompanyIdentity(): WhatsappCompanyValues | undefined {
  const { companyId } = useUserCompany();

  const { data } = useQuery({
    queryKey: ['whatsapp-company-identity', companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<WhatsappCompanyValues> => {
      const [company, settings] = await Promise.all([
        supabase.from('companies').select('name, cnpj, phone').eq('id', companyId as string).maybeSingle(),
        supabase.from('company_settings').select('document, phone').eq('company_id', companyId as string).maybeSingle(),
      ]);
      if (company.error) throw company.error;
      return resolveWhatsappCompanyValues({
        name: company.data?.name,
        cnpj: company.data?.cnpj,
        phone: company.data?.phone,
        settingsDocument: settings.data?.document,
        settingsPhone: settings.data?.phone,
      });
    },
  });

  return data;
}
