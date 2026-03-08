

## Plan: Fix Session Management, Rename Menu & Reorganize Items

### 1. Fix Session Management (`useForcedLogout.ts`)
- Remove `as any` casts — the `active_sessions` table is in the generated types
- Ensure the activity update query uses proper typing

### 2. Fix Session Management in Auth Context (`AuthContext.tsx`)
- Remove `as any` cast on the `active_sessions` delete in `signOut`

### 3. Fix Session Dialog Flow (`Auth.tsx`)
- The `handleSessionContinue` calls `completeLogin` which navigates to `/dashboard`, but then also needs to close the dialog — currently looks correct
- Ensure the re-authentication + session registration + optional disconnect flow matches EcoSistema exactly
- After `handleSessionContinue`, navigate to `/dashboard` explicitly (like EcoSistema does after the dialog)

### 4. Rename "Serviços" to "Operacional" in Sidebar (`AppSidebar.tsx`)
- Change `title: 'Serviços'` to `title: 'Operacional'` in the parent menu item
- Move "Rastreamento" and "Mapa ao Vivo" from top-level items into the `children` array of "Operacional"

### Files to Modify
| File | Change |
|------|--------|
| `src/hooks/useForcedLogout.ts` | Remove `as any` casts |
| `src/contexts/AuthContext.tsx` | Remove `as any` cast in signOut |
| `src/pages/Auth.tsx` | Ensure session flow works correctly (minor fixes if needed) |
| `src/components/layout/AppSidebar.tsx` | Rename "Serviços" → "Operacional", move Rastreamento + Mapa ao Vivo inside |

