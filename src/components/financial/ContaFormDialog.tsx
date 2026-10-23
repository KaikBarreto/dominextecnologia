import { useState, useEffect, useMemo } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFinancial, type TransactionInput } from '@/hooks/useFinancial';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { SupplierSelectField } from '@/components/financial/SupplierSelectField';
import { CategorySelectField } from '@/components/financial/CategorySelectField';
import { addMonths, addWeeks, addYears, format } from 'date-fns';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import type { TransactionType, FinancialTransaction } from '@/types/database';
import { useEmployees } from '@/hooks/useEmployees';
import { useContracts } from '@/hooks/useContracts';
import { useCustomers } from '@/hooks/useCustomers';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { BankLogo } from '@/components/financial/BankInstitutionCombobox';
import { NumericInput } from '@/components/ui/numeric-input';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { filterAccountsForReceivable } from '@/lib/financial-account-filter';
import { readPastedCents } from '@/lib/money-paste-mask';
import { CostCenterSelect } from './CostCenterSelect';
import { useCostCenters } from '@/hooks/useCostCenters';
import { ModalFormSection } from './ModalFormSection';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { useTenantCharges, type TenantChargeBillingType } from '@/hooks/useTenantCharges';
import { buildReceivableChargeRequests } from '@/lib/finance-installment-charges';
import { getDocumentStatus } from '@/lib/documentValidation';
import { useToast } from '@/hooks/use-toast';
import { todayInTz } from '@/lib/timezone';

interface ContaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: TransactionType;
  editingTransaction?: FinancialTransaction | null;
}

type Recurrence = 'unica' | 'mensal' | 'semanal' | 'anual';

