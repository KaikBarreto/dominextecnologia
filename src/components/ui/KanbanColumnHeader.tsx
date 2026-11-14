import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface KanbanColumnHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
  title: string;
  color: string;
  count: number;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** Resumo opcional, por exemplo o valor total da coluna. */
  children?: ReactNode;
}

/** Cabeçalho Kanban compartilhado: referência visual do CRM, reutilizada em OS e disponível aos outros domínios. */
export function KanbanColumnHeader({ title, color, count, icon: Icon, actions, children, className, style, ...props }: KanbanColumnHeaderProps) {
  return (
    <div {...props} data-kanban-column-header className={cn('rounded-t-2xl px-3 py-3 text-white', className)} style={{ ...style, backgroundColor: color || '#475569' }}>
      <div className="flex items-center justify-between gap-2">
        <h3 data-kanban-column-title className="flex min-w-0 items-center gap-2 text-base font-semibold text-white">
          {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="break-words leading-snug">{title}</span>
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium tabular-nums text-white">{count}</span>
          {actions}
        </div>
      </div>
      {children != null && children !== false && <div className="mt-1 min-w-0 break-words text-sm font-semibold tabular-nums text-white">{children}</div>}
    </div>
  );
}
