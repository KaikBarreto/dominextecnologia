/**
 * Vocabulário canônico de "forma de pagamento" (`financial_transactions.payment_method`).
 *
 * Por que existe: 4 telas do Financeiro evoluíram cada uma com o próprio
 * vocabulário pro mesmo conceito — `cartao_debito` vs `debito`;
 * `cartao_credito` vs `credito` vs `credito_avista`/`credito_parcelado` —
 * e isso fragmenta qualquer agrupamento/relatório por forma de pagamento
 * (achado 4b do handoff EcoSistema, 2026-09-04).
 *
 * Regra:
 * - Tela que ESCREVE `payment_method` (Select/options de formulário) só
 *   pode oferecer os códigos de `PAYMENT_METHOD_CODES`.
 * - Tela que LÊ um valor já gravado (pode ser um sinônimo legado, de
 *   antes desta unificação) passa por `normalizePaymentMethod()` antes de
 *   comparar, exibir ou agrupar.
 *
 * NÃO há aqui nenhuma migration de backfill — dado antigo continua
 * gravado com a grafia legada no banco. A normalização é só de LEITURA.
 */

export const PAYMENT_METHOD_CODES = [
  'dinheiro',
  'pix',
  'cartao_debito',
  'cartao_credito',
  'transferencia',
  'boleto',
  'cheque',
] as const;

export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[number];

/**
 * Sinônimos gravados historicamente por telas que já divergiram do
 * vocabulário canônico. Chave = valor cru já persistido no banco;
 * valor = código canônico correspondente.
 *
 * - `debito` → o modal "Confirmar pagamento" de FinanceContas e o
 *   ReceivePaymentModal gravavam assim, em vez de `cartao_debito`.
 * - `credito` → não é escrito por nenhuma tela viva hoje; existiu como
 *   rótulo legado de exibição. Mantido por segurança de leitura.
 * - `credito_avista` / `credito_parcelado` → o ReceivePaymentModal
 *   oferecia os dois como opções separadas. Nenhum consumidor (relatório,
 *   recibo) distinguia os dois depois de gravado — ambos colapsam em
 *   `cartao_credito`.
 */
const LEGACY_PAYMENT_METHOD_SYNONYMS: Record<string, PaymentMethodCode> = {
  debito: 'cartao_debito',
  credito: 'cartao_credito',
  credito_avista: 'cartao_credito',
  credito_parcelado: 'cartao_credito',
};

function isPaymentMethodCode(value: string): value is PaymentMethodCode {
  return (PAYMENT_METHOD_CODES as readonly string[]).includes(value);
}

/**
 * Leitura tolerante: recebe QUALQUER valor já gravado em `payment_method`
 * (canônico atual ou sinônimo legado) e devolve o código canônico.
 * `null`/`undefined`/valor desconhecido → `null` (o chamador decide o
 * fallback — ex.: mostrar o valor cru ou "—").
 */
export function normalizePaymentMethod(value?: string | null): PaymentMethodCode | null {
  if (!value) return null;
  if (isPaymentMethodCode(value)) return value;
  return LEGACY_PAYMENT_METHOD_SYNONYMS[value] ?? null;
}
