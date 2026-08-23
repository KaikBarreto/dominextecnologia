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
import { ChevronDown, ChevronUp, Copy, ExternalLink, Info, Loader2, Users } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import {
  useTenantSubscriptions,
  MethodNotEnabledError,
  type SubscriptionCycle,
  type SubscriptionBillingType,
  type PixAutoAuthorization,
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

/** Obtém o IP público do cliente para tokenização do cartão pela Asaas.
 * Se a requisição falhar (timeout, bloqueio), retorna string vazia — o edge
 * aceita remote_ip vazio e usa o IP do próprio request como fallback. */
async function fetchClientIp(): Promise<string> {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (!res.ok) return '';
    const json = await res.json() as { ip?: string };
    return json.ip ?? '';
  } catch {
    return '';
  }
}

/** Aplica máscara de cartão (grupos de 4 dígitos). */
function maskCardNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

/** Aplica máscara de validade MM/AA. */
function maskExpiry(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Garante que o qr_code tenha o prefixo base64 correto. */
function qrCodeSrc(qr: string): string {
  if (qr.startsWith('data:')) return qr;
  return `data:image/png;base64,${qr}`;
}

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
  const { createSubscription, authorizePixAuto } = useTenantSubscriptions();
  const paymentAccount = useTenantPaymentAccount();

  const { defaultFinePercent, defaultInterestPercent, cardRecurringEnabled, pixAutoEnabled } = paymentAccount;

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

  // ── Estado cartão recorrente (feature dormente) ───────────────────────────
  // INVARIANTE: estes campos nunca vão pro console/log.
  const [cardHolderName, setCardHolderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [holderFullName, setHolderFullName] = useState('');
  const [holderEmail, setHolderEmail] = useState('');
  const [holderCpfCnpj, setHolderCpfCnpj] = useState('');
  const [holderPostalCode, setHolderPostalCode] = useState('');
  const [holderAddressNumber, setHolderAddressNumber] = useState('');
  const [holderPhone, setHolderPhone] = useState('');

  // ── Estado Pix Automático (feature dormente) ──────────────────────────────
  const [pixAuth, setPixAuth] = useState<PixAutoAuthorization | null>(null);
  const [copiedPixAuto, setCopiedPixAuto] = useState(false);

  // ── Estado do painel "método não habilitado" ──────────────────────────────
  // Preenchido quando o edge devolve code=method_not_enabled (HTTP 409).
  const [methodNotEnabled, setMethodNotEnabled] = useState<'credit_card' | 'pix_auto' | null>(null);

  // Opções de forma de pagamento disponíveis
  const billingOptions = useMemo<{ value: SubscriptionBillingType; label: string }[]>(() => {
    const opts: { value: SubscriptionBillingType; label: string }[] = [];
    const { allowPix, allowBoleto } = paymentAccount;
    const enabledCount = [allowPix, allowBoleto].filter(Boolean).length;
    if (enabledCount >= 2) {
      opts.push({ value: 'UNDEFINED', label: t.billing_types.UNDEFINED });
    }
    if (allowPix) opts.push({ value: 'PIX', label: t.billing_types.PIX });
    if (allowBoleto) opts.push({ value: 'BOLETO', label: t.billing_types.BOLETO });
    // ── Opções dormentes — só aparecem quando o flag do tenant está ligado ──
    if (cardRecurringEnabled) {
      opts.push({ value: 'CREDIT_CARD', label: t.billing_types.CREDIT_CARD });
    }
    if (pixAutoEnabled) {
      opts.push({ value: 'PIX_AUTO' as SubscriptionBillingType, label: t.billing_types.PIX_AUTO });
    }
    if (opts.length === 0) {
      opts.push({ value: 'UNDEFINED', label: t.billing_types.UNDEFINED });
    }
    return opts;
  }, [paymentAccount, t.billing_types, cardRecurringEnabled, pixAutoEnabled]);

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
    // reset cartão (sem log)
    setCardHolderName('');
    setCardNumber('');
    setCardExpiry('');
    setCardCvv('');
    setHolderFullName('');
    setHolderEmail('');
    setHolderCpfCnpj('');
    setHolderPostalCode('');
    setHolderAddressNumber('');
    setHolderPhone('');
    // reset pix auto
    setPixAuth(null);
    setCopiedPixAuto(false);
    // reset painel de método não habilitado
    setMethodNotEnabled(null);
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

  // Verifica se o billingType selecionado é Pix Auto (sentinel string)
  const isPixAuto = billingType === ('PIX_AUTO' as SubscriptionBillingType);
  const isCreditCard = billingType === 'CREDIT_CARD';

  const handleSubmit = async () => {
    if (!customerId || !amount || amount <= 0) return;

    const parsedFine = parseFloat(finePercent.replace(',', '.'));
    const parsedInterest = parseFloat(interestPercent.replace(',', '.'));

    // ── Fluxo: Pix Automático ─────────────────────────────────────────────
    if (isPixAuto) {
      try {
        const auth = await authorizePixAuto.mutateAsync({
          customer_id: customerId,
          value: amount,
          cycle,
          next_due_date: firstDueDate,
          description: description.trim() || undefined,
          source_type: source?.type,
          source_id: source?.id,
        });
        setPixAuth(auth);
        // Não fecha o dialog — exibe o QR para o usuário.
      } catch (err) {
        if (err instanceof MethodNotEnabledError) {
          setMethodNotEnabled(err.method);
        }
        // Outros erros: toast já disparado pelo hook.
      }
      return;
    }

    // ── Fluxo: Cartão recorrente ──────────────────────────────────────────
    if (isCreditCard) {
      const expiryParts = cardExpiry.replace(/\D/g, '');
      const expiryMonth = expiryParts.slice(0, 2);
      const expiryYear = `20${expiryParts.slice(2, 4)}`;
      const remoteIp = await fetchClientIp();

      try {
        await createSubscription.mutateAsync({
          customer_id: customerId,
          value: amount,
          cycle,
          billing_type: 'CREDIT_CARD',
          next_due_date: firstDueDate || undefined,
          description: description.trim() || undefined,
          fine_percent: isNaN(parsedFine) ? undefined : parsedFine,
          interest_percent: isNaN(parsedInterest) ? undefined : parsedInterest,
          source_type: source?.type,
          source_id: source?.id,
          // INVARIANTE: dados do cartão nunca logados — enviados diretamente ao edge
          credit_card: {
            holderName: cardHolderName.trim(),
            number: cardNumber.replace(/\s/g, ''),
            expiryMonth,
            expiryYear,
            ccv: cardCvv.trim(),
          },
          credit_card_holder_info: {
            name: holderFullName.trim(),
            email: holderEmail.trim(),
            cpfCnpj: holderCpfCnpj.replace(/\D/g, ''),
            postalCode: holderPostalCode.replace(/\D/g, ''),
            addressNumber: holderAddressNumber.trim(),
            phone: holderPhone.replace(/\D/g, ''),
          },
          remote_ip: remoteIp,
        });
        // Toast disparado pelo hook — só fecha o dialog aqui.
        handleClose(false);
      } catch (err) {
        if (err instanceof MethodNotEnabledError) {
          setMethodNotEnabled(err.method);
        }
        // Outros erros: toast já disparado pelo hook.
      }
      return;
    }

    // ── Fluxo padrão: Pix / Boleto / Cliente escolhe (inalterado) ─────────
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

  const handleCopyPixAuto = async () => {
    if (!pixAuth) return;
    try {
      await navigator.clipboard.writeText(pixAuth.copy_paste);
      setCopiedPixAuto(true);
      setTimeout(() => setCopiedPixAuto(false), 2000);
    } catch {
      alert(t.pixAuto.copyFallback);
    }
  };

  const isPending = createSubscription.isPending || authorizePixAuto.isPending;
  const isSubmittingPixAuto = authorizePixAuto.isPending;
  const isValid = !!customerId && amount > 0;

  // Label do botão de submit
  const submitLabel = () => {
    if (isPending) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {isSubmittingPixAuto ? t.pixAuto.submitting : t.submitting}
        </>
      );
    }
    return t.submit;
  };

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
            {/* ── Estado: método não habilitado na conta Asaas (409) ──────── */}
            {methodNotEnabled ? (
              (() => {
                const tMne = t.methodNotEnabled;
                const isCard = methodNotEnabled === 'credit_card';
                const steps: string[] = isCard ? tMne.steps.card : tMne.steps.pixAuto;
                return (
                  <div className="space-y-4">
                    {/* Título */}
                    <p className="text-sm font-semibold text-foreground">
                      {isCard ? tMne.titleCard : tMne.titlePixAuto}
                    </p>

                    {/* Explicação */}
                    <p className="text-sm text-muted-foreground">{tMne.explanation}</p>

                    {/* Passo a passo — mesmo padrão do guia da chave Asaas em SettingsAsaasContent */}
                    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
                        {tMne.guideTitle}
                      </p>
                      <ol className="space-y-2.5">
                        {steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-xs text-muted-foreground leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Ações */}
                    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                      <Button
                        variant="outline"
                        onClick={() => setMethodNotEnabled(null)}
                      >
                        {tMne.understood}
                      </Button>
                      <Button
                        asChild
                      >
                        <a
                          href="https://www.asaas.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {tMne.openAsaas}
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })()
            ) : pixAuth ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-foreground">{t.pixAuto.sectionTitle}</p>
                <p className="text-xs text-muted-foreground">{t.pixAuto.authorized}</p>

                {/* Texto de consentimento — TODO(legal): revisar antes de habilitar */}
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {t.pixAuto.consentText(
                    amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    t.cycles[cycle],
                  )}
                </div>

                {/* QR Code */}
                <div className="flex justify-center">
                  <img
                    src={qrCodeSrc(pixAuth.qr_code)}
                    alt="QR Code Pix Automático"
                    className="h-48 w-48 rounded-md border border-border object-contain"
                  />
                </div>

                {/* Copia e cola */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t.pixAuto.copyPaste}</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={pixAuth.copy_paste}
                      className="truncate font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={handleCopyPixAuto}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      {copiedPixAuto ? t.pixAuto.copied : t.pixAuto.copy}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={() => handleClose(false)}>{t.cancel}</Button>
                </div>
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

                {/* ── Campos de cartão recorrente (feature dormente) ────────
                    Só renderiza quando billing_type=CREDIT_CARD E cardRecurringEnabled=true.
                    Com o flag false, a opção nem aparece no select — este bloco
                    nunca é exibido. */}
                {isCreditCard && cardRecurringEnabled && (
                  <div className="space-y-4 rounded-md border border-border p-3">
                    {/* Dados do cartão */}
                    <p className="text-sm font-medium text-foreground">{t.card.sectionTitle}</p>

                    <div className="space-y-2">
                      <Label htmlFor="card-holder-name" className="text-xs font-medium">
                        {t.card.holderName}
                      </Label>
                      <Input
                        id="card-holder-name"
                        autoComplete="cc-name"
                        placeholder={t.card.holderNamePlaceholder}
                        value={cardHolderName}
                        onChange={(e) => setCardHolderName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="card-number" className="text-xs font-medium">
                        {t.card.number}
                      </Label>
                      <Input
                        id="card-number"
                        autoComplete="cc-number"
                        inputMode="numeric"
                        placeholder={t.card.numberPlaceholder}
                        value={cardNumber}
                        onChange={(e) => setCardNumber(maskCardNumber(e.target.value))}
                        maxLength={19}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="card-expiry" className="text-xs font-medium">
                          {t.card.expiry}
                        </Label>
                        <Input
                          id="card-expiry"
                          autoComplete="cc-exp"
                          inputMode="numeric"
                          placeholder={t.card.expiryPlaceholder}
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(maskExpiry(e.target.value))}
                          maxLength={5}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="card-cvv" className="text-xs font-medium">
                          {t.card.cvv}
                        </Label>
                        <Input
                          id="card-cvv"
                          autoComplete="cc-csc"
                          inputMode="numeric"
                          placeholder={t.card.cvvPlaceholder}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          maxLength={4}
                        />
                      </div>
                    </div>

                    {/* Dados do titular */}
                    <p className="pt-2 text-sm font-medium text-foreground">{t.card.holderSectionTitle}</p>

                    <div className="space-y-2">
                      <Label htmlFor="holder-full-name" className="text-xs font-medium">
                        {t.card.holderFullName}
                      </Label>
                      <Input
                        id="holder-full-name"
                        autoComplete="name"
                        placeholder={t.card.holderFullNamePlaceholder}
                        value={holderFullName}
                        onChange={(e) => setHolderFullName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="holder-email" className="text-xs font-medium">
                        {t.card.holderEmail}
                      </Label>
                      <Input
                        id="holder-email"
                        type="email"
                        autoComplete="email"
                        placeholder={t.card.holderEmailPlaceholder}
                        value={holderEmail}
                        onChange={(e) => setHolderEmail(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="holder-cpfcnpj" className="text-xs font-medium">
                          {t.card.holderCpfCnpj}
                        </Label>
                        <Input
                          id="holder-cpfcnpj"
                          inputMode="numeric"
                          placeholder={t.card.holderCpfCnpjPlaceholder}
                          value={holderCpfCnpj}
                          onChange={(e) => setHolderCpfCnpj(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="holder-postal" className="text-xs font-medium">
                          {t.card.holderPostalCode}
                        </Label>
                        <Input
                          id="holder-postal"
                          inputMode="numeric"
                          placeholder={t.card.holderPostalCodePlaceholder}
                          value={holderPostalCode}
                          onChange={(e) => setHolderPostalCode(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="holder-addr-num" className="text-xs font-medium">
                          {t.card.holderAddressNumber}
                        </Label>
                        <Input
                          id="holder-addr-num"
                          placeholder={t.card.holderAddressNumberPlaceholder}
                          value={holderAddressNumber}
                          onChange={(e) => setHolderAddressNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="holder-phone" className="text-xs font-medium">
                          {t.card.holderPhone}
                        </Label>
                        <Input
                          id="holder-phone"
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
                          placeholder={t.card.holderPhonePlaceholder}
                          value={holderPhone}
                          onChange={(e) => setHolderPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Nota de segurança */}
                    <p className="text-xs text-muted-foreground">{t.card.securityNote}</p>
                  </div>
                )}

                {/* ── Texto de consentimento para Pix Automático (preview antes do submit) ──
                    Aparece só quando billing_type=PIX_AUTO E pixAutoEnabled=true.
                    Com o flag false, a opção nem aparece — este bloco nunca é exibido. */}
                {isPixAuto && pixAutoEnabled && (
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    {/* TODO(legal): revisar texto de consentimento (LGPD) antes de habilitar */}
                    {t.pixAuto.consentText(
                      amount > 0
                        ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—',
                      t.cycles[cycle],
                    )}
                  </div>
                )}

                {/* Opções avançadas (collapsible) — oculto no Pix Auto (sem multa/juros) */}
                {!isPixAuto && (
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
                )}

                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => handleClose(false)}
                    disabled={isPending}
                  >
                    {t.cancel}
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isPending || !isValid}
                  >
                    {submitLabel()}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
