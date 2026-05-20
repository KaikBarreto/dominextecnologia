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
  const { open, setOpen, isMobile } = useSidebar();
  const isHoverOpenRef = useRef(false);
  const persistedOpenRef = useRef(open);
  const hoverLeaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isHoverOpenRef.current) persistedOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    return () => {
      if (hoverLeaveTimerRef.current) window.clearTimeout(hoverLeaveTimerRef.current);
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (isMobile) return;
    if (hoverLeaveTimerRef.current) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    if (!persistedOpenRef.current && !open) {
      isHoverOpenRef.current = true;
      setOpen(true);
    }
  }, [isMobile, open, setOpen]);

  const handleMouseLeave = useCallback(() => {
    if (isMobile) return;
    if (!isHoverOpenRef.current) return;
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      isHoverOpenRef.current = false;
      setOpen(false);
    }, 500);
  }, [isMobile, setOpen]);

  return (
    <SidebarContainer
      collapsible="icon"
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
