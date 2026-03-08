

## Plan: Sidebar collapse toggle + Photo preview modal

### 1. Sidebar collapse button in header (desktop)

**File: `src/components/layout/AppLayout.tsx`**

In `HeaderContent`, the hamburger button currently only shows on mobile (`isMobile`). Change it to always show — on desktop it calls `toggleSidebar()` to collapse/expand the sidebar to icon-only mode. Use `PanelLeftClose`/`PanelLeft` icons to indicate state.

The existing `<Sidebar>` component in `AppSidebar.tsx` needs `collapsible="icon"` prop so toggling collapses it to the narrow icon strip instead of hiding entirely.

**File: `src/components/layout/AppSidebar.tsx`**

- Add `collapsible="icon"` to `<Sidebar>`.
- Use `useSidebar()` to get `state` and conditionally hide text labels, profile name, WhatsApp label, group labels when collapsed. Show only icons.
- Hide profile section details when collapsed, show only avatar.
- Hide collapsible group text, show only icons for top-level items.

### 2. Photo preview modal on Users and Employees

**File: `src/pages/Users.tsx`**

Currently the avatar area has a Camera overlay that implies clicking uploads a photo. Change behavior:
- Clicking the avatar opens `ImagePreviewModal` with the user's photo (if exists).
- The Camera upload overlay is removed from the avatar. Photo changes happen only through "Editar".

**File: `src/components/employees/EmployeeCard.tsx`**

Currently clicking the avatar triggers file upload. Change:
- Clicking opens `ImagePreviewModal` to view the photo full-size.
- Remove the Camera overlay and file input trigger from the avatar click.
- Photo upload stays available only through "Editar" (the edit button).

### Files to modify
- `src/components/layout/AppLayout.tsx` — show toggle button always
- `src/components/layout/AppSidebar.tsx` — add `collapsible="icon"`, handle collapsed state for labels
- `src/pages/Users.tsx` — avatar click opens preview modal instead of upload
- `src/components/employees/EmployeeCard.tsx` — avatar click opens preview modal instead of upload

### Technical notes
- `ImagePreviewModal` component already exists at `src/components/ui/ImagePreviewModal.tsx`
- The sidebar's `useSidebar()` hook provides `state: "expanded" | "collapsed"` and `toggleSidebar()`
- `SIDEBAR_WIDTH_ICON = "3rem"` is already configured

