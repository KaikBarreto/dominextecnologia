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
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Loader2, TrendingUp, TrendingDown, Upload, X, CreditCard, Info, FileText, Download, Layers, Calculator, AlertTriangle } from 'lucide-react';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { CategoryFormDialog } from './CategoryFormDialog';
import { AccountFormDialog } from './AccountFormDialog';
import { getCategoryIcon } from './categoryIcons';
import { cn } from '@/lib/utils';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { useToast } from '@/hooks/use-toast';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { BankLogo } from '@/components/financial/BankInstitutionCombobox';
import { computeBillDate } from '@/hooks/useCreditCardBills';
import { normalizePaymentMethod } from '@/lib/finance-payment-methods';
import { filterAccountsForReceivable } from '@/lib/financial-account-filter';
import { filterCategoriesForSelect } from '@/lib/financial-category-filter';
import { CostCenterSelect } from './CostCenterSelect';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { useCostCenters } from '@/hooks/useCostCenters';
import {
  buildInstallmentPlan,
  buildCardReceivablePlan,
  receivableInstallmentCount,
  type CardReceiptMode,
} from '@/lib/finance-installments';
import {
  planTransactionEdit,
  belongsToInstallmentGroup,
  type TransactionEditPlan,
} from '@/lib/finance-edit-plan';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTenantFees } from '@/hooks/useTenantCardFees';
import { simulateNetAmount, REFERENCE_CARD_FEES, type SimulatorFees } from '@/lib/asaasFeeSimulator';
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
import { formatMoney, formatDate, toBcp47 } from '@/lib/format';
import { todayInBrazil } from '@/lib/today-brazil';


// Billing months: 1 month back to 4 months ahead (covers all realistic card use cases)
const CARD_BILL_MONTHS = Array.from({ length: 6 }, (_, i) => {
  const d = addMonths(startOfMonth(new Date()), i - 1);
  return { value: format(d, 'yyyy-MM-dd'), label: format(d, 'MMMM yyyy', { locale: ptBR }) };
});

/**
 * A pergunta "como o dinheiro entra na sua conta?" só existe em RECEITA paga no
 * crédito PARCELADO. Em despesa as N parcelas estão certas (a empresa deve mês
 * a mês) e nas outras formas de pagamento não há antecipação a decidir.
 *
 * Usada em dois lugares que precisam concordar: a validação (bloqueia o salvar
 * enquanto não houver escolha) e a renderização do bloco. Se divergirem, o
 * formulário trava num campo invisível.
 */
function needsCardReceiptChoice(d: {
  transaction_type?: string;
  payment_method?: string | null;
  installment_count?: number;
}): boolean {
  const method = d.payment_method ? (normalizePaymentMethod(d.payment_method) ?? d.payment_method) : '';
  return d.transaction_type === 'entrada'
    && method === 'cartao_credito'
    && (d.installment_count ?? 1) > 1;
}

function makeTransactionSchema(
  v: { descriptionRequired: string; amountPositive: string; dateRequired: string; accountRequired: string; cardReceiptModeRequired: string },
  opts?: { canAskCardReceiptMode?: boolean },
) {
  const base = z.object({
    transaction_type: z.enum(['entrada', 'saida']),
    category: z.string().optional(),
    description: z.string().min(1, v.descriptionRequired),
    amount: z.coerce.number().positive(v.amountPositive),
    transaction_date: z.string().min(1, v.dateRequired),
    is_paid: z.boolean().default(true),
    /**
     * Data em que o dinheiro REALMENTE se moveu. Só é usada quando `is_paid`
     * está ligado. Antes o form carimbava `transaction_date` aqui: conta
     * lançada em 10/01 e paga em 05/03 caía em JANEIRO — mês já fechado
     * mudando depois de fechado.
     */
    paid_date: z.string().optional(),
    notes: z.string().optional(),
    payment_method: z.string().optional(),
    installment_count: z.coerce.number().min(1).default(1),
    account_id: z.string().min(1, v.accountRequired),
    // Centro de custo é SEMPRE opcional — nenhum lançamento passa a exigir.
    cost_center_id: z.string().nullable().optional(),
    credit_card_bill_date: z.string().optional(),
    /**
     * Campo SÓ de tela (não é coluna): como o dinheiro do crédito parcelado
     * entra na conta. Sem valor padrão de propósito, o formulário pergunta
     * toda vez. É removido do payload antes de gravar.
     */
    card_receipt_mode: z.enum(['anticipated', 'as_customer_pays']).optional(),
  });

  // A trava só entra quando o bloco PODE aparecer na tela. Editando uma parcela
  // de um grupo já criado o campo vira badge read-only e a pergunta não é feita
  // — exigir a escolha ali bloquearia o salvar sem nada visível pra corrigir.
  if (!opts?.canAskCardReceiptMode) return base;

  return base.superRefine((data, ctx) => {
    if (needsCardReceiptChoice(data) && !data.card_receipt_mode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['card_receipt_mode'],
        message: v.cardReceiptModeRequired,
      });
    }
  });
}

