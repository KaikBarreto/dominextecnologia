import { useLayoutEffect, useRef, type ReactNode, type UIEvent } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { MobilePullToRefresh } from '@/components/mobile/MobilePullToRefresh';
import { cn } from '@/lib/utils';

export type AppViewportMode = 'sidebar' | 'topbar' | 'compact';
const ignoreSidebarChange = () => {};

/** Navegação pode mudar; o caminho React do conteúdo permanece o mesmo. */
export function AppViewport({ mode, sidebar, header, subscriptionNotice, notices, desktopFooter, mobileFooter, bottomNavigation, onRefresh, onScroll, scrollResetKey, children }: {
  mode: AppViewportMode;
  sidebar: ReactNode;
  header: ReactNode;
  subscriptionNotice?: ReactNode;
  notices: ReactNode;
  desktopFooter: ReactNode;
  mobileFooter: ReactNode;
  bottomNavigation: ReactNode;
  onRefresh: () => Promise<void> | void;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  scrollResetKey: string;
  children: ReactNode;
}) {
  const compact = mode === 'compact';
  const showSidebar = mode === 'sidebar';
  const mainRef = useRef<HTMLElement>(null);
  const pullScrollRef = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(0);
  const previousResetKey = useRef(scrollResetKey);

  useLayoutEffect(() => {
    if (previousResetKey.current !== scrollResetKey) {
      scrollPosition.current = 0;
      previousResetKey.current = scrollResetKey;
    }
    const scroller = compact ? pullScrollRef.current : mainRef.current;
    if (scroller) scroller.scrollTop = scrollPosition.current;
  }, [compact, scrollResetKey]);

  return <SidebarProvider
    open={showSidebar ? undefined : true}
    onOpenChange={showSidebar ? undefined : ignoreSidebarChange}
    keyboardShortcutEnabled={showSidebar}
    persistOpenState={showSidebar}
    className="h-[100dvh] min-h-0"
  >
    <div data-app-layout-mode={mode} className="flex h-[100dvh] w-full min-w-0 max-w-full">
      {showSidebar ? sidebar : null}
      <div className="relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-background">
        {header}
        {!compact ? subscriptionNotice : null}
        {notices}
        <MobilePullToRefresh
          disabled={!compact}
          scrollContainerRef={pullScrollRef}
          onRefresh={onRefresh}
          onScroll={(event) => {
            if (!compact) return;
            scrollPosition.current = event.currentTarget.scrollTop;
            onScroll?.(event);
          }}
          className={compact ? 'min-h-0 flex-1 overflow-x-hidden min-w-0 max-w-full bg-background' : 'contents'}
        >
          <main ref={mainRef} onScroll={(event) => {
            if (!compact) scrollPosition.current = event.currentTarget.scrollTop;
          }} className={cn('app-ui-main min-w-0 max-w-full', compact
            ? 'pb-[calc(8rem+env(safe-area-inset-bottom))] bg-background'
            : 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden')}>
            {children}
            {compact ? mobileFooter : null}
          </main>
        </MobilePullToRefresh>
        {!compact ? desktopFooter : null}
        {compact ? bottomNavigation : null}
      </div>
    </div>
  </SidebarProvider>;
}
