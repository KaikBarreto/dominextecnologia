import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { getCategoryIcon } from './categoryIcons';
import { cn } from '@/lib/utils';
import type { FinancialTransaction, TransactionType } from '@/types/database';

const transactionSchema = z.object({
  transaction_type: z.enum(['entrada', 'saida']),
  category: z.string().optional(),
  description: z.string().min(1, 'Descrição é obrigatória'),
  amount: z.coerce.number().positive('Valor deve ser positivo'),
  transaction_date: z.string().min(1, 'Data é obrigatória'),
  is_paid: z.boolean().default(true),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

const fallbackCategories = {
  entrada: ['Serviços', 'Venda de peças', 'Contratos PMOC', 'Outros recebimentos'],
  saida: ['Fornecedores', 'Peças e materiais', 'Combustível', 'Salários', 'Aluguel', 'Impostos', 'Outras despesas'],
};

interface TransactionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: FinancialTransaction | null;
  onSubmit: (data: TransactionFormData) => Promise<void>;
  isLoading?: boolean;
  defaultType?: TransactionType;
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  onSubmit,
  isLoading,
  defaultType = 'entrada',
}: TransactionFormDialogProps) {
  const { categories: dbCategories } = useFinancialCategories();

  const getCategoriesForType = (type: 'entrada' | 'saida') => {
    const fromDb = dbCategories
      .filter((c) => c.is_active && (c.type === type || c.type === 'ambos'));
    return fromDb.length > 0 ? fromDb : null;
  };

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transaction_type: (transaction?.transaction_type as TransactionType) ?? defaultType,
      category: transaction?.category ?? '',
      description: transaction?.description ?? '',
      amount: transaction?.amount ?? 0,
      transaction_date: transaction?.transaction_date ?? new Date().toISOString().split('T')[0],
    },
  });

  // Reset form defaults when dialog opens with new defaultType or transaction
  useEffect(() => {
    if (open) {
      form.reset({
        transaction_type: (transaction?.transaction_type as TransactionType) ?? defaultType,
        category: transaction?.category ?? '',
        description: transaction?.description ?? '',
        amount: transaction?.amount ?? 0,
        transaction_date: transaction?.transaction_date ?? new Date().toISOString().split('T')[0],
        is_paid: transaction?.is_paid ?? true,
      });
    }
  }, [open, defaultType, transaction]);

  const transactionType = form.watch('transaction_type');

  const handleSubmit = async (data: TransactionFormData) => {
    const payload = {
      ...data,
      paid_date: data.is_paid ? data.transaction_date : undefined,
    };
    await onSubmit(payload);
    form.reset();
    onOpenChange(false);
  };

  const isEntrada = transactionType === 'entrada';
  const dbCats = getCategoriesForType(transactionType);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={transaction ? 'Editar Transação' : 'Nova Transação'}
      className="sm:max-w-[480px]"
    >
      <p className="text-sm text-muted-foreground -mt-2 mb-4">Registre uma receita ou despesa</p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
          {/* Type toggle buttons */}
          <FormField
            control={form.control}
            name="transaction_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Movimentação</FormLabel>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => field.onChange('entrada')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-semibold transition-all',
                      field.value === 'entrada'
                        ? 'border-success bg-success text-white'
                        : 'border-border bg-background text-muted-foreground hover:border-success/50'
                    )}
                  >
                    <TrendingUp className="h-4 w-4" />
                    Receita
                  </button>
                  <button
                    type="button"
                    onClick={() => field.onChange('saida')}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-semibold transition-all',
                      field.value === 'saida'
                        ? 'border-destructive bg-destructive text-white'
                        : 'border-border bg-background text-muted-foreground hover:border-destructive/50'
                    )}
                  >
                    <TrendingDown className="h-4 w-4" />
                    Despesa
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Category with icons */}
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {dbCats ? (
                      dbCats.map((cat) => {
                        const Icon = getCategoryIcon(cat.icon);
                        return (
                          <SelectItem key={cat.id} value={cat.name}>
                            <span className="flex items-center gap-2">
                              <span
                                className="flex h-5 w-5 items-center justify-center rounded-full shrink-0"
                                style={{ backgroundColor: cat.color }}
                              >
                                <Icon className="h-3 w-3 text-white" />
                              </span>
                              {cat.name}
                            </span>
                          </SelectItem>
                        );
                      })
                    ) : (
                      fallbackCategories[transactionType].map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Amount */}
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor (R$)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="0,00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descrição</FormLabel>
                <FormControl>
                  <Textarea placeholder="Descreva a movimentação" rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Date */}
          <FormField
            control={form.control}
            name="transaction_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Is Paid toggle */}
          <FormField
            control={form.control}
            name="is_paid"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <FormLabel className="!mt-0 font-medium">Já foi {isEntrada ? 'recebido' : 'pago'}</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    {field.value
                      ? (isEntrada ? 'Será registrado como recebido' : 'Será registrado como pago')
                      : (isEntrada ? 'Irá para contas a receber' : 'Irá para contas a pagar')
                    }
                  </p>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className={isEntrada ? 'bg-success hover:bg-success/90 text-white' : 'bg-destructive hover:bg-destructive/90 text-white'}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </Form>
    </ResponsiveModal>
  );
}
