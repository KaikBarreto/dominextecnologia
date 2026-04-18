import { useEffect, useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, TrendingUp, TrendingDown, Upload, X, Paperclip } from 'lucide-react';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { getCategoryIcon } from './categoryIcons';
import { cn } from '@/lib/utils';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { SignedLink } from '@/components/ui/SignedLink';
import { useToast } from '@/hooks/use-toast';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import type { FinancialTransaction, TransactionType } from '@/types/database';


const transactionSchema = z.object({
  transaction_type: z.enum(['entrada', 'saida']),
  category: z.string().optional(),
  description: z.string().min(1, 'Descrição é obrigatória'),
  amount: z.coerce.number().positive('Valor deve ser positivo'),
  transaction_date: z.string().min(1, 'Data é obrigatória'),
  is_paid: z.boolean().default(true),
  notes: z.string().optional(),
  payment_method: z.string().optional(),
  installment_count: z.coerce.number().min(1).default(1),
  account_id: z.string().optional(),
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
  onSubmit: (data: any) => Promise<void>;
  isLoading?: boolean;
  defaultType?: TransactionType;
}

export function TransactionFormDialog({
  open, onOpenChange, transaction, onSubmit, isLoading, defaultType = 'entrada',
}: TransactionFormDialogProps) {
  const { categories: dbCategories } = useFinancialCategories();
  const { accounts } = useFinancialAccounts();
  const { toast } = useToast();
  const isEditing = !!transaction;
  const draft = useFormDraft<TransactionFormData>({ key: 'transaction-form', isOpen: open, isEditing });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const getCategoriesForType = (type: 'entrada' | 'saida') => {
    const fromDb = dbCategories.filter((c) => c.is_active && (c.type === type || c.type === 'ambos'));
    return fromDb.length > 0 ? fromDb : null;
  };

  const lastPaymentMethod = localStorage.getItem('fin_last_payment_method') || '';
  const lastAccountId = localStorage.getItem('fin_last_account_id') || '';

  const defaults: TransactionFormData = {
    transaction_type: (transaction?.transaction_type as TransactionType) ?? defaultType,
    category: transaction?.category ?? '',
    description: transaction?.description ?? '',
    amount: transaction?.amount ?? 0,
    transaction_date: transaction?.transaction_date ?? new Date().toISOString().split('T')[0],
    is_paid: transaction?.is_paid ?? true,
    notes: (transaction as any)?.notes ?? '',
    payment_method: (transaction as any)?.payment_method ?? lastPaymentMethod,
    installment_count: 1,
    account_id: (transaction as any)?.account_id ?? lastAccountId,
  };

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: defaults,
  });

  const watchedValues = form.watch();
  useEffect(() => {
    if (open && !isEditing && !draft.showResumePrompt) draft.saveDraft(watchedValues);
  }, [watchedValues, open, isEditing, draft.showResumePrompt]);

  useEffect(() => {
    if (open) {
      setReceiptFile(null);
      setReceiptPreview((transaction as any)?.receipt_url || null);
      if (!isEditing && draft.hasDraft && draft.draftData) {
        // Draft will be applied via DraftResumeDialog
      } else {
        form.reset(defaults);
      }
    }
  }, [open, defaultType, transaction]);

  const transactionType = form.watch('transaction_type');
  const isPaid = form.watch('is_paid');

  const uploadReceipt = async (): Promise<string | null> => {
    if (!receiptFile) return (transaction as any)?.receipt_url || null;
    setUploading(true);
    try {
      const ext = receiptFile.name.split('.').pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('financial-receipts').upload(path, receiptFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('financial-receipts').getPublicUrl(path);
      return publicUrl;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar comprovante', description: err.message });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (data: TransactionFormData) => {
    const receiptUrl = await uploadReceipt();
    const payload = {
      ...data,
      paid_date: data.is_paid ? data.transaction_date : undefined,
      receipt_url: receiptUrl,
      payment_method: data.payment_method || null,
      account_id: data.account_id || null,
    };
    if (data.payment_method) localStorage.setItem('fin_last_payment_method', data.payment_method);
    if (data.account_id) localStorage.setItem('fin_last_account_id', data.account_id);
    await onSubmit(payload);
    draft.clearDraft();
    form.reset();
    onOpenChange(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setReceiptPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview(null);
    }
  };

  const isEntrada = transactionType === 'entrada';
  const dbCats = getCategoriesForType(transactionType);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={transaction ? 'Editar Transação' : 'Nova Transação'}
      className="sm:max-w-[520px]"
    >
      <DraftResumeDialog
        open={draft.showResumePrompt}
        onResume={() => { if (draft.draftData) form.reset(draft.draftData); draft.acceptDraft(); }}
        onDiscard={() => {
          draft.discardDraft();
          form.reset({ ...defaults, transaction_type: defaultType });
        }}
      />
      <p className="text-sm text-muted-foreground -mt-2 mb-4">Registre uma receita ou despesa</p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Type toggle */}
          <FormField control={form.control} name="transaction_type" render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Movimentação</FormLabel>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => field.onChange('entrada')}
                  className={cn('flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-semibold transition-all',
                    field.value === 'entrada' ? 'border-success bg-success text-white' : 'border-border bg-background text-muted-foreground hover:border-success/50')}>
                  <TrendingUp className="h-4 w-4" /> Receita
                </button>
                <button type="button" onClick={() => field.onChange('saida')}
                  className={cn('flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-semibold transition-all',
                    field.value === 'saida' ? 'border-destructive bg-destructive text-white' : 'border-border bg-background text-muted-foreground hover:border-destructive/50')}>
                  <TrendingDown className="h-4 w-4" /> Despesa
                </button>
              </div>
              <FormMessage />
            </FormItem>
          )} />

          {/* Category */}
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem>
              <FormLabel>Categoria</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger></FormControl>
                <SelectContent>
                  {dbCats ? dbCats.map((cat) => {
                    const Icon = getCategoryIcon(cat.icon);
                    return (
                      <SelectItem key={cat.id} value={cat.name}>
                        <span className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: cat.color }}>
                            <Icon className="h-3 w-3 text-white" />
                          </span>
                          {cat.name}
                        </span>
                      </SelectItem>
                    );
                  }) : fallbackCategories[transactionType].map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          {/* Amount */}
          <FormField control={form.control} name="amount" render={({ field }) => {
            const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
              const raw = e.target.value.replace(/\D/g, '');
              field.onChange(parseInt(raw || '0', 10) / 100);
            };
            const displayValue = field.value
              ? field.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : '';
            return (
              <FormItem>
                <FormLabel>Valor (R$)</FormLabel>
                <FormControl>
                  <Input placeholder="0,00" value={displayValue} onChange={handleCurrencyChange} inputMode="numeric" />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }} />

          {/* Account */}
          {accounts.length > 0 && (
            <FormField control={form.control} name="account_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Conta Bancária / Caixa</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione uma conta (opcional)" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {accounts.filter(a => a.is_active).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                          {a.type === 'caixa' ? `${a.name} (em dinheiro)` : a.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          )}

          {/* Description */}
          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl><Textarea placeholder="Descreva a movimentação" rows={2} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Date + Installments row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="transaction_date" render={({ field }) => (
              <FormItem>
                <FormLabel>Data</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {!isEditing && (
              <FormField control={form.control} name="installment_count" render={({ field }) => (
                <FormItem>
                  <FormLabel>Parcelas</FormLabel>
                  <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value || 1)}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="1">À vista</SelectItem>
                      {[2,3,4,5,6,7,8,9,10,11,12].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}
          </div>

          {/* Installment info */}
          {!isEditing && (form.watch('installment_count') || 1) > 1 && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded-md">
              Serão geradas {form.watch('installment_count')} parcelas de{' '}
              <strong>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  (form.watch('amount') || 0) / (form.watch('installment_count') || 1)
                )}
              </strong>{' '}
              com vencimentos mensais a partir da data informada.
            </p>
          )}

          {/* Notes */}
          <FormField control={form.control} name="notes" render={({ field }) => (
            <FormItem>
              <FormLabel>Observações</FormLabel>
              <FormControl><Textarea placeholder="Anotações internas (opcional)" rows={2} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Receipt upload */}
          <div className="space-y-2">
            <FormLabel>Comprovante / Nota Fiscal</FormLabel>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
            {receiptPreview || receiptFile ? (
              <div className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/50">
                {receiptPreview && receiptPreview.startsWith('data:image') ? (
                  <img src={receiptPreview} alt="Comprovante" className="h-12 w-12 rounded object-cover" />
                ) : receiptPreview ? (
                  <SignedLink src={receiptPreview} className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <Paperclip className="h-3.5 w-3.5" /> Ver comprovante
                  </SignedLink>
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> {receiptFile?.name}</span>
                )}
                <Button type="button" variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={() => { setReceiptFile(null); setReceiptPreview(null); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Anexar comprovante
              </Button>
            )}
          </div>

          {/* Is Paid toggle */}
          <FormField control={form.control} name="is_paid" render={({ field }) => (
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
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            </FormItem>
          )} />

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading || uploading}
              className={isEntrada ? 'bg-success hover:bg-success/90 text-white' : 'bg-destructive hover:bg-destructive/90 text-white'}>
              {(isLoading || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </Form>
    </ResponsiveModal>
  );
}
