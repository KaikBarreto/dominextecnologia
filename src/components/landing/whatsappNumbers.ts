// Fonte ÚNICA dos números de WhatsApp do comercial/suporte do Dominex.
// Todas as CTAs de aquisição (landing) e os links de suporte do app leem
// daqui — atualizar aqui reflete automaticamente em todos os lugares.
//
// FALLBACK DE SEGURANÇA: usado quando a RPC get_landing_whatsapp_numbers()
// falha ou retorna vazio. Mantém apenas o número do Maicon (rodízio ativo).
// O número da Livia (5521978758227) saiu do rodízio de vendas em 2026-08-09.
export const WHATSAPP_NUMBERS = [
  "5521966885044", // Maicon — (21) 96688-5044
];

// Sorteio aleatório — distribui os contatos de forma uniforme entre os
// números, já que a maioria dos cliques vem de visitantes de primeiro acesso.
export function getRandomWhatsAppNumber(): string {
  const index = Math.floor(Math.random() * WHATSAPP_NUMBERS.length);
  return WHATSAPP_NUMBERS[index];
}
