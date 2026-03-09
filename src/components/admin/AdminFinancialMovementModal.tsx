import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const INCOME_CATEGORIES = [
  { value: 'renewal', label: 'Renovação' },
  { value: 'first_sale', label: 'Venda Nova' },
  { value: 'upgrade', label: 'Upgrade' },
  { value: 'other_income', label: 'Outra Receita' },
];

const EXPENSE_CATEGORIES = [
  { value: 'infrastructure', label: 'Infraestrutura' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'salary', label: 'Salários' },
  { value: 'tools', label: 'Ferramentas' },
  { value: 'other_expense', label: 'Outra Despesa' },
];

interface AdminFinancialMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: 'income' | 'expense';
}

export function AdminFinancialMovementModal({ open, onOpenChange, defaultType = 'income' }: AdminFinancialMovementModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<'income' | 'expense'>(defaultType);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<Date>(new Date());

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setCategory('');
      setAmount('');
      setDescription('');
      setDate(new Date());
    }
  }, [open, defaultType]);

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const mutation = useMutation({
    mutationFn: async () => {
      const parsedAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
      if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Valor inválido');
      if (!category) throw new Error('Selecione uma categoria');

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('admin_financial_transactions').insert({
        type,
        category,
        amount: parsedAmount,
        description: description || null,
        transaction_date: date.toISOString(),
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-financial-transactions'] });
      toast({ title: 'Movimentação criada!' });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Transação</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setType('income'); setCategory(''); }}
                className={cn(
                  'flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all',
                  type === 'income' ? 'border-emerald-600 bg-emerald-500 text-white' : 'border-border hover:border-emerald-500/50'
                )}
              >
                <TrendingUp className="h-4 w-4" />
                <span className="font-medium text-sm">Receita</span>
              </button>
              <button
                type="button"
                onClick={() => { setType('expense'); setCategory(''); }}
                className={cn(
                  'flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all',
                  type === 'expense' ? 'border-red-600 bg-red-500 text-white' : 'border-border hover:border-red-500/50'
                )}
              >
                <TrendingDown className="h-4 w-4" />
                <span className="font-medium text-sm">Despesa</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Valor (R$)</Label>
            <Input placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-lg font-medium" />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending} className="flex-1">{mutation.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
