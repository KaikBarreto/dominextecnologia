

## Plan: 4 Changes

### 1. Remove `/acompanhamento` page, embed tracking in TechnicianOS public view

The `PublicTrackingMap` is already rendered in `TechnicianOS.tsx` for non-authenticated viewers when status is `a_caminho` (line 482-485). The separate `PublicTracking` page is redundant.

**Changes:**
- Delete `src/pages/PublicTracking.tsx`
- Remove the route `/acompanhamento/:osId` and the import from `App.tsx`
- Update any links that point to `/acompanhamento/` to point to `/os-tecnico/` instead (in `CustomerPortal.tsx` and `ScheduleDetailPanel.tsx`)

### 2. Better error message for duplicate email in user creation

In `src/pages/Users.tsx` line 105-107, the catch block shows raw error message. The edge function `create-user` returns Supabase's raw error which says something like "User already registered".

**Changes:**
- In `src/pages/Users.tsx` `handleCreateUser` catch block, check if `e.message` contains "already registered" or "already been registered" and show a friendly Portuguese message: "Este e-mail já está cadastrado no sistema."
- Also in `supabase/functions/create-user/index.ts`, catch the specific `createError` and return a clearer message when `message` includes "already" or "duplicate".

### 3. Delete user glacialcoldbr@gmail.com from database

Use the data insert tool to delete user records:
- Look up and delete from `auth.users` via edge function or direct SQL
- This requires a migration or edge function call since we can't delete from `auth.users` directly via client

**Approach:** Use the insert tool to run:
```sql
DELETE FROM auth.users WHERE email = 'glacialcoldbr@gmail.com';
```
This will cascade-delete profiles, user_roles, user_permissions etc. due to foreign key constraints.

### 4. HEIC to JPEG conversion on upload

Create a utility function `convertHeicToJpeg` that uses the `heic2any` library to convert HEIC files to JPEG before uploading.

**Changes:**
- Install `heic2any` package
- Create `src/utils/imageConvert.ts` with a `processImageFile(file: File): Promise<File>` function that checks if file is HEIC and converts it
- Update all `accept="image/*"` file inputs across the app to go through this converter before upload. The key files are:
  - `src/components/users/UserFormDialog.tsx`
  - `src/components/employees/EmployeeFormDialog.tsx`
  - `src/components/employees/EmployeeCard.tsx`
  - `src/components/customers/CustomerFormDialog.tsx`
  - `src/components/customers/EquipmentFormDialog.tsx`
  - `src/pages/Profile.tsx`
  - `src/pages/Settings.tsx`
  - `src/components/technician/DynamicFormQuestions.tsx`
  - `src/components/time-tracking/TechnicianTimeClock.tsx`

### Files Summary

| File | Action |
|------|--------|
| `src/pages/PublicTracking.tsx` | Delete |
| `src/App.tsx` | Remove route + import |
| `src/pages/CustomerPortal.tsx` | Update tracking links to `/os-tecnico/` |
| `src/components/schedule/ScheduleDetailPanel.tsx` | Update tracking links |
| `src/pages/Users.tsx` | Friendly duplicate email error |
| `supabase/functions/create-user/index.ts` | Better error message for duplicate |
| DB operation | Delete user glacialcoldbr@gmail.com |
| `src/utils/imageConvert.ts` | New HEIC→JPEG utility |
| 9 component files | Add HEIC conversion before upload |

