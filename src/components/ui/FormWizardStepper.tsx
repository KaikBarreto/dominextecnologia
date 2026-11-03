import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';

export interface FormWizardStep {
  key: string;
  label: string;
}

interface FormWizardStepperProps {
  steps: FormWizardStep[];
  currentIndex: number;
  maxReachedIndex?: number;
  onStepChange?: (index: number) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Navegação compartilhada dos formulários em etapas.
 *
 * No desktop os rótulos podem ocupar duas linhas e nunca recebem ellipsis.
 * Em telas compactas mostramos a etapa ativa por extenso e o progresso, porque
 * comprimir todos os rótulos em uma única faixa torna a navegação ilegível.
 */
export function FormWizardStepper({
  steps,
  currentIndex,
  maxReachedIndex = currentIndex,
  onStepChange,
  ariaLabel = 'Etapas do formulário',
  className,
}: FormWizardStepperProps) {
  const activeStep = steps[currentIndex];
  const progress = steps.length > 0 ? ((currentIndex + 1) / steps.length) * 100 : 0;

  if (steps.length === 0) return null;

  return (
    <nav aria-label={ariaLabel} className={cn('min-w-0', className)}>
      <div className="lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {currentIndex + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Etapa {currentIndex + 1} de {steps.length}
            </p>
            <p className="mt-0.5 whitespace-normal break-words text-sm font-semibold leading-5 text-foreground">
              {activeStep?.label}
            </p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={`Progresso: etapa ${currentIndex + 1} de ${steps.length}`}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={currentIndex + 1}
          className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ol
        className="relative hidden items-start lg:grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[calc(50%/var(--wizard-step-count))] right-[calc(50%/var(--wizard-step-count))] top-3 h-px bg-border"
          style={{ '--wizard-step-count': steps.length } as CSSProperties}
        />
        {steps.map((step, index) => {
          const reached = index <= maxReachedIndex;
          const completed = index < currentIndex;
          const active = index === currentIndex;

          return (
            <li key={step.key} className="relative min-w-0 px-1">
              <button
                type="button"
                onClick={() => onStepChange?.(index)}
                disabled={!reached || !onStepChange}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'group flex w-full min-w-0 flex-col items-center rounded-lg px-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  reached && onStepChange && 'cursor-pointer',
                  !reached && 'cursor-not-allowed',
                )}
              >
                <span
                  className={cn(
                    'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background text-[10px] font-semibold transition-colors',
                    active && 'border-primary bg-primary text-primary-foreground ring-2 ring-primary/15',
                    completed && 'border-primary bg-primary text-primary-foreground',
                    !reached && 'border-muted text-muted-foreground opacity-70',
                    reached && !active && !completed && 'border-border text-foreground',
                  )}
                >
                  {completed ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'mt-1.5 block min-h-5 w-full whitespace-normal break-words text-[11px] font-medium leading-4',
                    active && 'font-semibold text-foreground',
                    completed && 'text-foreground',
                    !reached && 'text-muted-foreground opacity-70',
                  )}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
