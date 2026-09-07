// Cores dos cards de FORMA DE PAGAMENTO dos checkouts (paleta aprovada pelo CEO
// em 2026-09-07). Card SELECIONADO = fundo cheio na cor + ícone/título/subtítulo
// BRANCOS + borda na mesma cor. Não selecionado = fundo claro e borda neutra.
//
// Fonte única pras DUAS telas de checkout (têm que ficar idênticas):
//   • /pagar/:code        → src/pages/PublicCheckout.tsx (cobrança avulsa)
//   • /checkout           → src/components/checkout/CheckoutLayout.tsx (assinatura)
//
// São valores literais (hsl()/hex), NÃO tokens de tema: o painel de pagamento é
// sempre claro e neutro (não herda a cor de marca do tenant), então essas três
// cores precisam ser estáveis e independentes do white-label.
export const PAYMENT_METHOD_COLORS = {
  /** Azul — mesmo valor do token `--info` do tema claro (200 85% 45%). */
  card: 'hsl(200, 85%, 45%)',
  /** Verde-água oficial da marca Pix (#32BCAD ≈ hsl(174, 58%, 47%)). */
  pix: '#32BCAD',
  /** Grafite escuro (slate-800). */
  boleto: '#1e293b',
} as const;

export type PaymentMethodKey = keyof typeof PAYMENT_METHOD_COLORS;
