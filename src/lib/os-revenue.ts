// ─────────────────────────────────────────────────────────────────────────────
// Helpers PUROS compartilhados entre os dois lugares que lançam RECEITA de uma
// Ordem de Serviço no Financeiro:
//   · `OsFinishRevenueDialog` — pergunta automática no fechamento da OS.
//   · `OsBillingDialog` — ação manual "Faturar OS" (escolha explícita).
//
// Os dois têm que gerar a MESMA descrição e o MESMO pré-preenchimento pro
// mesmo contexto — por isso a fórmula mora aqui, em vez de duplicada nos dois
// componentes. Nada de React, nada de Supabase: só a conta.
// ─────────────────────────────────────────────────────────────────────────────

import type { OsRevenueContext } from '@/hooks/useOsFinishRevenuePrompt';

/** Recorte de `MESSAGES[locale].app.finance.osRevenue` que a fórmula precisa. */
export interface OsRevenueDescriptionMessages {
  descriptionWithCustomer: string;
  descriptionOsOnly: string;
  descriptionFallback: string;
}

/**
 * Descrição que vai PARA O BANCO no lançamento. Sem travessão (régua de copy):
 * o separador é o ponto médio.
 */
export function buildOsRevenueDescription(
  t: OsRevenueDescriptionMessages,
  ctx: OsRevenueContext,
): string {
  const name = ctx.customerName?.trim() ?? '';
  if (ctx.osNumber != null) {
    return name
      ? t.descriptionWithCustomer.replace('{number}', String(ctx.osNumber)).replace('{customer}', name)
      : t.descriptionOsOnly.replace('{number}', String(ctx.osNumber));
  }
  return name ? `${t.descriptionFallback} · ${name}` : t.descriptionFallback;
}

/** Valor sugerido do contexto, só quando é um número finito e não negativo. */
export function resolveOsRevenueSuggestedAmount(ctx: OsRevenueContext): number | null {
  return typeof ctx.suggestedAmount === 'number'
    && Number.isFinite(ctx.suggestedAmount)
    && ctx.suggestedAmount >= 0
    ? ctx.suggestedAmount
    : null;
}

/**
 * Pré-preenchimento do formulário de receita (`TransactionFormDialog`).
 * `amount` é SUGESTÃO: o valor da OS pode não ser o que foi recebido, e o
 * campo continua editável.
 */
export function buildOsRevenuePrefill(t: OsRevenueDescriptionMessages, ctx: OsRevenueContext) {
  const suggestedAmount = resolveOsRevenueSuggestedAmount(ctx);
  return {
    transaction_type: 'entrada' as const,
    description: buildOsRevenueDescription(t, ctx),
    amount: suggestedAmount ?? 0,
    service_order_id: ctx.serviceOrderId,
    ...(ctx.customerId ? { customer_id: ctx.customerId } : {}),
  };
}
