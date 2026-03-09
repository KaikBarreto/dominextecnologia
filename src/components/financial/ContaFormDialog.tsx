import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFinancial, type TransactionInput } from '@/hooks/useFinancial';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { addMonths, addWeeks, addYears, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import type { TransactionType } from '@/types/database';

interface ContaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Recurrence = 'unica' | 'mensal' | 'semanal' | 'anual';

export function ContaFormDialog({ open, onOpenChange }: ContaFormDialogProps) {
  const { createTransaction } = useFinancial();
  const [tipo, setTipo] = useState<TransactionType>('saida');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [dueDate, setDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [recurrence, setRecurrence] = useState<Recurrence>('mensal');
  const [occurrences, setOccurrences] = useState(12);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['financial-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const filteredCategories = categories.filter(
    (c) => c.type === 'ambos' || (tipo === 'entrada' ? c.type === 'receita' : c.type === 'despesa')
  );

  const categoryOptions = filteredCategories.map((c) => ({ value: c.name, label: c.name }));

  const resetForm = () => {
    setTipo('saida');
    setDescription('');
    setAmount('');
    setCategory('');
    setDueDate(format(new Date(), 'yyyy-MM-dd'));
    setRecurrence('mensal');
    setOccurrences(12);
    setNotes('');
  };

  const handleSubmit = async () => {
    if (!description.trim() || !amount || Number(amount) <= 0) return;
    setIsSubmitting(true);

    try {
      const baseDate = new Date(dueDate + 'T12:00:00');
      const count = recurrence === 'unica' ? 1 : occurrences;

      for (let i = 0; i < count; i++) {
        let date: Date;
        switch (recurrence) {
          case 'semanal': date = addWeeks(baseDate, i); break;
          case 'mensal': date = addMonths(baseDate, i); break;
          case 'anual': date = addYears(baseDate, i); break;
          default: date = baseDate;
        }

        const input: TransactionInput = {
          transaction_type: tipo,
          description: count > 1 ? `${description} (${i + 1}/${count})` : description,
          amount: Number(amount),
          transaction_date: format(date, 'yyyy-MM-dd'),
          due_date: format(date, 'yyyy-MM-dd'),
          is_paid: false,
          category: category || undefined,
          notes: notes || undefined,
        };

        await createTransaction.mutateAsync(input);
      }

      resetForm();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova Conta</DialogTitle>
          <DialogDescription>Crie uma conta a pagar ou a receber, com opção de recorrência.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TransactionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="saida">A Pagar</SelectItem>
                <SelectItem value="entrada">A Receber</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Aluguel do escritório" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <SearchableSelect
              options={categoryOptions}
              value={category}
              onValueChange={setCategory}
              placeholder="Selecione uma categoria"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Recorrência</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unica">Única</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recurrence !== 'unica' && (
              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Input type="number" min={2} max={60} value={occurrences} onChange={(e) => setOccurrences(Number(e.target.value) || 2)} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notas internas" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !description.trim() || !amount}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Criando...</> : 'Criar Conta'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
