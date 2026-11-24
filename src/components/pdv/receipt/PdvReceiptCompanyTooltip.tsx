import type { ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** O botão desabilitado continua explicável pelo tooltip do app, inclusive no teclado. */
export function PdvReceiptCompanyTooltip({ ready, message, children }: { ready: boolean; message: string; children: ReactElement }) {
  if (ready) return children;
  return <TooltipProvider delayDuration={150}><Tooltip>
    <TooltipTrigger asChild><span tabIndex={0} className="inline-flex min-w-0 max-w-full">{children}</span></TooltipTrigger>
    <TooltipContent className="max-w-72">{message}</TooltipContent>
  </Tooltip></TooltipProvider>;
}
