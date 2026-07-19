import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { currencyMask, parseCurrency, calculateDailyValue } from '@/utils/employeeCalculations';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { useEmployeeWorkHours } from '@/hooks/useEmployeeWorkHours';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

export interface MovementCashAccount {
  id: string;
  name: string;
  type: string;
}

interface EmployeeMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'vale' | 'bonus' | 'falta';
  employeeName: string;
  currentBalance: number;
  onSubmit: (data: { amount: number; description?: string; subType?: string; accountId?: string }) => void;
  isPending?: boolean;
  employeeId?: string;
  salary?: number;
  /**
   * Contas de saída disponíveis pro vale (caixa/conta corrente).
   * Não deve conter cartão de crédito — vale sai sempre de caixa/dinheiro real.
   * Obrigatório quando `type === 'vale'`. Ignorado nos demais tipos.
   */
  cashBankAccounts?: MovementCashAccount[];
}

type MovementDraft = { amount: string; description: string };

export function EmployeeMovementModal({
  open, onOpenChange, type, employeeName, currentBalance, onSubmit, isPending,
  employeeId, salary = 0, cashBankAccounts = [],
}: EmployeeMovementModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [faltaMode, setFaltaMode] = useState<'salario' | 'banco'>('salario');
  const [applyDSR, setApplyDSR] = useState(false);
  const [accountId, setAccountId] = useState('');
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.movementModal;
  const typeLabels: Record<string, string> = { vale: t.typeLabels.vale, bonus: t.typeLabels.bonus, falta: t.typeLabels.falta };

  const draft = useFormDraft<MovementDraft>({ key: `employee-movement-${type}`, isOpen: open });

  const { dailyHours, monthlyHours, workDaysPerMonth } = useEmployeeWorkHours(employeeId);
  const suggestedDailyValue = salary > 0 ? calculateDailyValue(salary, workDaysPerMonth) : 0;

  // Reset local state on open before auto-suggesting the falta value
  const [faltaPreFilled, setFaltaPreFilled] = useState(false);

  useEffect(() => {
    if (!open) {
      setFaltaPreFilled(false);
      return;
    }

    if (!(draft.hasDraft && draft.draftData)) {
      setAmount('');
      setDescription('');
      setFaltaMode('salario');
      setApplyDSR(false);
      setFaltaPreFilled(false);
    }

    // Auto-seleciona primeira conta disponível pro vale (só relevante quando type === 'vale').
    if (type === 'vale' && cashBankAccounts.length > 0) {
      setAccountId((prev) => prev || cashBankAccounts[0].id);
    } else {
      setAccountId('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pre-fill falta value when suggestion becomes available (async)
  useEffect(() => {
    if (!open || draft.showResumePrompt) return;

    if (
      type === 'falta' &&
      salary > 0 &&
      suggestedDailyValue > 0 &&
      !faltaPreFilled &&
      !amount
    ) {
      setAmount(currencyMask(String(Math.round(suggestedDailyValue * 100))));
      setFaltaPreFilled(true);
    }
  }, [open, type, salary, suggestedDailyValue, draft.showResumePrompt, faltaPreFilled, amount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const baseValue = parseCurrency(amount);
    if (baseValue <= 0) return;

    // Vale exige conta de saída — gera despesa no financeiro.
    if (type === 'vale' && !accountId) {
      toast({
        variant: 'destructive',
        title: t.validationNoAccount,
        description: t.validationNoAccountDescription,
      });
      return;
    }

    let finalAmount = baseValue;
    let finalDescription = description || undefined;

    if (type === 'falta') {
      if (faltaMode === 'salario') {
        if (applyDSR) {
          finalAmount = baseValue * 2;
          finalDescription = `${description || 'Falta'} + DSR (${currencyMask(String(Math.round(baseValue * 100)))} × 2)`;
        }
      } else if (faltaMode === 'banco') {
        if (applyDSR) {
          // DSR portion is financial (1 day salary), work portion goes to bank
          finalAmount = baseValue; // bank hours deduction (1 work day)
          finalDescription = `${description || 'Falta'} — ${dailyHours.toFixed(1)}h banco + DSR R$ ${suggestedDailyValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        }
      }
    }

    onSubmit({
      amount: finalAmount,
      description: finalDescription,
      subType: type === 'falta' ? faltaMode : undefined,
      accountId: type === 'vale' ? accountId : undefined,
    });
    draft.clearDraft();
    setAmount('');
    setDescription('');
  };

  const baseValue = parseCurrency(amount);

  // Calculate totals for summary
  const dsrValue = applyDSR ? suggestedDailyValue : 0;
  const salaryDiscount = type === 'falta' && faltaMode === 'salario'
    ? baseValue + dsrValue
    : type === 'falta' && faltaMode === 'banco' && applyDSR
      ? dsrValue
      : 0;
  const bankHoursDiscount = type === 'falta' && faltaMode === 'banco' ? dailyHours : 0;

  const footer = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.cancelLabel}</Button>
      <Button type="submit" form="employee-movement-form" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t.submitLabel.replace('{type}', typeLabels[type])}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`${t.titlePrefix} ${typeLabels[type]} — ${employeeName}`} footer={footer}>
      <DraftResumeDialog
        open={draft.showResumePrompt}
        onResume={() => {
          if (draft.draftData) {
            setAmount(draft.draftData.amount || '');
            setDescription(draft.draftData.description || '');
          }
          draft.acceptDraft();
        }}
        onDiscard={() => {
          draft.discardDraft();
          setAmount('');
          setDescription('');
        }}
      />
      <form id="employee-movement-form" onSubmit={handleSubmit} className="space-y-4 p-1">
        <div className="rounded-lg bg-muted p-3 text-sm">
          {t.currentBalance}: <span className={currentBalance >= 0 ? 'text-green-600 font-semibold' : 'text-destructive font-semibold'}>
            {currentBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>

        {/* Conta de saída — só para vale. Vale precisa sair de uma conta real
            (caixa/conta corrente) pra aparecer no extrato + bater saldo. */}
        {type === 'vale' && (
          <div className="space-y-1.5">
            <Label>{t.advance.sourceLabel}</Label>
            {cashBankAccounts.length === 0 ? (
              <p className="text-xs text-destructive">
                {t.advance.noAccountsWarning}
              </p>
            ) : (
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={t.advance.accountPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {cashBankAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.type === 'caixa' ? `${acc.name} ${t.advance.cashSuffix}` : acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Falta mode selection */}
        {type === 'falta' && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.absence.discountTypeLabel}</Label>
            <RadioGroup value={faltaMode} onValueChange={(v) => setFaltaMode(v as 'salario' | 'banco')} className="grid grid-cols-1 gap-2">
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                <RadioGroupItem value="salario" />
                <div>
                  <p className="text-sm font-medium">{t.absence.deductFromSalary}</p>
                  <p className="text-xs text-muted-foreground">{t.absence.deductFromSalaryDescription}</p>
                </div>
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                <RadioGroupItem value="banco" />
                <div>
                  <p className="text-sm font-medium">{t.absence.deductFromHoursBank}</p>
                  <p className="text-xs text-muted-foreground">{t.absence.deductFromHoursBankDescription.replace('{hours}', dailyHours.toFixed(1))}</p>
                </div>
              </label>
            </RadioGroup>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t.amountLabel}</Label>
          <Input value={amount} onChange={e => setAmount(currencyMask(e.target.value))} placeholder="R$ 0,00" required />
          {type === 'falta' && salary > 0 && (
            <p className="text-xs text-muted-foreground">
              {t.absenceSuggestion
                .replace('{value}', suggestedDailyValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
                .replace('{dailyHours}', dailyHours.toFixed(1))
                .replace('{monthlyHours}', String(Math.round(monthlyHours)))}
            </p>
          )}
        </div>

        {/* DSR checkbox — available for both modes */}
        {type === 'falta' && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="dsr"
                checked={applyDSR}
                onCheckedChange={(v) => setApplyDSR(!!v)}
                className="mt-0.5"
              />
              <label htmlFor="dsr" className="cursor-pointer">
                <p className="text-sm font-medium">{t.absence.dsrLabel}</p>
                {faltaMode === 'salario' ? (
                  <p className="text-xs text-muted-foreground">
                    {t.absence.dsrDescriptionSalary}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t.absence.dsrDescriptionBank.replace('{hours}', dailyHours.toFixed(1))}
                  </p>
                )}
              </label>
            </div>

            {/* Summary breakdown */}
            {applyDSR && baseValue > 0 && (
              <div className="text-xs bg-muted rounded p-2 space-y-0.5">
                {faltaMode === 'salario' ? (
                  <>
                    <div className="flex justify-between">
                      <span>{t.absence.summaryDayMissed}</span>
                      <span>{baseValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t.absence.summaryDsrLoss}</span>
                      <span>{baseValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                      <span>{t.absence.summaryTotalDiscount}</span>
                      <span className="text-destructive">{(baseValue * 2).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span>{t.absence.summaryBankHours}</span>
                      <span>−{dailyHours.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t.absence.summaryDsrFinancial}</span>
                      <span>{suggestedDailyValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                      <span>{t.absence.summaryTotal}</span>
                      <span className="text-destructive">
                        {dailyHours.toFixed(1)}h + {suggestedDailyValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Summary when no DSR but falta selected */}
        {type === 'falta' && !applyDSR && baseValue > 0 && (
          <div className="text-xs bg-muted rounded-lg p-2">
            <div className="flex justify-between font-medium">
              <span>{t.absence.summaryTotalDiscount2}</span>
              <span className="text-destructive">
                {faltaMode === 'salario'
                  ? baseValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  : `${dailyHours.toFixed(1)}h`
                }
              </span>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t.descriptionLabel}</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t.descriptionPlaceholder} rows={2} />
        </div>

      </form>
    </ResponsiveModal>
  );
}