import { useState, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useFinancial, type TransactionInput } from '@/hooks/useFinancial';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { addMonths, addWeeks, addYears, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import type { TransactionType, FinancialTransaction } from '@/types/database';
import { useEmployees } from '@/hooks/useEmployees';
import { useContracts } from '@/hooks/useContracts';
import { useCustomers } from '@/hooks/useCustomers';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { BankLogo } from '@/components/financial/BankInstitutionCombobox';
import { NumericInput } from '@/components/ui/numeric-input';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface ContaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: TransactionType;
  editingTransaction?: FinancialTransaction | null;
}

type Recurrence = 'unica' | 'mensal' | 'semanal' | 'anual';

export function ContaFormDialog({ open, onOpenChange, defaultType = 'saida', editingTransaction }: ContaFormDialogProps) {
  const { createTransaction, updateTransaction } = useFinancial();
  const { categories } = useFinancialCategories();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.contaForm;
  const { employees } = useEmployees();
  const { contracts } = useContracts();
  const { customers } = useCustomers();
  const { accounts } = useFinancialAccounts();

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
  const [accountId, setAccountId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        setAccountId((editingTransaction as any).account_id || '');
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
        setAccountId(localStorage.getItem('fin_last_account_id') || '');
      }
    }
  }, [open, defaultType, editingTransaction]);

  // Filter categories based on type
  const filteredCategories = (categories || []).filter(
    (c) => c.type === 'ambos' || (tipo === 'entrada' ? c.type === 'receita' : c.type === 'despesa')
  );

  const categoryOptions = filteredCategories.map((c) => ({ value: c.name, label: c.name }));

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
  const customerOptions = activeCustomers.map((c: any) => ({ value: c.id, label: c.name }));

  const handleSubmit = async () => {
    if (!description.trim() || !amount || Number(amount) <= 0) return;
    if (!accountId) return;
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
          account_id: accountId,
        } as any;
        await updateTransaction.mutateAsync(input);
      } else {
        const baseDate = new Date(dueDate + 'T12:00:00');
        const count = recurrence === 'unica' ? 1 : Math.min(60, Math.max(2, parseInt(occurrences, 10) || 2));

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
            notes: [
              notes,
              employeeId && isSalaryCategory ? `[funcionario:${employeeId}]` : '',
              contractId && showContractSelector ? `[contrato:${contractId}]` : '',
            ].filter(Boolean).join(' ') || undefined,
            contract_id: contractId && showContractSelector ? contractId : undefined,
            customer_id: customerId || undefined,
            account_id: accountId,
          } as any;

          await createTransaction.mutateAsync(input);
        }
      }

      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const footer = (
    <div className="flex justify-end gap-2">
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
      className="sm:max-w-lg"
      footer={footer}
    >
      <p className="text-sm text-muted-foreground -mt-2 mb-4">
        {isEditing
          ? (tipo === 'saida' ? t.subtitleEditPayable : t.subtitleEditReceivable)
          : t.subtitleNew.replace('{tipo}', tipo === 'saida' ? t.types.saida.toLowerCase() : t.types.entrada.toLowerCase())
        }
      </p>

      <div className="space-y-4 pb-2">
          <div className="space-y-1.5">
            <Label>{t.typeLabel}</Label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v as TransactionType); setCategory(''); setEmployeeId(''); setContractId(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="saida">{t.types.saida}</SelectItem>
                <SelectItem value="entrada">{t.types.entrada}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t.descriptionLabel}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.descriptionPlaceholder} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t.amountLabel}</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t.amountPlaceholder} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.dueDateLabel}</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.categoryLabel}</Label>
            <SearchableSelect
              options={categoryOptions}
              value={category}
              onValueChange={(v) => { setCategory(v); setEmployeeId(''); setContractId(''); }}
              placeholder={t.categoryPlaceholder}
            />
          </div>

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

          {/* Customer selector */}
          <div className="space-y-1.5">
            <Label>{t.customerLabel}</Label>
            <SearchableSelect
              options={customerOptions}
              value={customerId}
              onValueChange={setCustomerId}
              placeholder={t.customerPlaceholder}
            />
          </div>

          {/* Account selector — required */}
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200">{t.noAccountTitle}</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                {t.noAccountDescription}{' '}
                <a href="/financeiro/caixas-bancos" className="underline font-medium">{t.noAccountLink}</a>
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t.accountLabel} <span className="text-destructive">*</span></Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder={t.accountPlaceholder} /></SelectTrigger>
                <SelectContent>
                  {accounts.filter(a => a.is_active).map(a => (
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

          {!isEditing && (
            <div className="grid grid-cols-2 gap-3">
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
          )}

          <div className="space-y-1.5">
            <Label>{t.notesLabel}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t.notesPlaceholder} />
          </div>
        </div>
    </ResponsiveModal>
  );
}
