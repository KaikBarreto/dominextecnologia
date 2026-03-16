

## Problem

On mobile, when a Drawer opens and the user taps an input, the virtual keyboard triggers `interactive-widget=resizes-content` which shrinks the viewport. The drawer content (fixed to bottom with `max-height: 90dvh`) gets squeezed, pushing the focused input out of the visible area.

## Solution

Two changes:

1. **`DrawerContent` component (`src/components/ui/drawer.tsx`)**: Add a `focusin` event listener on the drawer content element. When an input/textarea/select receives focus, call `element.scrollIntoView({ block: 'center', behavior: 'smooth' })` on the focused element after a short delay (to let the keyboard finish appearing). This ensures the active field stays visible regardless of viewport resizing.

2. **`ResponsiveModal` drawer branch (`src/components/ui/ResponsiveModal.tsx`)**: The scrollable `div` wrapper already has `overflow-y-auto`. We just need the same scroll-into-view behavior, which will be inherited from the DrawerContent fix.

### Technical detail

In `DrawerContent`, wrap children in a container that listens for `focusin` events:

```tsx
// Inside DrawerContent's rendered content
useEffect on the content ref:
  - listen for 'focusin' on the container
  - if target is input/textarea/select, setTimeout 300ms then target.scrollIntoView({ block: 'center', behavior: 'smooth' })
```

This is a single-file fix in `drawer.tsx` that solves the problem globally for all drawers in the app.

