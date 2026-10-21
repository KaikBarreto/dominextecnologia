export interface PaidWhatsappTier {
  tier: number;
  price: number;
}

interface WhatsappPricingClient {
  // As Edge Functions ainda usam versões diferentes do supabase-js. O contrato
  // necessário aqui é só o query builder de `from`, não a classe concreta.
  from: (table: string) => any;
}

/** Mesma oferta vendida em `/proposta`: o primeiro nível pago de WhatsApp. */
export async function resolveFirstPaidWhatsappTier(
  supabase: WhatsappPricingClient,
): Promise<PaidWhatsappTier | null> {
  const { data, error } = await supabase
    .from("whatsapp_tiers")
    .select("tier, price")
    .gt("price", 0)
    .order("tier")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const tier = Number(data?.tier);
  const price = Number(data?.price);
  return Number.isInteger(tier) && tier > 1 && Number.isFinite(price) && price > 0
    ? { tier, price }
    : null;
}
