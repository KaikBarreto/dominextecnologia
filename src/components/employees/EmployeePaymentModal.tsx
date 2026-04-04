import { useState, useMemo } from 'react';
import { Loader2, Wallet, CreditCard } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { BalanceSummary } from '@/utils/employeeCalculations';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';

export interface PaymentPayload {
  valeDiscount: number;
  accountId: string;
  description?: string;
}

interface EmployeePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  salary: number;
  balance: BalanceSummary;
  onSubmit: (payload: PaymentPayload) => void;
  isPending?: boolean;
}

export function EmployeePaymentModal({ open, onOpenChange, employeeName, salary, balance, onSubmit, isPending }: EmployeePaymentModalProps) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const { accounts, balances } = useFinancialAccounts();
  const activeAccounts = accounts.filter(a => a.is_active);

  const [valeDiscountStr, setValeDiscountStr] = useState('');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');

  // Reset state when modal opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setValeDiscountStr(balance.totalVales > 0 ? currencyMask(String(Math.round(balance.totalVales * 100))) : '');
      setAccountId(activeAccounts.length > 0 ? activeAccounts[0].id : '');
      setDescription('');
    }
    onOpenChange(o);
  };

  const valeDiscount = useMemo(() => {
    if (!valeDiscountStr) return balance.totalVales;
    const parsed = parseCurrency(valeDiscountStr);
    return Math.min(parsed, balance.totalVales);
  }, [valeDiscountStr, balance.totalVales]);

  const subtotal = salary + balance.totalBonus - balance.totalFaltas;
  const toPay = subtotal - valeDiscount;
  const remainingVales = balance.totalVales - valeDiscount;

  const canSubmit = toPay > 0 && accountId && !isPending;

  return (
    <ResponsiveModal open={open} onOpenChange={handleOpenChange} title={`Pagamento — ${employeeName}`}>
      <div className="space-y-4 p-1">
        {/* Financial Summary */}
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Salário</span>
            <span className="font-medium">{fmt(salary)}</span>
          </div>
          {balance.totalBonus > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Total de Bônus</span>
              <span>{fmt(balance.totalBonus)}</span>
            </div>
          )}
          {(balance.totalVales > 0 || balance.totalFaltas > 0) && (
            <>
              <div className="flex justify-between text-destructive font-medium">
                <span>Descontos</span>
                <span>{fmt(balance.totalVales + balance.totalFaltas)}</span>
              </div>
              {balance.totalVales > 0 && (
                <div className="flex justify-between text-muted-foreground pl-4">
                  <span>Vales</span>
                  <span>{fmt(balance.totalVales)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground pl-4">
                <span>Faltas</span>
                <span>{fmt(balance.totalFaltas)}</span>
              </div>
            </>
          )}
          <div className="border-t pt-2 flex justify-between font-medium">
            <span>Subtotal</span>
            <span>{fmt(subtotal)}</span>
          </div>
        </div>

        {/* Vale Discount */}
        {balance.totalVales > 0 && (
          <div className="space-y-2">
            <Label>Descontar dos Vales</Label>
            <Input
              value={valeDiscountStr}
              onChange={e => setValeDiscountStr(currencyMask(e.target.value))}
              placeholder={fmt(balance.totalVales)}
            />
            <p className="text-xs text-muted-foreground">
              Total de vales: {fmt(balance.totalVales)} — Padrão: 100%
              {remainingVales > 0 && (
                <span className="text-amber-600 font-medium"> • Restante: {fmt(remainingVales)} (será relançado)</span>
              )}
            </p>
          </div>
        )}

        {/* Amount to Pay */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
          <p className="text-sm text-muted-foreground mb-1">Valor a Pagar</p>
          <p className={`text-2xl font-bold ${toPay >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            {fmt(toPay)}
          </p>
          {valeDiscount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {fmt(subtotal)} - {fmt(valeDiscount)} (vales)
            </p>
          )}
        </div>

        {/* Account Selection */}
        {activeAccounts.length > 0 && (
          <div className="space-y-2">
            <Label>Pagar com</Label>
            <RadioGroup value={accountId} onValueChange={setAccountId} className="space-y-2">
              {activeAccounts.map(acc => {
                const accBalance = balances[acc.id] ?? acc.initial_balance;
                return (
                  <label
                    key={acc.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      accountId === acc.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem value={acc.id} />
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: acc.color + '20', color: acc.color }}
                    >
                      {acc.type === 'caixa' ? <Wallet className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{acc.name}</p>
                      {acc.bank_name && <p className="text-xs text-muted-foreground truncate">{acc.bank_name}</p>}
                    </div>
                    <span className={`text-sm font-medium ${accBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {fmt(accBalance)}
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <Label>Observações (opcional)</Label>
          <Textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Observações sobre este pagamento..."
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSubmit({ valeDiscount, accountId, description: description || undefined })} disabled={!canSubmit}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Pagamento
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
