import { describe, expect, it } from 'vitest';
import { canManageCompanyNotificationRules, canSaveCompanySettings } from './notificationSettingsAccess';

describe('acesso às regras de notificações', () => {
  it('não confia no fallback legado sem registro explícito', () => {
    expect(canManageCompanyNotificationRules({
      isAdminOrGestor: false,
      isSuperAdmin: false,
      hasPermissionRecord: false,
      hasManageSettingsPermission: true,
    })).toBe(false);
  });

  it('aceita permissão explícita para um usuário comum', () => {
    expect(canManageCompanyNotificationRules({
      isAdminOrGestor: false,
      isSuperAdmin: false,
      hasPermissionRecord: true,
      hasManageSettingsPermission: true,
    })).toBe(true);
  });

  it('mantém administradores e gestores liberados', () => {
    expect(canManageCompanyNotificationRules({
      isAdminOrGestor: true,
      isSuperAdmin: false,
      hasPermissionRecord: false,
      hasManageSettingsPermission: false,
    })).toBe(true);
  });

  it('não habilita auto-save corporativo no modo pessoal', () => {
    expect(canSaveCompanySettings(false, true)).toBe(false);
    expect(canSaveCompanySettings(true, true)).toBe(true);
  });
});
