import * as React from 'react';
import { Search, type LucideIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SearchFieldProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {
  actions?: React.ReactNode;
  containerClassName?: string;
}

const SearchField = React.forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ actions, className, containerClassName, ...props }, ref) => (
    <div className={cn('relative', containerClassName)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={ref}
        type="search"
        className={cn('h-9 pl-9', actions && 'pr-[4.75rem]', className)}
        {...props}
      />
      {actions && (
        <div className="absolute right-1 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5">
          {actions}
        </div>
      )}
    </div>
  ),
);
SearchField.displayName = 'SearchField';

interface SearchFieldActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  activeCount?: number;
  tooltip?: string;
}

const SearchFieldAction = React.forwardRef<HTMLButtonElement, SearchFieldActionProps>(
  ({ icon: Icon, label, activeCount = 0, tooltip, className, ...props }, ref) => {
    const hasActive = activeCount > 0;
    const accessibleLabel = hasActive ? `${label}, ${activeCount} ativo${activeCount === 1 ? '' : 's'}` : label;

    return (
      <TooltipProvider delayDuration={350}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={ref}
              type="button"
              aria-label={accessibleLabel}
              className={cn(
                'group/search-action relative inline-flex h-8 min-w-8 max-w-8 items-center justify-end overflow-hidden rounded-sm px-2 text-muted-foreground',
                'transition-[max-width,color] duration-200 ease-out hover:max-w-24 hover:text-foreground focus-visible:max-w-24 focus-visible:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 motion-reduce:transition-none',
                hasActive && 'text-primary',
                className,
              )}
              {...props}
            >
              <span className="mr-0 max-w-0 overflow-hidden whitespace-nowrap text-xs font-semibold opacity-0 transition-[max-width,margin,opacity] duration-200 ease-out group-hover/search-action:mr-1.5 group-hover/search-action:max-w-16 group-hover/search-action:opacity-100 group-focus-visible/search-action:mr-1.5 group-focus-visible/search-action:max-w-16 group-focus-visible/search-action:opacity-100 motion-reduce:transition-none">
                {label}
              </span>
              <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover/search-action:translate-x-0.5 group-focus-visible/search-action:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
              {hasActive && (
                <span className="absolute right-0.5 top-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {tooltip ?? label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
SearchFieldAction.displayName = 'SearchFieldAction';

export { SearchField, SearchFieldAction };
