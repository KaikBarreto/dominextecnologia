import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { FileText, RefreshCw, Ban, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NumericInput, parseDecimalInputValue } from '@/components/ui/numeric-input';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatDate, parseDateOnly } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';
import { getContractVigencia } from '@/utils/contractVigencia';
import {
  useEmployeeContracts, type EmployeeContract, type ContractBillingType,
} from '@/hooks/useEmployeeContracts';

interface EmployeeContractSectionProps {
  /** `null` = funcionário ainda não foi salvo (criação em andamento). */
  employeeId: string | null;
}

interface ContractFormState {
  startDate: string;
  endDate: string;
  indeterminate: boolean;
  billingType: ContractBillingType;
  amountStr: string;
  paymentDay: string;
  readjustmentStr: string;
  notes: string;
}

function emptyFormState(todayIso: string): ContractFormState {
  return {
    startDate: todayIso,
    endDate: '',
    // Nasce com DURAÇÃO (campo "Fim" preenchível), não indeterminado — é
    // justamente o que o CEO pediu pra gestão de contrato. Indeterminado
    // fica como a EXCEÇÃO que o usuário liga, não o ponto de partida.
    indeterminate: false,
    billingType: 'monthly',
    amountStr: '',
    paymentDay: '',
    readjustmentStr: '',
    notes: '',
  };
}

