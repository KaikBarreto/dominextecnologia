import { useAuth } from '@/contexts/AuthContext';

/**
 * Pode criar e editar lançamentos do Financeiro?
 *
 * É a mesma régua da policy de `financial_transactions`: admin/gestor ou uma
 * linha ativa de permissões com `fn:manage_finance`/`*`. O registro explícito
 * é obrigatório porque o fallback legado de `hasPermission` libera qualquer
 * usuário que tenha algum papel, enquanto a RLS falha fechada. Centralizar
 * evita que uma tela exiba a ação e outra só descubra o bloqueio depois do
 * formulário preenchido.
 */
export function useCanManageFinanceTransactions(): boolean {
  const { isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();
  return isAdminOrGestor()
    || (hasPermissionRecord && hasPermission('fn:manage_finance'));
}
