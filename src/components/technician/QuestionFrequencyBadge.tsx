import { useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NumericInput } from '@/components/ui/numeric-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
// Lógica PURA do rótulo de frequência vive num util compartilhado (reusada pelo
// documento "Plano de Manutenção" sem arrastar React/Radix). FONTE ÚNICA.
import {
  MONTH_PRESETS,
  frequencyLabel,
  frequencyDetail,
  isEveryVisit,
  type QuestionFrequency,
  type QuestionFrequencyPayload,
} from '@/components/contracts/questionFrequency';

// Re-export pra não quebrar os imports existentes deste módulo.
export {
  frequencyLabel,
  isEveryVisit,
  type QuestionFrequency,
  type QuestionFrequencyPayload,
};

/**
 * Configuração de frequência de UMA pergunta de checklist (Fase B — contratos
 * agnósticos, fatia B2). Os 6 campos espelham `form_questions` e o motor puro
 * `visitScheduleEngine.ts` (ActivitySpec). NULL em tudo = "Toda visita".
 *
 * Só deve ser renderizado quando a empresa tem o módulo `contracts` — o gate
 * fica no chamador (ChecklistDetail), não aqui.
 */

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

/** Valor selecionado no Select compacto (variant="select"). */
type SelectChoice = 'every' | '1' | '2' | '3' | '6' | '12' | 'custom';

/** Deriva a opção do Select a partir do valor salvo (round-trip). */
function selectChoiceFromValue(value: QuestionFrequency): SelectChoice {
  if (!value.freq_kind) return 'every';
  if (isCustomValue(value)) return 'custom';
  // Preset de meses conhecido.
  const m = value.freq_months ?? 0;
  if (m === 1 || m === 2 || m === 3 || m === 6 || m === 12) return String(m) as SelectChoice;
  return 'custom';
}

const SELECT_OPTIONS: { value: SelectChoice; label: string }[] = [
  { value: 'every', label: 'Toda visita' },
  { value: '1', label: 'Mensal' },
  { value: '2', label: 'Bimestral' },
  { value: '3', label: 'Trimestral' },
  { value: '6', label: 'Semestral' },
  { value: '12', label: 'Anual' },
  { value: 'custom', label: 'Personalizado' },
];

export function FrequencyEditor({ value, onApply, variant = 'list' }: { value: QuestionFrequency; onApply: (p: QuestionFrequencyPayload) => void | Promise<void>; variant?: 'list' | 'select' }) {
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

  // ── Variante compacta (Select) — usada no modal de criar/editar pergunta.
  // Recolhida numa linha; os controles extras (a cada X / começa vencida) só
  // aparecem quando "Personalizado" está escolhido. Reusa o MESMO payload.
  if (variant === 'select') {
    const choice = selectChoiceFromValue(value);

    const handleSelect = (next: SelectChoice) => {
      if (next === 'every') {
        // Sai do override custom e zera a frequência.
        setCustom(false);
        applyEveryVisit();
        return;
      }
      if (next === 'custom') {
        // Entra no modo personalizado sem persistir ainda — o usuário ajusta o
        // intervalo e o "Começa vencida". O override local `custom` abre o bloco
        // mesmo que o valor salvo ainda seja um preset/toda visita.
        setCustom(true);
        return;
      }
      // Preset de meses → limpa o override custom e persiste na hora.
      setCustom(false);
      applyPreset(parseInt(next, 10));
    };

    // Separa a ESCOLHA VISUAL do valor persistido: enquanto o usuário não aplicou
    // "Personalizado", `value` ainda reflete o valor antigo. O state `custom` é o
    // override que manda no que o Select mostra e em abrir o bloco custom.
    const showCustom = custom || choice === 'custom';
    const selectValue: SelectChoice = custom ? 'custom' : choice;
    // "Começa vencida" é acessível sempre que houver frequência (preset OU custom),
    // não só no Personalizado. Em "Toda visita" não faz sentido.
    const showDueNow = showCustom || choice !== 'every';

    return (
      <div className="text-sm space-y-3">
        <Select value={selectValue} onValueChange={(v) => handleSelect(v as SelectChoice)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Toda visita" />
          </SelectTrigger>
          <SelectContent>
            {SELECT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showCustom && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            {/* Seletor ternário (Meses / Dias / Visitas). */}
            <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1">
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

        {/* Começa vencida — acessível com QUALQUER frequência ≠ "Toda visita"
            (preset ou personalizado), não só no bloco custom. Em "Toda visita"
            fica oculto (não há "1ª visita aplicável" diferente). */}
        {showDueNow && (
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
            <div className="min-w-0">
              <Label className="text-sm cursor-pointer">Começa vencida</Label>
              <p className="text-[11px] text-muted-foreground leading-snug">Aparece já na 1ª visita aplicável.</p>
            </div>
            <Switch
              checked={dueNow}
              onCheckedChange={(checked) => {
                setDueNow(checked);
                // No modo personalizado a frequência só é definida ao Aplicar
                // (applyCustom já lê `dueNow`) → aqui só guarda o state.
                // Num PRESET já persistido, persiste a mudança na hora mantendo
                // a frequência atual (payload completo de 6 campos).
                if (!showCustom && value.freq_kind) {
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
