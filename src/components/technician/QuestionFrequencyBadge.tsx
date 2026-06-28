import { useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NumericInput } from '@/components/ui/numeric-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Configuração de frequência de UMA pergunta de checklist (Fase B — contratos
 * agnósticos, fatia B2). Os 6 campos espelham `form_questions` e o motor puro
 * `visitScheduleEngine.ts` (ActivitySpec). NULL em tudo = "Toda visita".
 *
 * Só deve ser renderizado quando a empresa tem o módulo `contracts` — o gate
 * fica no chamador (ChecklistDetail), não aqui.
 */
export interface QuestionFrequency {
  freq_kind?: 'time' | 'visits' | null;
  freq_months?: number | null;
  freq_days?: number | null;
  freq_visits?: number | null;
  start_kind?: 'contract_start' | 'due_now' | 'visit_n' | null;
  start_visit?: number | null;
}

/** Payload completo gravado na pergunta (sempre os 6 campos, NULL quando padrão). */
export interface QuestionFrequencyPayload {
  freq_kind: 'time' | 'visits' | null;
  freq_months: number | null;
  freq_days: number | null;
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

/** Teto pra não estourar o `integer` do Postgres (e nº absurdo é sempre erro). */
const MAX_INTERVAL = 999;

const EVERY_VISIT: QuestionFrequencyPayload = {
  freq_kind: null,
  freq_months: null,
  freq_days: null,
  freq_visits: null,
  start_kind: null,
  start_visit: null,
};

/** Clampa um inteiro positivo a [0, MAX_INTERVAL]. NaN/negativo → 0. */
function clampInterval(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_INTERVAL);
}

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
  // time: dias têm prioridade sobre meses (espelha o motor).
  const d = f.freq_days ?? 0;
  if (d > 0) return 'Personalizado';
  const m = f.freq_months ?? 0;
  const preset = MONTH_PRESETS.find((p) => p.months === m);
  if (preset) return preset.label;
  // Qualquer valor de meses fora dos presets (ou intervalo ausente) = custom.
  return 'Personalizado';
}

/** Texto longo (popover/title): descreve o intervalo exato. */
function frequencyDetail(f: QuestionFrequency): string {
  if (!f.freq_kind) return 'Aparece em toda visita.';
  if (f.freq_kind === 'visits') {
    const n = f.freq_visits ?? 1;
    return n <= 1 ? 'Aparece em toda visita.' : `Aparece a cada ${n} visitas.`;
  }
  const d = f.freq_days ?? 0;
  if (d > 0) return `Aparece a cada ${d} dias.`;
  const m = f.freq_months ?? 0;
  return m > 0 ? `Aparece a cada ${m} ${m === 1 ? 'mês' : 'meses'}.` : 'Aparece em toda visita.';
}

