export interface PdvOtherCashAccessInput {
  roles: readonly string[];
  permissions: readonly string[];
  hasPermissionRecord: boolean;
}

/**
 * Trava "explícita" do PDV, espelho de `pdv_has_explicit_action_permission_v2`
 * no servidor.
 *
 * - admin da empresa = Acesso Total também aqui (regra do CEO, 19/11/2026),
 *   igual ao resto do app. super_admin segue liberado.
 * - gestor e demais papéis só passam com `'*'` ou a chave nominal.
 * - `hasPermissionRecord` NÃO é redundante: sem linha em `user_permissions`,
 *   `hasPermission` do AuthContext libera tudo pelo papel (fallback legado).
 *   Aqui lemos o array direto, então quem não tem cadastro fica barrado.
 */
export function hasPdvExplicitPermission(input: PdvOtherCashAccessInput, key: string): boolean {
  if (input.roles.includes('admin') || input.roles.includes('super_admin')) return true;
  if (!input.hasPermissionRecord) return false;
  return input.permissions.includes('*') || input.permissions.includes(key);
}

export function canOperateOtherPdvCash(input: PdvOtherCashAccessInput): boolean {
  return hasPdvExplicitPermission(input, 'fn:operate_other_pdv_cash');
}
