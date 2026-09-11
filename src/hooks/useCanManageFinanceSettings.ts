import { useAuth } from '@/contexts/AuthContext';

/**
 * Pode CRIAR/EDITAR cadastro de configuração do financeiro (conta bancária,
 * categoria, centro de custo)?
 *
 * Espelha o que o servidor exige: as policies de `financial_accounts`,
 * `financial_categories` e `cost_centers` pedem `can_manage_system`. Quem não
 * tem, antes via o "+" de criar-na-hora, clicava, e tomava um erro de RLS sem
 * entender o motivo. O gate aqui é só UX — a segurança continua na RLS.
 *
 * Critério único do domínio (não duplicar a expressão em tela nenhuma):
 * admin/gestor sempre, ou permissão explícita `fn:manage_settings`.
 */
export function useCanManageFinanceSettings(): boolean {
  const { isAdminOrGestor, hasPermission } = useAuth();
  return isAdminOrGestor() || hasPermission('fn:manage_settings');
}
