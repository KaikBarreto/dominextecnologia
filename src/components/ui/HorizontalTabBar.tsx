import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HorizontalTabBarProps {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
  viewportProps?: React.HTMLAttributes<HTMLDivElement>;
  asChild?: boolean;
  wrapTabs?: boolean;
}

/** Trilho único para abas extensas, sem sobrepor as setas aos rótulos. */
export function HorizontalTabBar({ children, className, viewportClassName, viewportProps, asChild = false, wrapTabs = true }: HorizontalTabBarProps) {
  const root = React.useRef<HTMLDivElement>(null);
  const viewport = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ overflow: false, before: false, after: false, vertical: false });
  const behavior = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' as const : 'smooth' as const;

  React.useEffect(() => {
    const el = viewport.current;
    const container = root.current;
    if (!el || !container) return;
    let frame = 0;
    const measure = () => {
      const vertical = el.getAttribute('aria-orientation') === 'vertical' || el.getAttribute('data-orientation') === 'vertical';
      const overflow = !vertical && el.scrollWidth > container.clientWidth + 1;
      const position = Math.abs(el.scrollLeft);
      const next = { overflow, before: position > 1, after: position + el.clientWidth < el.scrollWidth - 1, vertical };
      setEdges(old => Object.keys(next).every(key => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
    };
    const reveal = () => {
      measure();
      const selected = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"], [data-state="active"], [aria-current="page"], [aria-pressed="true"]');
      if (!selected || el.getAttribute('aria-orientation') === 'vertical') return;
      const active = selected.closest<HTMLElement>('[data-tab-item]') ?? selected;
      const bounds = el.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      // Margem só quando a aba cabe com folga. A tolerância evita que
      // frações de pixel empurrem uma aba larga de volta para fora da vista.
      const gutter = item.width + 16 <= bounds.width ? 8 : 0;
      const delta = item.left < bounds.left - 1 ? item.left - bounds.left - gutter : item.right > bounds.right + 1 ? item.right - bounds.right + gutter : 0;
      if (delta) el.scrollBy?.({ left: delta, behavior: behavior() });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(reveal); };
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : undefined;
    resize?.observe(container);
    resize?.observe(el);
    window.addEventListener('resize', schedule);
    const mutations = new MutationObserver(schedule);
    mutations.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'aria-current', 'aria-pressed', 'data-state', 'aria-orientation', 'data-orientation'] });
    el.addEventListener('scroll', measure, { passive: true });
    document.fonts?.addEventListener('loadingdone', schedule);
    measure();
    schedule();
    return () => { cancelAnimationFrame(frame); resize?.disconnect(); window.removeEventListener('resize', schedule); mutations.disconnect(); el.removeEventListener('scroll', measure); document.fonts?.removeEventListener('loadingdone', schedule); };
  }, []);

  const move = (direction: number) => {
    const el = viewport.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy?.({ left: direction * (rtl ? -1 : 1) * Math.max(80, el.clientWidth * 0.8), behavior: behavior() });
  };
  const Viewport = asChild ? Slot : 'div';
  return <div ref={root} data-horizontal-tab-bar className={cn('relative min-w-0 max-w-full', !edges.vertical && 'flex items-stretch', className)}>
    {edges.overflow && <button type="button" aria-label="Ver abas anteriores" title="Ver abas anteriores" disabled={!edges.before} onClick={() => move(-1)} className="grid min-h-11 w-11 shrink-0 place-items-center self-stretch border-b border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-30"><ChevronLeft aria-hidden className="h-5 w-5" /></button>}
    <Viewport {...viewportProps} ref={viewport} style={{ scrollSnapType: 'none', scrollPaddingInline: 0, ...viewportProps?.style }} className={cn('min-w-0 max-w-full flex-1', !edges.vertical && 'overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-px-2 touch-manipulation [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', wrapTabs && '[&>button]:max-w-full [&>button]:whitespace-normal [&>button>span]:whitespace-normal [&>button]:[overflow-wrap:anywhere] [&>[data-tab-item]]:max-w-full [&>[data-tab-item]_[role=tab]]:min-w-0 [&>[data-tab-item]_[role=tab]]:whitespace-normal [&>[data-tab-item]_[role=tab]>span]:whitespace-normal', viewportClassName)}>{children}</Viewport>
    {edges.overflow && <button type="button" aria-label="Ver próximas abas" title="Ver próximas abas" disabled={!edges.after} onClick={() => move(1)} className="grid min-h-11 w-11 shrink-0 place-items-center self-stretch border-b border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-30"><ChevronRight aria-hidden className="h-5 w-5" /></button>}
  </div>;
}
