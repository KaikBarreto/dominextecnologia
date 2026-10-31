import { cn } from '@/lib/utils';
import type { PartyLabel } from '@/hooks/usePartyLabels';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function PartyLabelBadge({
  label,
  className,
  compact = false,
}: {
  label?: Pick<PartyLabel, 'id' | 'name' | 'color'> | null;
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

export function PartyLabelBadges({
  labels,
  mode = 'full',
  className,
}: {
  labels?: Array<Pick<PartyLabel, 'id' | 'name' | 'color'>> | null;
  mode?: 'full' | 'summary' | 'compact';
  className?: string;
}) {
  if (!labels?.length) return null;

  if (mode === 'full') {
    return (
      <span className={cn('inline-flex min-w-0 flex-wrap items-center gap-1', className)}>
        {labels.map((label) => <PartyLabelBadge key={label.id} label={label} />)}
      </span>
    );
  }

  const [first, ...remaining] = labels;
  const names = labels.map((label) => label.name).join(', ');
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            aria-label={`Etiquetas: ${names}`}
            className={cn('inline-flex min-w-0 shrink-0 cursor-help items-center gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
          >
            <PartyLabelBadge label={first} compact={mode === 'compact'} />
            {remaining.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-bold text-background">
                +{remaining.length}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          <div className="flex flex-wrap gap-1.5">
            {labels.map((label) => <PartyLabelBadge key={label.id} label={label} />)}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
