

## Plan: Login Layout Fix + Full Permissions System

### 1. Login Mobile Layout Fix
In `Auth.tsx`, change the "Lembrar-me" + "Esqueci minha senha" row (line 169) from `flex items-center justify-between` to a stacked layout on mobile: "Lembrar-me" on one line, "Esqueci minha senha" below it, aligned left.

### 2. Permissions System - Database Changes

Create 2 new tables via migration:

**`permission_presets`** (cargos/kits de permissão):
- `id`, `name`, `description`, `permissions` (jsonb array of permission keys), `created_at`, `updated_at`
- RLS: admin/gestor can manage, authenticated can view

**`user_permissions`** (permissões individuais por usuário):
- `id`, `user_id` (references auth.users), `permissions` (jsonb array of permission keys), `preset_id` (nullable FK to permission_presets), `is_active` (boolean, default true), `created_at`, `updated_at`
- RLS: admin/gestor can manage, users can view own

The permissions will be a flat list of string keys covering:

**Screen permissions (telas):**
- `screen:dashboard`, `screen:service_orders`, `screen:services`, `screen:questionnaires`, `screen:pmoc`, `screen:schedule`, `screen:customers`, `screen:equipment`, `screen:crm`, `screen:inventory`, `screen:finance`, `screen:users`, `screen:settings`

**Function permissions (funções):**
- `fn:create_os`, `fn:edit_os`, `fn:delete_os`
- `fn:create_customer`, `fn:edit_customer`, `fn:delete_customer`
- `fn:manage_equipment`, `fn:manage_inventory`
- `fn:manage_finance`, `fn:view_finance_totals`
- `fn:manage_users`, `fn:manage_settings`
- `fn:manage_crm`, `fn:manage_pmoc`

### 3. Users Page Redesign (`src/pages/Users.tsx`)

Redesign as a full CRUD inspired by the reference screenshots:
- **Header**: Title "Usuários e Permissões" + counter badge + "Criar Usuário" button (blue, primary)
- **User list**: Cards showing avatar, name, email (from auth metadata), status badge (Ativo/Inativo via `is_active`), permission summary badge, and action buttons (Editar, Ativar/Desativar)
- **Search bar** at the top

### 4. New Components

**`UserFormDialog.tsx`** - Modal/Drawer for creating/editing users:
- Fields: Nome Completo, Email, Senha (only on create), Foto (optional)
- "Perfil de Acesso" select: choose a preset or "Personalizado"
- **Telas section**: Checkboxes grouped by module (Serviços, Financeiro, etc.) for screen permissions
- **Funções section**: Checkboxes for action permissions
- When a preset is selected, auto-fill the checkboxes; user can override (switches to "Personalizado")

**`PermissionPresetDialog.tsx`** - CRUD for managing permission presets (cargos):
- Name, description, and same checkbox structure as above
- Accessible from a gear icon on the Users page header

### 5. New Hook: `usePermissions.ts`
- Fetch user's permissions from `user_permissions` table
- Provide `hasPermission(key: string)` helper
- Provide `hasScreenAccess(screenKey: string)` helper

### 6. Auth Context Updates
- Add `permissions: string[]` to AuthContext state
- Fetch from `user_permissions` table on login
- Expose `hasPermission()` method

### 7. Sidebar & Menu Filtering
- Update `AppSidebar.tsx` menu items to use permission keys instead of role-based filtering
- Each menu item maps to a `screen:*` permission
- Fallback: if user has no `user_permissions` row, use legacy role-based access
- Update `MobileNav.tsx` similarly

### 8. Edge Function for User Creation
Create `supabase/functions/create-user/index.ts`:
- Admin-only endpoint that calls `supabase.auth.admin.createUser()` to create a new user with email+password
- Also creates the profile and user_permissions records
- This is needed because client-side `signUp` sends a confirmation email and logs in

### Technical Details

The permission keys are stored as a simple JSON array in `user_permissions.permissions`, e.g.:
```json
["screen:dashboard", "screen:service_orders", "fn:create_os", "fn:edit_os"]
```

Presets work the same way - selecting a preset copies its permissions array into the user's record and sets `preset_id`. If the user customizes, `preset_id` is cleared.

The `is_active` field on `user_permissions` controls whether the user can access the system at all (replaces the Ativar/Desativar concept from the reference).

