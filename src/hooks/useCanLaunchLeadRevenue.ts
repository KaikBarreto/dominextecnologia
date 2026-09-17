import { useAuth } from '@/contexts/AuthContext';

/**
 * Pode lançar a receita da oportunidade ganha (CRM → Financeiro)?
 *
 * NÃO usa `AuthContext.hasPermission` sozinho, pelo mesmo motivo de
 * `useCanLaunchOsRevenue`: ele termina em `roles.length > 0`, então usuário
 * legado SEM linha em `user_permissions` receberia `true` pra uma chave
 * financeira e a oferta nasceria ligada justamente pra quem ela deveria barrar
 * (vendedor que não mexe no Financeiro). Medição em produção (11/09/2026): 88
 * profiles, 50 sem linha em `user_permissions`, 11 deles não-admin.
 *
 * O `hasPermissionRecord` NÃO é redundante: é ele que separa "configurado e
 * sem a permissão" de "nunca configurado". Não podar no próximo review. Mesmo
 * arranjo dos gates do Financeiro (`canDeleteFinance` em FinanceContas.tsx e
 * TransactionListPanel.tsx).
 *
 * Régua:
 *   1. admin / gestor (acesso total por papel) ....................... true
 *   2. tem registro E curinga '*' ("Acesso Total") ................... true
 *   3. tem registro E `fn:manage_finance` marcada .................... true
 *   4. tem registro E a chave NÃO está marcada ....................... false
 *   5. NÃO tem registro (legado) ..................................... false  ← o ponto todo
 *
 * `fn:manage_finance` ("Gerenciar Financeiro" = criar e editar transações) é a
 * chave certa: a oferta termina criando um lançamento de verdade. Sem chave
 * nova, sem tela nova de configuração.
 *
 * Isto é gate de UI. A escrita continua protegida pela RLS de
 * `financial_transactions` (regra-lei nº1: filtro client é UX, RLS é segurança).
 */
export function useCanLaunchLeadRevenue(): boolean {
  const { isAdminOrGestor, hasPermission, hasPermissionRecord } = useAuth();
  return isAdminOrGestor() || (hasPermissionRecord && hasPermission('fn:manage_finance'));
}
