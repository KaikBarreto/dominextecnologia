import { useEffect, useState, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Loader2, TrendingUp, TrendingDown, Upload, X, CreditCard, Info, FileText, Download } from 'lucide-react';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { getCategoryIcon } from './categoryIcons';
import { cn } from '@/lib/utils';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { useToast } from '@/hooks/use-toast';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { BankLogo } from '@/components/financial/BankInstitutionCombobox';
import { computeBillDate } from '@/hooks/useCreditCardBills';
import {
  useTransactionAttachments,
  useUploadTransactionAttachment,
  useRemoveTransactionAttachment,
  createAttachmentSignedUrl,
  formatAttachmentSize,
  type TransactionAttachment,
} from '@/hooks/useTransactionAttachments';
import { format, parseISO, addMonths, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { FinancialTransaction, TransactionType } from '@/types/database';


// Billing months: 1 month back to 4 months ahead (covers all realistic card use cases)
const CARD_BILL_MONTHS = Array.from({ length: 6 }, (_, i) => {
  const d = addMonths(startOfMonth(new Date()), i - 1);
  return { value: format(d, 'yyyy-MM-dd'), label: format(d, 'MMMM yyyy', { locale: ptBR }) };
});

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
  account_id: z.string().min(1, 'Selecione uma conta ou caixa'),
  credit_card_bill_date: z.string().optional(),
});

type TransactionFormData = z.infer<typeof transactionSchema>;

const fallbackCategories = {
  entrada: ['Serviços', 'Venda de peças', 'Contratos PMOC', 'Outros recebimentos'],
  saida: ['Fornecedores', 'Peças e materiais', 'Combustível', 'Salários', 'Aluguel', 'Impostos', 'Outras despesas'],
};

interface CreditCardBillSectionProps {
  form: ReturnType<typeof useForm<any>>;
  cardName: string;
  account: import('@/hooks/useFinancialAccounts').FinancialAccount | undefined;
  installmentCount: number;
  totalAmount: number;
  transactionDate: string;
}

