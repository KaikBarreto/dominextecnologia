import { useAuth } from '@/contexts/AuthContext';

/**
 * Permissões bancárias separadas por responsabilidade.
 *
 * `use` permite selecionar uma conta em pagamentos/recebimentos, sem revelar
 * saldos. `manage` inclui uso e libera saldos, cadastro, edição, ajuste e
 * exclusão. O fallback legado continua vindo de `hasPermission`: empresas que
 * ainda não criaram um registro explícito de permissões não perdem acesso.
 */
export function useBankPermissions() {
  const { isAdminOrGestor, hasPermission } = useAuth();

  const canManageBankAccounts =
    isAdminOrGestor() || hasPermission('fn:manage_bank_accounts');
  const canUseBankAccounts =
    canManageBankAccounts || hasPermission('fn:use_bank_accounts');

  return { canUseBankAccounts, canManageBankAccounts };
}
