import { CalendarClock, ClipboardCheck, Users, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { FormWizardStepper } from '@/components/ui/FormWizardStepper';
import { cn } from '@/lib/utils';

export interface ServiceOrderWizardStep {
  key: 'client' | 'equipment' | 'details' | 'review';
  label: string;
}

interface ServiceOrderFormStepperProps {
  steps: ServiceOrderWizardStep[];
  currentIndex: number;
  maxReachedIndex?: number;
  onStepChange: (index: number) => void;
}

export function ServiceOrderFormStepper({
  steps,
  currentIndex,
  maxReachedIndex = currentIndex,
  onStepChange,
}: ServiceOrderFormStepperProps) {
  return (
    <FormWizardStepper
      steps={steps}
      currentIndex={currentIndex}
      maxReachedIndex={maxReachedIndex}
      onStepChange={onStepChange}
      ariaLabel="Etapas da ordem de serviço"
    />
  );
}

export interface ServiceOrderFormSummaryData {
  customerName: string;
  serviceNames: string[];
  equipmentCount: number;
  checklistCount: number;
  assigneeNames: string[];
  teamNames: string[];
  scheduleLabel: string;
  scheduleCount: number;
  budgetItemCount: number;
  recurrenceLabel?: string | null;
  description?: string | null;
  notes?: string | null;
  requireTechSignature: boolean;
  requireClientSignature: boolean;
  generateNpsSurvey: boolean;
}

interface ServiceOrderFormSummaryProps {
  data: ServiceOrderFormSummaryData;
  mode?: 'sidebar' | 'review' | 'mobile';
}

function joinNames(names: string[], empty: string) {
  if (names.length === 0) return empty;
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

export function ServiceOrderFormSummary({
  data,
  mode = 'sidebar',
}: ServiceOrderFormSummaryProps) {
  const responsibleNames = [...data.teamNames, ...data.assigneeNames];
  const services = joinNames(data.serviceNames, 'Nenhum serviço selecionado');

  return (
    <section
      aria-label={mode === 'review' ? 'Revisão da ordem de serviço' : 'Resumo da ordem de serviço'}
      data-summary-mode={mode}
      className={cn(
        'min-w-0 space-y-4',
        mode === 'sidebar' && 'pr-1',
        mode === 'review' && 'space-y-5',
      )}
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {mode === 'review' ? 'Confira antes de salvar' : 'Resumo da OS'}
        </p>
        <p className="mt-1 break-words text-sm font-semibold text-foreground">
          {data.customerName || 'Cliente não selecionado'}
        </p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">{services}</p>
      </div>

      <div className="grid grid-cols-3 divide-x border-y py-2">
        <div className="px-2 py-1 text-center">
          <Wrench className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
          <p className="mt-1 text-base font-semibold tabular-nums">{data.equipmentCount}</p>
          <p className="text-[10px] text-muted-foreground">equip.</p>
        </div>
        <div className="px-2 py-1 text-center">
          <ClipboardCheck className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
          <p className="mt-1 text-base font-semibold tabular-nums">{data.checklistCount}</p>
          <p className="text-[10px] text-muted-foreground">checklists</p>
        </div>
        <div className="px-2 py-1 text-center">
          <CalendarClock className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
          <p className="mt-1 text-base font-semibold tabular-nums">{data.scheduleCount}</p>
          <p className="text-[10px] text-muted-foreground">visitas</p>
        </div>
      </div>

      <dl className="space-y-2.5 text-xs">
        <div className="flex items-start justify-between gap-3">
          <dt className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-3.5 w-3.5" /> Responsáveis</dt>
          <dd className="max-w-[58%] text-right font-medium">{joinNames(responsibleNames, 'Não definidos')}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Agenda</dt>
          <dd className="max-w-[62%] text-right font-medium">{data.scheduleLabel || 'Não definida'}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="text-muted-foreground">Itens orçados</dt>
          <dd className="font-medium tabular-nums">{data.budgetItemCount}</dd>
        </div>
      </dl>

      {data.recurrenceLabel && (
        <p className="rounded-md border border-warning/35 bg-warning/10 p-2.5 text-xs leading-relaxed">
          {data.recurrenceLabel}
        </p>
      )}

      {mode === 'review' && (
        <div className="space-y-4 border-t pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Descrição</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{data.description?.trim() || 'Sem descrição.'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Observações internas</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{data.notes?.trim() || 'Sem observações.'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={data.requireTechSignature ? 'info' : 'secondary'}>
              Assinatura técnica: {data.requireTechSignature ? 'obrigatória' : 'opcional'}
            </Badge>
            <Badge variant={data.requireClientSignature ? 'info' : 'secondary'}>
              Assinatura do cliente: {data.requireClientSignature ? 'obrigatória' : 'opcional'}
            </Badge>
            <Badge variant={data.generateNpsSurvey ? 'success' : 'secondary'}>
              Pesquisa NPS: {data.generateNpsSurvey ? 'ativa' : 'desativada'}
            </Badge>
          </div>
        </div>
      )}
    </section>
  );
}

/** Informações complementares da revisão, sem repetir o resumo lateral. */
export function ServiceOrderReviewDetails({ data }: { data: ServiceOrderFormSummaryData }) {
  return (
    <section aria-label="Detalhes finais da ordem de serviço" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Descrição</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{data.description?.trim() || 'Sem descrição.'}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Observações internas</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{data.notes?.trim() || 'Sem observações.'}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant={data.requireTechSignature ? 'info' : 'secondary'}>
          Assinatura técnica: {data.requireTechSignature ? 'obrigatória' : 'opcional'}
        </Badge>
        <Badge variant={data.requireClientSignature ? 'info' : 'secondary'}>
          Assinatura do cliente: {data.requireClientSignature ? 'obrigatória' : 'opcional'}
        </Badge>
        <Badge variant={data.generateNpsSurvey ? 'success' : 'secondary'}>
          Pesquisa NPS: {data.generateNpsSurvey ? 'ativa' : 'desativada'}
        </Badge>
      </div>
    </section>
  );
}
