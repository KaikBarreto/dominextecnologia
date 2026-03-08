

## Plan: Fix Session Management to Match EcoSistema

### Root Cause

The session dialog never shows because of this sequence:
1. `handleLogin` calls `signIn()` from AuthContext
2. `signIn` triggers `onAuthStateChange` which sets `user` state
3. The `/login` route is wrapped in `PublicRoute`, which auto-redirects to `/dashboard` when `user` is set
4. The redirect happens **before** the session check and dialog can run

In EcoSistema, the Auth page is **not** wrapped in a `PublicRoute` auto-redirect. Instead, it manages its own redirect logic with a `skipAutoRegisterRef` to prevent premature navigation.

### Fix

**1. `src/App.tsx`** — Remove `PublicRoute` wrapper from `/login`
- The Auth page will manage its own redirect when user is already logged in

**2. `src/pages/Auth.tsx`** — Rewrite login flow to match EcoSistema exactly:
- Add `useEffect` that redirects to `/dashboard` if user is already logged in (replacing `PublicRoute` behavior)
- Add `skipAutoRegisterRef` to prevent that redirect during session check
- Call `supabase.auth.signInWithPassword` directly instead of `signIn()` from AuthContext
- After auth succeeds: check `active_sessions` for other recent sessions (< 60 min)
- If found → show `SessionConfirmDialog`, store pending data, **do not navigate**
- `handleSessionContinue`: re-authenticate, register session, optionally disconnect others, then navigate
- `handleSessionCancel`: sign out, clear state

### Files to Modify
| File | Change |
|------|---------|
| `src/App.tsx` | Remove `PublicRoute` from `/login` route |
| `src/pages/Auth.tsx` | Rewrite login flow with skipAutoRegister pattern |

