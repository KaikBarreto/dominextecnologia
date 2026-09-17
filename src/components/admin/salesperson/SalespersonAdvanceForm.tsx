import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateAdvance } from '@/hooks/useSalespersonData';
import { Wallet } from 'lucide-react';
import { readPastedCents } from '@/lib/money-paste-mask';

interface Props { salespersonId: string; salespersonName: string; }

export function SalespersonAdvanceForm({ salespersonId, salespersonName }: Props) {
  const [data, setData] = useState({ amount: '' as string, description: '' });
  const createAdvance = useCreateAdvance();

  // Máscara de dinheiro (centavos), igual ContaFormDialog/ChargeDialog: digita
  // só dígitos, os 2 últimos são os centavos. NUNCA `<input type="number">`
  // aqui — bug real (2026-09-17), e aqui é vale (adiantamento) de dinheiro
  // real a um vendedor. `onPaste` cobre colar valor pronto via
  // `readPastedCents` (`src/lib/money-paste-mask.ts`), que SUBSTITUI o campo
  // inteiro (não mescla no cursor). `data.amount` é sempre string canônica
  // ("4550.00"), nunca "4.550".
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    const cents = parseInt(raw || '0', 10);
    setData((d) => ({ ...d, amount: cents ? (cents / 100).toFixed(2) : '' }));
  };
  const handleAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents == null) return;
    setData((d) => ({ ...d, amount: cents ? (cents / 100).toFixed(2) : '' }));
  };
  const amountDisplay = data.amount
    ? Number(data.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountValue = data.amount ? Number(data.amount) : 0;
    if (amountValue <= 0) return;
    await createAdvance.mutateAsync({
      salesperson_id: salespersonId,
      salesperson_name: salespersonName,
      amount: amountValue,
      description: data.description || null,
    });
    setData({ amount: '', description: '' });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Registrar Vale
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Valor (R$)*</Label>
            <Input
              id="amount"
              inputMode="numeric"
              value={amountDisplay}
              onChange={handleAmountChange}
              onPaste={handleAmountPaste}
              placeholder="0,00"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" rows={2} value={data.description}
              onChange={(e) => setData({ ...data, description: e.target.value })} placeholder="Motivo do vale..." />
          </div>
          <Button type="submit" variant="destructive" className="w-full" disabled={createAdvance.isPending}>
            {createAdvance.isPending ? 'Registrando...' : 'Registrar Vale'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
