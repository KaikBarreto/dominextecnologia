import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { registrationOfferConfiguration, type BusinessCore } from '@/lib/businessCore';

export function useCreateRegistrationCoreOffer() {
  return useMutation({
    mutationFn: async ({core,params,affiliateTrialOnly=false}:{core:BusinessCore;params:URLSearchParams;affiliateTrialOnly?:boolean}) => {
      const {data,error}=await supabase.rpc('create_registration_core_offer_v1',{
        p_business_core:core,p_configuration:affiliateTrialOnly?{link_type:'teste',affiliate_id:params.get('afiliado')}:registrationOfferConfiguration(params),
      });
      const offer=data as {token?:string;business_core?:string}|null;
      if(error||!offer?.token) throw new Error('Não foi possível preparar o link. Tente novamente.');
      return offer.token;
    },
  });
}
