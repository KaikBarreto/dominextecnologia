/** Atribuição compartilhada pela ativação inicial e pela primeira venda legada.
 * Valor, ciclo, vínculo e idempotência são reconciliados pela RPC a partir do
 * pagamento persistido; este helper nunca credita LTV nem cria receita.
 */
export async function recordFirstSaleAttribution(
  supabase: { rpc: unknown }, companyId: string, paymentId: string,
): Promise<void> {
  const rpc = (supabase.rpc as (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>).bind(supabase);
  const { data, error } = await rpc('record_subscription_first_sale_attribution', {
    p_company_id: companyId, p_asaas_payment_id: paymentId,
  });
  const result = data as { recorded?: unknown; eligible?: unknown; already_recorded?: unknown } | null;
  if (error || !result || typeof result.recorded !== 'boolean'
    || (!result.recorded && result.eligible !== false && result.already_recorded !== true)) {
    throw new Error('Não foi possível registrar a atribuição da primeira venda.');
  }
}
