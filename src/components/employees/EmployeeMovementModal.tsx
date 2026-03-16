import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';

interface EmployeeMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'vale' | 'bonus' | 'falta';
  employeeName: string;
  currentBalance: number;
  onSubmit: (data: { amount: number; description?: string }) => void;
  isPending?: boolean;
}

const typeLabels: Record<string, string> = { vale: 'Vale', bonus: 'Bônus', falta: 'Falta' };

type MovementDraft = { amount: string; description: string };

export function EmployeeMovementModal({ open, onOpenChange, type, employeeName, currentBalance, onSubmit, isPending }: EmployeeMovementModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const draft = useFormDraft<MovementDraft>({ key: `employee-movement-${type}`, isOpen: open });

  // Save draft on changes
  useEffect(() => {
    if (open && !draft.showResumePrompt) {
      draft.saveDraft({ amount, description });
    }
  }, [amount, description, open, draft.showResumePrompt]);

  // Reset on open
  useEffect(() => {
    if (open && !(draft.hasDraft && draft.draftData)) {
      setAmount('');
      setDescription('');
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseCurrency(amount);
    if (value <= 0) return;
    onSubmit({ amount: value, description: description || undefined });
    draft.clearDraft();
    setAmount('');
    setDescription('');
  };

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

        <div className="space-y-1.5">
          <Label>Valor *</Label>
          <Input value={amount} onChange={e => setAmount(currencyMask(e.target.value))} placeholder="R$ 0,00" required />
        </div>

        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Observação opcional..." rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar {typeLabels[type]}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
