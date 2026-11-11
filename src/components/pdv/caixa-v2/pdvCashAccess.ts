export interface PdvOtherCashAccessInput {
  roles: string[];
  permissions: string[];
  hasPermissionRecord: boolean;
}

export function canOperateOtherPdvCash(input: PdvOtherCashAccessInput): boolean {
  if (input.roles.includes('super_admin')) return true;
  if (!input.hasPermissionRecord) return false;
  return input.permissions.includes('*')
    || input.permissions.includes('fn:operate_other_pdv_cash');
}