// Fallback schema para uso fora de componente (e.g. inferência de tipo)
const transactionSchema = makeTransactionSchema({
  descriptionRequired: 'Descrição é obrigatória',
  amountPositive: 'Valor deve ser positivo',
  dateRequired: 'Data é obrigatória',
  accountRequired: 'Selecione uma conta ou caixa',
  cardReceiptModeRequired: 'Escolha como o dinheiro entra na sua conta',
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

  // Preview usa o MESMO motor da gravação (buildInstallmentPlan): datas com
  // clamp de fim de mês (31/01 → 28/02, nunca 03/03) e rateio com sobra na
  // última parcela. Antes o preview repetia a conta com `setMonth` nativo —
  // ambos erravam igual, então o bug passava despercebido.
  const installmentBreakdown = installmentCount > 1 && account && transactionDate
    ? buildInstallmentPlan(transactionDate, totalAmount, installmentCount).map(({ number, date, amount }) => {
        const bDate = computeBillDate(account, date);
        const bLabel = format(parseISO(bDate + 'T12:00:00'), 'MMMM yyyy', { locale: ptBR });
        return { label: bLabel, amount, num: number };
      })
    : null;

  const fmt = (v: number) => formatMoney(v, currency, locale);

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-800 p-3 space-y-2">
      <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
        <CreditCard className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium">{tf.creditCardSection.title}</p>
      </div>

      {/* Previsão da fatura — SEMPRE visível (à vista mostra 1 linha com o
          valor cheio; parcelado mostra 1 linha por parcela). Regra do
          fechamento já embutida no computeBillDate/computeBillDates: o
          próprio dia do fechamento cai na fatura seguinte. */}
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
                    .replace('{month}', label)
                    .replace('{amount}', fmt(amount))}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        billLabel && (
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300 capitalize">
            {tf.creditCardSection.singleBillRow
              .replace('{month}', billLabel)
              .replace('{amount}', fmt(totalAmount))}
          </p>
        )
      )}

      <p className="text-[11px] text-violet-600/80 dark:text-violet-400/80 flex items-start gap-1">
        <Info className="h-3 w-3 shrink-0 mt-0.5" />
        {tf.creditCardSection.notOnCashFlowNote}
      </p>

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
// Crédito parcelado em RECEITA — como o dinheiro ENTRA na conta
// ============================================================================
//
// O cliente parcelar em 10x é assunto dele com a operadora. O que entra no
// Contas a Receber da empresa é QUANDO o dinheiro cai na conta dela: de uma vez
// (se antecipar) ou mês a mês (se não antecipar). O sistema tratava as duas
// coisas como uma só e jogava 10 recebíveis de R$ 78,90 numa venda de R$ 789,00.
//
// Decisão do CEO: pergunta toda vez, sem opção pré-marcada e sem configuração
// salva. O valor líquido mostrado aqui é ESTIMATIVA: nenhuma taxa é lançada
// agora. A tarifa real é informada na baixa, que é quando ela é conhecida
// (mesma regra do ApproveQuoteModal e do ReceivePaymentModal).

interface CardReceiptModeSectionProps {
  form: ReturnType<typeof useForm<any>>;
  installmentCount: number;
  totalAmount: number;
  transactionDate: string;
}

