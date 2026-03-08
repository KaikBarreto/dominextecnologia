

## Plan

### Issue 1: Customers page not contained within screen width

The `Customers.tsx` page already has a mobile card view, but the outer `<div className="space-y-6">` and the inner `<div className="p-6">` lack overflow containment. The desktop table also uses `overflow-x-auto` but the card wrapping it has no width constraint.

**Fix:**
- Add `min-w-0 overflow-hidden` to the root container div
- Ensure the Card wrapping the table/cards has `overflow-hidden`
- Add `min-w-0` to text containers that might overflow (search input area)

### Issue 2: Employee "create access" failing with "Forbidden: requires admin or gestor role"

The `create-user` edge function (line 38-50) checks **only** `user_roles` for `admin` or `gestor` roles. However, the app's permission system also grants management access to users with full permissions (27+ permissions) or the `fn:manage_users` permission. If the logged-in user has these permissions but lacks an explicit admin/gestor role in `user_roles`, the edge function rejects the call with 403.

**Fix in `supabase/functions/create-user/index.ts`:**
- After the role check fails, also check `user_permissions` for `fn:manage_users` or 27+ permissions (full access)
- This aligns the edge function authorization with the client-side logic in `useUsers.ts` (line ~90: `hasManageUsersPermission`)

```
// Check if caller is admin/gestor OR has manage_users permission
const { data: callerRole } = await supabaseAdmin
  .from('user_roles')
  .select('role')
  .eq('user_id', caller.id)
  .in('role', ['admin', 'gestor'])
  .maybeSingle();

let authorized = !!callerRole;

if (!authorized) {
  const { data: permsData } = await supabaseAdmin
    .from('user_permissions')
    .select('permissions')
    .eq('user_id', caller.id)
    .eq('is_active', true)
    .maybeSingle();

  const perms = (permsData?.permissions as string[]) || [];
  authorized = perms.includes('fn:manage_users') || perms.length >= 27;
}

if (!authorized) {
  return 403 Forbidden...
}
```

### Files to modify
1. **`src/pages/Customers.tsx`** -- Add overflow containment classes to root and card containers
2. **`supabase/functions/create-user/index.ts`** -- Expand authorization check to include permission-based access

