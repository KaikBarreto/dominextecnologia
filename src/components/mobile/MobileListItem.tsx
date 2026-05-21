import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MobileListItemProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
  /** Reservado pra extensão futura (swipe-to-action). Não implementado ainda. */
  swipeActions?: ReactNode;
}

/**
 * Linha estilo app nativo (altura mínima 56px). Divisor automático embaixo.
 */
export function MobileListItem({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  className,
}: MobileListItemProps) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 min-h-[72px] px-4 py-3.5 border-b border-border/60 last:border-b-0 text-left transition-colors',
        onClick && 'active:bg-muted/60 hover:bg-muted/40 cursor-pointer',
        className
      )}
    >
      {leading && <div className="shrink-0 flex items-center justify-center">{leading}</div>}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-[15px] font-medium truncate">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-1">{trailing}</div>}
    </Tag>
  );
}
