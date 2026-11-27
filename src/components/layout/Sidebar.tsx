import { memo, useCallback, useEffect, useRef } from 'react';
import {
  Sidebar as SidebarContainer,
  SidebarContent,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { SidebarMenuContent } from './SidebarMenuContent';

/**
 * Sidebar lateral colapsável (modo padrão do desktop).
 *
 * - `collapsible="icon"`: colapsa pra barra fininha com ícones.
 * - Hover-expand: quando colapsado por preferência, passar o mouse expande
 *   temporariamente sem persistir o estado. Saída tem delay de 500ms pra
 *   não piscar quando o usuário cruza popovers/borda.
 * - Não engatilha em mobile (sheet é separado, ver `MobileSidebar`).
 */
export const Sidebar = memo(() => {
  const { open, pinnedOpen, setOpen, isMobile } = useSidebar();
  const isHoverOpenRef = useRef(false);
  const hoverLeaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hoverLeaveTimerRef.current) window.clearTimeout(hoverLeaveTimerRef.current);
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (isMobile || pinnedOpen) return;
    if (hoverLeaveTimerRef.current) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    if (!open) {
      isHoverOpenRef.current = true;
      setOpen(true, { transient: true });
    }
  }, [isMobile, open, pinnedOpen, setOpen]);

  const handleMouseLeave = useCallback(() => {
    if (isMobile) return;
    if (!isHoverOpenRef.current) return;
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      isHoverOpenRef.current = false;
      setOpen(false, { transient: true });
    }, 500);
  }, [isMobile, setOpen]);

  return (
    <SidebarContainer
      collapsible="icon"
      data-nav-surface
      className="border-r border-border bg-background"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <SidebarContent className="flex h-full flex-col p-0 overflow-hidden">
        <SidebarMenuContent />
      </SidebarContent>
      <SidebarRail />
    </SidebarContainer>
  );
});

Sidebar.displayName = 'Sidebar';
