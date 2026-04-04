import { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { currencyMask, parseCurrency, calculateDailyValue } from '@/utils/employeeCalculations';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { useEmployeeWorkHours } from '@/hooks/useEmployeeWorkHours';

interface EmployeeMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'vale' | 'bonus' | 'falta';
  employeeName: string;
  currentBalance: number;
  onSubmit: (data: { amount: number; description?: string; subType?: string }) => void;
  isPending?: boolean;
  employeeId?: string;
  salary?: number;
}

const typeLabels: Record<string, string> = { vale: 'Vale', bonus: 'Bônus', falta: 'Falta' };

type MovementDraft = { amount: string; description: string };

export function EmployeeMovementModal({
  open, onOpenChange, type, employeeName, currentBalance, onSubmit, isPending,
  employeeId, salary = 0
}: EmployeeMovementModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [faltaMode, setFaltaMode] = useState<'salario' | 'banco'>('salario');
  const [applyDSR, setApplyDSR] = useState(false);
  const { profile } = useAuth();

  const draft = useFormDraft<MovementDraft>({ key: `employee-movement-${type}`, isOpen: open });

  const companyId = profile?.company_id;
  const { data: timeSettings } = useQuery({
    queryKey: ['time-settings-for-falta', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('time_settings')
        .select('default_in, default_out, default_break_min')
        .eq('company_id', companyId)
        .maybeSingle();
      return data;
    },
    enabled: type === 'falta' && !!companyId,
  });

  const { data: employeeSchedule } = useQuery({
    queryKey: ['time-schedule-for-falta', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data } = await supabase
        .from('time_schedules')
        .select('weekday, expected_in, expected_out, break_minutes, is_work_day')
        .eq('employee_id', employeeId);
      return data;
    },
    enabled: type === 'falta' && !!employeeId,
  });

  const dailyHours = useMemo(() => {
    if (employeeSchedule && employeeSchedule.length > 0) {
      const workDays = employeeSchedule.filter((s: any) => s.is_work_day);
      if (workDays.length > 0) {
        let totalMin = 0;
        for (const d of workDays) {
          const inTime = d.expected_in?.split(':').map(Number) || [8, 0];
          const outTime = d.expected_out?.split(':').map(Number) || [17, 0];
          const workMin = (outTime[0] * 60 + (outTime[1] || 0)) - (inTime[0] * 60 + (inTime[1] || 0)) - (d.break_minutes || 0);
          totalMin += Math.max(workMin, 0);
        }
        return totalMin / workDays.length / 60;
      }
    }

    if (timeSettings?.default_in && timeSettings?.default_out) {
      const inP = timeSettings.default_in.split(':').map(Number);
      const outP = timeSettings.default_out.split(':').map(Number);
      const workMin = (outP[0] * 60 + (outP[1] || 0)) - (inP[0] * 60 + (inP[1] || 0)) - (timeSettings.default_break_min || 0);
      return Math.max(workMin, 0) / 60;
    }

    return 8;
  }, [employeeSchedule, timeSettings]);

  const monthlyHours = dailyHours * 22;
  const suggestedDailyValue = salary > 0 ? calculateDailyValue(salary, 22) : 0;

  useEffect(() => {
    if (open && type === 'falta' && salary > 0 && !draft.showResumePrompt && amount === '') {
      setAmount(currencyMask(String(Math.round(suggestedDailyValue * 100))));
    }
  }, [open, type, salary, suggestedDailyValue, draft.showResumePrompt]);

  useEffect(() => {
    if (open && !draft.showResumePrompt) {
      draft.saveDraft({ amount, description });
    }
  }, [amount, description, open, draft.showResumePrompt]);

  useEffect(() => {
    if (open && !(draft.hasDraft && draft.draftData)) {
      setAmount('');
      setDescription('');
      setFaltaMode('salario');
      setApplyDSR(false);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const baseValue = parseCurrency(amount);
    if (baseValue <= 0) return;

    let finalAmount = baseValue;
    let finalDescription = description || undefined;

    if (type === 'falta') {
      if (faltaMode === 'salario' && applyDSR) {
        finalAmount = baseValue * 2;
        finalDescription = `${description || 'Falta'} + DSR (${currencyMask(String(Math.round(baseValue * 100)))} × 2)`;
      }
    }

    onSubmit({
      amount: finalAmount,
      description: finalDescription,
      subType: type === 'falta' ? faltaMode : undefined,
    });
    draft.clearDraft();
    setAmount('');
    setDescription('');
  };

  const baseValue = parseCurrency(amount);
  const dsrTotal = type === 'falta' && faltaMode === 'salario' && applyDSR ? baseValue * 2 : baseValue;

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`Registrar ${typeLabels[type]} — ${employeeName}`}>
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
      <form onSubmit={handleSubmit} className="space-y-4 p-1">
        <div className="rounded-lg bg-muted p-3 text-sm">
          Saldo atual: <span className={currentBalance >= 0 ? 'text-green-600 font-semibold' : 'text-destructive font-semibold'}>
            {currentBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        </div>

        {/* Falta mode selection */}
        {type === 'falta' && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de desconto</Label>
            <RadioGroup value={faltaMode} onValueChange={(v) => setFaltaMode(v as 'salario' | 'banco')} className="grid grid-cols-1 gap-2">
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                <RadioGroupItem value="salario" />
                <div>
                  <p className="text-sm font-medium">Descontar do salário</p>
                  <p className="text-xs text-muted-foreground">Valor será deduzido do saldo financeiro</p>
                </div>
              </label>
              <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                <RadioGroupItem value="banco" />
                <div>
                  <p className="text-sm font-medium">Descontar do banco de horas</p>
                  <p className="text-xs text-muted-foreground">Registra horas negativas sem impacto financeiro</p>
                </div>
              </label>
            </RadioGroup>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Valor *</Label>
          <Input value={amount} onChange={e => setAmount(currencyMask(e.target.value))} placeholder="R$ 0,00" required />
          {type === 'falta' && salary > 0 && (
            <p className="text-xs text-muted-foreground">
              Sugestão: {suggestedDailyValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/dia 
              ({dailyHours.toFixed(1)}h/dia · {Math.round(monthlyHours)}h/mês)
            </p>
          )}
        </div>

        {/* DSR checkbox */}
        {type === 'falta' && faltaMode === 'salario' && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="dsr"
                checked={applyDSR}
                onCheckedChange={(v) => setApplyDSR(!!v)}
                className="mt-0.5"
              />
              <label htmlFor="dsr" className="cursor-pointer">
                <p className="text-sm font-medium">Aplicar perda de DSR</p>
                <p className="text-xs text-muted-foreground">
                  A falta injustificada resulta na perda do Descanso Semanal Remunerado (valor × 2)
                </p>
              </label>
            </div>
            {applyDSR && baseValue > 0 && (
              <div className="text-xs bg-muted rounded p-2 space-y-0.5">
                <div className="flex justify-between">
                  <span>Dia faltado</span>
                  <span>{baseValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Perda DSR</span>
                  <span>{baseValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>Total desconto</span>
                  <span className="text-destructive">{dsrTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Observação opcional..." rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar {typeLabels[type]}
            {type === 'falta' && faltaMode === 'salario' && applyDSR && baseValue > 0 && (
              <span className="ml-1 text-xs opacity-80">
                ({dsrTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
              </span>
            )}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
