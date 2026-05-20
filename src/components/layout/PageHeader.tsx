import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { typography } from '@/lib/typography';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Header padronizado de página. Use no topo de toda página principal.
 * Substitui combinações ad-hoc de <h1>+<p>.
 *
 * Ex:
 *   <PageHeader title="Clientes" subtitle="Gerencie seus clientes" icon={Users}>
 *     <Button>Novo Cliente</Button>
 *   </PageHeader>
 */
export function PageHeader({ title, subtitle, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <Icon className="h-7 w-7 lg:h-8 lg:w-8 text-foreground/70 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <h1 className={typography.pageTitle}>{title}</h1>
          {subtitle && (
            <p className={cn(typography.pageSubtitle, 'mt-1')}>{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