function CreditCardBillSection({ form, cardName, account, installmentCount, totalAmount, transactionDate }: CreditCardBillSectionProps) {
  const billDate = form.watch('credit_card_bill_date');
  const billLabel = billDate
    ? format(parseISO(billDate + 'T12:00:00'), 'MMMM yyyy', { locale: ptBR })
    : null;

  const perInstallment = installmentCount > 1 && totalAmount > 0
    ? Math.round((totalAmount / installmentCount) * 100) / 100
    : 0;

  const installmentBreakdown = installmentCount > 1 && account && transactionDate
    ? Array.from({ length: installmentCount }, (_, i) => {
        const d = new Date(transactionDate + 'T12:00:00');
        d.setMonth(d.getMonth() + i);
        const dueDateStr = d.toISOString().split('T')[0];
        const bDate = computeBillDate(account, dueDateStr);
        const bLabel = format(parseISO(bDate + 'T12:00:00'), 'MMMM yyyy', { locale: ptBR });
        const amt = i === installmentCount - 1
          ? Math.round((totalAmount - perInstallment * (installmentCount - 1)) * 100) / 100
          : perInstallment;
        return { label: bLabel, amount: amt, num: i + 1 };
      })
    : null;

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800 p-3 space-y-2">
      <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
        <CreditCard className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium">Despesa no Cartão de Crédito</p>
      </div>

      {installmentBreakdown ? (
        <div className="space-y-1">
          <p className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            {installmentCount} parcelas distribuídas nas faturas do cartão {cardName}:
          </p>
          <div className="space-y-0.5 pl-4">
            {installmentBreakdown.map(({ num, label, amount }) => (
              <div key={num} className="flex justify-between text-xs text-violet-700 dark:text-violet-300">
                <span className="capitalize">{num}/{installmentCount} → fatura de {label}</span>
                <span className="font-medium">{fmt(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        billLabel && (
          <p className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
            <Info className="h-3 w-3" />
            Esta despesa será acumulada na <strong>fatura de {billLabel}</strong> do cartão {cardName}
          </p>
        )
      )}

      {!installmentBreakdown && (
        <FormField control={form.control} name="credit_card_bill_date" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs text-violet-700 dark:text-violet-300">Mês da fatura</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || ''}>
              <FormControl>
                <SelectTrigger className="h-8 text-sm border-violet-300 dark:border-violet-700">
                  <SelectValue placeholder="Selecione o mês" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {CARD_BILL_MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value} className="capitalize">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormItem>
        )} />
      )}
    </div>
  );
}

// ============================================================================
// Anexos — sub-componente
// ============================================================================

interface PendingFile {
  id: string; // uuid local, só pra key/remover
  file: File;
  preview: string | null;
}

function readImagePreview(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) ?? null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

interface AttachmentsSectionProps {
  isEditing: boolean;
  transactionId?: string;
  pendingFiles: PendingFile[];
  setPendingFiles: React.Dispatch<React.SetStateAction<PendingFile[]>>;
}

function AttachmentsSection({ isEditing, transactionId, pendingFiles, setPendingFiles }: AttachmentsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Anexos persistidos (modo edit)
  const { data: savedAttachments = [], isLoading: loadingSaved } = useTransactionAttachments(
    isEditing ? transactionId : undefined,
  );
  const uploadMutation = useUploadTransactionAttachment();
  const removeMutation = useRemoveTransactionAttachment();

  const handlePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (isEditing && transactionId) {
      // No modo edit, sobe imediatamente para feedback rápido
      for (const file of files) {
        try {
          await uploadMutation.mutateAsync({ transactionId, file });
        } catch {
          // erro já é exibido pelo onError do hook
        }
      }
    } else {
      // No modo novo, acumula pra subir após criar a transação
      const newOnes: PendingFile[] = await Promise.all(
        files.map(async (file) => ({
          id: crypto.randomUUID(),
          file,
          preview: await readImagePreview(file),
        })),
      );
      setPendingFiles((prev) => [...prev, ...newOnes]);
    }

    // Reset do input pra permitir reanexar mesmo arquivo se removido
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePending = (id: string) => {
    setPendingFiles((prev) => prev.filter((p) => p.id !== id));
  };

  const handleDownloadSaved = async (att: TransactionAttachment) => {
    const url = await createAttachmentSignedUrl(att.storage_path);
    if (!url) {
      toast({ variant: 'destructive', title: 'Não foi possível gerar o link', description: 'Tente novamente.' });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleRemoveSaved = (att: TransactionAttachment) => {
    removeMutation.mutate({ id: att.id, storage_path: att.storage_path, transaction_id: att.transaction_id });
  };

  const totalCount = savedAttachments.length + pendingFiles.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FormLabel>Comprovantes / Notas Fiscais</FormLabel>
        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground">{totalCount} anexo{totalCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Lista — anexos já salvos (modo edit) */}
      {isEditing && loadingSaved && (
        <p className="text-xs text-muted-foreground">Carregando anexos…</p>
      )}

      {savedAttachments.length > 0 && (
        <ul className="space-y-2">
          {savedAttachments.map((att) => (
            <li key={att.id} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/40">
              <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{att.file_name}</p>
                <p className="text-xs text-muted-foreground">{formatAttachmentSize(att.size_bytes)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleDownloadSaved(att)}
                title="Baixar"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => handleRemoveSaved(att)}
                disabled={removeMutation.isPending}
                title="Remover"
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Lista — arquivos pendentes (modo novo, ainda não enviados) */}
      {pendingFiles.length > 0 && (
        <ul className="space-y-2">
          {pendingFiles.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-2 rounded-lg border border-border bg-muted/40">
              {p.preview ? (
                <img src={p.preview} alt={p.file.name} className="h-10 w-10 rounded object-cover shrink-0" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{p.file.name}</p>
                <p className="text-xs text-muted-foreground">{formatAttachmentSize(p.file.size)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => removePending(p.id)}
                title="Remover"
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" className="w-full gap-2" onClick={handlePick} disabled={uploadMutation.isPending}>
        {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {totalCount > 0 ? 'Adicionar mais' : 'Anexar comprovantes'}
      </Button>
      <p className="text-xs text-muted-foreground">Aceita imagens (JPG, PNG) e PDFs. Você pode anexar vários.</p>
    </div>
  );
}

// ============================================================================
// Form principal
// ============================================================================

interface TransactionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: FinancialTransaction | null;
  onSubmit: (data: any) => Promise<any>;
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
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const uploadMutation = useUploadTransactionAttachment();

  const getCategoriesForType = (type: 'entrada' | 'saida') => {
    const fromDb = dbCategories.filter((c) => c.is_active && (c.type === type || c.type === 'ambos'));
    return fromDb.length > 0 ? fromDb : null;
  };

  const lastPaymentMethod = localStorage.getItem('fin_last_payment_method') || '';
  const lastAccountId = localStorage.getItem('fin_last_account_id') || '';

  const defaults: TransactionFormData = useMemo(() => ({
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [transaction, defaultType]);

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
      setPendingFiles([]);
      if (!isEditing && draft.hasDraft && draft.draftData) {
        // Draft will be applied via DraftResumeDialog
      } else {
        form.reset(defaults);
      }
    }
  }, [open, defaultType, transaction]);

  const transactionType = form.watch('transaction_type');
  const isPaid = form.watch('is_paid');
  const watchedAccountId = form.watch('account_id');
  const watchedDate = form.watch('transaction_date');

  const selectedAccount = accounts.find(a => a.id === watchedAccountId);
  const isCardAccount = selectedAccount?.type === 'cartao';

  // Auto-calculate bill month when card account or date changes
  useEffect(() => {
    if (!open) return;
    if (isCardAccount && watchedDate && selectedAccount) {
      form.setValue('credit_card_bill_date', computeBillDate(selectedAccount, watchedDate));
      form.setValue('is_paid', true);
    } else if (!isCardAccount) {
      form.setValue('credit_card_bill_date', undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCardAccount, watchedDate, watchedAccountId, open]);

  const handleSubmit = async (data: TransactionFormData) => {
    setSubmitting(true);
    try {
      const payload = {
        ...data,
        paid_date: data.is_paid ? data.transaction_date : undefined,
        payment_method: data.payment_method || null,
        account_id: data.account_id || null,
        credit_card_bill_date: data.credit_card_bill_date || null,
      };
      if (data.payment_method) localStorage.setItem('fin_last_payment_method', data.payment_method);
      if (data.account_id) localStorage.setItem('fin_last_account_id', data.account_id);

      const result: any = await onSubmit(payload);

      // Após criar/editar, sobe os anexos pendentes (se houver)
      if (pendingFiles.length > 0) {
        // Modo novo: precisa do id da transação criada. Modo edit: já existe.
        const txnId: string | undefined = isEditing ? transaction?.id : (result?.id || result?.[0]?.id);

        if (!txnId) {
          // Caso típico: parcelamento (várias transações criadas, sem id único de retorno).
          // Anexos pendentes ficam descartados — orientamos a anexar pela edição de cada parcela.
          toast({
            variant: 'destructive',
            title: 'Anexos não foram enviados',
            description: 'Para anexar comprovantes em compras parceladas, edite a parcela específica e anexe lá.',
          });
        } else {
          let failures = 0;
          for (const pf of pendingFiles) {
            try {
              await uploadMutation.mutateAsync({ transactionId: txnId, file: pf.file });
            } catch {
              failures += 1;
            }
          }
          if (failures > 0) {
            toast({
              variant: 'destructive',
              title: `${failures} anexo${failures !== 1 ? 's' : ''} não enviado${failures !== 1 ? 's' : ''}`,
              description: 'A transação foi salva. Reabra para anexar novamente.',
            });
          }
        }
      }

      draft.clearDraft();
      form.reset();
      setPendingFiles([]);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const isEntrada = transactionType === 'entrada';
  const dbCats = getCategoriesForType(transactionType);
  const busy = isLoading || submitting;

  const footer = (
    <div className="flex justify-end gap-3">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
      <Button type="submit" form="transaction-form" disabled={busy}
        className={isEntrada ? 'bg-success hover:bg-success/90 text-white' : 'bg-destructive hover:bg-destructive/90 text-white'}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={transaction ? 'Editar Transação' : 'Nova Transação'}
      className="sm:max-w-[520px]"
      footer={footer}
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
        <form id="transaction-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200">Nenhuma conta cadastrada</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                É necessário cadastrar pelo menos uma conta ou caixa para registrar transações.{' '}
                <a href="/financeiro/caixas-bancos" className="underline font-medium">Cadastrar agora</a>
              </p>
            </div>
          ) : (
            <FormField control={form.control} name="account_id" render={({ field }) => (
              <FormItem>
                <FormLabel>Conta Bancária / Caixa <span className="text-destructive">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Selecione uma conta" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {accounts.filter(a => a.is_active).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="flex items-center gap-2">
                          <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={18} />
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
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

          {/* Credit card bill info */}
          {isCardAccount && transactionType === 'saida' && (
            <CreditCardBillSection
              form={form}
              cardName={selectedAccount?.name ?? ''}
              account={selectedAccount}
              installmentCount={form.watch('installment_count') ?? 1}
              totalAmount={form.watch('amount') ?? 0}
              transactionDate={form.watch('transaction_date') ?? ''}
            />
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

          {/* Installment info — shown for non-card transactions only (card gets breakdown above) */}
          {!isEditing && (form.watch('installment_count') || 1) > 1 && !isCardAccount && (
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

          {/* Anexos múltiplos */}
          <AttachmentsSection
            isEditing={isEditing}
            transactionId={transaction?.id}
            pendingFiles={pendingFiles}
            setPendingFiles={setPendingFiles}
          />

          {/* Is Paid toggle — hidden for credit card expenses (always committed) */}
          {!(isCardAccount && transactionType === 'saida') && (
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
          )}

        </form>
      </Form>
    </ResponsiveModal>
  );
}
