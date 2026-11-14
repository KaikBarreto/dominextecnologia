import { describe, expect, it } from 'vitest';
import { canOperateOtherPdvCash } from './pdvCashAccess';

describe('acesso a outro Caixa', () => {
  it('não libera admin, gestor ou edição de venda implicitamente', () => {
    expect(canOperateOtherPdvCash({ roles: ['admin'], permissions: ['fn:edit_pdv_sales'], hasPermissionRecord: true })).toBe(false);
    expect(canOperateOtherPdvCash({ roles: ['gestor'], permissions: [], hasPermissionRecord: true })).toBe(false);
  });

  it('libera somente superadmin, wildcard ou permissão nominal', () => {
    expect(canOperateOtherPdvCash({ roles: ['super_admin'], permissions: [], hasPermissionRecord: false })).toBe(true);
    expect(canOperateOtherPdvCash({ roles: [], permissions: ['*'], hasPermissionRecord: true })).toBe(true);
    expect(canOperateOtherPdvCash({ roles: [], permissions: ['fn:operate_other_pdv_cash'], hasPermissionRecord: true })).toBe(true);
  });
});
