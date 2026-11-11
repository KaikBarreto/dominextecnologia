export interface NotificationSettingsAccessInput {
  isAdminOrGestor: boolean;
  isSuperAdmin: boolean;
  hasPermissionRecord: boolean;
  hasManageSettingsPermission: boolean;
}
/**
 * O fallback legado de `hasPermission` não pode, sozinho, liberar regras da
 * empresa. Para usuários comuns a permissão só vale quando existe um registro
 * explícito; admins/gestores e o master continuam liberados por papel.
 */
export function canManageCompanyNotificationRules(input: NotificationSettingsAccessInput) {
  return input.isAdminOrGestor
    || input.isSuperAdmin
    || (input.hasPermissionRecord && input.hasManageSettingsPermission);
}
/** Evita que o modo pessoal da rota tente salvar configurações do tenant. */
export function canSaveCompanySettings(canAccessSettingsScreen: boolean, canSaveForTenant: boolean) {
  return canAccessSettingsScreen && canSaveForTenant;
}
