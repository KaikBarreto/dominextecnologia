import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  useUpdateAdminFinancialTransaction,
  type AdminFinancialTransaction,
} from '@/hooks/useAdminFinancialTransactions';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
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
import { getErrorMessage } from '@/utils/errorMessages';
import { useToast } from '@/hooks/use-toast';

import { useAdminFinancialCategories } from '@/hooks/useAdminFinancialCategories';
import { getCategoryIcon } from '@/components/financial/categoryIcons';

interface AdminFinancialMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: 'income' | 'expense';
  /** Quando passada, o modal abre em modo edição (corrige a própria row). */
  transaction?: AdminFinancialTransaction | null;
}

// Formata um número (ex: 1234.5) pro input pt-BR (ex: "1.234,50").
const formatAmountForInput = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AdminFinancialMovementModal({ open, onOpenChange, defaultType = 'income', transaction }: AdminFinancialMovementModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateAdminFinancialTransaction();
  const { data: allCategories = [] } = useAdminFinancialCategories();
  const isEditing = Boolean(transaction);
  const [type, setType] = useState<'income' | 'expense'>(defaultType);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setType(transaction.type);
      setCategory(transaction.category);
      setAmount(formatAmountForInput(Number(transaction.amount)));
      setDescription(transaction.description ?? '');
      setDate(new Date(transaction.transaction_date));
    } else {
      setType(defaultType);
      setCategory('');
      setAmount('');
      setDescription('');
      setDate(new Date());
    }
    setShowErrors(false);
  }, [open, defaultType, transaction]);

  const typeCategories = allCategories.filter((c) => c.type === type);
  const categories = typeCategories.map((c) => ({ value: c.name, label: c.label, color: c.color, icon: c.icon as string | null }));

  // Em edição, a categoria do lançamento pode estar desativada (is_active=false)
  // e por isso ausente da lista de opções (o hook só traz ativas). Sem isso o
  // Select abre vazio. Injeta uma opção sintética pra ela aparecer e ficar
  // selecionada. Some sozinha ao trocar o tipo (category vira '').
  const hasCurrentCategory = !category || categories.some((c) => c.value === category);
  if (transaction && category && !hasCurrentCategory) {
    const known = allCategories.find((c) => c.name === category);
    categories.unshift({
      value: category,
      label: known?.label ?? category,
      color: known?.color ?? '#64748b',
      icon: known?.icon ?? null,
    });
  }

  const selectedCategory = categories.find((c) => c.value === category);

  const parsedAmount = parseFloat(amount.replace(/\./g, '').replace(',', '.'));
  const amountInvalid = isNaN(parsedAmount) || parsedAmount <= 0;
  const categoryMissing = !category;
  const formInvalid = amountInvalid || categoryMissing;

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('admin_financial_transactions').insert({ type, category, amount: parsedAmount, description: description || null, transaction_date: date.toISOString(), created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-financial-transactions-all'] });
      toast({ title: 'Movimentação criada!' });
      onOpenChange(false);
    },
    onError: (error: any) => { toast({ title: 'Erro', description: getErrorMessage(error), variant: 'destructive' }); },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (formInvalid) {
      setShowErrors(true);
      toast({ title: 'Confira os campos', description: 'Preencha o valor e selecione uma categoria.', variant: 'destructive' });
      return;
    }
    if (isEditing && transaction) {
      updateMutation.mutate(
        { id: transaction.id, type, category, amount: parsedAmount, description: description || null, transaction_date: date.toISOString() },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createMutation.mutate();
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Editar Transação' : 'Nova Transação'}
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending || formInvalid} className="flex-1">{isPending ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => { setType('income'); setCategory(''); }}
              className={cn('flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all', type === 'income' ? 'border-emerald-600 bg-emerald-500 text-white' : 'border-border hover:border-emerald-500/50')}>
              <TrendingUp className="h-4 w-4" /><span className="font-medium text-sm">Receita</span>
            </button>
            <button type="button" onClick={() => { setType('expense'); setCategory(''); }}
              className={cn('flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all', type === 'expense' ? 'border-red-600 bg-red-500 text-white' : 'border-border hover:border-red-500/50')}>
              <TrendingDown className="h-4 w-4" /><span className="font-medium text-sm">Despesa</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={cn(showErrors && categoryMissing && 'border-destructive focus:ring-destructive')}>
              <SelectValue placeholder="Selecione">
                {selectedCategory && (() => {
                  const Icon = getCategoryIcon(selectedCategory.icon);
                  return (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: selectedCategory.color }} />
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: selectedCategory.color }} />
                      <span>{selectedCategory.label}</span>
                    </span>
                  );
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => {
                const Icon = getCategoryIcon(c.icon);
                return (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: c.color }} />
                      <span>{c.label}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {showErrors && categoryMissing && (
            <p className="text-xs text-destructive">Selecione uma categoria</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Valor (R$)</Label>
          <Input
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className={cn('text-lg font-medium', showErrors && amountInvalid && 'border-destructive focus-visible:ring-destructive')}
          />
          {showErrors && amountInvalid && (
            <p className="text-xs text-destructive">Informe um valor maior que zero</p>
          )}
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
      </form>
    </ResponsiveModal>
  );
}
