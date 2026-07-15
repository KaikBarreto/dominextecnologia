// Fonte ÚNICA dos números de WhatsApp do comercial/suporte do Dominex.
// Todas as CTAs de aquisição (landing) e os links de suporte do app leem
// daqui — atualizar aqui reflete automaticamente em todos os lugares.
export const WHATSAPP_NUMBERS = [
  "5521966885044", // (21) 96688-5044
  "5521978758227", // (21) 97875-8227
];

// Sorteio aleatório — distribui os contatos de forma uniforme entre os
// números, já que a maioria dos cliques vem de visitantes de primeiro acesso.
export function getRandomWhatsAppNumber(): string {
  const index = Math.floor(Math.random() * WHATSAPP_NUMBERS.length);
  return WHATSAPP_NUMBERS[index];
}
