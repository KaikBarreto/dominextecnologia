import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/types/database';

/**
 * Pode lançar a receita no fechamento da OS?
 *
 * NÃO usa AuthContext.hasPermission de propósito: ele termina em
 * `roles.length > 0`, então usuário legado SEM linha em `user_permissions`
 * receberia `true` pra esta chave nova e a feature financeira nasceria ligada
 * justamente pra quem ela deveria barrar (técnico em campo). Medição em
 * produção (11/09/2026): 88 profiles, 50 sem linha em `user_permissions`,
 * 11 deles não-admin.
 * Lê o array direto — mesmo padrão de `canExportData` / `fn:export_company_data`
 * em src/pages/Settings.tsx (v1.24.12) e de `canViewAllSchedule` em
 * src/pages/Schedule.tsx.
 *
 * O `hasPermissionRecord` NÃO é redundante: é ele que separa "configurado e
 * sem a permissão" de "nunca configurado". Não podar no próximo review.
 *
 * Régua:
 *   1. admin / super_admin (acesso total por papel) ................... true
 *   2. curinga '*' ("Acesso Total") ................................... true
 *   3. tem registro E a chave está marcada ............................ true
 *   4. tem registro E a chave NÃO está marcada ........................ false
 *   5. NÃO tem registro (legado) ...................................... false  ← o ponto todo
 *
 * Isto é gate de UI. A escrita continua protegida pela RLS de
 * `financial_transactions` (regra-lei nº1: filtro client é UX, RLS é segurança).
 */
export function useCanLaunchOsRevenue(): boolean {
  const { roles, permissions, hasPermissionRecord } = useAuth();

  // `isFullAccess` existe dentro do AuthContext mas NÃO é exposto no value do
  // provider — derivamos aqui da mesma forma (AuthContext.tsx:292).
  const isFullAccess =
    roles.includes('admin' as AppRole) || roles.includes('super_admin' as AppRole);
  if (isFullAccess) return true;

  if (!hasPermissionRecord) return false;

  return permissions.includes('*') || permissions.includes('fn:os_finish_revenue');
}
