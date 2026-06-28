import { useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NumericInput } from '@/components/ui/numeric-input';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Configuração de frequência de UMA pergunta de checklist (Fase B — contratos
 * agnósticos, fatia B2). Os 5 campos espelham `form_questions` e o motor puro
 * `visitScheduleEngine.ts` (ActivitySpec). NULL em tudo = "Toda visita".
 *
 * Só deve ser renderizado quando a empresa tem o módulo `contracts` — o gate
 * fica no chamador (ChecklistDetail), não aqui.
 */
export interface QuestionFrequency {
  freq_kind?: 'time' | 'visits' | null;
  freq_months?: number | null;
  freq_visits?: number | null;
  start_kind?: 'contract_start' | 'due_now' | 'visit_n' | null;
  start_visit?: number | null;
}

/** Payload completo gravado na pergunta (sempre os 5 campos, NULL quando padrão). */
export interface QuestionFrequencyPayload {
  freq_kind: 'time' | 'visits' | null;
  freq_months: number | null;
  freq_visits: number | null;
  start_kind: 'contract_start' | 'due_now' | 'visit_n' | null;
  start_visit: number | null;
}

const MONTH_PRESETS: { months: number; label: string }[] = [
  { months: 1, label: 'Mensal' },
  { months: 2, label: 'Bimestral' },
  { months: 3, label: 'Trimestral' },
  { months: 6, label: 'Semestral' },
  { months: 12, label: 'Anual' },
];

const EVERY_VISIT: QuestionFrequencyPayload = {
  freq_kind: null,
  freq_months: null,
  freq_visits: null,
  start_kind: null,
  start_visit: null,
};

/** É o padrão "Toda visita" (tudo NULL)? */
export function isEveryVisit(f: QuestionFrequency): boolean {
  return !f.freq_kind;
}

/** Texto curto do selo a partir dos campos da pergunta. */
export function frequencyLabel(f: QuestionFrequency): string {
  if (!f.freq_kind) return 'Toda visita';
  if (f.freq_kind === 'visits') {
    const n = f.freq_visits ?? 1;
    return n <= 1 ? 'Toda visita' : `A cada ${n} visitas`;
  }
  // time
  const m = f.freq_months ?? 0;
  const preset = MONTH_PRESETS.find((p) => p.months === m);
  return preset ? preset.label : `A cada ${m} meses`;
}

interface QuestionFrequencyBadgeProps {
  value: QuestionFrequency;
  onChange: (payload: QuestionFrequencyPayload) => void;
  disabled?: boolean;
  className?: string;
}

