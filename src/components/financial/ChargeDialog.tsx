import { useMemo, useState, useEffect } from 'react';
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
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { EmptyState } from '@/components/mobile/EmptyState';
import { Loader2, Copy, Check, CheckCircle2, Users, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCustomers } from '@/hooks/useCustomers';
import {
  useTenantCharges,
  buildCheckoutUrl,
  type TenantChargeBillingType,
  type CreateChargeResult,
} from '@/hooks/useTenantCharges';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { buildWhatsAppLink } from '@/utils/shareLinks';
import { formatBRL } from '@/utils/currency';

interface ChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando informado, o select de cliente começa pré-preenchido com este ID. */
  presetCustomerId?: string;
  /** Quando true, o select de cliente fica travado (não editável) para manter
   *  o contexto do cliente que está sendo visualizado. */
  lockCustomer?: boolean;
}

// Meios de pagamento efetivos (respeitam as flags allow_* da conta).
type BillingMethod = TenantChargeBillingType;

/** Converte string com vírgula ou ponto para número float. Retorna NaN se inválido. */
function parseDecimalInput(v: string): number {
  return parseFloat(v.replace(',', '.'));
}

/** Data de hoje em ISO (yyyy-mm-dd) no fuso local, sem virar o dia por UTC. */
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function ChargeDialog({ open, onOpenChange, presetCustomerId, lockCustomer }: ChargeDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.cobrar;
  const { toast } = useToast();

  const { customers } = useCustomers();
  const { create } = useTenantCharges();
  const paymentAccount = useTenantPaymentAccount();

  // ── Defaults da conta ──────────────────────────────────────────────────────
  const {
    allowPix,
    allowBoleto,
    allowCard,
    defaultFinePercent,
    defaultInterestPercent,
    defaultDiscountPercent,
    defaultDiscountDays,
    defaultDescription,
    defaultMaxInstallments,
  } = paymentAccount;

  // ── Opções de método disponíveis ───────────────────────────────────────────
  const methodOptions = useMemo<{ value: BillingMethod; label: string }[]>(() => {
    const opts: { value: BillingMethod; label: string }[] = [];
    const enabledCount = [allowPix, allowBoleto, allowCard].filter(Boolean).length;
    if (enabledCount >= 2) {
      opts.push({ value: 'UNDEFINED', label: t.methods.customerChooses });
    }
    if (allowPix) opts.push({ value: 'PIX', label: t.methods.pix });
    if (allowBoleto) opts.push({ value: 'BOLETO', label: t.methods.boleto });
    if (allowCard) opts.push({ value: 'CREDIT_CARD', label: t.methods.card });
    // Garante ao menos uma opção mesmo se nenhum flag estiver configurado ainda.
    if (opts.length === 0) {
      opts.push({ value: 'UNDEFINED', label: t.methods.customerChooses });
    }
    return opts;
  }, [allowPix, allowBoleto, allowCard, t.methods]);

  // Estado do formulário
  const [customerId, setCustomerId] = useState(presetCustomerId ?? '');
  const [amount, setAmount] = useState(0); // em reais (número), máscara de centavos
  const [dueDate, setDueDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<BillingMethod>('UNDEFINED');
  const [installmentCount, setInstallmentCount] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Opções avançadas — inicializadas com o default da conta, editáveis por cobrança.
  const [finePercent, setFinePercent] = useState('');
  const [interestPercent, setInterestPercent] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountDays, setDiscountDays] = useState('');

  // Resultado (link gerado) — resultado normalizado da mutation
  const [result, setResult] = useState<CreateChargeResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Helper derivado do resultado normalizado
  const isOrphan = result?.orphan === true;

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  // Inicializa os campos avançados com os defaults da conta ao abrir o dialog.
  useEffect(() => {
    if (open) {
      setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
      setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
      setDiscountPercent(defaultDiscountPercent != null ? String(defaultDiscountPercent) : '');
      setDiscountDays(defaultDiscountDays != null ? String(defaultDiscountDays) : '');
      setDescription(defaultDescription ?? '');
    }
  }, [open, defaultFinePercent, defaultInterestPercent, defaultDiscountPercent, defaultDiscountDays, defaultDescription]);

  // Sincroniza o cliente pré-selecionado quando o dialog abre com novo preset.
  useEffect(() => {
    if (open && presetCustomerId) {
      setCustomerId(presetCustomerId);
    }
  }, [open, presetCustomerId]);

  // Sincroniza o método selecionado sempre que a lista de opções mudar (ex.: conta carregou).
  useEffect(() => {
    if (methodOptions.length > 0 && !methodOptions.find((o) => o.value === method)) {
      setMethod(methodOptions[0].value);
    }
  }, [methodOptions, method]);

  const resetForm = () => {
    setCustomerId(presetCustomerId ?? '');
    setAmount(0);
    setDueDate(todayISO());
    setDescription(defaultDescription ?? '');
    setMethod(methodOptions[0]?.value ?? 'UNDEFINED');
    setInstallmentCount(1);
    setShowAdvanced(false);
    setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
    setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
    setDiscountPercent(defaultDiscountPercent != null ? String(defaultDiscountPercent) : '');
    setDiscountDays(defaultDiscountDays != null ? String(defaultDiscountDays) : '');
    setResult(null);
    setCopied(false);
  };

  // URL exibida no bloco de resultado — checkout próprio no caso normal,
  // invoice_url do Asaas no caso órfão.
  const displayUrl = (() => {
    if (!result) return '';
    if (result.orphan === true) return result.invoiceUrl;
    if (result.orphan === false) {
      const { charge } = result;
      return charge.checkout_url || (charge.public_short_code ? buildCheckoutUrl(charge.public_short_code) : '');
    }
    return '';
  })();

  const handleClose = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  // Máscara de dinheiro (centavos): digita só dígitos, formata em reais.
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmount(parseInt(raw || '0', 10) / 100);
  };
  const amountDisplay = amount
    ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  // Opções de parcelas (1..defaultMaxInstallments).
  const installmentOptions = useMemo(() => {
    const max = Math.max(1, defaultMaxInstallments ?? 1);
    return Array.from({ length: max }, (_, i) => i + 1);
  }, [defaultMaxInstallments]);

  const handleSubmit = async () => {
    if (!customerId) {
      toast({ variant: 'destructive', title: t.validation.customerRequired });
      return;
    }
    if (!amount || amount <= 0) {
      toast({ variant: 'destructive', title: t.validation.valueRequired });
      return;
    }
    if (!dueDate) {
      toast({ variant: 'destructive', title: t.validation.dueDateRequired });
      return;
    }

    const parsedFine = parseDecimalInput(finePercent);
    const parsedInterest = parseDecimalInput(interestPercent);
    const parsedDiscount = parseDecimalInput(discountPercent);
    const parsedDiscountDays = parseInt(discountDays, 10);

    try {
      const chargeResult = await create.mutateAsync({
        customer_id: customerId,
        value: amount,
        due_date: dueDate,
        billing_type: method,
        description: description.trim() || undefined,
        fine_percent: isNaN(parsedFine) ? undefined : parsedFine,
        interest_percent: isNaN(parsedInterest) ? undefined : parsedInterest,
        discount_percent: isNaN(parsedDiscount) ? undefined : parsedDiscount,
        discount_days: isNaN(parsedDiscountDays) ? undefined : parsedDiscountDays,
        installment_count: method === 'CREDIT_CARD' && installmentCount > 1 ? installmentCount : undefined,
      });
      setResult(chargeResult);
      toast({ title: t.success.title, description: t.success.description });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t.dialogTitle,
        description: err instanceof Error ? err.message : t.error,
      });
    }
  };

  const handleCopy = async () => {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      toast({ title: t.success.copied });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API indisponível (contexto não-seguro, permissão negada) —
      // avisa o usuário para copiar manualmente.
      toast({ variant: 'destructive', title: t.copyFallback });
    }
  };

  const handleSendWhatsapp = () => {
    if (!result) return;
    // No caso órfão não há `charge`, usamos o `amount` do formulário (estado local).
    const chargeValue = result.orphan || !('charge' in result) ? amount : result.charge.value;
    const valueLabel = formatBRL(chargeValue);
    const descPart = description.trim() ? ` (${description.trim()})` : '';
    const message = `${t.whatsappMessage
      .replace('{value}', valueLabel)
      .replace('{description}', descPart)}\n${displayUrl}`;
    const phone = selectedCustomer?.celular || selectedCustomer?.phone || '';
    const link = buildWhatsAppLink(phone, message);
    // Sem telefone válido: abre o WhatsApp Web sem destinatário com o texto pronto.
    window.open(link ?? `https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleClose}
      title={t.dialogTitle}
      description={t.dialogDescription}
    >
      <div className="space-y-4 px-4 pb-4 sm:px-1">
        {!result ? (
          <>
            {/* Estado "sem clientes": orienta o usuário, não mostra select vazio */}
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
                // Travado: exibe o nome do cliente sem permitir troca.
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

            {/* Valor (máscara de dinheiro, NÃO NumericInput) */}
            <div className="space-y-2">
              <Label htmlFor="charge-amount" className="text-sm font-medium">
                {t.fields.value}
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  R$
                </span>
                <Input
                  id="charge-amount"
                  className="pl-9"
                  inputMode="numeric"
                  placeholder={t.fields.valuePlaceholder}
                  value={amountDisplay}
                  onChange={handleAmountChange}
                />
              </div>
            </div>

            {/* Vencimento */}
            <div className="space-y-2">
              <Label htmlFor="charge-due" className="text-sm font-medium">
                {t.fields.dueDate}
              </Label>
              <Input
                id="charge-due"
                type="date"
                value={dueDate}
                min={todayISO()}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {/* Forma de pagamento — só meios habilitados na conta */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t.fields.method}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as BillingMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methodOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parcelas — só visível quando cartão selecionado e há mais de 1 parcela */}
            {method === 'CREDIT_CARD' && installmentOptions.length > 1 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t.installments.label}</Label>
                <Select
                  value={String(installmentCount)}
                  onValueChange={(v) => setInstallmentCount(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {installmentOptions.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n === 1 ? t.installments.once : t.installments.times(n)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="charge-desc" className="text-sm font-medium">
                {t.fields.description}
              </Label>
              <Textarea
                id="charge-desc"
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
                <div className="space-y-3 border-t border-border px-3 pb-3 pt-3">
                  {/* Multa e Juros lado a lado */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="adv-fine" className="text-xs font-medium">
                        {t.advanced.finePercent}
                      </Label>
                      <Input
                        id="adv-fine"
                        inputMode="decimal"
                        placeholder="2"
                        value={finePercent}
                        onChange={(e) => setFinePercent(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="adv-interest" className="text-xs font-medium">
                        {t.advanced.interestPercent}
                      </Label>
                      <Input
                        id="adv-interest"
                        inputMode="decimal"
                        placeholder="1"
                        value={interestPercent}
                        onChange={(e) => setInterestPercent(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Desconto e Dias para desconto lado a lado */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="adv-discount" className="text-xs font-medium">
                        {t.advanced.discountPercent}
                      </Label>
                      <Input
                        id="adv-discount"
                        inputMode="decimal"
                        placeholder="0"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="adv-discount-days" className="text-xs font-medium">
                        {t.advanced.discountDays}
                      </Label>
                      <Input
                        id="adv-discount-days"
                        inputMode="numeric"
                        placeholder={t.advanced.discountDaysPlaceholder}
                        value={discountDays}
                        onChange={(e) => setDiscountDays(e.target.value.replace(/\D/g, ''))}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={create.isPending}>
                {t.cancel}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={create.isPending || !customerId || !amount || amount <= 0}
              >
                {create.isPending ? (
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
          </>
        ) : (
          /* ── Sucesso: link + copiar + WhatsApp ─────────────────────────── */
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="text-sm font-semibold">{t.success.title}</p>
            </div>

            {/* Aviso discreto no caso órfão (207): sem checkout próprio, usar invoice_url do Asaas */}
            {isOrphan && result ? (
              <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <p className="text-sm text-muted-foreground">
                  {result.orphan && result.warning ? result.warning : t.orphan.notice}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.success.description}</p>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {isOrphan ? t.orphan.linkLabel : t.success.linkLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={displayUrl} className="text-sm" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label={t.success.copy}
                  className="shrink-0"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button
                type="button"
                onClick={handleSendWhatsapp}
                className="bg-[#25D366] hover:bg-[#1fb955] text-white"
              >
                <WhatsAppIcon className="mr-2 h-4 w-4" />
                {t.success.sendWhatsapp}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                {t.success.newCharge}
              </Button>
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
                {t.success.close}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
