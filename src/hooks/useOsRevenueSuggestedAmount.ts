import { supabase } from '@/integrations/supabase/client';

/**
 * Relê o valor canônico da OS no instante em que um fluxo financeiro começa.
 *
 * `service_orders.total_value` é mantido no servidor pela sincronização do
 * orçamento da OS e já consolida serviços, mão de obra, materiais e eventuais
 * ajustes/descontos. O objeto em memória da lista/detalhe pode estar defasado
 * logo depois de editar os itens; por isso ele é somente fallback do chamador.
 *
 * O filtro client-side por empresa é defesa em profundidade. A RLS de
 * `service_orders` continua sendo a barreira de segurança real.
 */
export async function fetchOsRevenueSuggestedAmount(
  serviceOrderId: string,
): Promise<number | null> {
  try {
    const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
    const companyId = await getCurrentUserCompanyId();
    if (!companyId) return null;

    const { data, error } = await supabase
      .from('service_orders')
      .select('total_value')
      .eq('company_id', companyId)
      .eq('id', serviceOrderId)
      .maybeSingle();

    if (error || !data || data.total_value == null) return null;

    const amount = Number(data.total_value);
    // Zero significa "sem sugestão" e é aceito; negativo é dado legado
    // inconsistente e faria o formulário nascer inválido (o schema exige > 0).
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  } catch {
    return null;
  }
}