export function QuestionFrequencyBadge({ value, onChange, disabled, className }: QuestionFrequencyBadgeProps) {
  const [open, setOpen] = useState(false);
  const everyVisit = isEveryVisit(value);
  const dueNow = value.start_kind === 'due_now';
  const label = frequencyLabel(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn('shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full', className)}
          title="Frequência da pergunta"
        >
          <Badge
            variant={everyVisit ? 'outline' : 'default'}
            className={cn(
              'gap-1 px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors',
              everyVisit
                ? 'text-muted-foreground font-normal border-dashed hover:bg-muted/60'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 border-transparent',
            )}
          >
            <CalendarClock className="h-3 w-3" />
            <span className="whitespace-nowrap">{label}</span>
            {!everyVisit && dueNow && <span className="opacity-80">· vencida</span>}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <FrequencyEditor
          value={value}
          onApply={(payload) => {
            onChange(payload);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type EditorMode = 'months' | 'visits';

function FrequencyEditor({ value, onApply }: { value: QuestionFrequency; onApply: (p: QuestionFrequencyPayload) => void }) {
  // Estado local: começa refletindo o valor atual.
  const [custom, setCustom] = useState(value.freq_kind === 'time' && !MONTH_PRESETS.some((p) => p.months === value.freq_months));
  const [mode, setMode] = useState<EditorMode>(value.freq_kind === 'visits' ? 'visits' : 'months');
  const [months, setMonths] = useState<string>(value.freq_kind === 'time' && value.freq_months ? String(value.freq_months) : '');
  const [visits, setVisits] = useState<string>(value.freq_kind === 'visits' && value.freq_visits ? String(value.freq_visits) : '2');
  const [dueNow, setDueNow] = useState(value.start_kind === 'due_now');

  const applyPreset = (m: number) => {
    onApply({
      freq_kind: 'time',
      freq_months: m,
      freq_visits: null,
      start_kind: dueNow ? 'due_now' : 'contract_start',
      start_visit: null,
    });
  };

  const applyEveryVisit = () => onApply({ ...EVERY_VISIT });

  const applyCustom = () => {
    if (mode === 'visits') {
      const n = Math.max(1, parseInt(visits || '0', 10) || 0);
      if (n <= 1) {
        // "a cada 1 visita" = toda visita → grava padrão
        onApply({ ...EVERY_VISIT });
        return;
      }
      onApply({
        freq_kind: 'visits',
        freq_months: null,
        freq_visits: n,
        start_kind: dueNow ? 'due_now' : 'contract_start',
        start_visit: null,
      });
    } else {
      const m = parseInt(months || '0', 10) || 0;
      if (m <= 0) return;
      onApply({
        freq_kind: 'time',
        freq_months: m,
        freq_visits: null,
        start_kind: dueNow ? 'due_now' : 'contract_start',
        start_visit: null,
      });
    }
  };

  const currentIsPreset = (m: number) => value.freq_kind === 'time' && value.freq_months === m;

  return (
    <div className="text-sm">
      <div className="px-3 py-2.5 border-b">
        <p className="font-semibold leading-none">Frequência da pergunta</p>
        <p className="text-xs text-muted-foreground mt-1">Em quais visitas ela deve aparecer.</p>
      </div>

      {/* Opções rápidas */}
      <div className="p-2 space-y-1">
        <FreqOption label="Toda visita" active={isEveryVisit(value)} onClick={applyEveryVisit} muted />
        {MONTH_PRESETS.map((p) => (
          <FreqOption key={p.months} label={p.label} active={currentIsPreset(p.months)} onClick={() => applyPreset(p.months)} />
        ))}
        <button
          type="button"
          onClick={() => setCustom((c) => !c)}
          className={cn(
            'w-full flex items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted/60',
            custom && 'bg-muted/50',
          )}
        >
          <span>Personalizado…</span>
        </button>
      </div>

      {/* Bloco personalizado */}
      {custom && (
        <div className="px-3 pb-2 pt-1 space-y-3 border-t">
          <div className="flex items-center justify-center pt-1">
            <LabeledSwitch
              size="default"
              value={mode}
              onChange={(v) => setMode(v)}
              off={{ value: 'months', label: 'Meses' }}
              on={{ value: 'visits', label: 'Visitas' }}
              aria-label="Medir frequência por meses ou por número de visitas"
            />
          </div>

          {mode === 'months' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">A cada</span>
              <NumericInput
                value={months}
                onValueChange={setMonths}
                placeholder="3"
                className="h-9 text-center"
                inputMode="numeric"
              />
              <span className="text-xs text-muted-foreground shrink-0">meses</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">A cada</span>
              <NumericInput
                value={visits}
                onValueChange={setVisits}
                placeholder="2"
                className="h-9 text-center"
                inputMode="numeric"
              />
              <span className="text-xs text-muted-foreground shrink-0">visitas</span>
            </div>
          )}

          <Button type="button" className="w-full h-9" onClick={applyCustom}>
            <Check className="mr-1.5 h-4 w-4" /> Aplicar
          </Button>
        </div>
      )}

      {/* Começa vencida (só faz sentido quando não é "toda visita") */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t">
        <div className="min-w-0">
          <Label className="text-sm cursor-pointer">Começa vencida</Label>
          <p className="text-[11px] text-muted-foreground leading-snug">Aparece já na 1ª visita aplicável.</p>
        </div>
        <Switch
          checked={dueNow}
          onCheckedChange={(checked) => {
            setDueNow(checked);
            // Se já há uma frequência configurada, persiste a mudança na hora
            // (sem isso o toggle só valeria ao re-escolher um preset).
            if (value.freq_kind) {
              onApply({
                freq_kind: value.freq_kind,
                freq_months: value.freq_kind === 'time' ? value.freq_months ?? null : null,
                freq_visits: value.freq_kind === 'visits' ? value.freq_visits ?? null : null,
                start_kind: checked ? 'due_now' : 'contract_start',
                start_visit: null,
              });
            }
          }}
          aria-label="Começa vencida"
        />
      </div>
    </div>
  );
}

function FreqOption({ label, active, onClick, muted }: { label: string; active: boolean; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted/60',
        active && 'bg-primary/10 text-primary font-medium',
      )}
    >
      <span className={cn(muted && !active && 'text-muted-foreground')}>{label}</span>
      {active && <Check className="h-4 w-4 shrink-0" />}
    </button>
  );
}
