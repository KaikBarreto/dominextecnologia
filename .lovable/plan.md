

## Plan: Fix collapsed sidebar + use uploaded icon

### Problems identified
1. `SIDEBAR_WIDTH_ICON = "3rem"` (48px) is too narrow for icons + padding. The custom layout inside the sidebar fights with the shadcn sidebar's built-in collapse behavior.
2. Clicking collapsed items should expand the sidebar back (for groups) or navigate (for links).
3. Icons are not centered/aligned consistently in collapsed mode.
4. Logo needs to use the uploaded spartan helmet icon (`icone_preto.png`) when collapsed, full logo when expanded.

### Changes

**1. Copy uploaded icon to project**
- Copy `user-uploads://icone_preto.png` to `src/assets/icone_preto.png`

**2. `src/components/ui/sidebar.tsx`**
- Change `SIDEBAR_WIDTH_ICON` from `"3rem"` to `"4rem"` (64px) for proper icon spacing.

**3. `src/components/layout/AppSidebar.tsx`** (main rewrite of collapsed behavior)
- **Logo**: When collapsed, show the spartan helmet icon (small, centered). When expanded, show full logo.
- **Profile**: When collapsed, show only centered avatar. When expanded, show full profile block.
- **Menu items (no children)**: When collapsed, show centered icon with tooltip. Clicking navigates normally.
- **Menu items (with children/groups)**: When collapsed, show the group icon centered with tooltip. Clicking expands the sidebar (`toggleSidebar()`) so user can see the submenu. This is standard UX for grouped items.
- **Footer WhatsApp button**: When collapsed, show only the icon centered.
- All icons use consistent `h-5 w-5` size, centered in a fixed-size container (`w-10 h-10 flex items-center justify-center`), ensuring perfect vertical alignment.
- Remove the custom padding/layout differences between collapsed and expanded. Use a single consistent structure with conditional text visibility.

**4. Alignment approach**
All collapsed items will use:
```
<div className="flex items-center justify-center w-full h-10">
  <Icon className="h-5 w-5" />
</div>
```
This ensures every icon row is the same height and perfectly centered.

### Files to modify
- `src/assets/icone_preto.png` (new - copy from upload)
- `src/components/ui/sidebar.tsx` (line 19: icon width)
- `src/components/layout/AppSidebar.tsx` (collapsed mode rewrite)

