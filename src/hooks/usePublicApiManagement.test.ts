import { describe, expect, it } from 'vitest';
import { canManagePublicApiKeys } from './usePublicApiManagement';

describe('canManagePublicApiKeys', () => {
  it('libera administrador mesmo sem ACL granular', () => {
    expect(canManagePublicApiKeys({
      isAdmin: true,
      hasPermissionRecord: false,
      permissions: [],
    })).toBe(true);
  });

  it('libera a permissão explícita e o curinga somente quando existe registro de ACL', () => {
    expect(canManagePublicApiKeys({
      isAdmin: false,
      hasPermissionRecord: true,
      permissions: ['fn:manage_api_keys'],
    })).toBe(true);
    expect(canManagePublicApiKeys({
      isAdmin: false,
      hasPermissionRecord: true,
      permissions: ['*'],
    })).toBe(true);
  });

  it('não herda o fallback legado por role quando não existe registro de ACL', () => {
    expect(canManagePublicApiKeys({
      isAdmin: false,
      hasPermissionRecord: false,
      permissions: ['fn:manage_api_keys'],
    })).toBe(false);
    expect(canManagePublicApiKeys({
      isAdmin: false,
      hasPermissionRecord: false,
      permissions: ['*'],
    })).toBe(false);
  });
});
