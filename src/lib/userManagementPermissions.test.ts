import { describe, expect, it } from 'vitest';
import { hasExplicitUserManagementPermission } from './userManagementPermissions';

describe('gestão de usuários exige concessão explícita', () => {
  it('não transforma muitas permissões em gestão de usuários', () => {
    const screens = Array.from({ length: 40 }, (_, index) => `screen:consulta_${index}`);
    expect(hasExplicitUserManagementPermission(screens)).toBe(false);
  });
  it('reconhece a permissão nominal', () => {
    expect(hasExplicitUserManagementPermission(['screen:users', 'fn:manage_users'])).toBe(true);
  });
  it('preserva o curinga explícito', () => {
    expect(hasExplicitUserManagementPermission(['*'])).toBe(true);
  });
  it('falha fechado sem concessão carregada', () => {
    expect(hasExplicitUserManagementPermission(null)).toBe(false);
    expect(hasExplicitUserManagementPermission(undefined)).toBe(false);
    expect(hasExplicitUserManagementPermission([])).toBe(false);
  });
});
