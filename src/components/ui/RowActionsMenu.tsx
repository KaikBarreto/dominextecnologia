import type { LucideIcon } from 'lucide-react';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type RowActionVariant = 'default' | 'edit' | 'delete';

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onClick: (e?: React.MouseEvent) => void;
  variant?: RowActionVariant;
  disabled?: boolean;
  hidden?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
  align?: 'start' | 'end' | 'center';
  triggerClassName?: string;
  ariaLabel?: string;
}

const variantClasses: Record<RowActionVariant, string> = {
  default:
    'focus:bg-primary focus:text-primary-foreground hover:bg-primary hover:text-primary-foreground data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground',
  edit:
    'focus:bg-warning focus:text-white hover:bg-warning hover:text-white data-[highlighted]:bg-warning data-[highlighted]:text-white',
  delete:
    'focus:bg-destructive focus:text-white hover:bg-destructive hover:text-white data-[highlighted]:bg-destructive data-[highlighted]:text-white',
};

export function RowActionsMenu({
  actions,
  align = 'end',
  triggerClassName,
  ariaLabel = 'Ações',
}: RowActionsMenuProps) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8 active:scale-95 transition-transform', triggerClassName)}
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="min-w-[180px]"
        onClick={(e) => e.stopPropagation()}
      >
        {visible.map((action, i) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(e);
              }}
              disabled={action.disabled}
              className={cn(
                'gap-2 cursor-pointer',
                variantClasses[action.variant ?? 'default'],
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{action.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
