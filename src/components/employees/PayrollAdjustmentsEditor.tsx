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

const makeDraft = (incideEncargos = false): PayrollAdjustmentDraft => ({
  id: crypto.randomUUID(),
  label: '',
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
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {type === 'earning' ? copy.emptyEarnings : copy.emptyDeductions}
        </p>
      )}
      {items.map((item) => (
        <div key={item.id} className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
          <Input
            value={item.label}
            onChange={(event) => onChange(items.map((current) => current.id === item.id
              ? { ...current, label: event.target.value }
              : current))}
            placeholder={type === 'earning' ? copy.earningPlaceholder : copy.deductionPlaceholder}
            maxLength={60}
          />
          <Input
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
            aria-label={copy.remove}
            onClick={() => onChange(items.filter((current) => current.id !== item.id))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          {type === 'earning' && (
            <div className="flex items-center gap-2 sm:col-span-3">
              <Switch
                id={`legal-bases-${item.id}`}
                checked={Boolean(item.incideEncargos)}
                onCheckedChange={(checked) => onChange(items.map((current) => current.id === item.id
                  ? { ...current, incideEncargos: checked }
                  : current))}
              />
              <Label htmlFor={`legal-bases-${item.id}`} className="text-xs font-normal text-muted-foreground">
                {copy.legalBases}
              </Label>
            </div>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed"
        onClick={() => onChange([...items, makeDraft(type === 'earning')])}
      >
        <Plus className="mr-2 h-4 w-4" />
        {type === 'earning' ? copy.addEarning : copy.addDeduction}
      </Button>
    </div>
  );

  return (
    <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-semibold">{copy.title}</h3>
        <p className="text-xs text-muted-foreground">{copy.description}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-emerald-700 dark:text-emerald-400">{copy.earnings}</Label>
          {renderRows(earnings, onEarningsChange, 'earning')}
        </div>
        <div className="space-y-2">
          <Label className="text-red-700 dark:text-red-400">{copy.deductions}</Label>
          {renderRows(deductions, onDeductionsChange, 'deduction')}
        </div>
      </div>
    </section>
  );
}
