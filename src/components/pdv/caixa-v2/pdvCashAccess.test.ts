import { describe, expect, it } from 'vitest';
import { canOperateOtherPdvCash, hasPdvExplicitPermission } from './pdvCashAccess';

describe('acesso a outro Caixa', () => {
  it('libera admin da empresa como Acesso Total, mesmo sem cadastro de permissões', () => {
    expect(canOperateOtherPdvCash({ roles: ['admin'], permissions: [], hasPermissionRecord: false })).toBe(true);
    expect(canOperateOtherPdvCash({ roles: ['admin'], permissions: ['fn:edit_pdv_sales'], hasPermissionRecord: true })).toBe(true);
  });

  it('não libera gestor sem a chave nem quem não tem cadastro', () => {
    expect(canOperateOtherPdvCash({ roles: ['gestor'], permissions: [], hasPermissionRecord: true })).toBe(false);
    expect(canOperateOtherPdvCash({ roles: ['gestor'], permissions: ['fn:edit_pdv_sales'], hasPermissionRecord: true })).toBe(false);
    expect(canOperateOtherPdvCash({ roles: ['gestor'], permissions: [], hasPermissionRecord: false })).toBe(false);
    expect(canOperateOtherPdvCash({ roles: ['comercial'], permissions: [], hasPermissionRecord: false })).toBe(false);
  });

  it('libera superadmin, wildcard ou permissão nominal', () => {
    expect(canOperateOtherPdvCash({ roles: ['super_admin'], permissions: [], hasPermissionRecord: false })).toBe(true);
    expect(canOperateOtherPdvCash({ roles: [], permissions: ['*'], hasPermissionRecord: true })).toBe(true);
    expect(canOperateOtherPdvCash({ roles: ['gestor'], permissions: ['fn:operate_other_pdv_cash'], hasPermissionRecord: true })).toBe(true);
  });

  it('ignora array de permissões quando não há cadastro', () => {
    expect(hasPdvExplicitPermission({ roles: ['comercial'], permissions: ['*'], hasPermissionRecord: false }, 'fn:x')).toBe(false);
  });
});
