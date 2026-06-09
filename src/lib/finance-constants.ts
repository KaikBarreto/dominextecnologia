/**
 * Categoria reservada usada pela transação gerada ao "Ajustar saldo" de uma
 * conta. NÃO é editável pelo usuário e é EXCLUÍDA do DRE (é conciliação de
 * saldo, neutra — não é receita nem despesa real). Fonte única da string pra
 * que o ponto que CRIA (AdjustBalanceDialog) e o ponto que FILTRA (FinanceDRE)
 * nunca divirjam.
 */
export const ADJUSTMENT_CATEGORY = 'Ajuste de saldo';
