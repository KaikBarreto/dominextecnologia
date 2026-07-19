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
import { Loader2, TrendingUp, TrendingDown, Upload, X, CreditCard, Info, FileText, Download, Layers, Plus } from 'lucide-react';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { CategoryFormDialog } from './CategoryFormDialog';
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
  useUploadTransactionAttachmentShared,
  useRemoveTransactionAttachment,
  createAttachmentSignedUrl,
  formatAttachmentSize,
  type TransactionAttachment,
} from '@/hooks/useTransactionAttachments';
import { format, parseISO, addMonths, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { FinancialTransaction, TransactionType } from '@/types/database';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';


// Billing months: 1 month back to 4 months ahead (covers all realistic card use cases)
const CARD_BILL_MONTHS = Array.from({ length: 6 }, (_, i) => {
  const d = addMonths(startOfMonth(new Date()), i - 1);
  return { value: format(d, 'yyyy-MM-dd'), label: format(d, 'MMMM yyyy', { locale: ptBR }) };
});

function makeTransactionSchema(v: { descriptionRequired: string; amountPositive: string; dateRequired: string; accountRequired: string }) {
  return z.object({
    transaction_type: z.enum(['entrada', 'saida']),
    category: z.string().optional(),
    description: z.string().min(1, v.descriptionRequired),
    amount: z.coerce.number().positive(v.amountPositive),
    transaction_date: z.string().min(1, v.dateRequired),
    is_paid: z.boolean().default(true),
    notes: z.string().optional(),
    payment_method: z.string().optional(),
    installment_count: z.coerce.number().min(1).default(1),
    account_id: z.string().min(1, v.accountRequired),
    credit_card_bill_date: z.string().optional(),
  });
}

// Fallback schema para uso fora de componente (e.g. inferência de tipo)
const transactionSchema = makeTransactionSchema({
  descriptionRequired: 'Descrição é obrigatória',
  amountPositive: 'Valor deve ser positivo',
  dateRequired: 'Data é obrigatória',
  accountRequired: 'Selecione uma conta ou caixa',
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
  const { locale, currency } = useAppLocaleContext();
  const tf = MESSAGES[locale].app.finance.transactionForm;

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

  const fmt = (v: number) => formatMoney(v, currency, locale);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800 p-3 space-y-2">
      <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
        <CreditCard className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium">{tf.creditCardSection.title}</p>
      </div>

      {installmentBreakdown ? (
        <div className="space-y-1">
          <p className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            {tf.creditCardSection.installmentInfo.replace('{count}', String(installmentCount)).replace('{card}', cardName)}
          </p>
          <div className="space-y-0.5 pl-4">
            {installmentBreakdown.map(({ num, label, amount }) => (
              <div key={num} className="flex justify-between text-xs text-violet-700 dark:text-violet-300">
                <span className="capitalize">
                  {tf.creditCardSection.installmentRow
                    .replace('{num}', String(num))
                    .replace('{total}', String(installmentCount))
                    .replace('{month}', label)}
                </span>
                <span className="font-medium">{fmt(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        billLabel && (
          <p className="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
            <Info className="h-3 w-3" />
            {tf.creditCardSection.billInMonthPrefix}{' '}
            <strong>{tf.creditCardSection.billInMonthStrong.replace('{month}', billLabel)}</strong>{' '}
            {tf.creditCardSection.billInMonthSuffix.replace('{card}', cardName)}
          </p>
        )
      )}

      {!installmentBreakdown && (
        <FormField control={form.control} name="credit_card_bill_date" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs text-violet-700 dark:text-violet-300">{tf.creditCardSection.billMonthLabel}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || ''}>
              <FormControl>
                <SelectTrigger className="h-8 text-sm border-violet-300 dark:border-violet-700">
                  <SelectValue placeholder={tf.creditCardSection.billMonthPlaceholder} />
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
  installmentCount?: number;
}

function AttachmentsSection({ isEditing, transactionId, pendingFiles, setPendingFiles, installmentCount = 1 }: AttachmentsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const tf = MESSAGES[locale].app.finance.transactionForm;

  // Anexos persistidos (modo edit)
  const { data: savedAttachments = [], isLoading: loadingSaved } = useTransactionAttachments(
    isEditing ? transactionId : undefined,
  );
  const uploadMutation = useUploadTransactionAttachment();
  const removeMutation = useRemoveTransactionAttachment();
  // Mostra info de vinculação a múltiplas parcelas tanto na criação quanto na
  // edição "à vista → parcelada" (caso em que o save recria como N parcelas).
  const showInstallmentInfo = installmentCount > 1;

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
        <FormLabel>{tf.attachmentsLabel}</FormLabel>
        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {totalCount !== 1
              ? tf.attachmentsCountPlural.replace('{count}', String(totalCount))
              : tf.attachmentsCount.replace('{count}', String(totalCount))}
          </span>
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
        <p className="text-xs text-muted-foreground">{tf.attachmentsLoading}</p>
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
        {totalCount > 0 ? tf.attachmentsAdd : tf.attachmentsAttach}
      </Button>
      <p className="text-xs text-muted-foreground">{tf.attachmentsHint}</p>

      {showInstallmentInfo && (
        <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-2 flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{tf.attachmentsInstallmentInfo.replace('{count}', String(installmentCount))}</span>
        </p>
      )}
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
  const { locale, currency } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const tf = fin.transactionForm;
  const { categories: dbCategories, createCategory } = useFinancialCategories();
  const { accounts } = useFinancialAccounts();
  const { toast } = useToast();
  const isEditing = !!transaction;
  const draft = useFormDraft<TransactionFormData>({ key: 'transaction-form', isOpen: open, isEditing });
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  // Guard de reentrância SÍNCRONO. O state `submitting` só atualiza no próximo
  // render — entre dois cliques rápidos (ou duplo-clique) o React ainda não
  // re-renderizou com o botão desabilitado, então um 2º submit entra antes.
  // Esse ref barra na hora e impede dois `.insert()` (bug do cartão parcelado
  // que criava dois installment_group_id idênticos). Regra-lei #7.
  const submitGuard = useRef(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const uploadSharedMutation = useUploadTransactionAttachmentShared();

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
    installment_count: (transaction as any)?.installment_total ?? 1,
    account_id: (transaction as any)?.account_id ?? lastAccountId,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [transaction, defaultType]);

  const localizedSchema = useMemo(
    () => makeTransactionSchema(tf.validations),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );

  const form = useForm<TransactionFormData>({
    resolver: zodResolver(localizedSchema),
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

  // Auto-calculate bill month when card account or date changes.
  // is_paid NÃO é mais auto-setado pra cartão: a despesa entra como pendente
  // e só fica paga quando a FATURA inteira é quitada (via Pagar Fatura). Isso
  // corrige o bug onde a parcela (1/6) sumia do filtro "Pendentes" porque
  // entrava como is_paid=true. Ver v1.9.15 — refactor cartão/faturas.
  useEffect(() => {
    if (!open) return;
    if (isCardAccount && watchedDate && selectedAccount) {
      form.setValue('credit_card_bill_date', computeBillDate(selectedAccount, watchedDate));
    } else if (!isCardAccount) {
      form.setValue('credit_card_bill_date', undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCardAccount, watchedDate, watchedAccountId, open]);

  const handleSubmit = async (data: TransactionFormData) => {
    // Trava de reentrância: se já há um submit em andamento, ignora o 2º disparo.
    // Cobre duplo-clique e o retry do react-hook-form, evitando dois inserts.
    if (submitGuard.current) return;
    submitGuard.current = true;

    // Transição "à vista → parcelada" OU mudança de forma de pagamento em edição:
    // Finance.tsx vai deletar a original (ou o grupo inteiro de parcelas) e
    // recriar do zero, porque o backend só faz UPDATE plano e não consegue
    // reescrever a estrutura (parcelas, cartão vs PIX, etc.). Confirma com o
    // usuário antes pra evitar surpresa.
    const originalInstallmentTotal = (transaction as any)?.installment_total;
    const originalPaymentMethod = (transaction as any)?.payment_method;
    const wasOnePayment = isEditing && (!originalInstallmentTotal || originalInstallmentTotal <= 1);
    const willBeMultiple = (data.installment_count ?? 1) > 1;
    const paymentMethodChanged = isEditing && originalPaymentMethod !== data.payment_method;

    if (paymentMethodChanged) {
      const parcelasInfo = (data.installment_count ?? 1) > 1
        ? `${data.installment_count} parcelas`
        : 'à vista';
      const grupoInfo = (originalInstallmentTotal ?? 1) > 1
        ? `Todas as ${originalInstallmentTotal} parcelas originais serão removidas`
        : 'A transação original será removida';
      const ok = window.confirm(
        tf.changeMethodConfirm
          .replace('{groupInfo}', grupoInfo)
          .replace('{parcelas}', parcelasInfo)
      );
      if (!ok) { submitGuard.current = false; return; }
    } else if (wasOnePayment && willBeMultiple) {
      const ok = window.confirm(
        tf.changeInstallmentConfirm
          .replace(/\{count\}/g, String(data.installment_count))
      );
      if (!ok) { submitGuard.current = false; return; }
    }

    setSubmitting(true);
    try {
      // Despesa de cartão NUNCA entra como paga — quem fica pago é a FATURA.
      // O checkbox "Já foi pago" já é ocultado no UI pra cartão, mas o form pode
      // ter valor true herdado de outro fluxo (default, draft, etc). Force false
      // pra evitar o bug do (1/6) sumir do filtro Pendentes.
      const isCardSaida = isCardAccount && data.transaction_type === 'saida';
      const isPaidFinal = isCardSaida ? false : data.is_paid;
      const payload = {
        ...data,
        is_paid: isPaidFinal,
        paid_date: isPaidFinal ? data.transaction_date : undefined,
        payment_method: data.payment_method || null,
        account_id: data.account_id || null,
        credit_card_bill_date: data.credit_card_bill_date || null,
      };
      if (data.payment_method) localStorage.setItem('fin_last_payment_method', data.payment_method);
      if (data.account_id) localStorage.setItem('fin_last_account_id', data.account_id);

      const result: any = await onSubmit(payload);

      // Após criar/editar, sobe os anexos pendentes (se houver).
      // Contrato esperado de `result`: { ids: string[]; primary?: object }
      // - À vista: ids = [id]
      // - Parcelado: ids = [id_1, id_2, ..., id_N] (em ordem de installment_number)
      // - Edit normal: ids = [transaction.id]
      // - Edit à vista → parcelada: ids = [id_1, ..., id_N] das NOVAS parcelas
      //   (a original já foi deletada por Finance.tsx). Sempre prioriza result.ids.
      if (pendingFiles.length > 0) {
        const txnIds: string[] = Array.isArray(result?.ids) && result.ids.length > 0
          ? result.ids
          : (isEditing && transaction?.id ? [transaction.id] : []);

        if (txnIds.length === 0) {
          toast({
            variant: 'destructive',
            title: 'Anexos não foram enviados',
            description: 'A transação foi salva, mas não conseguimos vincular os comprovantes. Reabra a transação e anexe novamente.',
          });
        } else {
          let failures = 0;
          for (const pf of pendingFiles) {
            try {
              await uploadSharedMutation.mutateAsync({ transactionIds: txnIds, file: pf.file });
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
          } else if (txnIds.length > 1) {
            toast({
              title: `${pendingFiles.length} comprovante${pendingFiles.length !== 1 ? 's' : ''} anexado${pendingFiles.length !== 1 ? 's' : ''} em todas as ${txnIds.length} parcelas`,
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
      submitGuard.current = false;
    }
  };

  const isEntrada = transactionType === 'entrada';
  const dbCats = getCategoriesForType(transactionType);
  const busy = isLoading || submitting;

  const footer = (
    <div className="flex justify-end gap-3">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tf.cancelLabel}</Button>
      <Button type="submit" form="transaction-form" disabled={busy}
        className={isEntrada ? 'bg-success hover:bg-success/90 text-white' : 'bg-destructive hover:bg-destructive/90 text-white'}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {tf.saveLabel}
      </Button>
    </div>
  );

  // Handler do CategoryFormDialog inline: cria categoria e auto-seleciona
  // no form. Usa createCategory.mutateAsync direto (em vez de delegar pro
  // FinanceCategorias) pra capturar o `name` retornado e setar no Select.
  // Invalidação do queryKey já roda dentro do onSuccess do hook → o Select
  // recarrega sozinho na próxima renderização.
  const handleCreateCategoryInline = async (data: any) => {
    const created = await createCategory.mutateAsync(data);
    if (created?.name) {
      form.setValue('category', created.name, { shouldDirty: true });
    }
    setCategoryFormOpen(false);
  };

  return (
    <>
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={transaction ? tf.titleEdit : tf.titleNew}
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
      <p className="text-sm text-muted-foreground -mt-2 mb-4">{tf.subtitle}</p>

      <Form {...form}>
        <form id="transaction-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {/* Type toggle */}
          <FormField control={form.control} name="transaction_type" render={({ field }) => (
            <FormItem>
              <FormLabel>{tf.typeLabel}</FormLabel>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => field.onChange('entrada')}
                  className={cn('flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-semibold transition-all',
                    field.value === 'entrada' ? 'border-success bg-success text-white' : 'border-border bg-background text-muted-foreground hover:border-success/50')}>
                  <TrendingUp className="h-4 w-4" /> {tf.typeRevenue}
                </button>
                <button type="button" onClick={() => field.onChange('saida')}
                  className={cn('flex items-center justify-center gap-2 rounded-lg border-2 py-3 text-sm font-semibold transition-all',
                    field.value === 'saida' ? 'border-destructive bg-destructive text-white' : 'border-border bg-background text-muted-foreground hover:border-destructive/50')}>
                  <TrendingDown className="h-4 w-4" /> {tf.typeExpense}
                </button>
              </div>
              <FormMessage />
            </FormItem>
          )} />

          {/* Category — Select + botão "+" inline pra criar categoria sem
              precisar sair do form. Auto-seleciona a nova categoria criada
              (UX premium: usuário sente que faltou X, cria, e ela já está
              selecionada). */}
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem>
              <FormLabel>{tf.categoryLabel}</FormLabel>
              <div className="flex gap-2">
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={tf.categoryPlaceholder} />
                    </SelectTrigger>
                  </FormControl>
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
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setCategoryFormOpen(true)}
                  title={tf.newCategoryAriaLabel}
                  aria-label={tf.newCategoryAriaLabel}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
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
                <FormLabel>{tf.amountLabel}</FormLabel>
                <FormControl>
                  <Input placeholder={tf.amountPlaceholder} value={displayValue} onChange={handleCurrencyChange} inputMode="numeric" />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }} />

          {/* Account */}
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200">{tf.noAccountTitle}</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                {tf.noAccountDescription}{' '}
                <a href="/financeiro/caixas-bancos" className="underline font-medium">{tf.noAccountLink}</a>
              </p>
            </div>
          ) : (
            <FormField control={form.control} name="account_id" render={({ field }) => (
              <FormItem>
                <FormLabel>{tf.accountLabel} <span className="text-destructive">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl><SelectTrigger><SelectValue placeholder={tf.accountPlaceholder} /></SelectTrigger></FormControl>
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

          {/* Forma de pagamento — visível em new e edit. Trocar o método em edição
              dispara em Finance.handleSubmit a recriação da despesa (delete da
              original + create no novo método). Isso é o que permite mover uma
              despesa de PIX → Cartão (ou vice-versa) com as parcelas corretas. */}
          <FormField control={form.control} name="payment_method" render={({ field }) => (
            <FormItem>
              <FormLabel>{tf.paymentMethodLabel}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl><SelectTrigger><SelectValue placeholder={tf.paymentMethodPlaceholder} /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="dinheiro">{tf.paymentMethods.dinheiro}</SelectItem>
                  <SelectItem value="pix">{tf.paymentMethods.pix}</SelectItem>
                  <SelectItem value="cartao_credito">{tf.paymentMethods.cartao_credito}</SelectItem>
                  <SelectItem value="cartao_debito">{tf.paymentMethods.cartao_debito}</SelectItem>
                  <SelectItem value="transferencia">{tf.paymentMethods.transferencia}</SelectItem>
                  <SelectItem value="boleto">{tf.paymentMethods.boleto}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          {/* Credit card bill info */}
          {isCardAccount && transactionType === 'saida' && (() => {
            const originalInstallmentTotal = (transaction as any)?.installment_total;
            const originalPaymentMethod = (transaction as any)?.payment_method;
            const currentPaymentMethod = form.watch('payment_method');
            const paymentMethodChanged = isEditing && originalPaymentMethod !== currentPaymentMethod;
            // Se trocou método, vai recriar como nova despesa → trata como "novo".
            const wasAlreadyMultiple = isEditing && originalInstallmentTotal > 1 && !paymentMethodChanged;
            // Editando parcela individual de despesa já parcelada: mostrar só o
            // mês desta parcela (breakdown sairia errado, calculado a partir
            // desta data específica). Nos outros casos (novo OU à vista virando
            // parcelada OU método mudou), refletir a escolha atual do form.
            return (
              <CreditCardBillSection
                form={form}
                cardName={selectedAccount?.name ?? ''}
                account={selectedAccount}
                installmentCount={wasAlreadyMultiple ? 1 : (form.watch('installment_count') ?? 1)}
                totalAmount={form.watch('amount') ?? 0}
                transactionDate={form.watch('transaction_date') ?? ''}
              />
            );
          })()}

          {/* Description */}
          <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem>
              <FormLabel>{tf.descriptionLabel}</FormLabel>
              <FormControl><Textarea placeholder={tf.descriptionPlaceholder} rows={2} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Date + Installments row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="transaction_date" render={({ field }) => (
              <FormItem>
                <FormLabel>{tf.dateLabel}</FormLabel>
                <FormControl><Input type="date" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {(() => {
              const originalInstallmentTotal = (transaction as any)?.installment_total;
              const originalPaymentMethod = (transaction as any)?.payment_method;
              const currentPaymentMethod = form.watch('payment_method');
              const paymentMethodChanged = isEditing && originalPaymentMethod !== currentPaymentMethod;
              // Se o usuário trocou o método de pagamento na edição, vamos
              // recriar a despesa do zero (delete + create) — então libera o
              // select de parcelas como se fosse criação nova.
              const wasAlreadyMultiple = isEditing && originalInstallmentTotal > 1 && !paymentMethodChanged;
              // Edição de transação JÁ parcelada: badge read-only — alterar
              // quantidade ali exigiria reescrever TODAS as parcelas (fora de escopo).
              // Edição de transação à vista (ou nova): Select normal. Se o usuário
              // escolher N>1, Finance.tsx recria como parcelas (delete + create).
              if (wasAlreadyMultiple) {
                return (
                  <FormItem>
                    <FormLabel>{tf.installmentsLabel}</FormLabel>
                    <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm">
                      <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>
                        {tf.installmentBadgePrefix} {(transaction as any)?.installment_number ?? '?'}/{originalInstallmentTotal}
                      </span>
                    </div>
                  </FormItem>
                );
              }
              return (
                <FormField control={form.control} name="installment_count" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{tf.installmentsLabel}</FormLabel>
                    <Select onValueChange={(v) => field.onChange(parseInt(v))} value={String(field.value || 1)}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="1">{tf.installmentSingle}</SelectItem>
                        {[2,3,4,5,6,7,8,9,10,11,12].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              );
            })()}
          </div>

          {/* Installment info — shown for non-card transactions only (card gets breakdown above).
              Vale também na edição "à vista → parcelada" (transação JÁ parcelada nunca chega aqui
              porque o campo vira badge read-only). */}
          {!((transaction as any)?.installment_total > 1) && (form.watch('installment_count') || 1) > 1 && !isCardAccount && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded-md">
              {tf.installmentInfo
                .replace('{count}', String(form.watch('installment_count')))
                .replace('{amount}', formatMoney(
                  (form.watch('amount') || 0) / (form.watch('installment_count') || 1),
                  currency,
                  locale,
                ))}
            </p>
          )}

          {/* Notes */}
          <FormField control={form.control} name="notes" render={({ field }) => (
            <FormItem>
              <FormLabel>{tf.notesLabel}</FormLabel>
              <FormControl><Textarea placeholder={tf.notesPlaceholder} rows={2} {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Anexos múltiplos */}
          <AttachmentsSection
            isEditing={isEditing}
            transactionId={transaction?.id}
            pendingFiles={pendingFiles}
            setPendingFiles={setPendingFiles}
            installmentCount={form.watch('installment_count') ?? 1}
          />

          {/* Is Paid toggle — hidden for credit card expenses (always committed) */}
          {!(isCardAccount && transactionType === 'saida') && (
            <FormField control={form.control} name="is_paid" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <FormLabel className="!mt-0 font-medium">
                    {isEntrada ? tf.isPaidLabelRevenue : tf.isPaidLabelExpense}
                  </FormLabel>
                  <p className="text-xs text-muted-foreground">
                    {field.value
                      ? (isEntrada ? tf.isPaidDescReceivedTrue : tf.isPaidDescPaidTrue)
                      : (isEntrada ? tf.isPaidDescReceivedFalse : tf.isPaidDescPaidFalse)
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

    {/* Modal "Nova Categoria" — renderizado fora do ResponsiveModal pai pra
        evitar conflito de stacking entre Drawer (mobile) e o modal-filho.
        Auto-seleciona a nova categoria no Select via handleCreateCategoryInline. */}
    <CategoryFormDialog
      open={categoryFormOpen}
      onOpenChange={setCategoryFormOpen}
      category={null}
      onSubmit={handleCreateCategoryInline}
      isLoading={createCategory.isPending}
    />
    </>
  );
}
