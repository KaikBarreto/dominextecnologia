/**
 * Categoria reservada usada pela transação gerada ao "Ajustar saldo" de uma
 * conta. NÃO é editável pelo usuário e é EXCLUÍDA do DRE (é conciliação de
 * saldo, neutra — não é receita nem despesa real). Fonte única da string pra
 * que o ponto que CRIA (AdjustBalanceDialog) e o ponto que FILTRA (FinanceDRE)
 * nunca divirjam.
 */
export const ADJUSTMENT_CATEGORY = 'Ajuste de saldo';

/**
 * Categoria reservada da linha FILHA criada quando uma conta a receber é
 * recebida em partes ("Recebimento parcial", `transaction_type = 'entrada'`,
 * `parent_transaction_id` = a conta mãe).
 *
 * Não é texto livre: é o MESMO predicado que o gatilho
 * `trg_recalc_amount_received` usa no banco pra somar `amount_received` na mãe
 * (migration `20260523234208_pagamento_parcial_recebivel.sql`). Fonte única da
 * string pra que quem CRIA (`useFinancial.buildPartialReceiptRow`), quem LISTA
 * (`useReceivablePayments`) e quem CONTA (`FinanceDRE`) nunca divirjam.
 *
 * ⚠️ Contábil: essa filha NÃO é receita nova. Ela é um EVENTO DE CAIXA da mãe,
 * que continua no banco com o `amount` cheio. Somar mãe + filhas dobra a
 * receita. Ver `getDreAmount`/`isPartialReceiptChild` em `@/lib/dre-regime`.
 */
export const PARTIAL_RECEIPT_CATEGORY = 'Recebimento parcial';
