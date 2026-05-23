import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PillTab {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface MobilePillTabsProps {
  tabs: PillTab[];
  activeTab: string;
  onTabChange: (value: string) => void;
  className?: string;
}

/**
 * Segmented control horizontal scrollável pra trocar de aba no mobile.
 * Pills snap-x com gradient fade nas bordas. Visual app nativo.
 */
export function MobilePillTabs({ tabs, activeTab, onTabChange, className }: MobilePillTabsProps) {
  return (
    <div className={cn('relative -mx-3', className)}>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-3 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-3 bg-gradient-to-l from-background to-transparent" />
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-1 snap-x scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onTabChange(tab.value)}
              className={cn(
                'snap-start shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium transition-all active:scale-95',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted active:bg-muted',
              )}
            >
              {tab.icon}
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
