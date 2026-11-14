import { useAuth } from '@/contexts/AuthContext';

/**
 * Permissões bancárias separadas por responsabilidade.
 *
 * `use` permite selecionar uma conta em pagamentos/recebimentos, sem revelar
 * saldos. O acesso às telas operacionais de Financeiro/PDV também implica esse
 * uso: sem ele o usuário abriria o fluxo, mas receberia um catálogo vazio.
 * `manage` inclui uso e libera saldos, cadastro, edição, ajuste e exclusão.
 * As implicações espelham as funções canônicas do banco.
 */
export function useBankPermissions() {
  const { isAdminOrGestor, hasPermission, hasScreenAccess } = useAuth();

  const canManageBankAccounts =
    isAdminOrGestor()
    || hasPermission('fn:manage_bank_accounts')
    || hasPermission('fn:manage_settings')
    || hasPermission('fn:view_finance_totals');
  const canUseBankAccounts =
    canManageBankAccounts
    || hasPermission('fn:use_bank_accounts')
    || hasPermission('fn:manage_finance')
    || hasScreenAccess('screen:finance')
    || hasScreenAccess('screen:pdv');

  return { canUseBankAccounts, canManageBankAccounts };
}
