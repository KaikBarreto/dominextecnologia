import { useAuth } from '@/contexts/AuthContext';

/**
 * Pode ver e alterar os dados de RH dos funcionários (salário, custo, CPF,
 * PIX, endereço, dependentes, VT, calendário de pagamento, dados do PJ)?
 *
 * É a mesma régua de `public.can_manage_employees` (migration
 * 20261121160200): admin/gestor, Acesso Total (`*`) ou `fn:manage_employees`
 * numa linha ATIVA de `user_permissions`. O registro explícito é obrigatório
 * porque o fallback legado de `hasPermission` libera qualquer usuário com
 * algum papel, enquanto o banco falha fechado: sem isto a tela pediria a RPC
 * de RH e tomaria 42501.
 *
 * `AuthContext` só carrega a lista de permissões quando a linha está ativa,
 * então "linha inativa" já chega aqui como lista vazia.
 */
export function canManageEmployeesFromAuth(auth: {
  isAdminOrGestor: () => boolean;
  hasPermission: (key: string) => boolean;
  hasPermissionRecord: boolean;
}): boolean {
  return auth.isAdminOrGestor()
    || (auth.hasPermissionRecord && auth.hasPermission('fn:manage_employees'));
}

export function useCanManageEmployees(): boolean {
  const { isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();
  return canManageEmployeesFromAuth({ isAdminOrGestor, hasPermission, hasPermissionRecord });
}
