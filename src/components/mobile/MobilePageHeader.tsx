import type { LucideIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/utils';

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
  compactOnMobile?: boolean;
}

/**
 * Header de página. Desktop delega pro PageHeader padrão. Mobile compacta em ~56px.
 */
export function MobilePageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  className,
  compactOnMobile = false,
}: MobilePageHeaderProps) {
  const isMobile = useIsMobile();

  if (!isMobile || !compactOnMobile) {
    return <PageHeader title={title} subtitle={subtitle} icon={Icon} actions={actions} className={className} />;
  }

  return (
    <div className={cn('flex items-center gap-2 h-14 mb-3', className)}>
      {Icon && <Icon className="h-5 w-5 text-foreground/70 shrink-0" />}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold tracking-tight truncate leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground truncate leading-tight">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </div>
  );
}