export function ContaFormDialog({ open, onOpenChange, defaultType = 'saida', editingTransaction }: ContaFormDialogProps) {
  const { createTransaction, updateTransaction } = useFinancial();
  const { locale, timezone } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const t = fin.contaForm;
  // Fornecedor reusa a copy do formulário de Movimentações: é o mesmo campo,
  // e duplicar a chave em contaForm criaria duas frases para divergir.
  const tSupplier = fin.transactionForm;
  const { activeCostCenters } = useCostCenters();
  const { employees } = useEmployees();
  const { contracts } = useContracts();
  const { customers } = useCustomers();
  const { suppliers } = useSuppliers();
  const { accounts } = useFinancialAccounts();
  const canManagePayments = useCanManageFinanceSettings();
  const { hasModule } = useCompanyModules();
  const paymentAccount = useTenantPaymentAccount();
  const { create: createOnlineCharge } = useTenantCharges({ enabled: false });
  const { toast } = useToast();

  const [tipo, setTipo] = useState<TransactionType>(defaultType);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [dueDate, setDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [recurrence, setRecurrence] = useState<Recurrence>('unica');
  const [occurrences, setOccurrences] = useState('12');
  const [notes, setNotes] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [contractId, setContractId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [accountId, setAccountId] = useState('');
  // Centro de custo é SEMPRE opcional: `null` = nenhum.
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generateOnlineCharges, setGenerateOnlineCharges] = useState(false);
  const [onlineBillingType, setOnlineBillingType] = useState<Exclude<TenantChargeBillingType, 'CREDIT_CARD'>>('BOLETO');

  const isEditing = !!editingTransaction;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (editingTransaction) {
        setTipo(editingTransaction.transaction_type);
        setDescription(editingTransaction.description);
        setAmount(String(editingTransaction.amount));
        setCategory(editingTransaction.category || '');
        setDueDate(editingTransaction.due_date || format(new Date(), 'yyyy-MM-dd'));
        setNotes(editingTransaction.notes || '');
        setContractId(editingTransaction.contract_id || '');
        setCustomerId(editingTransaction.customer_id || '');
        setSupplierId((editingTransaction as any).supplier_id || '');
        setAccountId((editingTransaction as any).account_id || '');
        setCostCenterId(editingTransaction.cost_center_id ?? null);
        setGenerateOnlineCharges(false);
        setRecurrence('unica');
        setOccurrences('12');
        const empMatch = editingTransaction.notes?.match(/\[funcionario:([^\]]+)\]/);
        setEmployeeId(empMatch ? empMatch[1] : '');
      } else {
        setTipo(defaultType);
        setDescription('');
        setAmount('');
        setCategory('');
        setDueDate(format(new Date(), 'yyyy-MM-dd'));
        setRecurrence('unica');
        setOccurrences('12');
        setNotes('');
        setEmployeeId('');
        setContractId('');
        setCustomerId('');
        setSupplierId('');
        setAccountId(localStorage.getItem('fin_last_account_id') || '');
        setCostCenterId(null);
        setGenerateOnlineCharges(false);
      }
    }
  }, [open, defaultType, editingTransaction]);

  // Contas elegíveis pro campo "Conta bancária / caixa". Em RECEBIMENTO
  // (entrada) exclui cartão de crédito, que é conta de saída (fatura que a
  // empresa paga), nunca destino de receita.
  const accountsForTipo = tipo === 'entrada'
    ? filterAccountsForReceivable(accounts)
    : accounts.filter((a) => a.is_active !== false);

  // Show employee selector for salary-related categories
  const isSalaryCategory = category.toLowerCase().includes('salário') || category.toLowerCase().includes('salario');
  
  // Show contract selector for receivables or contract-related categories
  const isContractCategory = category.toLowerCase().includes('contrato');
  const showContractSelector = tipo === 'entrada' || isContractCategory;

  const activeEmployees = employees.filter(e => e.is_active);
  const employeeOptions = activeEmployees.map(e => ({ value: e.id, label: e.name }));
  
  const activeContracts = (contracts || []).filter((c: any) => c.status === 'active');
  const contractOptions = activeContracts.map((c: any) => ({
    value: c.id,
    label: `${c.name} - ${c.customer?.name || t.noCustomer}`,
  }));

  const activeCustomers = (customers || []).filter((c: any) => !c.is_deleted);

  const occurrenceCount = recurrence === 'unica'
    ? 1
    : Math.min(60, Math.max(2, parseInt(occurrences, 10) || 2));

  const chargeMethodOptions = useMemo(() => {
    const options: Array<{
      value: Exclude<TenantChargeBillingType, 'CREDIT_CARD'>;
      label: string;
    }> = [];
    const copy = fin.transactionForm.onlineCharges.methods;
    if (paymentAccount.allowPix && paymentAccount.allowBoleto) {
      options.push({ value: 'UNDEFINED', label: copy.customerChooses });
    }
    if (paymentAccount.allowBoleto) options.push({ value: 'BOLETO', label: copy.boleto });
    if (paymentAccount.allowPix) options.push({ value: 'PIX', label: copy.pix });
    return options;
  }, [fin.transactionForm.onlineCharges.methods, paymentAccount.allowBoleto, paymentAccount.allowPix]);

  const canOfferOnlineCharges =
    !isEditing
    && tipo === 'entrada'
    && occurrenceCount > 1
    && canManagePayments
    && hasModule('cobrancas')
    && paymentAccount.isActive
    && chargeMethodOptions.length > 0;

  useEffect(() => {
    if (!canOfferOnlineCharges && generateOnlineCharges) setGenerateOnlineCharges(false);
  }, [canOfferOnlineCharges, generateOnlineCharges]);

  useEffect(() => {
    if (chargeMethodOptions.length === 0) return;
    if (!chargeMethodOptions.some((option) => option.value === onlineBillingType)) {
      setOnlineBillingType(chargeMethodOptions[0].value);
    }
  }, [chargeMethodOptions, onlineBillingType]);

  // Máscara de dinheiro (centavos), igual ChargeDialog/TransactionFormDialog:
  // digita só dígitos, os 2 últimos são os centavos. NUNCA usar
  // `<input type="number">` aqui — bug real (2026-09-17, "PMOC - Daluz
  // Freguesia"): o input nativo aceita colar "4.550" como texto válido
  // (ponto = separador decimal do HTML), e `parseFloat`/`Number` liam ponto
  // como decimal e devolviam 4.55 — 72 parcelas nasceram de R$ 4,55 em vez
  // de R$ 4.550,00. `amount` continua string, só que agora é SEMPRE
  // canônica ("4550.00", nunca "4.550"), pra não exigir mudar quem já
  // consome via `Number(amount)`.
  //
  // `onPaste` cobre a outra ponta do mesmo bug: colar um valor pronto (ex.
  // "4.550" copiado de planilha) através da regra de centavos comum
  // (dígitos → últimos 2 = centavos) daria R$ 45,50 — 100x menor. Por isso
  // COLAR usa `readPastedCents`, que lê o texto como valor de verdade (ver
  // `src/lib/money-paste-mask.ts`), não como sequência de dígitos.
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    const cents = parseInt(raw || '0', 10);
    setAmount(cents ? (cents / 100).toFixed(2) : '');
  };
  const handleAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents == null) return;
    setAmount(cents ? (cents / 100).toFixed(2) : '');
  };
  const amountDisplay = amount
    ? Number(amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const handleSubmit = async () => {
    if (!description.trim() || !amount || Number(amount) <= 0) return;
    if (!accountId) return;

    const baseDate = new Date(dueDate + 'T12:00:00');
    const occurrencePlan = Array.from({ length: occurrenceCount }, (_, index) => {
      let date: Date;
      switch (recurrence) {
        case 'semanal': date = addWeeks(baseDate, index); break;
        case 'mensal': date = addMonths(baseDate, index); break;
        case 'anual': date = addYears(baseDate, index); break;
        default: date = baseDate;
      }
      return {
        number: index + 1,
        date: format(date, 'yyyy-MM-dd'),
        amount: Number(amount),
      };
    });

    const onlineChargeCopy = fin.transactionForm.onlineCharges;
    if (generateOnlineCharges) {
      if (!customerId) {
        toast({ variant: 'destructive', title: onlineChargeCopy.customerRequired });
        return;
      }
      const customer = activeCustomers.find((item) => item.id === customerId);
      const documentStatus = getDocumentStatus(customer?.document);
      if (documentStatus !== 'ok') {
        toast({
          variant: 'destructive',
          title: documentStatus === 'missing'
            ? onlineChargeCopy.documentMissing
            : onlineChargeCopy.documentInvalid,
        });
        return;
      }
      if (dueDate < todayInTz(timezone)) {
        toast({ variant: 'destructive', title: onlineChargeCopy.dueDatePast });
        return;
      }
      if (Number(amount) < 5) {
        toast({
          variant: 'destructive',
          title: onlineChargeCopy.minimumTitle,
          description: onlineChargeCopy.minimumDescription,
        });
        return;
      }
    }
    setIsSubmitting(true);

    try {
      localStorage.setItem('fin_last_account_id', accountId);
      if (isEditing && editingTransaction) {
        const input: TransactionInput & { id: string } = {
          id: editingTransaction.id,
          transaction_type: tipo,
          description,
          amount: Number(amount),
          transaction_date: dueDate,
          due_date: dueDate,
          is_paid: editingTransaction.is_paid,
          category: category || undefined,
          notes: [
            notes,
            employeeId && isSalaryCategory ? `[funcionario:${employeeId}]` : '',
            contractId && showContractSelector ? `[contrato:${contractId}]` : '',
          ].filter(Boolean).join(' ') || undefined,
          contract_id: contractId && showContractSelector ? contractId : undefined,
          customer_id: customerId || undefined,
          supplier_id: supplierId || undefined,
          account_id: accountId,
          cost_center_id: costCenterId,
        } as any;
        await updateTransaction.mutateAsync(input);
      } else {
        const transactionIds: string[] = [];
        for (const occurrence of occurrencePlan) {
          const input: TransactionInput = {
            transaction_type: tipo,
            description: occurrenceCount > 1 ? `${description} (${occurrence.number}/${occurrenceCount})` : description,
            amount: Number(amount),
            transaction_date: occurrence.date,
            due_date: occurrence.date,
            is_paid: false,
            category: category || undefined,
            notes: [
              notes,
              employeeId && isSalaryCategory ? `[funcionario:${employeeId}]` : '',
              contractId && showContractSelector ? `[contrato:${contractId}]` : '',
            ].filter(Boolean).join(' ') || undefined,
            contract_id: contractId && showContractSelector ? contractId : undefined,
            customer_id: customerId || undefined,
            supplier_id: supplierId || undefined,
            account_id: accountId,
            // Recorrência: TODA ocorrência leva o mesmo centro de custo.
            cost_center_id: costCenterId,
          } as any;

          const result = await createTransaction.mutateAsync(input);
          if (Array.isArray(result?.ids)) transactionIds.push(...result.ids);
        }

        if (generateOnlineCharges) {
          let createdCount = 0;
          try {
            const requests = buildReceivableChargeRequests({
              transactionIds,
              plan: occurrencePlan,
              customerId,
              description,
              billingType: onlineBillingType,
            });
            for (const request of requests) {
              const chargeResult = await createOnlineCharge.mutateAsync(request);
              createdCount += 1;
              if (chargeResult.orphan) {
                throw new Error(chargeResult.warning || onlineChargeCopy.linkFailed);
              } else if (chargeResult.charge.financeWarning) {
                throw new Error(chargeResult.charge.financeWarning);
              }
            }
            toast({
              title: onlineChargeCopy.successTitle,
              description: onlineChargeCopy.successDescription.replace('{count}', String(createdCount)),
            });
          } catch (error) {
            toast({
              variant: 'destructive',
              title: createdCount > 0 ? onlineChargeCopy.partialTitle : onlineChargeCopy.failedTitle,
              description: (createdCount > 0
                ? onlineChargeCopy.partialDescription
                    .replace('{created}', String(createdCount))
                    .replace('{total}', String(occurrencePlan.length))
                : onlineChargeCopy.failedDescription)
                + (error instanceof Error && error.message ? ` ${error.message}` : ''),
            });
          }
        }
      }

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTypeChange = (nextType: TransactionType) => {
    setTipo(nextType);
    setCategory('');
    setEmployeeId('');
    setContractId('');
    // Cliente e Fornecedor não são limpos: ao trocar o tipo eles apenas mudam
    // entre o bloco principal e Mais detalhes, sem perda silenciosa de vínculo.
  };

  const customerField = (
    <div className="space-y-1.5 lg:col-span-2">
      <Label>{t.customerLabel}{generateOnlineCharges && ' *'}</Label>
      <CustomerSelectField
        customers={activeCustomers}
        value={customerId}
        onValueChange={setCustomerId}
        placeholder={t.customerPlaceholder}
        requireDocument={generateOnlineCharges}
      />
    </div>
  );

  const supplierField = (
    <div className="space-y-1.5 lg:col-span-2">
      <Label>{tSupplier.supplierLabel}</Label>
      <SupplierSelectField
        suppliers={(suppliers || []) as any}
        value={supplierId}
        onValueChange={setSupplierId}
        placeholder={tSupplier.supplierPlaceholder}
      />
    </div>
  );

  const secondaryPartyId = tipo === 'entrada' ? supplierId : customerId;

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={() => onOpenChange(false)}>{t.cancelLabel}</Button>
      <Button onClick={handleSubmit} disabled={isSubmitting || !description.trim() || !amount || !accountId}>
        {isSubmitting
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isEditing ? t.savingLabel : t.creatingLabel}</>
          : (isEditing ? t.saveLabel : t.createLabel)}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t.titleEdit : t.titleNew}
      className="sm:max-w-2xl"
      footer={footer}
    >
      <p className="text-sm text-muted-foreground -mt-2 mb-4">
        {isEditing
          ? (tipo === 'saida' ? t.subtitleEditPayable : t.subtitleEditReceivable)
          : t.subtitleNew.replace('{tipo}', tipo === 'saida' ? t.types.saida.toLowerCase() : t.types.entrada.toLowerCase())
        }
      </p>

      <div className="pb-2">
        {/* ── Seção 1: O que é ─────────────────────────────────────────────
            Identidade da conta: tipo, categoria (e os vínculos que dependem
            dela), descrição e cliente/fornecedor. "Dinheiro" (valor,
            vencimento, conta) é a próxima seção. */}
        <ModalFormSection title={t.sections.whatIsIt}>
          <div className="space-y-1.5 lg:col-span-2">
            <Label>{t.typeLabel}</Label>
            <div className="grid grid-cols-2 gap-3" role="group" aria-label={t.typeLabel}>
              <button
                type="button"
                aria-pressed={tipo === 'entrada'}
                onClick={() => handleTypeChange('entrada')}
                className={cn(
                  'flex min-w-0 items-center justify-center gap-2 rounded-lg border-2 px-2 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  tipo === 'entrada'
                    ? 'border-success bg-success text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-success/50',
                )}
              >
                <TrendingUp className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.types.entrada}</span>
              </button>
              <button
                type="button"
                aria-pressed={tipo === 'saida'}
                onClick={() => handleTypeChange('saida')}
                className={cn(
                  'flex min-w-0 items-center justify-center gap-2 rounded-lg border-2 px-2 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  tipo === 'saida'
                    ? 'border-destructive bg-destructive text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-destructive/50',
                )}
              >
                <TrendingDown className="h-4 w-4 shrink-0" />
                <span className="truncate">{t.types.saida}</span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.categoryLabel}</Label>
            <CategorySelectField
              type={tipo}
              value={category}
              onValueChange={(v) => { setCategory(v); setEmployeeId(''); setContractId(''); }}
              placeholder={t.categoryPlaceholder}
              searchPlaceholder={t.categorySearchPlaceholder}
            />
          </div>

          <div className="space-y-1.5 lg:col-span-2">
            <Label>{t.descriptionLabel}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.descriptionPlaceholder} />
          </div>

          {/* Vínculo principal: Cliente em conta a receber; Fornecedor em
              conta a pagar. O outro vínculo continua em Mais detalhes. */}
          {tipo === 'entrada' ? customerField : supplierField}

          {/* Employee selector for salary categories */}
          {isSalaryCategory && tipo === 'saida' && (
            <div className="space-y-1.5">
              <Label>{t.employeeLabel}</Label>
              <SearchableSelect
                options={employeeOptions}
                value={employeeId}
                onValueChange={setEmployeeId}
                placeholder={t.employeePlaceholder}
              />
            </div>
          )}

          {/* Contract selector for receivables */}
          {showContractSelector && (
            <div className="space-y-1.5">
              <Label>{t.contractLabel}</Label>
              <SearchableSelect
                options={contractOptions}
                value={contractId}
                onValueChange={setContractId}
                placeholder={t.contractPlaceholder}
              />
            </div>
          )}

        </ModalFormSection>

        {/* ── Seção 2: Dinheiro ────────────────────────────────────────────
            Quanto, quando vence e de qual conta/caixa. */}
        <ModalFormSection title={t.sections.money}>
          <div className="space-y-1.5">
            <Label>{t.amountLabel}</Label>
            <Input
              id="conta-amount"
              inputMode="numeric"
              value={amountDisplay}
              onChange={handleAmountChange}
              onPaste={handleAmountPaste}
              placeholder={t.amountPlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.dueDateLabel}</Label>
            <DatePicker value={dueDate} onValueChange={setDueDate} />
          </div>

          {/* Account selector — required. Em recebimento (entrada), cartão de
              crédito nunca aparece: é conta de saída, não destino de receita. */}
          {accountsForTipo.length === 0 ? (
            <div className="lg:col-span-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200">{t.noAccountTitle}</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                {t.noAccountDescription}{' '}
                <a href="/financeiro/caixas-bancos" className="underline font-medium">{t.noAccountLink}</a>
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 lg:col-span-2">
              <Label>{t.accountLabel} <span className="text-destructive">*</span></Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder={t.accountPlaceholder} /></SelectTrigger>
                <SelectContent>
                  {accountsForTipo.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-2">
                        <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={18} />
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                        {a.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </ModalFormSection>

        {/* ── Seção 3: Mais detalhes ───────────────────────────────────────
            Opcionais: vínculo secundário, centro de custo e observações. */}
        <ModalFormSection
          key={`conta-more-details-${tipo}`}
          title={t.sections.moreDetails}
          collapsible
          defaultOpen={isEditing || !!secondaryPartyId || !!costCenterId || !!notes.trim()}
        >
          {/* Vínculo secundário continua disponível. Ao editar, a seção abre;
              ao trocar o tipo com valor preenchido, a key remonta a seção já
              aberta para que o dado nunca desapareça da vista. */}
          {tipo === 'entrada' ? supplierField : customerField}

          {/* Centro de custo — opcional. Só renderiza pra quem tem centro ativo
              cadastrado (ou quando a conta em edição já carrega um). */}
          {(activeCostCenters.length > 0 || costCenterId) && (
            <div className="space-y-1.5">
              <Label>{fin.costCenters.fieldLabel}</Label>
              <CostCenterSelect value={costCenterId} onValueChange={setCostCenterId} />
            </div>
          )}

          <div className="space-y-1.5 lg:col-span-2">
            <Label>{t.notesLabel}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t.notesPlaceholder} />
          </div>
        </ModalFormSection>

        {/* ── Seção 4: Parcelar ou repetir ─────────────────────────────────
            Só ao CRIAR — a recorrência gera N contas de uma vez; editar mexe
            só nesta conta. */}
        {!isEditing && (
          <ModalFormSection title={t.sections.installmentsOrRecurrence} collapsible grid={false} defaultOpen={recurrence !== 'unica'}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t.recurrenceLabel}</Label>
                <Select value={recurrence} onValueChange={(v) => setRecurrence(v as Recurrence)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unica">{t.recurrences.unica}</SelectItem>
                    <SelectItem value="semanal">{t.recurrences.semanal}</SelectItem>
                    <SelectItem value="mensal">{t.recurrences.mensal}</SelectItem>
                    <SelectItem value="anual">{t.recurrences.anual}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {recurrence !== 'unica' && (
                <div className="space-y-1.5">
                  <Label>{t.installmentsLabel}</Label>
                  <NumericInput value={occurrences} onValueChange={setOccurrences} placeholder={t.installmentsPlaceholder} />
                </div>
              )}
            </div>

            {canOfferOnlineCharges && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="generate-online-account-charges" className="cursor-pointer">
                      {fin.transactionForm.onlineCharges.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {fin.transactionForm.onlineCharges.description.replace('{count}', String(occurrenceCount))}
                    </p>
                  </div>
                  <Switch
                    id="generate-online-account-charges"
                    checked={generateOnlineCharges}
                    onCheckedChange={setGenerateOnlineCharges}
                    aria-label={fin.transactionForm.onlineCharges.label}
                  />
                </div>

                {generateOnlineCharges && (
                  <div className="space-y-2 border-t border-primary/15 pt-3">
                    <Label>{fin.transactionForm.onlineCharges.methodLabel}</Label>
                    <Select
                      value={onlineBillingType}
                      onValueChange={(value) => setOnlineBillingType(value as Exclude<TenantChargeBillingType, 'CREDIT_CARD'>)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {chargeMethodOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{fin.transactionForm.onlineCharges.hint}</p>
                  </div>
                )}
              </div>
            )}
          </ModalFormSection>
        )}
      </div>
    </ResponsiveModal>
  );
}
