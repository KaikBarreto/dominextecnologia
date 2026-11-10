import { AlertCircle, Building2, Check, ChevronRight } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/lib/utils';

export type CompanyFormSection = 'basic' | 'commercial' | 'access';

interface SectionState {
  key: CompanyFormSection;
  label: string;
  complete: boolean;
  optional?: boolean;
}

interface CompanyFormSummaryProps {
  companyName: string;
  contactName: string;
  status: string;
  planName: string;
  subscriptionValue: number;
  billingCycle: string;
  maxUsers: number;
  expiresAt: string;
  modulesLabel: string;
  sections: SectionState[];
  activeSection: CompanyFormSection;
  onNavigate: (section: CompanyFormSection) => void;
  className?: string;
}

const STATUS_LABELS: Record<string, string> = {
  testing: 'Em teste',
  active: 'Ativa',
  inactive: 'Inativa',
};

const STATUS_COLORS: Record<string, string> = {
  testing: 'bg-orange-500',
  active: 'bg-emerald-500',
  inactive: 'bg-slate-500',
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Não definido';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function CompanyFormSummary({
  companyName,
  contactName,
  status,
  planName,
  subscriptionValue,
  billingCycle,
  maxUsers,
  expiresAt,
  modulesLabel,
  sections,
  activeSection,
  onNavigate,
  className,
}: CompanyFormSummaryProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className={cn('space-y-6', className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Building2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p id={titleId} className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Resumo da empresa
          </p>
          <p className="mt-1 break-words text-base font-semibold leading-5 text-foreground">
            {companyName.trim() || 'Nova empresa'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[status] ?? STATUS_COLORS.inactive)} />
              {STATUS_LABELS[status] ?? 'Status não definido'}
            </span>
            {contactName.trim() ? <span>• {contactName}</span> : null}
          </div>
        </div>
      </div>

      <dl className="divide-y border-y text-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
          <dt className="text-muted-foreground">Plano</dt>
          <dd className="max-w-40 break-words text-right font-medium text-foreground">{planName || 'Não definido'}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
          <dt className="text-muted-foreground">Valor</dt>
          <dd className="whitespace-nowrap text-right font-semibold tabular-nums text-foreground">
            {formatMoney(subscriptionValue)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              /{billingCycle === 'yearly' ? 'ano' : 'mês'}
            </span>
          </dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
          <dt className="text-muted-foreground">Usuários</dt>
          <dd className="text-right font-medium tabular-nums text-foreground">{Math.max(0, maxUsers || 0)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
          <dt className="text-muted-foreground">Vencimento</dt>
          <dd className="whitespace-nowrap text-right font-medium tabular-nums text-foreground">{formatDate(expiresAt)}</dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
          <dt className="text-muted-foreground">Módulos</dt>
          <dd className="max-w-40 break-words text-right font-medium text-foreground">{modulesLabel}</dd>
        </div>
      </dl>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Seções</p>
        <nav aria-label="Revisar seções da empresa" className="mt-2 divide-y border-y">
          {sections.map((section) => {
            const pending = !section.complete && !section.optional;
            const optionalIncomplete = !section.complete && section.optional;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => onNavigate(section.key)}
                aria-current={activeSection === section.key ? 'step' : undefined}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2 py-2.5 text-left text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  activeSection === section.key ? 'font-semibold text-primary' : 'text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    pending
                      ? 'bg-destructive text-destructive-foreground'
                      : optionalIncomplete
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-emerald-600 text-white',
                  )}
                  aria-hidden="true"
                >
                  {pending ? (
                    <AlertCircle className="h-3.5 w-3.5" />
                  ) : optionalIncomplete ? (
                    <span className="text-xs font-semibold">—</span>
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0 flex-1 break-words">{section.label}</span>
                {section.optional && !section.complete ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Opcional</span>
                ) : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
