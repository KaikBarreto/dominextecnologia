

## Plan: Fix Time Clock, Permissions & User Visibility Issues

### Issues Identified

1. **Ramon "Empresa não encontrada"**: The `registerPunch` function fetches `company_id` from `profiles` table. When an employee is created via the Employees page and a user is created via `create-user` edge function, the `company_id` IS set from the caller's profile. However, if the employee was created first and then linked, or if the `handle_new_user` trigger creates the profile without `company_id` and the update fails/races, the profile ends up without `company_id`. The fix: ensure the `create-user` edge function reliably sets `company_id`, and also link the employee's `user_id` back. Additionally, we should add a fallback in `registerPunch` to look up `company_id` via the employee record if the profile lacks it.

2. **Ramon not showing in Users page**: The `useUsers` hook fetches from `profiles` table. If Ramon's profile exists but lacks `company_id`, and the Users page doesn't filter by company (it fetches ALL profiles), he should appear. But looking closer, the profiles RLS has no company filtering — so the issue is likely that the `handle_new_user` trigger created the profile but the subsequent profile update (to set `company_id`) may have failed silently. Need to verify and fix the `create-user` function to be more robust. Also, `useUsers` should filter profiles by `company_id` to only show same-company users.

3. **Rayellen seeing all employee data**: The Employees page currently checks `isTecnico` (role === 'tecnico') to decide whether to show `TechnicianTimeClock` vs `AdminTimePanel`. Rayellen has 25 permissions but is not 'tecnico' role, so she sees the admin panel. Need permission-based access control.

4. **Users linked to employees should clock in**: Any user linked to an employee should see their own time clock first, then optionally the admin panel if they have the right permission.

### Changes

#### 1. Add employee/time permissions to the permission system (`src/hooks/usePermissions.ts`)
- Add `screen:employees` to SCREEN_PERMISSIONS
- Add `fn:manage_employees` and `fn:manage_timeclock` to FUNCTION_PERMISSIONS
- Add `screenKey: 'screen:employees'` to the Funcionários menu item in AppSidebar

#### 2. Fix Users page to filter by company (`src/hooks/useUsers.ts`)
- Filter profiles by `company_id` matching the current user's `company_id` so only same-company users are shown (this fixes Ramon not appearing if he's in a different company, and prevents cross-company data leaks)

#### 3. Fix Employees page time clock tab (`src/pages/Employees.tsx`)
- Instead of checking `isTecnico` role, check if user is linked to an employee (has a matching employee record with `user_id`)
- If user is linked to an employee: show `TechnicianTimeClock` first, then below it show `AdminTimePanel` only if user has `fn:manage_employees` or `fn:manage_timeclock` permission or is admin/gestor
- If user is NOT linked to an employee but has manage permission: show only `AdminTimePanel`
- If user has neither: hide the timeclock tab entirely or show read-only view

#### 4. Fix `registerPunch` company lookup (`src/hooks/useTimeRecords.ts`)
- Add fallback: if `profile.company_id` is null, look up the employee record linked to this user and get `company_id` from there (via the employees table which doesn't have company_id... so actually look up via the caller's profile more carefully)
- Better fix: ensure the `create-user` edge function always sets `company_id` reliably by retrying the profile update

#### 5. Fix `create-user` edge function (`supabase/functions/create-user/index.ts`)
- After creating the user and waiting for trigger, use `upsert` instead of `update` for the profile to handle race conditions
- Ensure `company_id` is always set from the caller's company
- If an `employee_id` is passed, link the employee record's `user_id` field

#### 6. Fix `useUsers` to show company-scoped users
- Get current user's `company_id` from profile
- Filter the profiles query to only return users from the same company

### Technical Details

**Permission keys to add:**
- `screen:employees` — access to Employees page
- `fn:manage_employees` — manage employee records (vale, bonus, falta, pagamento)
- `fn:manage_timeclock` — view admin time panel for all employees

**Employees page timeclock logic:**
```typescript
const linkedEmployee = employees.find(e => e.user_id === user?.id);
const canManageTime = isAdminOrGestor || hasPermission('fn:manage_timeclock') || hasPermission('fn:manage_employees');

// In timeclock tab:
// If linkedEmployee exists → show TechnicianTimeClock
// If canManageTime → show AdminTimePanel below
```

**Users hook company filter:**
```typescript
const { data: myProfile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
const { data: profiles } = await supabase.from('profiles').select('*').eq('company_id', myProfile.company_id);
```