interface QuestionFrequencyBadgeProps {
  value: QuestionFrequency;
  /**
   * Persiste a frequência. Pode retornar uma Promise — o popover só FECHA quando
   * ela resolve (sucesso). Se rejeitar (erro), o popover fica ABERTO (o chamador
   * mostra o toast de erro). Retorno void/undefined fecha imediatamente.
   */
  onChange: (payload: QuestionFrequencyPayload) => void | Promise<void>;
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
          title={frequencyDetail(value)}
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
          onApply={async (payload) => {
            try {
              // Fecha SÓ no sucesso; em erro mantém aberto (chamador toasta).
              await onChange(payload);
              setOpen(false);
            } catch {
              // Mantém o popover aberto pra o técnico tentar de novo.
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type EditorMode = 'months' | 'days' | 'visits';

const MODE_OPTIONS: { value: EditorMode; label: string }[] = [
  { value: 'months', label: 'Meses' },
  { value: 'days', label: 'Dias' },
  { value: 'visits', label: 'Visitas' },
];

/** Modo inicial do editor a partir do valor salvo (round-trip). */
function initialMode(value: QuestionFrequency): EditorMode {
  if (value.freq_kind === 'visits') return 'visits';
  if (value.freq_kind === 'time' && (value.freq_days ?? 0) > 0) return 'days';
  return 'months';
}

/** O valor salvo é uma frequência "Personalizada" (não um preset de meses)? */
function isCustomValue(value: QuestionFrequency): boolean {
  if (value.freq_kind === 'visits') return true;
  if (value.freq_kind === 'time') {
    if ((value.freq_days ?? 0) > 0) return true;
    return !MONTH_PRESETS.some((p) => p.months === value.freq_months);
  }
  return false;
}

function FrequencyEditor({ value, onApply }: { value: QuestionFrequency; onApply: (p: QuestionFrequencyPayload) => void | Promise<void> }) {
  // Estado local: começa refletindo o valor atual (round-trip months/days/visits).
  const [custom, setCustom] = useState(isCustomValue(value));
  const [mode, setMode] = useState<EditorMode>(initialMode(value));
  const [months, setMonths] = useState<string>(
    value.freq_kind === 'time' && (value.freq_days ?? 0) <= 0 && value.freq_months ? String(value.freq_months) : '',
  );
  const [days, setDays] = useState<string>(
    value.freq_kind === 'time' && (value.freq_days ?? 0) > 0 ? String(value.freq_days) : '',
  );
  const [visits, setVisits] = useState<string>(value.freq_kind === 'visits' && value.freq_visits ? String(value.freq_visits) : '2');
  const [dueNow, setDueNow] = useState(value.start_kind === 'due_now');

  const everyVisitNow = isEveryVisit(value);

  const applyPreset = (m: number) => {
    onApply({
      freq_kind: 'time',
      freq_months: m,
      freq_days: null,
      freq_visits: null,
      start_kind: dueNow ? 'due_now' : 'contract_start',
      start_visit: null,
    });
  };

  const applyEveryVisit = () => onApply({ ...EVERY_VISIT });

  const applyCustom = () => {
    if (mode === 'visits') {
      const n = clampInterval(parseInt(visits || '0', 10));
      if (n <= 1) {
        // "a cada 0/1 visita" = toda visita → grava padrão
        onApply({ ...EVERY_VISIT });
        return;
      }
      onApply({
        freq_kind: 'visits',
        freq_months: null,
        freq_days: null,
        freq_visits: n,
        start_kind: dueNow ? 'due_now' : 'contract_start',
        start_visit: null,
      });
    } else if (mode === 'days') {
      const d = clampInterval(parseInt(days || '0', 10));
      if (d <= 0) return; // invariante: 'time' exige intervalo > 0
      onApply({
        freq_kind: 'time',
        freq_months: null,
        freq_days: d,
        freq_visits: null,
        start_kind: dueNow ? 'due_now' : 'contract_start',
        start_visit: null,
      });
    } else {
      const m = clampInterval(parseInt(months || '0', 10));
      if (m <= 0) return; // invariante: 'time' exige intervalo > 0
      onApply({
        freq_kind: 'time',
        freq_months: m,
        freq_days: null,
        freq_visits: null,
        start_kind: dueNow ? 'due_now' : 'contract_start',
        start_visit: null,
      });
    }
  };

  // Botão Aplicar fica bloqueado quando o intervalo do modo atual é inválido
  // (evita salvar 'time' sem intervalo — que o motor trataria como "eventual").
  const applyDisabled =
    (mode === 'months' && clampInterval(parseInt(months || '0', 10)) <= 0) ||
    (mode === 'days' && clampInterval(parseInt(days || '0', 10)) <= 0);

  const currentIsPreset = (m: number) =>
    value.freq_kind === 'time' && (value.freq_days ?? 0) <= 0 && value.freq_months === m;

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
          {/* Seletor ternário (Meses / Dias / Visitas) — LabeledSwitch é só pra
              binário; com 3 modos usamos um grupo de botões segmentado. */}
          <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1 mt-2">
            {MODE_OPTIONS.map((opt) => {
              const active = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={cn(
                    'rounded-md py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/60',
                  )}
                  aria-pressed={active}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {mode === 'months' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">A cada</span>
              <NumericInput value={months} onValueChange={setMonths} placeholder="3" className="h-9 text-center" inputMode="numeric" />
              <span className="text-xs text-muted-foreground shrink-0">meses</span>
            </div>
          )}
          {mode === 'days' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">A cada</span>
              <NumericInput value={days} onValueChange={setDays} placeholder="17" className="h-9 text-center" inputMode="numeric" />
              <span className="text-xs text-muted-foreground shrink-0">dias</span>
            </div>
          )}
          {mode === 'visits' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">A cada</span>
              <NumericInput value={visits} onValueChange={setVisits} placeholder="2" className="h-9 text-center" inputMode="numeric" />
              <span className="text-xs text-muted-foreground shrink-0">visitas</span>
            </div>
          )}

          <Button type="button" className="w-full h-9" onClick={applyCustom} disabled={applyDisabled}>
            <Check className="mr-1.5 h-4 w-4" /> Aplicar
          </Button>
        </div>
      )}

      {/* Começa vencida — só faz sentido com frequência definida. Em "Toda
          visita" fica oculto (não há "1ª visita aplicável" diferente). */}
      {!everyVisitNow && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t">
          <div className="min-w-0">
            <Label className="text-sm cursor-pointer">Começa vencida</Label>
            <p className="text-[11px] text-muted-foreground leading-snug">Aparece já na 1ª visita aplicável.</p>
          </div>
          <Switch
            checked={dueNow}
            onCheckedChange={(checked) => {
              setDueNow(checked);
              // Já há frequência configurada → persiste a mudança na hora,
              // mantendo o payload COMPLETO (6 campos) e o intervalo atual.
              if (value.freq_kind) {
                onApply({
                  freq_kind: value.freq_kind,
                  freq_months: value.freq_kind === 'time' ? value.freq_months ?? null : null,
                  freq_days: value.freq_kind === 'time' ? value.freq_days ?? null : null,
                  freq_visits: value.freq_kind === 'visits' ? value.freq_visits ?? null : null,
                  start_kind: checked ? 'due_now' : 'contract_start',
                  start_visit: null,
                });
              }
            }}
            aria-label="Começa vencida"
          />
        </div>
      )}
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