export function EmployeeContractSection({ employeeId }: EmployeeContractSectionProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.form.contract;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const maskCurrency = (value: string) => currencyMask(value, currency, locale);

  const { contracts, activeContract, isLoading, createContract, renewContract, endContract } =
    useEmployeeContracts(employeeId);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'new' | 'renew'>('new');
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<ContractFormState>(emptyFormState(todayIso));

  const history = useMemo(() => contracts.filter((c) => c.status !== 'active'), [contracts]);

  const openNewContractForm = () => {
    setFormMode('new');
    setForm(emptyFormState(todayIso));
    setFormOpen(true);
  };

  const openRenewForm = (contract: EmployeeContract) => {
    setFormMode('renew');
    // Início do contrato renovado: dia seguinte ao FIM do que está sendo
    // renovado (nunca repete o início do antigo — era o bug reportado em
    // QA). Sem `end_date` (prazo indeterminado), cai em hoje no fuso da
    // empresa. `parseDateOnly` evita off-by-one de fuso na data pura;
    // `addDays` do date-fns, nunca aritmética de milissegundos à mão.
    const newStartDate = contract.end_date
      ? format(addDays(parseDateOnly(contract.end_date), 1), 'yyyy-MM-dd')
      : todayInTz(timezone);
    setForm({
      startDate: newStartDate,
      endDate: '',
      indeterminate: !contract.end_date,
      billingType: contract.billing_type,
      amountStr: contract.amount > 0 ? maskCurrency(String(Math.round(contract.amount * 100))) : '',
      paymentDay: contract.payment_day != null ? String(contract.payment_day) : '',
      // `readjustment_percent` vem do banco com PONTO decimal (number JS);
      // o NumericInput(decimal) espera a MESMA notação PT-BR que ele produz
      // ao digitar (vírgula) — sem isso o campo nasce com "7.5" em vez de "7,5".
      readjustmentStr: contract.readjustment_percent != null ? String(contract.readjustment_percent).replace('.', ',') : '',
      notes: contract.notes || '',
    });
    setFormOpen(true);
  };

  const handleSubmitForm = () => {
    if (!employeeId) return;
    const next = {
      employee_id: employeeId,
      start_date: form.startDate,
      end_date: form.indeterminate ? null : (form.endDate || null),
      billing_type: form.billingType,
      amount: parseCurrency(form.amountStr),
      payment_day: form.paymentDay ? parseInt(form.paymentDay, 10) : null,
      // NUNCA `Number(form.readjustmentStr)` direto: o NumericInput(decimal)
      // devolve vírgula PT-BR ("7,5"), e `Number('7,5')` é `NaN` → gravava
      // `null` em silêncio (achado em QA).
      readjustment_percent: parseDecimalInputValue(form.readjustmentStr),
      notes: form.notes || null,
    };
    if (formMode === 'renew') {
      renewContract.mutate({ previousId: activeContract?.id ?? null, next }, {
        onSuccess: () => setFormOpen(false),
      });
    } else {
      createContract.mutate(next, { onSuccess: () => setFormOpen(false) });
    }
  };

  const isSaving = createContract.isPending || renewContract.isPending;

  if (!employeeId) {
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" />}
        title={t.emptyTitle}
        description={t.saveFirstHint}
        size="compact"
      />
    );
  }

  if (isLoading) {
    return <div className="h-24 rounded-lg bg-muted animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      {activeContract ? (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <Label className="text-sm font-medium">{t.activeLabel}</Label>
            <ContractVigenciaBadge contract={activeContract} timezone={timezone} />
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between sm:flex-col sm:gap-0.5">
              <span className="text-muted-foreground">{t.fields.amount}</span>
              <span className="font-semibold">
                {fmt(activeContract.amount)}
                <span className="text-xs text-muted-foreground font-normal">
                  {' '}{MESSAGES[locale].app.employees.pjTab.billingSuffix[activeContract.billing_type]}
                </span>
              </span>
            </div>
            <div className="flex justify-between sm:flex-col sm:gap-0.5">
              <span className="text-muted-foreground">{t.fields.startDate}</span>
              <span>{formatDate(activeContract.start_date, locale, timezone)}</span>
            </div>
            <div className="flex justify-between sm:flex-col sm:gap-0.5">
              <span className="text-muted-foreground">{t.fields.endDate}</span>
              <span>{activeContract.end_date ? formatDate(activeContract.end_date, locale, timezone) : t.indeterminateBadge}</span>
            </div>
            {activeContract.payment_day != null && (
              <div className="flex justify-between sm:flex-col sm:gap-0.5">
                <span className="text-muted-foreground">{t.fields.paymentDay}</span>
                <span>{activeContract.payment_day}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => openRenewForm(activeContract)}>
              <RefreshCw className="h-3.5 w-3.5" /> {t.renewButton}
            </Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5 text-destructive hover:bg-destructive hover:text-white" onClick={() => setEndConfirmOpen(true)}>
              <Ban className="h-3.5 w-3.5" /> {t.endButton}
            </Button>
          </div>
        </div>
      ) : (
        // "ainda" só faz sentido quando NUNCA existiu contrato. Com histórico
        // (ex.: acabou de Encerrar), o texto certo é "nenhum VIGENTE" — senão
        // o painel parece estar mentindo sobre os 2+ contratos visíveis
        // embaixo (achado em QA).
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title={history.length > 0 ? t.noActiveTitle : t.emptyTitle}
          description={history.length > 0 ? t.noActiveDescription : t.emptyDescription}
          size="compact"
          action={{ label: t.newButton, onClick: openNewContractForm }}
        />
      )}

      {history.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">{t.historyLabel}</Label>
          <div className="rounded-lg border divide-y">
            {history.map((c) => (
              <div key={c.id} className="p-3 text-sm">
                <p className="font-medium">
                  {fmt(c.amount)} <span className="text-xs text-muted-foreground">{MESSAGES[locale].app.employees.pjTab.billingSuffix[c.billing_type]}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(c.start_date, locale, timezone)}, {c.end_date ? formatDate(c.end_date, locale, timezone) : t.indeterminateBadge}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeContract && (
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={openNewContractForm}>
          <Plus className="h-3.5 w-3.5" /> {t.newButton}
        </Button>
      )}

      {/* Confirmação de encerramento */}
      <AlertDialog open={endConfirmOpen} onOpenChange={setEndConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.endConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.endConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.endConfirmCancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (activeContract) endContract.mutate(activeContract.id);
                setEndConfirmOpen(false);
              }}
            >
              {t.endConfirmConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Form de novo contrato / renovação */}
      <ResponsiveModal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={formMode === 'renew' ? t.formTitleRenew : t.formTitleNew}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>{t.cancelLabel}</Button>
            <Button type="button" onClick={handleSubmitForm} disabled={isSaving}>{t.saveLabel}</Button>
          </div>
        }
      >
        <div className="space-y-4 p-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t.fields.startDate}</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">{t.fields.endDate}</Label>
              </div>
              <Input
                type="date"
                value={form.endDate}
                disabled={form.indeterminate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex flex-col items-start gap-1.5">
            <Label className="text-xs text-muted-foreground">{t.fields.indeterminate}</Label>
            <LabeledSwitch
              value={form.indeterminate ? 'on' : 'off'}
              onChange={(v) => setForm((f) => ({ ...f, indeterminate: v === 'on', endDate: v === 'on' ? '' : f.endDate }))}
              off={{ value: 'off', label: 'Não' }}
              on={{ value: 'on', label: 'Sim' }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t.fields.billingType}</Label>
              <Select value={form.billingType} onValueChange={(v) => setForm((f) => ({ ...f, billingType: v as ContractBillingType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t.fields.billingTypeOptions.monthly}</SelectItem>
                  <SelectItem value="per_order">{t.fields.billingTypeOptions.per_order}</SelectItem>
                  <SelectItem value="hourly">{t.fields.billingTypeOptions.hourly}</SelectItem>
                  <SelectItem value="daily">{t.fields.billingTypeOptions.daily}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t.fields.amount}</Label>
              <Input value={form.amountStr} onChange={(e) => setForm((f) => ({ ...f, amountStr: maskCurrency(e.target.value) }))} placeholder={maskCurrency('0')} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t.fields.paymentDay}</Label>
              <NumericInput
                value={form.paymentDay}
                onValueChange={(v) => setForm((f) => ({ ...f, paymentDay: v }))}
                placeholder={t.fields.paymentDayPlaceholder}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t.fields.readjustmentPercent}</Label>
              <NumericInput
                value={form.readjustmentStr}
                onValueChange={(v) => setForm((f) => ({ ...f, readjustmentStr: v }))}
                decimal
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t.fields.notes}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}

function ContractVigenciaBadge({ contract, timezone }: { contract: EmployeeContract; timezone: string | null | undefined }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.form.contract.statusBadge;
  const { status, daysUntilEnd } = getContractVigencia(contract.end_date, timezone);
  const label = status === 'active' ? t.active : status === 'expired' ? t.expired : t.expiringSoon.replace('{days}', String(daysUntilEnd ?? 0));
  const colorClass = status === 'active' ? 'bg-emerald-600' : status === 'expired' ? 'bg-red-600' : 'bg-amber-500';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold text-white whitespace-nowrap ${colorClass}`}>
      {label}
    </span>
  );
}
