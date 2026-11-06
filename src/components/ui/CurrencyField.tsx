import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface CurrencyFieldProps {
  symbol: string;
  children: ReactNode;
  className?: string;
}

/**
 * Adorno monetário compartilhado. Mantém a cifra visível sem misturá-la ao
 * valor persistido e reserva uma largura curta, adequada a preço/custo unitário.
 */
export function CurrencyField({ symbol, children, className }: CurrencyFieldProps) {
  return (
    <div className={cn('relative min-w-0 [&_input]:pl-12', className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm font-medium text-muted-foreground"
      >
        {symbol}
      </span>
      {children}
    </div>
  );
}
