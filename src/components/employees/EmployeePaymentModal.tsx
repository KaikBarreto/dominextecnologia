import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BalanceSummary } from '@/utils/employeeCalculations';

interface EmployeePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  salary: number;
  balance: BalanceSummary;
  onSubmit: (data: { payment_method: string }) => void;
  isPending?: boolean;
}

export function EmployeePaymentModal({ open, onOpenChange, employeeName, salary, balance, onSubmit, isPending }: EmployeePaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const toPay = balance.currentBalance;

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`Pagamento — ${employeeName}`}>
      <div className="space-y-4 p-1">
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span>Salário Base</span><span className="font-medium">{fmt(salary)}</span></div>
          {balance.totalBonus > 0 && <div className="flex justify-between text-green-600"><span>+ Bônus</span><span>{fmt(balance.totalBonus)}</span></div>}
          {balance.totalVales > 0 && <div className="flex justify-between text-destructive"><span>- Vales</span><span>{fmt(balance.totalVales)}</span></div>}
          {balance.totalFaltas > 0 && <div className="flex justify-between text-destructive"><span>- Faltas</span><span>{fmt(balance.totalFaltas)}</span></div>}
          <div className="border-t pt-2 flex justify-between font-semibold text-base">
            <span>Total a Pagar</span>
            <span className={toPay >= 0 ? 'text-green-600' : 'text-destructive'}>{fmt(toPay)}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Forma de Pagamento</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="dinheiro">Dinheiro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSubmit({ payment_method: paymentMethod })} disabled={isPending || toPay <= 0}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Pagamento
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