function CardReceiptModeSection({ form, installmentCount, totalAmount, transactionDate }: CardReceiptModeSectionProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.transactionForm.cardReceipt;

  const mode = form.watch('card_receipt_mode') as CardReceiptMode | undefined;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const pct = (v: number) => {
    try {
      return `${v.toLocaleString(toBcp47(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    } catch {
      return `${v.toFixed(2)}%`;
    }
  };

  // Taxas da conta Asaas do tenant. Só busca quando este bloco está montado, e
  // ele só é montado no crédito parcelado de receita.
  const { card, pix, bankSlip, anticipation, settlementDays, source, extrasSource, isLoading } = useTenantFees();
  // Sem a tabela da conta (integração ausente, edge fora do ar), usa a tabela
  // pública de referência e AVISA. Some com o número seria pior: o usuário
  // precisa de uma ordem de grandeza pra decidir antecipar ou não.
  const feeTable = card ?? REFERENCE_CARD_FEES;

  // Valor de cada parcela do CLIENTE: sai do mesmo motor que grava as linhas,
  // pra tela e extrato nunca divergirem.
  const perInstallment = useMemo(() => {
    if (!transactionDate || totalAmount <= 0) return 0;
    return buildCardReceivablePlan({
      firstDate: transactionDate,
      total: totalAmount,
      installmentCount,
      mode: 'as_customer_pays',
    })[0]?.amount ?? 0;
  }, [transactionDate, totalAmount, installmentCount]);

  // Estimativa do líquido com antecipação. Fórmula única do front
  // (src/lib/asaasFeeSimulator.ts), a mesma do modal de Nova cobrança.
  const simulation = useMemo(() => {
    if (mode !== 'anticipated' || totalAmount <= 0 || !transactionDate) return null;
    const start = parseISO(`${transactionDate}T12:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    const fees: SimulatorFees = { card: feeTable, pix, bankSlip, anticipation, settlementDays };
    return simulateNetAmount({
      amount: totalAmount,
      method: 'card',
      installments: installmentCount,
      // A empresa absorve a taxa: o cliente paga o valor da venda, nada a mais.
      feePayer: 'company',
      fees,
      anticipate: true,
      startDate: start,
      dueDays: 0,
    });
  }, [mode, feeTable, pix, bankSlip, anticipation, settlementDays, totalAmount, installmentCount, transactionDate]);

  // Alguma taxa não veio da conta do tenant: o número é aproximado e a tela
  // tem que dizer isso antes que alguém confie nele.
  const feesAreReference =
    !card || source === 'fallback' || extrasSource === 'fallback' || simulation?.usedReferenceFees === true;

  const optionClass = (selected: boolean) =>
    cn(
      'w-full rounded-lg border-2 p-3 text-left transition-all',
      selected
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-background hover:border-primary/50',
    );

  return (
    <FormField control={form.control} name="card_receipt_mode" render={({ field }) => (
      <FormItem className="rounded-lg border border-border bg-muted/40 p-3 space-y-3">
        <div>
          <FormLabel className="!mt-0 font-semibold">{t.title}</FormLabel>
          <p className="text-xs text-muted-foreground mt-1">
            {t.subtitle.replace('{count}', String(installmentCount))}
          </p>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => field.onChange('anticipated')}
            className={optionClass(field.value === 'anticipated')}
          >
            <span className="block text-sm font-semibold">{t.lumpTitle}</span>
            <span className={cn('block text-xs mt-0.5', field.value === 'anticipated' ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
              {t.lumpDesc.replace('{total}', fmt(totalAmount))}
            </span>
          </button>

          <button
            type="button"
            onClick={() => field.onChange('as_customer_pays')}
            className={optionClass(field.value === 'as_customer_pays')}
          >
            <span className="block text-sm font-semibold">{t.scheduleTitle}</span>
            <span className={cn('block text-xs mt-0.5', field.value === 'as_customer_pays' ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
              {t.scheduleDesc
                .replace('{count}', String(installmentCount))
                .replace('{amount}', fmt(perInstallment))}
            </span>
          </button>
        </div>

        <FormMessage />

        {/* Líquido previsto — só na opção com antecipação. ESTIMATIVA: nada é
            lançado agora, a tarifa real entra na baixa. */}
        {field.value === 'anticipated' && totalAmount > 0 && (
          <div className="rounded-md border border-border bg-background p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm font-semibold">{t.netTitle}</p>
            </div>

            {isLoading && !card ? (
              <p className="text-xs text-muted-foreground">{t.netLoading}</p>
            ) : !simulation ? null : (
              <>
                {feesAreReference && (
                  <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-xs leading-snug">{t.referenceWarning}</p>
                  </div>
                )}

                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{t.saleValue}</dt>
                    <dd className="font-medium tabular-nums">{fmt(simulation.gross)}</dd>
                  </div>

                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t.fee}
                      <span className="block text-[11px] leading-snug">
                        {simulation.feeBreakdown.percent > 0
                          ? t.feeComposition
                              .replace('{percent}', pct(simulation.feeBreakdown.percent))
                              .replace('{fixed}', fmt(simulation.feeBreakdown.fixed))
                          : t.feeFixedOnly.replace('{fixed}', fmt(simulation.feeBreakdown.fixed))}
                      </span>
                    </dt>
                    <dd className="font-medium tabular-nums text-destructive">- {fmt(simulation.feeTotal)}</dd>
                  </div>

                  {simulation.anticipationCost != null && simulation.anticipationCost > 0 && (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">{t.anticipationCost}</dt>
                      <dd className="font-medium tabular-nums text-destructive">- {fmt(simulation.anticipationCost)}</dd>
                    </div>
                  )}

                  <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                    <dt className="font-semibold">{t.netAtOnce}</dt>
                    <dd className="text-base font-bold tabular-nums text-success">
                      {fmt(simulation.netAfterAnticipation)}
                    </dd>
                  </div>
                </dl>

                <p className="text-xs text-muted-foreground">
                  {simulation.settlementDays <= 0
                    ? t.creditToday
                    : t.creditDate.replace('{date}', formatDate(simulation.settlementDate, locale, timezone))}
                </p>
                {simulation.settlementDays > 0 && (
                  <p className="text-[11px] leading-snug text-muted-foreground">{t.businessDayNote}</p>
                )}
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t.revenueNote.replace('{total}', fmt(simulation.gross))}
                </p>
                <p className="text-[11px] leading-snug text-muted-foreground">{t.estimateNote}</p>
              </>
            )}
          </div>
        )}
      </FormItem>
    )} />
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
      toast({ variant: 'destructive', title: tf.toastLinkError, description: tf.toastLinkErrorDesc });
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
                title={tf.attachmentDownloadTitle}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="destructive-ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleRemoveSaved(att)}
                disabled={removeMutation.isPending}
                title={tf.attachmentRemoveTitle}
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
                variant="destructive-ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => removePending(p.id)}
                title={tf.attachmentRemoveTitle}
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
  const { activeCostCenters } = useCostCenters();
  const { toast } = useToast();
  // Quem não gerencia configuração não vê o "+" de criar conta/categoria na
  // hora: o banco recusa (RLS pede `can_manage_system`) e o erro chegava sem
  // explicação. Mesmo critério do CostCenterSelect.
  const canManageFinanceSettings = useCanManageFinanceSettings();
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
  // Nome pré-preenchido no quick-create de categoria (texto digitado no SearchableSelect).
  const [categoryInitialName, setCategoryInitialName] = useState('');
  // Quick-create de conta bancária inline.
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [accountInitialName, setAccountInitialName] = useState('');
  const uploadSharedMutation = useUploadTransactionAttachmentShared();

  // `selectedName` mantém na lista a categoria JÁ escolhida mesmo que ela tenha
  // sido desativada — sem isso, editar um lançamento antigo fazia o
  // SearchableSelect cair no placeholder e o campo parecia vazio.
  const getCategoriesForType = (type: 'entrada' | 'saida', selectedName?: string | null) => {
    const fromDb = filterCategoriesForSelect(dbCategories, type, selectedName);
    return fromDb.length > 0 ? fromDb : null;
  };

  // Leitura tolerante: valor salvo (localStorage ou transação em edição) pode ter
  // sido gravado por outra tela com a grafia legada (ex.: 'debito', 'credito_avista').
  // normalizePaymentMethod resolve pro código canônico ofertado no Select; sem isso
  // o Select ficava em branco pra uma transação editada que veio de outra tela.
  const lastPaymentMethodRaw = localStorage.getItem('fin_last_payment_method') || '';
  const lastPaymentMethod = normalizePaymentMethod(lastPaymentMethodRaw) ?? lastPaymentMethodRaw;
  const lastAccountId = localStorage.getItem('fin_last_account_id') || '';

  const defaults: TransactionFormData = useMemo(() => ({
    transaction_type: (transaction?.transaction_type as TransactionType) ?? defaultType,
    category: transaction?.category ?? '',
    description: transaction?.description ?? '',
    amount: transaction?.amount ?? 0,
    transaction_date: transaction?.transaction_date ?? todayInBrazil(),
    is_paid: transaction?.is_paid ?? true,
    // Regra da data de pagamento:
    // - transação JÁ paga: preserva a data real. Editar a descrição não pode
    //   recarimbar o mês em que o dinheiro se moveu.
    // - EDITANDO uma conta em aberto (o caso do bug): padrão é HOJE, porque
    //   quem liga "pago" agora está dando baixa agora. Antes vinha
    //   `transaction_date` e a baixa de março voltava pra janeiro.
    // - CRIANDO: espelha `transaction_date` (ver efeito de espelho abaixo), que
    //   é o comportamento de sempre pra lançamento retroativo já pago.
    paid_date: (transaction as any)?.paid_date
      ?? (transaction ? todayInBrazil() : (transaction as any)?.transaction_date ?? todayInBrazil()),
    notes: (transaction as any)?.notes ?? '',
    payment_method: (transaction as any)?.payment_method
      ? (normalizePaymentMethod((transaction as any).payment_method) ?? (transaction as any).payment_method)
      : lastPaymentMethod,
    // NUNCA semear com `installment_total`. O `amount` de uma parcela é a
    // FATIA, não o total: semear 10 aqui fazia o motor dividir R$ 100 em 10 e
    // a venda de R$ 1.000 voltava como R$ 100. Edição de parcela nasce em 1 e
    // `planTransactionEdit` impede que ela vire parcelamento novo.
    installment_count: 1,
    account_id: (transaction as any)?.account_id ?? lastAccountId,
    cost_center_id: transaction?.cost_center_id ?? null,
    // Decisão do CEO: nunca nasce marcado. Sem padrão, sem preferência salva.
    card_receipt_mode: undefined,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [transaction, defaultType]);

  // Editando uma parcela de um grupo JÁ criado, o campo de parcelas vira badge
  // read-only e a pergunta do crédito parcelado não é feita. A validação segue
  // o mesmo flag pra nunca travar o salvar num campo que não está na tela.
  const isEditingInstallmentGroup = !!transaction && belongsToInstallmentGroup(transaction as any);
  const canAskCardReceiptMode = !isEditingInstallmentGroup;

  const localizedSchema = useMemo(
    () => makeTransactionSchema(tf.validations, { canAskCardReceiptMode }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, canAskCardReceiptMode],
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
  const watchedPaymentMethod = form.watch('payment_method');
  const watchedInstallmentCount = form.watch('installment_count') ?? 1;

  // A pergunta "como o dinheiro entra na sua conta?" está na tela?
  const askCardReceiptMode = canAskCardReceiptMode && needsCardReceiptChoice({
    transaction_type: transactionType,
    payment_method: watchedPaymentMethod,
    installment_count: watchedInstallmentCount,
  });

  // Quantas linhas vão MESMO nascer (o preview de anexos e os avisos usam este
  // número, não o que o cliente parcelou).
  const effectiveInstallmentCountUi = receivableInstallmentCount({
    installmentCount: watchedInstallmentCount,
    mode: askCardReceiptMode
      ? ((form.watch('card_receipt_mode') as CardReceiptMode | undefined) ?? null)
      : null,
  });

  // Saiu do crédito parcelado (trocou a forma de pagamento, voltou pra à vista,
  // virou despesa): a escolha anterior morre junto com o bloco. Sem isso, um
  // 'antecipado' esquecido colapsaria as parcelas de outro cenário em silêncio.
  useEffect(() => {
    if (!askCardReceiptMode && form.getValues('card_receipt_mode')) {
      form.setValue('card_receipt_mode', undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askCardReceiptMode]);

  // Espelho data do lançamento → data do pagamento, SÓ na criação e SÓ enquanto
  // o usuário não mexeu no campo. Lançar uma despesa retroativa de 05/01 já
  // paga continua gravando pagamento em 05/01, como sempre foi. Na EDIÇÃO não
  // há espelho: lá o padrão é hoje, porque ligar "pago" numa conta em aberto é
  // dar baixa agora — era exatamente isso que jogava a despesa pro mês do
  // lançamento.
  const paidDateTouched = useRef(false);
  useEffect(() => {
    if (!open) paidDateTouched.current = false;
  }, [open]);
  useEffect(() => {
    if (!open || isEditing || paidDateTouched.current || !watchedDate) return;
    form.setValue('paid_date', watchedDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedDate, open, isEditing]);

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

  /**
   * Crédito parcelado em receita: o cliente parcela em N, mas o Contas a
   * Receber só recebe N linhas se a empresa NÃO antecipar. Antecipando, é uma
   * linha só com o valor cheio. O modo é campo de TELA, nunca vai pro banco.
   * Precisa ser calculado antes da confirmação E na gravação — se divergirem,
   * o aviso na tela promete um número de linhas e o banco grava outro.
   */
  const resolveReceipt = (data: TransactionFormData) => {
    const receiptMode: CardReceiptMode | null =
      canAskCardReceiptMode && needsCardReceiptChoice(data) ? (data.card_receipt_mode ?? null) : null;
    return {
      receiptMode,
      effectiveInstallmentCount: receivableInstallmentCount({
        installmentCount: data.installment_count ?? 1,
        mode: receiptMode,
      }),
    };
  };

  /**
   * Aviso de "refazer o lançamento", segurando os dados do formulário até o
   * usuário decidir. Substituiu o `window.confirm` (ação destrutiva usa o
   * diálogo do design system, que vira drawer no mobile).
   */
  const [replaceConfirm, setReplaceConfirm] = useState<
    { data: TransactionFormData; plan: TransactionEditPlan } | null
  >(null);

  /**
   * Porta de entrada do "Salvar". Só decide SE precisa de confirmação; quem
   * grava é `runSubmit`.
   *
   * A decisão vem do motor puro `planTransactionEdit`, o mesmo que o
   * `Finance.tsx` usa pra executar. Enquanto eram duas contas separadas, a tela
   * avisava "a transação original será removida" (singular) e o banco apagava
   * as 10 parcelas do grupo.
   */
  const handleSubmit = async (data: TransactionFormData) => {
    if (submitGuard.current) return;

    if (isEditing && transaction) {
      const { effectiveInstallmentCount } = resolveReceipt(data);
      const plan = planTransactionEdit({
        original: transaction as any,
        intent: {
          payment_method: data.payment_method,
          installment_count: effectiveInstallmentCount,
        },
      });
      // `replace` = a linha atual sai e outra(s) entra(m). UMA linha, sempre:
      // parcela de grupo nunca chega aqui (o plano devolve `update`).
      if (plan.action === 'replace') {
        setReplaceConfirm({ data, plan });
        return;
      }
    }

    await runSubmit(data);
  };

  const runSubmit = async (data: TransactionFormData) => {
    // Trava de reentrância: se já há um submit em andamento, ignora o 2º disparo.
    // Cobre duplo-clique e o retry do react-hook-form, evitando dois inserts.
    if (submitGuard.current) return;
    submitGuard.current = true;

    const { effectiveInstallmentCount } = resolveReceipt(data);

    setSubmitting(true);
    try {
      // Despesa de cartão NUNCA entra como paga — quem fica pago é a FATURA.
      // O checkbox "Já foi pago" já é ocultado no UI pra cartão, mas o form pode
      // ter valor true herdado de outro fluxo (default, draft, etc). Force false
      // pra evitar o bug do (1/6) sumir do filtro Pendentes.
      const isCardSaida = isCardAccount && data.transaction_type === 'saida';
      const isPaidFinal = isCardSaida ? false : data.is_paid;
      // QUANDO o dinheiro se moveu ≠ QUANDO o fato aconteceu.
      // Antes daqui saía `paid_date: data.transaction_date`: conta lançada em
      // 10/01 e baixada pelo Editar em 05/03 gravava pagamento em JANEIRO — um
      // mês já fechado mudava depois de fechado. Agora o form pergunta a data
      // (campo que aparece junto do switch) e o padrão é hoje no fuso do Brasil.
      // `undefined` quando não está pago: o backend limpa/ignora o campo.
      // `card_receipt_mode` é campo de tela: não existe como coluna e o insert
      // quebraria com ele no payload.
      const { card_receipt_mode: _cardReceiptMode, ...dbData } = data;
      // No modo ANTECIPADO grava-se 1 linha só, então `installment_total` não
      // registra que o cliente parcelou (e não pode: a própria tela trata
      // qualquer valor > 1 como parcela de grupo e vira selo read-only).
      // `card_installments` guarda esse rastro, que a conciliação bancária vai
      // precisar pra casar UMA entrada do extrato com uma venda parcelada.
      const cardInstallments =
        data.card_receipt_mode === 'anticipated' && (data.installment_count ?? 1) > 1
          ? data.installment_count
          : null;
      const payload = {
        ...dbData,
        installment_count: effectiveInstallmentCount,
        card_installments: cardInstallments,
        is_paid: isPaidFinal,
        paid_date: isPaidFinal ? (data.paid_date || data.transaction_date) : undefined,
        payment_method: data.payment_method || null,
        account_id: data.account_id || null,
        cost_center_id: data.cost_center_id || null,
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
            title: tf.toastAttachmentsNotSent,
            description: tf.toastAttachmentsNotSentDesc,
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
              title: failures !== 1
                ? tf.toastAttachmentFailPlural.replace('{count}', String(failures))
                : tf.toastAttachmentFail.replace('{count}', String(failures)),
              description: tf.toastAttachmentFailDesc,
            });
          } else if (txnIds.length > 1) {
            toast({
              title: pendingFiles.length !== 1
                ? tf.toastAttachmentSuccessPlural.replace('{count}', String(pendingFiles.length)).replace('{total}', String(txnIds.length))
                : tf.toastAttachmentSuccess.replace('{count}', String(pendingFiles.length)).replace('{total}', String(txnIds.length)),
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
  const selectedCategory = form.watch('category');
  // Campo de centro de custo só entra na tela pra quem usa centro de custo —
  // ou quando o lançamento em edição já carrega um (mesmo que desativado).
  const showCostCenter = activeCostCenters.length > 0 || !!form.watch('cost_center_id');
  const dbCats = getCategoriesForType(transactionType, selectedCategory);
  const busy = isLoading || submitting;

  // Opções do SearchableSelect de categoria — filtradas pelo tipo da transação
  // (o filtro já vem de getCategoriesForType). O `value` continua sendo o NOME
  // da categoria (contrato pré-existente do form). Ícone colorido no item.
  const categoryOptions = useMemo(() => {
    const opts = dbCats
      ? dbCats.map((cat) => {
          const Icon = getCategoryIcon(cat.icon);
          return {
            value: cat.name,
            label: cat.name,
            sublabel: cat.is_active ? undefined : tf.categoryInactiveSuffix,
            icon: (
              <span className="flex h-5 w-5 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: cat.color }}>
                <Icon className="h-3 w-3 text-white" />
              </span>
            ),
          };
        })
      : fallbackCategories[transactionType].map((cat) => ({ value: cat, label: cat, sublabel: undefined as string | undefined }));

    // Categoria apagada da tabela (não só desativada): sintetiza a opção pra o
    // valor gravado continuar visível em vez de sumir no placeholder.
    if (selectedCategory && !opts.some((o) => o.value === selectedCategory)) {
      opts.push({ value: selectedCategory, label: selectedCategory, sublabel: tf.categoryInactiveSuffix });
    }
    return opts;
  }, [dbCats, transactionType, selectedCategory, tf.categoryInactiveSuffix]);

  // Opções do SearchableSelect de conta bancária / caixa.
  // Em RECEITA o cartão sai da lista: cartão de crédito é conta de SAÍDA (a
  // fatura que a empresa paga), nunca lugar onde entra dinheiro de cliente.
  // Deixá-lo aqui fazia alguém selecionar por engano e o saldo ficar errado.
  // Em despesa ele continua, que é onde faz sentido.
  const accountOptions = useMemo(
    () => filterAccountsForReceivable(accounts, { includeCard: !isEntrada }).map((a) => ({
      value: a.id,
      label: a.type === 'caixa' ? `${a.name} ${tf.cashSuffix}` : a.name,
      icon: (
        <span className="flex items-center gap-1.5">
          <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={18} />
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
        </span>
      ),
    })),
    [accounts, tf.cashSuffix],
  );

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

          {/* Category — SearchableSelect com busca + criar-na-hora (padrão EcoSistema).
              O "+" (Nova categoria) fica sempre visível dentro da lista. Ao criar,
              abre o CategoryFormDialog pré-preenchido com o nome digitado e o tipo
              da transação atual; a nova categoria é auto-selecionada no submit.
              As options são filtradas pelo tipo (entrada/saída/ambos) da transação. */}
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem>
              <FormLabel>{tf.categoryLabel}</FormLabel>
              <SearchableSelect
                options={categoryOptions}
                value={field.value || ''}
                onValueChange={field.onChange}
                placeholder={tf.categoryPlaceholder}
                searchPlaceholder={tf.categorySearchPlaceholder}
                onCreateOption={canManageFinanceSettings ? (query) => {
                  setCategoryInitialName(query);
                  setCategoryFormOpen(true);
                } : undefined}
                createOptionLabel={tf.categoryCreateLabel}
                createAlwaysLabel={tf.categoryCreateAlwaysLabel}
              />
              <FormMessage />
            </FormItem>
          )} />

          {/* Centro de custo — SEMPRE opcional. Só aparece pra quem usa: sem
              nenhum centro ativo cadastrado, o campo nem é renderizado (não
              poluir o form de quem não organiza por obra/projeto). A exceção é
              editar um lançamento que JÁ tem centro: aí ele aparece mesmo que o
              centro tenha sido desativado depois. */}
          {showCostCenter && (
            <FormField control={form.control} name="cost_center_id" render={({ field }) => (
              <FormItem>
                <FormLabel>{fin.costCenters.fieldLabel}</FormLabel>
                <CostCenterSelect
                  value={field.value ?? null}
                  onValueChange={(v) => field.onChange(v)}
                />
                <FormMessage />
              </FormItem>
            )} />
          )}

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
                <SearchableSelect
                  options={accountOptions}
                  value={field.value || ''}
                  onValueChange={field.onChange}
                  placeholder={tf.accountPlaceholder}
                  searchPlaceholder={tf.accountSearchPlaceholder}
                  onCreateOption={canManageFinanceSettings ? (query) => {
                    setAccountInitialName(query);
                    setAccountFormOpen(true);
                  } : undefined}
                  createOptionLabel={tf.accountCreateLabel}
                  createAlwaysLabel={tf.accountCreateAlwaysLabel}
                />
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
                  <SelectItem value="cheque">{tf.paymentMethods.cheque}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          {/* Credit card bill info */}
          {isCardAccount && transactionType === 'saida' && (() => {
            // Editando parcela de um grupo: mostrar só o mês DESTA parcela. O
            // breakdown das N sairia errado (seria calculado a partir da data
            // desta parcela e do valor dela, que é fatia). Trocar a forma de
            // pagamento NÃO liberta esse bloco: a edição de uma parcela nunca
            // refaz o grupo. Ver src/lib/finance-edit-plan.ts.
            const wasAlreadyMultiple = isEditingInstallmentGroup;
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
              // Edição de PARCELA: selo read-only, sempre. Trocar a forma de
              // pagamento não libera o select — o valor desta linha é a fatia,
              // e deixar escolher "10x" aqui era exatamente o que redividia a
              // fatia e derrubava a venda de R$ 1.000 para R$ 100.
              // Refazer o parcelamento inteiro é outra operação: excluir as
              // parcelas e lançar de novo.
              // Edição de lançamento avulso (ou criação): Select normal. Se o
              // usuário escolher N>1, Finance.tsx recria como parcelas.
              if (isEditingInstallmentGroup) {
                return (
                  <FormItem>
                    <FormLabel>{tf.installmentsLabel}</FormLabel>
                    <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm">
                      <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>
                        {tf.installmentBadgePrefix} {(transaction as any)?.installment_number ?? '?'}/{originalInstallmentTotal ?? '?'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{tf.installmentScopeHint}</p>
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
          {!isEditingInstallmentGroup && (form.watch('installment_count') || 1) > 1 && !isCardAccount && !askCardReceiptMode && (
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

          {/* Crédito parcelado em RECEITA: como o cliente paga ≠ como o dinheiro
              entra. Sem escolha, o salvar fica bloqueado (decisão do CEO: a
              pergunta é feita toda vez, sem opção pré-marcada). */}
          {askCardReceiptMode && (
            <CardReceiptModeSection
              form={form}
              installmentCount={watchedInstallmentCount}
              totalAmount={form.watch('amount') ?? 0}
              transactionDate={form.watch('transaction_date') ?? ''}
            />
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
            installmentCount={effectiveInstallmentCountUi}
          />

          {/* Is Paid toggle — hidden for credit card expenses (always committed) */}
          {!(isCardAccount && transactionType === 'saida') && (
            <div className="rounded-lg border border-border divide-y divide-border">
              <FormField control={form.control} name="is_paid" render={({ field }) => (
                <FormItem className="flex items-center justify-between p-3">
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

              {/* Data do pagamento — só com o switch ligado.
                  O mês em que o dinheiro se move é o que manda no regime de
                  Caixa da DRE. Sem perguntar, uma conta de janeiro baixada em
                  março voltava pra janeiro e mexia num mês já fechado. */}
              {isPaid && (
                <FormField control={form.control} name="paid_date" render={({ field }) => (
                  <FormItem className="p-3">
                    <FormLabel>{isEntrada ? tf.paidDateLabelRevenue : tf.paidDateLabelExpense}</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          paidDateTouched.current = true;
                          field.onChange(e);
                        }}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{tf.paidDateHint}</p>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>
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
      initialName={categoryInitialName}
      initialType={transactionType}
      onSubmit={handleCreateCategoryInline}
      isLoading={createCategory.isPending}
    />

    {/* Refazer o lançamento: a linha atual sai e outra(s) entra(m). Substituiu
        o `window.confirm` (ação destrutiva usa o diálogo do design system, que
        vira drawer no mobile). O texto diz exatamente quantas linhas nascem e
        que UMA sai — antes falava em remover "a transação original" enquanto o
        banco apagava as 10 parcelas do grupo. */}
    <AlertDialog
      open={!!replaceConfirm}
      onOpenChange={(o) => { if (!o) setReplaceConfirm(null); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tf.replaceDialog.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {replaceConfirm?.plan.reason === 'became_installments'
              ? tf.replaceDialog.descriptionInstallments
                  .replace(/\{count\}/g, String(replaceConfirm?.plan.installmentCount ?? 1))
              : tf.replaceDialog.descriptionPaymentMethod}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tf.replaceDialog.cancel}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              const pending = replaceConfirm;
              setReplaceConfirm(null);
              if (pending) void runSubmit(pending.data);
            }}
          >
            {tf.replaceDialog.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Quick-create de conta bancária / caixa — auto-seleciona a nova conta no form. */}
    <AccountFormDialog
      open={accountFormOpen}
      onOpenChange={setAccountFormOpen}
      initialName={accountInitialName}
      onCreated={(account) => {
        form.setValue('account_id', account.id, { shouldDirty: true });
      }}
    />
    </>
  );
}
