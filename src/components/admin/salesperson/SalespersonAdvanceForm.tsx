import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateAdvance } from '@/hooks/useSalespersonData';
import { Wallet } from 'lucide-react';

interface Props { salespersonId: string; }

export function SalespersonAdvanceForm({ salespersonId }: Props) {
  const [data, setData] = useState({ amount: 0, description: '' });
  const createAdvance = useCreateAdvance();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (data.amount <= 0) return;
    await createAdvance.mutateAsync({ salesperson_id: salespersonId, amount: data.amount, description: data.description || null });
    setData({ amount: 0, description: '' });
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
            <Input id="amount" type="number" step="0.01" min="0.01" value={data.amount || ''}
              onChange={(e) => setData({ ...data, amount: parseFloat(e.target.value) || 0 })} placeholder="0,00" required />
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
