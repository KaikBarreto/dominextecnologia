import { cn } from '@/lib/utils';
import type { PartyLabel } from '@/hooks/usePartyLabels';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function PartyLabelBadge({
  label,
  className,
  compact = false,
}: {
  label?: PartyLabel | null;
  className?: string;
  compact?: boolean;
}) {
  if (!label) return null;

  if (compact) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="img"
              aria-label={`Etiqueta: ${label.name}`}
              className={cn('inline-block h-4 w-6 shrink-0 cursor-help', className)}
              style={{
                backgroundColor: label.color,
                clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%)',
              }}
            />
          </TooltipTrigger>
          <TooltipContent side="top">{label.name}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <span
      className={cn('inline-flex max-w-full shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-4 text-white', className)}
      style={{ backgroundColor: label.color }}
      title={label.name}
    >
      <span className="truncate">{label.name}</span>
    </span>
  );
}
