import { useAuth } from '@/contexts/AuthContext';

/**
 * Compra direta termina em duas escritas sensíveis: saldo de estoque e saída
 * financeira. O botão só aparece quando a pessoa pode administrar os DOIS
 * domínios; a RPC repete a mesma regra no servidor.
 */
export function useCanRegisterDirectMaterialPurchase(): boolean {
  const { isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();
  return isAdminOrGestor()
    || (
      hasPermissionRecord
      && hasPermission('fn:manage_inventory')
      && hasPermission('fn:manage_finance')
    );
}
