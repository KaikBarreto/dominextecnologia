import { AlertCircle, Check, ChevronDown, Pencil, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface WizardReviewItem {
  key: string;
  label: string;
  detail: string;
  complete: boolean;
  optional?: boolean;
  stepIndex: number;
}
interface WizardReviewChecklistProps {
  items: WizardReviewItem[];
  onEdit: (stepIndex: number) => void;
  title?: string;
  className?: string;
}

export function WizardReviewChecklist({
  items,
  onEdit,
  title = 'Pronto para criar',
  className,
}: WizardReviewChecklistProps) {
  const pending = items.filter((item) => !item.complete && !item.optional);
  const ready = pending.length === 0;

  return (
    <section aria-label={title} className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className={cn('mt-0.5 text-xs', ready ? 'text-muted-foreground' : 'text-destructive')} role="status">
            {ready
              ? 'Os dados obrigatórios estão completos.'
              : `${pending.length} ${pending.length === 1 ? 'pendência precisa' : 'pendências precisam'} de atenção.`}
          </p>
        </div>
      </div>

      <div className="divide-y border-y">
        {items.map((item) => {
          const pendingRequired = !item.complete && !item.optional;
          return (
            <div key={item.key} className="flex min-w-0 items-start gap-3 py-3">
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                  pendingRequired
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-success text-success-foreground',
                )}
                aria-hidden="true"
              >
                {pendingRequired ? <AlertCircle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  {item.optional && !item.complete && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Opcional</span>
                  )}
                </div>
                <p className={cn('mt-0.5 text-xs leading-relaxed', pendingRequired ? 'text-destructive' : 'text-muted-foreground')}>
                  {item.detail}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs"
                onClick={() => onEdit(item.stepIndex)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Editar
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface WizardMobileSummaryProps {
  title: string;
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Resumo recolhível que vive no rodapé fixo dos wizards em telas compactas. */
export function WizardMobileSummary({ title, summary, children, className }: WizardMobileSummaryProps) {
  return (
    <Collapsible className={cn('xl:hidden', className)}>
      <CollapsibleContent className="max-h-[34dvh] overflow-y-auto border-b pb-3 [@media(max-height:500px)]:max-h-10">
        {children}
      </CollapsibleContent>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex min-h-10 w-full items-center gap-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">{title}</span>
          <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </button>
      </CollapsibleTrigger>
    </Collapsible>
  );
}
