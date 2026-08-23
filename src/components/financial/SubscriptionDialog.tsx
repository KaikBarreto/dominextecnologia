import { useState, useEffect, useMemo } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/mobile/EmptyState';
import { ChevronDown, ChevronUp, Loader2, Users } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import {
  useTenantSubscriptions,
  type SubscriptionCycle,
  type SubscriptionBillingType,
} from '@/hooks/useTenantSubscriptions';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pré-seleciona o cliente e trava o select quando combinado com lockCustomer. */
  presetCustomerId?: string;
  lockCustomer?: boolean;
  /** Ciclo inicial sugerido (usuário pode trocar). */
  presetCycle?: SubscriptionCycle;
  /** Descrição inicial sugerida. */
  presetDescription?: string;
  /** Origem da assinatura (ex: contrato). Enviada ao edge sem exposição ao usuário. */
  source?: { type: 'avulso' | 'contract' | 'quote'; id: string };
}

/** Data de hoje em ISO (yyyy-mm-dd), no fuso local. Evita bug de UTC/BRT. */
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

const CYCLES: SubscriptionCycle[] = [
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUALLY',
  'YEARLY',
];

export function SubscriptionDialog({
  open,
  onOpenChange,
  presetCustomerId,
  lockCustomer,
  presetCycle,
  presetDescription,
  source,
}: SubscriptionDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.subscriptions;

  const { customers } = useCustomers();
  const { createSubscription } = useTenantSubscriptions();
  const paymentAccount = useTenantPaymentAccount();

  const { defaultFinePercent, defaultInterestPercent } = paymentAccount;

  // ── Form state ─────────────────────────────────────────────────────────────
  const [customerId, setCustomerId] = useState(presetCustomerId ?? '');
  const [amount, setAmount] = useState(0);
  const [cycle, setCycle] = useState<SubscriptionCycle>(presetCycle ?? 'MONTHLY');
  const [billingType, setBillingType] = useState<SubscriptionBillingType>('UNDEFINED');
  const [firstDueDate, setFirstDueDate] = useState(todayISO());
  const [description, setDescription] = useState(presetDescription ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [finePercent, setFinePercent] = useState('');
  const [interestPercent, setInterestPercent] = useState('');

  // Opções de forma de pagamento disponíveis (PIX e Boleto — sem cartão p/ recorrência)
  const billingOptions = useMemo<{ value: SubscriptionBillingType; label: string }[]>(() => {
    const opts: { value: SubscriptionBillingType; label: string }[] = [];
    const { allowPix, allowBoleto } = paymentAccount;
    const enabledCount = [allowPix, allowBoleto].filter(Boolean).length;
    if (enabledCount >= 2) {
      opts.push({ value: 'UNDEFINED', label: t.billing_types.UNDEFINED });
    }
    if (allowPix) opts.push({ value: 'PIX', label: t.billing_types.PIX });
    if (allowBoleto) opts.push({ value: 'BOLETO', label: t.billing_types.BOLETO });
    if (opts.length === 0) {
      opts.push({ value: 'UNDEFINED', label: t.billing_types.UNDEFINED });
    }
    return opts;
  }, [paymentAccount, t.billing_types]);

  // Inicializa os defaults ao abrir
  useEffect(() => {
    if (open) {
      setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
      setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
    }
  }, [open, defaultFinePercent, defaultInterestPercent]);

  // Sincroniza cliente pré-selecionado
  useEffect(() => {
    if (open && presetCustomerId) {
      setCustomerId(presetCustomerId);
    }
  }, [open, presetCustomerId]);

  // Sincroniza ciclo e descrição sugeridos ao abrir
  useEffect(() => {
    if (open) {
      if (presetCycle) setCycle(presetCycle);
      if (presetDescription) setDescription(presetDescription);
    }
  }, [open, presetCycle, presetDescription]);

  // Sincroniza forma de pagamento quando opções carregam
  useEffect(() => {
    if (billingOptions.length > 0 && !billingOptions.find((o) => o.value === billingType)) {
      setBillingType(billingOptions[0].value);
    }
  }, [billingOptions, billingType]);

  const resetForm = () => {
    setCustomerId(presetCustomerId ?? '');
    setAmount(0);
    setCycle(presetCycle ?? 'MONTHLY');
    setBillingType(billingOptions[0]?.value ?? 'UNDEFINED');
    setFirstDueDate(todayISO());
    setDescription(presetDescription ?? '');
    setShowAdvanced(false);
    setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
    setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
  };

  const handleClose = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  // Máscara de dinheiro centavos (igual ChargeDialog — não usar NumericInput)
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmount(parseInt(raw || '0', 10) / 100);
  };
  const amountDisplay = amount
    ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const handleSubmit = async () => {
    if (!customerId || !amount || amount <= 0) return;

    const parsedFine = parseFloat(finePercent.replace(',', '.'));
    const parsedInterest = parseFloat(interestPercent.replace(',', '.'));

    await createSubscription.mutateAsync({
      customer_id: customerId,
      value: amount,
      cycle,
      billing_type: billingType,
      next_due_date: firstDueDate || undefined,
      description: description.trim() || undefined,
      fine_percent: isNaN(parsedFine) ? undefined : parsedFine,
      interest_percent: isNaN(parsedInterest) ? undefined : parsedInterest,
      source_type: source?.type,
      source_id: source?.id,
    });

    // Toast disparado pelo hook — só fecha o dialog aqui.
    handleClose(false);
  };

  const isValid = !!customerId && amount > 0;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleClose}
      title={t.dialogTitle}
      description={t.dialogDescription}
    >
      <div className="space-y-4 px-4 pb-4 sm:px-1">
        {customers.length === 0 ? (
          <div className="py-2">
            <EmptyState
              icon={<Users className="h-full w-full" />}
              title={t.noCustomers.title}
              description={t.noCustomers.description}
            />
          </div>
        ) : (
          <>
            {/* Cliente */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t.fields.customer}</Label>
              {lockCustomer && presetCustomerId ? (
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  {customers.find((c) => c.id === presetCustomerId)?.name ?? presetCustomerId}
                </div>
              ) : (
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.fields.customerPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Valor (máscara de dinheiro — NÃO NumericInput) */}
            <div className="space-y-2">
              <Label htmlFor="sub-amount" className="text-sm font-medium">
                {t.fields.value}
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  R$
                </span>
                <Input
                  id="sub-amount"
                  className="pl-9"
                  inputMode="numeric"
                  placeholder={t.fields.valuePlaceholder}
                  value={amountDisplay}
                  onChange={handleAmountChange}
                />
              </div>
            </div>

            {/* Frequência e Forma — grade 2 colunas no sm+ */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t.fields.cycle}</Label>
                <Select value={cycle} onValueChange={(v) => setCycle(v as SubscriptionCycle)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t.cycles[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">{t.fields.billing_type}</Label>
                <Select value={billingType} onValueChange={(v) => setBillingType(v as SubscriptionBillingType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {billingOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 1º vencimento */}
            <div className="space-y-2">
              <Label htmlFor="sub-due" className="text-sm font-medium">
                {t.fields.first_due_date}
              </Label>
              <Input
                id="sub-due"
                type="date"
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
              />
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="sub-desc" className="text-sm font-medium">
                {t.fields.description}
              </Label>
              <Textarea
                id="sub-desc"
                rows={2}
                placeholder={t.fields.descriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Opções avançadas (collapsible) */}
            <div className="rounded-md border border-border">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-foreground"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                <span>{t.advanced.toggle}</span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {showAdvanced && (
                <div className="grid grid-cols-2 gap-3 border-t border-border px-3 pb-3 pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-fine" className="text-xs font-medium">
                      {t.advanced.finePercent}
                    </Label>
                    <Input
                      id="sub-fine"
                      inputMode="decimal"
                      placeholder="2"
                      value={finePercent}
                      onChange={(e) => setFinePercent(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sub-interest" className="text-xs font-medium">
                      {t.advanced.interestPercent}
                    </Label>
                    <Input
                      id="sub-interest"
                      inputMode="decimal"
                      placeholder="1"
                      value={interestPercent}
                      onChange={(e) => setInterestPercent(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={createSubscription.isPending}
              >
                {t.cancel}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createSubscription.isPending || !isValid}
              >
                {createSubscription.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.submitting}
                  </>
                ) : (
                  t.submit
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
