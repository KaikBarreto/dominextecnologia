/** Uma lista extensa de permissões não concede gestão de usuários. */
export function hasExplicitUserManagementPermission(permissions: readonly string[] | null | undefined): boolean {
  return permissions?.includes('*') === true || permissions?.includes('fn:manage_users') === true;
}
