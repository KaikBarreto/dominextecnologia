import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface PayrollAdjustmentDraft {
  id: string;
  label: string;
  amountInput: string;
  incideEncargos?: boolean;
}

interface AdjustmentCopy {
  title: string;
  description: string;
  earnings: string;
  deductions: string;
  emptyEarnings: string;
  emptyDeductions: string;
  earningPlaceholder: string;
  deductionPlaceholder: string;
  amountPlaceholder: string;
  descriptionLabel: string;
  amountLabel: string;
  presetsHelp: string;
  earningPresets: readonly string[];
  legalBases: string;
  addEarning: string;
  addDeduction: string;
  remove: string;
}

interface Props {
  earnings: PayrollAdjustmentDraft[];
  deductions: PayrollAdjustmentDraft[];
  onEarningsChange: (items: PayrollAdjustmentDraft[]) => void;
  onDeductionsChange: (items: PayrollAdjustmentDraft[]) => void;
  onAmountChange: (value: string) => string;
  copy: AdjustmentCopy;
}

const makeDraft = (incideEncargos = false, label = ''): PayrollAdjustmentDraft => ({
  id: crypto.randomUUID(),
  label,
  amountInput: '',
  incideEncargos,
});

export function PayrollAdjustmentsEditor({
  earnings,
  deductions,
  onEarningsChange,
  onDeductionsChange,
  onAmountChange,
  copy,
}: Props) {
  const renderRows = (
    items: PayrollAdjustmentDraft[],
    onChange: (next: PayrollAdjustmentDraft[]) => void,
    type: 'earning' | 'deduction',
  ) => (
    <div className="space-y-2.5">
      {items.length === 0 && (
        <p className="py-1 text-xs text-muted-foreground">
          {type === 'earning' ? copy.emptyEarnings : copy.emptyDeductions}
        </p>
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_6.75rem_2.25rem] gap-2 px-1 text-[11px] font-medium text-muted-foreground">
          <span>{copy.descriptionLabel}</span>
          <span>{copy.amountLabel}</span>
          <span />
        </div>
      )}
      {items.map((item) => {
        const descriptionId = `${type}-description-${item.id}`;
        const amountId = `${type}-amount-${item.id}`;
        return (
          <div key={item.id} className="space-y-1.5">
            <div className="grid grid-cols-[minmax(0,1fr)_6.75rem_2.25rem] items-center gap-2">
            <Input
              id={descriptionId}
              aria-label={copy.descriptionLabel}
              className="h-9 px-2"
              value={item.label}
              onChange={(event) => onChange(items.map((current) => current.id === item.id
                ? { ...current, label: event.target.value }
                : current))}
              placeholder={type === 'earning' ? copy.earningPlaceholder : copy.deductionPlaceholder}
              maxLength={60}
            />
            <Input
              id={amountId}
              aria-label={copy.amountLabel}
              className="h-9 px-2"
              value={item.amountInput}
              onChange={(event) => onChange(items.map((current) => current.id === item.id
                ? { ...current, amountInput: onAmountChange(event.target.value) }
                : current))}
              inputMode="decimal"
              placeholder={copy.amountPlaceholder}
            />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                aria-label={copy.remove}
                onClick={() => onChange(items.filter((current) => current.id !== item.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {type === 'earning' && (
              <div className="flex items-center gap-2 px-1">
              <Switch
                id={`legal-bases-${item.id}`}
                checked={Boolean(item.incideEncargos)}
                onCheckedChange={(checked) => onChange(items.map((current) => current.id === item.id
                  ? { ...current, incideEncargos: checked }
                  : current))}
              />
              <Label htmlFor={`legal-bases-${item.id}`} className="text-xs font-normal normal-case tracking-normal text-muted-foreground">
                {copy.legalBases}
              </Label>
              </div>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => onChange([...items, makeDraft(type === 'earning')])}
      >
        <Plus className="mr-2 h-4 w-4" />
        {type === 'earning' ? copy.addEarning : copy.addDeduction}
      </Button>
    </div>
  );

  return (
    <section className="space-y-4 border-b pb-5">
      <div>
        <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2" aria-label={copy.earnings}>
          <span className="mr-1 text-xs font-medium text-muted-foreground">Adicionar rápido</span>
            {copy.earningPresets.map((preset) => {
              const active = earnings.some((item) => item.label === preset);
              return (
                <Button
                  key={preset}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={active}
                  className={active
                    ? "h-7 rounded-full bg-primary px-2.5 text-xs text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                    : "h-7 rounded-full bg-muted px-2.5 text-xs text-muted-foreground hover:bg-muted/80 hover:text-foreground"}
                  onClick={() => {
                    if (!active) onEarningsChange([...earnings, makeDraft(true, preset)]);
                  }}
                >
                  {preset}
                </Button>
              );
            })}
        </div>
        <p className="text-xs text-muted-foreground">{copy.presetsHelp}</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{copy.earnings}</p>
          {renderRows(earnings, onEarningsChange, 'earning')}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">{copy.deductions}</p>
          {renderRows(deductions, onDeductionsChange, 'deduction')}
        </div>
      </div>
    </section>
  );
}
