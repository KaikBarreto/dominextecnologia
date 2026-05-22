import type { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FABButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'extended' | 'mini';
  className?: string;
}

/**
 * Floating Action Button. Mobile = fixo acima da bottom nav. Desktop = botão inline.
 */
export function FABButton({ icon, label, onClick, variant = 'extended', className }: FABButtonProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return (
      <Button onClick={onClick} className={cn('bg-primary text-primary-foreground hover:bg-primary/90', className)}>
        <span className="mr-2 flex h-4 w-4 items-center justify-center">{icon}</span>
        {label}
      </Button>
    );
  }

  if (variant === 'mini') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          'mobile-fab fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-90 animate-in fade-in zoom-in-90',
          className
        )}
        style={{ bottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      >
        <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'mobile-fab fixed right-4 z-40 flex h-12 items-center gap-1.5 rounded-full bg-primary pl-3.5 pr-4 text-primary-foreground shadow-md shadow-primary/25 transition-transform active:scale-95 animate-in fade-in zoom-in-90',
        className
      )}
      style={{ bottom: 'calc(96px + env(safe-area-inset-bottom))' }}
    >
      <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
