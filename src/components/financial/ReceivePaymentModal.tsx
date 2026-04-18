import { useState, useEffect, useMemo } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { Wallet, Landmark, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/card';

export interface ReceivePaymentResult {
  account_id: string;
  payment_method: string;
  paid_date: string;
  fee_amount: number;
  notes?: string;
}

interface ReceivePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  title?: string;
  description?: string;
  defaultMethod?: string;
  onConfirm: (result: ReceivePaymentResult) => Promise<void> | void;
  isSubmitting?: boolean;
}

const PAYMENT_METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'debito', label: 'Cartão de Débito' },
  { value: 'credito_avista', label: 'Cartão de Crédito (à vista)' },
  { value: 'credito_parcelado', label: 'Cartão de Crédito (parcelado)' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'cheque', label: 'Cheque' },
];

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function getAccIcon(type: string) {
  if (type === 'caixa') return Wallet;
  if (type === 'cartao') return CreditCard;
  return Landmark;
}

export function ReceivePaymentModal({
  open, onOpenChange, amount, title = 'Como foi recebido?',
  description, defaultMethod = 'pix', onConfirm, isSubmitting,
}: ReceivePaymentModalProps) {
  const { accounts } = useFinancialAccounts();
  const activeAccounts = useMemo(() => accounts.filter(a => a.is_active), [accounts]);

  const [accountId, setAccountId] = useState<string>('');
  const [method, setMethod] = useState(defaultMethod);
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [feeAmount, setFeeAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setMethod(defaultMethod);
      setPaidDate(new Date().toISOString().split('T')[0]);
      setFeeAmount('');
      setNotes('');
      if (!accountId && activeAccounts[0]) setAccountId(activeAccounts[0].id);
    }
  }, [open, defaultMethod]); // eslint-disable-line

  const handleSubmit = async () => {
    if (!accountId) return;
    await onConfirm({
      account_id: accountId,
      payment_method: method,
      paid_date: paidDate,
      fee_amount: Number(feeAmount.replace(',', '.')) || 0,
      notes: notes.trim() || undefined,
    });
  };

  const fee = Number(feeAmount.replace(',', '.')) || 0;
  const liquid = amount - fee;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description ?? `Valor: ${fmt(amount)}`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Forma de pagamento *</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data do recebimento *</Label>
            <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Caixa / Conta bancária *</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um caixa ou conta" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map(a => {
                const Icon = getAccIcon(a.type);
                return (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <span className="rounded-full p-1" style={{ backgroundColor: a.color }}>
                        <Icon className="h-3 w-3 text-white" />
                      </span>
                      {a.type === 'caixa' ? `${a.name} (dinheiro)` : a.name}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {activeAccounts.length === 0 && (
            <p className="text-xs text-destructive mt-1">Cadastre um caixa ou conta primeiro.</p>
          )}
        </div>

        <div>
          <Label>Tarifa de máquina/gateway (R$)</Label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={feeAmount}
            onChange={e => setFeeAmount(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Será lançado como despesa em "Tarifas e Taxas" (deduzida da receita líquida no DRE).
          </p>
        </div>

        {fee > 0 && (
          <Card className="p-3 bg-muted/30 border-warning/30">
            <div className="flex justify-between text-sm">
              <span>Valor bruto</span><span className="font-medium">{fmt(amount)}</span>
            </div>
            <div className="flex justify-between text-sm text-destructive">
              <span>Tarifa</span><span>− {fmt(fee)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold pt-1 border-t mt-1">
              <span>Líquido na conta</span><span className="text-success">{fmt(liquid)}</span>
            </div>
          </Card>
        )}

        <div>
          <Label>Observação</Label>
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!accountId || isSubmitting}
            className="bg-success hover:bg-success/90 text-white"
          >
            {isSubmitting ? 'Confirmando...' : 'Confirmar recebimento'}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
