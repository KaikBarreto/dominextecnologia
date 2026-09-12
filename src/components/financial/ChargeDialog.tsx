import { useMemo, useState, useEffect } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { formatMoney, formatDate, toBcp47 } from '@/lib/format';
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
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Switch } from '@/components/ui/switch';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { CategorySelectField } from '@/components/financial/CategorySelectField';
import { BrandedQRCode } from '@/components/BrandedQRCode';
import { useBrandedQrConfig } from '@/hooks/useBrandedQrConfig';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { Loader2, Copy, Check, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Calculator, UserCog } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCustomers, type CustomerInput } from '@/hooks/useCustomers';
import {
  useTenantCharges,
  buildCheckoutUrl,
  type TenantChargeBillingType,
  type CreateChargeResult,
} from '@/hooks/useTenantCharges';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { useTenantFees } from '@/hooks/useTenantCardFees';
import {
  simulateNetAmount,
  type PaymentMethod as SimulatorMethod,
  type SimulationResult,
  type SimulatorFees,
} from '@/lib/asaasFeeSimulator';
import { getDocumentStatus } from '@/lib/documentValidation';
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
  /** Pré-preenche o campo de valor (em reais). */
  presetAmount?: number;
  /** Pré-preenche o campo de descrição. */
  presetDescription?: string;
  /** Origem da cobrança (repassada ao edge). Quando informada, flui para
   *  createCharge como source_type + source_id (dedupe ativo para 'quote'). */
  source?: { type: 'quote'; id: string };
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

/**
 * Quantos dias faltam de hoje até `iso` (yyyy-mm-dd). Comparação dia-a-dia em
 * UTC a partir dos componentes da data local — nunca vira o dia por fuso.
 * Nunca negativo (vencimento no passado conta como hoje).
 */
function daysFromToday(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return 0;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((target - today) / 86400000));
}

/** Meio de pagamento da cobrança → meio entendido pelo simulador de taxas. */
const METHOD_TO_SIMULATOR: Record<Exclude<BillingMethod, 'UNDEFINED'>, SimulatorMethod> = {
  PIX: 'pix',
  BOLETO: 'boleto',
  CREDIT_CARD: 'card',
};

export function ChargeDialog({ open, onOpenChange, presetCustomerId, lockCustomer, presetAmount, presetDescription, source }: ChargeDialogProps) {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.cobrar;
  const { toast } = useToast();

  const { customers, updateCustomer } = useCustomers();
  const { create } = useTenantCharges();
  const paymentAccount = useTenantPaymentAccount();
  // Personalização do QR (logo do tenant white-label + estilo/cor das settings).
  const qrConfig = useBrandedQrConfig();

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
  // Categoria do recebível gerado no Financeiro. Vazia = usa o default da conta.
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState<BillingMethod>('UNDEFINED');
  const [installmentCount, setInstallmentCount] = useState(1);
  // Quem paga a taxa do cartão: 'company' (empresa absorve) ou 'customer'
  // (repasse ao cliente — o total é inflado no servidor pela taxa real do Asaas).
  const [feePayer, setFeePayer] = useState<'company' | 'customer'>('company');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Taxas EFETIVAS da conta Asaas do tenant (cartão, Pix, boleto, antecipação
  // e prazos), usadas para o RESUMO do líquido e para o default de quem paga a
  // taxa. O cálculo autoritativo do repasse roda no edge de criação — aqui é
  // estimativa mostrada ao usuário antes de gerar a cobrança.
  const {
    card: cardFees,
    pix: pixFee,
    bankSlip: bankSlipFee,
    anticipation: anticipationFee,
    settlementDays: accountSettlementDays,
    source: cardFeesSource,
    extrasSource: feeExtrasSource,
    feePayerDefault,
    isLoading: feesLoading,
  } = useTenantFees({ enabled: open });

  const tenantFees = useMemo<SimulatorFees | null>(() => {
    if (!cardFees) return null;
    return {
      card: cardFees,
      pix: pixFee,
      bankSlip: bankSlipFee,
      anticipation: anticipationFee,
      settlementDays: accountSettlementDays,
    };
  }, [cardFees, pixFee, bankSlipFee, anticipationFee, accountSettlementDays]);

  // Simular a antecipação do recebimento (dinheiro em ~1 dia, com custo).
  // É só simulação: nada disso é enviado ao edge, a antecipação é contratada
  // dentro da Asaas.
  const [anticipate, setAnticipate] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // Edição do cadastro do cliente sem sair da cobrança (CPF/CNPJ faltando).
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);

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
  // Quando presetAmount ou presetDescription são fornecidos (ex.: orçamento),
  // eles têm prioridade sobre os defaults da conta.
  useEffect(() => {
    if (open) {
      setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
      setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
      setDiscountPercent(defaultDiscountPercent != null ? String(defaultDiscountPercent) : '');
      setDiscountDays(defaultDiscountDays != null ? String(defaultDiscountDays) : '');
      setDescription(presetDescription ?? defaultDescription ?? '');
      setCategory('');
      if (presetAmount != null && presetAmount > 0) {
        setAmount(presetAmount);
      }
    }
  }, [open, defaultFinePercent, defaultInterestPercent, defaultDiscountPercent, defaultDiscountDays, defaultDescription, presetAmount, presetDescription]);

  // Sincroniza o cliente pré-selecionado quando o dialog abre com novo preset.
  useEffect(() => {
    if (open && presetCustomerId) {
      setCustomerId(presetCustomerId);
    }
  }, [open, presetCustomerId]);

  // Inicializa o "quem paga a taxa" com o default da conta ao abrir o dialog.
  useEffect(() => {
    if (open) {
      setFeePayer(feePayerDefault === 'customer' ? 'customer' : 'company');
    }
  }, [open, feePayerDefault]);

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
    setCategory('');
    setMethod(methodOptions[0]?.value ?? 'UNDEFINED');
    setInstallmentCount(1);
    setFeePayer(feePayerDefault === 'customer' ? 'customer' : 'company');
    setAnticipate(false);
    setShowSchedule(false);
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
  //
  // No caso normal usamos SEMPRE a URL COMPLETA via buildCheckoutUrl(short_code)
  // (https://dominex.app/pagar/<code>). O `charge.checkout_url` do edge vem
  // RELATIVO ('/pagar/<code>'), que não funciona ao copiar/compartilhar — por isso
  // NÃO o usamos aqui. O invoice_url do Asaas (caso órfão) já é URL completa.
  const displayUrl = (() => {
    if (!result) return '';
    if (result.orphan === true) return result.invoiceUrl;
    if (result.orphan === false) {
      const { charge } = result;
      return charge.public_short_code ? buildCheckoutUrl(charge.public_short_code) : '';
    }
    return '';
  })();

  // ── Documento do cliente (CPF/CNPJ) ────────────────────────────────────────
  // A Asaas EXIGE CPF/CNPJ para emitir a cobrança. O edge é quem valida de
  // verdade (`ensureAsaasCustomer`); aqui avisamos antes, para o usuário não
  // preencher tudo e só descobrir o problema no "Gerar cobrança".
  const documentStatus = useMemo(
    () => (selectedCustomer ? getDocumentStatus(selectedCustomer.document) : null),
    [selectedCustomer],
  );
  const documentBlocked = documentStatus === 'missing' || documentStatus === 'invalid';
  const documentMessage = useMemo(() => {
    if (!selectedCustomer || !documentBlocked) return null;
    const name = selectedCustomer.name;
    return documentStatus === 'missing'
      ? t.missingDocument.missing(name)
      : t.missingDocument.invalid(name);
  }, [selectedCustomer, documentBlocked, documentStatus, t.missingDocument]);

  // ── Resumo do líquido (estimativa) ─────────────────────────────────────────
  // Fórmula ÚNICA do front: src/lib/asaasFeeSimulator.ts (o mesmo helper do
  // Simulador de venda em Ajustes). O número contratual continua sendo o do
  // edge `tenant-asaas-create-charge`, que recalcula com a taxa real.
  const dueDays = useMemo(() => daysFromToday(dueDate), [dueDate]);

  const simulatorMethod: SimulatorMethod | null =
    method === 'UNDEFINED' ? null : METHOD_TO_SIMULATOR[method];

  const simulation = useMemo<SimulationResult | null>(() => {
    if (!simulatorMethod || !tenantFees || amount <= 0) return null;
    return simulateNetAmount({
      amount,
      method: simulatorMethod,
      installments: simulatorMethod === 'card' ? installmentCount : 1,
      // Repasse ao cliente só existe no cartão (é o que o edge faz); nos demais
      // meios a empresa sempre absorve a taxa.
      feePayer: simulatorMethod === 'card' ? feePayer : 'company',
      fees: tenantFees,
      anticipate,
      dueDays,
    });
  }, [simulatorMethod, tenantFees, amount, installmentCount, feePayer, anticipate, dueDays]);

  // Antecipação efetivamente aplicada nesta simulação (toggle ligado E o
  // simulador conseguiu calcular um custo). Muda o rótulo/prazo/expander do
  // resumo: com antecipação a empresa recebe tudo numa data só, então o
  // cronograma que faz sentido mostrar é o que o CLIENTE paga, não o crédito
  // (que virou 1 linha).
  const isAnticipated = anticipate && simulation?.anticipationCost != null;

  // "Cliente escolhe": não dá para saber a taxa antes, então mostramos quanto
  // sobra em cada meio habilitado (cartão sempre à vista aqui).
  const multiSimulation = useMemo(() => {
    if (method !== 'UNDEFINED' || !tenantFees || amount <= 0) return null;
    const run = (m: SimulatorMethod) =>
      simulateNetAmount({
        amount,
        method: m,
        installments: 1,
        feePayer: 'company',
        fees: tenantFees,
        anticipate: false,
        dueDays,
      });
    const rows: { key: string; label: string; result: SimulationResult }[] = [];
    if (allowPix) rows.push({ key: 'pix', label: t.methods.pix, result: run('pix') });
    if (allowBoleto) rows.push({ key: 'boleto', label: t.methods.boleto, result: run('boleto') });
    if (allowCard) rows.push({ key: 'card', label: t.net.chooseCardLabel, result: run('card') });
    return rows.length > 0 ? rows : null;
  }, [method, tenantFees, amount, dueDays, allowPix, allowBoleto, allowCard, t.methods, t.net]);

  // Alguma taxa mostrada NÃO veio da conta do tenant (caiu na tabela de
  // referência). Nesse caso o número é aproximado e a UI tem que dizer isso.
  // A procedência é olhada por meio de pagamento: cartão tem fonte própria
  // (`source`), Pix/boleto/antecipação vêm de `extrasSource`.
  const feesAreReference =
    (simulatorMethod === 'card'
      ? cardFeesSource === 'fallback'
      : simulatorMethod != null
        ? feeExtrasSource === 'fallback'
        : cardFeesSource === 'fallback' || feeExtrasSource === 'fallback') ||
    simulation?.usedReferenceFees === true ||
    multiSimulation?.some((r) => r.result.usedReferenceFees) === true;

  const money = (v: number) => formatMoney(v, 'BRL', locale);
  const percentLabel = (v: number) => {
    try {
      return `${v.toLocaleString(toBcp47(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    } catch {
      return `${v.toFixed(2)}%`;
    }
  };

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
    // Espelho do gate do edge: sem CPF/CNPJ válido a Asaas recusa a cobrança.
    // Evita uma ida à edge só para receber o erro de volta.
    if (documentBlocked && documentMessage) {
      toast({ variant: 'destructive', title: documentMessage });
      return;
    }

    const parsedFine = parseDecimalInput(finePercent);
    const parsedInterest = parseDecimalInput(interestPercent);
    const parsedDiscount = parseDecimalInput(discountPercent);
    const parsedDiscountDays = parseInt(discountDays, 10);

    try {
      const chargeResult = await create.mutateAsync({
        customer_id: customerId,
        // Valor ORIGINAL — o repasse de taxa (quando cliente paga) é calculado
        // no servidor com a taxa real do Asaas. Nunca inflamos no client.
        value: amount,
        due_date: dueDate,
        billing_type: method,
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        fine_percent: isNaN(parsedFine) ? undefined : parsedFine,
        interest_percent: isNaN(parsedInterest) ? undefined : parsedInterest,
        discount_percent: isNaN(parsedDiscount) ? undefined : parsedDiscount,
        discount_days: isNaN(parsedDiscountDays) ? undefined : parsedDiscountDays,
        installment_count: method === 'CREDIT_CARD' && installmentCount > 1 ? installmentCount : undefined,
        // Quem paga a taxa — só faz sentido no cartão; o edge ignora nos demais.
        fee_payer: method === 'CREDIT_CARD' ? feePayer : undefined,
        // Origem da cobrança: ativa dedupe no edge quando source_type='quote'.
        source_type: source?.type,
        source_id: source?.id ?? null,
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
            {/* Cliente */}
            <div className="space-y-2">
              <Label htmlFor="charge-customer" className="text-sm font-medium">
                {t.fields.customer}
              </Label>
              {lockCustomer && presetCustomerId ? (
                // Travado: exibe o nome do cliente sem permitir troca.
                // Quando 0 clientes E travado, este branch nunca renderiza
                // (presetCustomerId virá do contexto que abriu o dialog).
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  {customers.find((c) => c.id === presetCustomerId)?.name ?? presetCustomerId}
                </div>
              ) : (
                // Combobox com busca + botão "+" dentro da borda (padrão do
                // sistema). requireDocument: a Asaas exige CPF/CNPJ para emitir.
                <CustomerSelectField
                  id="charge-customer"
                  value={customerId}
                  onValueChange={setCustomerId}
                  customers={customers}
                  requireDocument
                  placeholder={t.fields.customerPlaceholder}
                  searchPlaceholder={t.quickCustomer.searchPlaceholder}
                />
              )}

              {/* Cliente sem CPF/CNPJ (ou com documento errado): avisa AQUI e
                  deixa completar o cadastro sem perder o que já foi preenchido.
                  Vale também no modo travado (cobrança vinda de um orçamento). */}
              {documentBlocked && documentMessage && (
                <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <p className="text-xs leading-snug text-foreground">{documentMessage}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 bg-warning text-warning-foreground hover:bg-warning/90"
                    onClick={() => setEditCustomerOpen(true)}
                  >
                    <UserCog className="mr-2 h-4 w-4" />
                    {t.missingDocument.cta}
                  </Button>
                </div>
              )}
            </div>

            {/* Cadastro completo do cliente selecionado — abre por cima da
                cobrança e, ao salvar, o aviso some sozinho (a lista de clientes
                é invalidada pelo hook). Nada do formulário de cobrança se perde. */}
            {selectedCustomer && (
              <CustomerFormDialog
                open={editCustomerOpen}
                onOpenChange={setEditCustomerOpen}
                customer={selectedCustomer}
                onSubmit={async (data) => {
                  // O form já validou os campos (zod); o cast só reconcilia o
                  // tipo inferido do resolver com o input do hook.
                  await updateCustomer.mutateAsync({ ...(data as CustomerInput), id: selectedCustomer.id });
                }}
                isLoading={updateCustomer.isPending}
              />
            )}

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
                <div className="flex items-baseline justify-between gap-2">
                  <Label className="text-sm font-medium">{t.installments.label}</Label>
                  <span className="text-xs text-muted-foreground">{t.installments.hint}</span>
                </div>
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

            {/* Quem paga a taxa do cartão. Vale em QUALQUER cobrança de cartão
                (inclusive à vista): o edge aplica o repasse sempre que
                billingType = CREDIT_CARD, então esconder no 1x escondia um
                repasse que acontecia mesmo assim. O efeito no dinheiro aparece
                logo abaixo, no resumo do recebimento. */}
            {method === 'CREDIT_CARD' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t.installments.feePayerLabel}</Label>
                <SegmentedControl
                  options={[
                    { value: 'company' as const, label: t.installments.feePayerCompany },
                    { value: 'customer' as const, label: t.installments.feePayerCustomer },
                  ]}
                  value={feePayer}
                  onValueChange={(v) => setFeePayer(v)}
                  aria-label={t.installments.feePayerLabel}
                />
                <p className="text-xs text-muted-foreground">
                  {feePayer === 'customer'
                    ? t.installments.feePayerCustomerHint
                    : t.installments.feePayerCompanyHint}
                </p>
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

            {/* Categoria do recebível no Financeiro — opcional, sobrescreve o
                default da conta de recebimento quando escolhida. */}
            <div className="space-y-2">
              <Label htmlFor="charge-category" className="text-sm font-medium">
                {t.fields.category}
              </Label>
              <CategorySelectField
                id="charge-category"
                type="entrada"
                value={category}
                onValueChange={setCategory}
              />
              <p className="text-xs text-muted-foreground">{t.fields.categoryHint}</p>
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

                  {/* Desconto e Dias para desconto: empilhado no mobile, lado a lado em sm+ */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      <Label htmlFor="adv-discount-days" className="text-xs font-medium leading-snug">
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

            {/* ── Resumo do recebimento (ESTIMATIVA) ──────────────────────────
                Mostra quanto sobra depois da taxa da Asaas, quando o dinheiro
                cai e o custo da antecipação. O cálculo é do simulador do front;
                o valor contratual é recalculado no edge ao gerar a cobrança. */}
            {amount > 0 && (
              <div className="space-y-2.5 rounded-md border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">{t.net.title}</p>
                </div>

                {feesLoading && !tenantFees ? (
                  <p className="text-xs text-muted-foreground">{t.net.loading}</p>
                ) : !tenantFees ? (
                  <p className="text-xs text-muted-foreground">{t.net.fallbackWarning}</p>
                ) : (
                  <>
                    {/* Taxa não veio da conta do tenant: o número é referência,
                        e o usuário precisa saber disso antes de confiar nele. */}
                    {feesAreReference && (
                      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <p className="text-xs leading-snug text-foreground">{t.net.fallbackWarning}</p>
                      </div>
                    )}

                    {simulation && (
                      <>
                        <dl className="space-y-1.5 text-sm">
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-muted-foreground">
                              {simulation.feePassedOn > 0 ? t.net.targetNet : t.net.gross}
                            </dt>
                            <dd className="font-medium tabular-nums text-foreground">{money(amount)}</dd>
                          </div>

                          {/* Repasse ao cliente: o que ele paga a mais e o total dele. */}
                          {simulation.feePassedOn > 0 && (
                            <>
                              <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-muted-foreground">{t.net.feePassedOn}</dt>
                                <dd className="font-medium tabular-nums text-foreground">
                                  + {money(simulation.feePassedOn)}
                                </dd>
                              </div>
                              <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-muted-foreground">{t.net.customerPays}</dt>
                                <dd className="font-medium tabular-nums text-foreground">{money(simulation.gross)}</dd>
                              </div>
                            </>
                          )}

                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-muted-foreground">
                              {t.net.fee}
                              <span className="block text-[11px] leading-snug text-muted-foreground">
                                {simulation.feeBreakdown.percent > 0
                                  ? t.net.feeComposition(
                                      percentLabel(simulation.feeBreakdown.percent),
                                      money(simulation.feeBreakdown.fixed),
                                    )
                                  : t.net.feeFixedOnly(money(simulation.feeBreakdown.fixed))}
                              </span>
                            </dt>
                            <dd className="font-medium tabular-nums text-destructive">
                              - {money(simulation.feeTotal)}
                            </dd>
                          </div>

                          {simulation.anticipationCost != null && simulation.anticipationCost > 0 && (
                            <div className="flex items-baseline justify-between gap-3">
                              <dt className="text-muted-foreground">{t.net.anticipationCost}</dt>
                              <dd className="font-medium tabular-nums text-destructive">
                                - {money(simulation.anticipationCost)}
                              </dd>
                            </div>
                          )}

                          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                            <dt className="font-semibold text-foreground">
                              {isAnticipated ? t.net.netAtOnce : t.net.net}
                            </dt>
                            <dd className="text-base font-bold tabular-nums text-success">
                              {money(simulation.netAfterAnticipation)}
                            </dd>
                          </div>
                        </dl>

                        {simulation.installmentValue != null && (
                          <p className="text-xs text-muted-foreground">
                            {t.net.installmentLine(simulation.installments, money(simulation.installmentValue))}
                          </p>
                        )}

                        <p className="text-xs text-muted-foreground">
                          {isAnticipated
                            ? simulation.settlementDays <= 0
                              ? t.net.settlementAnticipatedNow
                              : t.net.settlementAnticipatedTotal(
                                  simulation.settlementDays,
                                  formatDate(simulation.settlementDate, locale, timezone, { weekday: 'short' }),
                                )
                            : simulation.installments > 1
                              ? t.net.settlementFirstInstallment(
                                  simulation.settlementDays,
                                  formatDate(simulation.settlementDate, locale, timezone, { weekday: 'short' }),
                                )
                              : simulation.settlementDays <= 0
                                ? t.net.settlementToday
                                : t.net.settlementDays(
                                    simulation.settlementDays,
                                    formatDate(simulation.settlementDate, locale, timezone, { weekday: 'short' }),
                                  )}
                        </p>

                        {/* Regra de dia útil, sempre visível quando o prazo não
                            é "na hora": o cliente pediu que a regra apareça
                            escrita, não só quando calha de rolar por fim de
                            semana/feriado. */}
                        {simulation.settlementDays > 0 && (
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            {t.net.settlementBusinessDayNote}
                          </p>
                        )}

                        {/* Sem antecipação: quando cada parcela cai na conta da
                            empresa. Com antecipação, a empresa recebe tudo numa
                            data só — o que faz sentido detalhar é o que o
                            CLIENTE paga por mês. */}
                        {(() => {
                          const scheduleList = isAnticipated ? simulation.customerSchedule : simulation.scheduleDetailed;
                          if (scheduleList.length <= 1) return null;
                          const showLabel = isAnticipated ? t.net.customerScheduleShow : t.net.scheduleShow;
                          const hideLabel = isAnticipated ? t.net.customerScheduleHide : t.net.scheduleHide;
                          const itemLabel = isAnticipated ? t.net.customerScheduleItem : t.net.scheduleItem;
                          return (
                            <div>
                              <button
                                type="button"
                                className="flex items-center gap-1 text-xs font-medium text-primary"
                                onClick={() => setShowSchedule((v) => !v)}
                              >
                                {showSchedule ? hideLabel : showLabel}
                                {showSchedule ? (
                                  <ChevronUp className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5" />
                                )}
                              </button>
                              {showSchedule && (
                                <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-md bg-background p-2">
                                  {scheduleList.map((item) => (
                                    <li
                                      key={item.installmentNumber}
                                      className="flex items-baseline justify-between gap-3 text-xs"
                                    >
                                      <span className="text-muted-foreground">
                                        {itemLabel(
                                          item.installmentNumber,
                                          formatDate(item.date, locale, timezone),
                                        )}
                                      </span>
                                      <span className="font-medium tabular-nums text-foreground">
                                        {money(item.amount)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })()}

                        {/* Antecipação: SIMULAÇÃO. Nada é enviado ao Asaas por
                            aqui, a antecipação é contratada lá dentro. */}
                        {(simulatorMethod === 'card' || simulatorMethod === 'boleto') && (
                          <div className="flex items-start gap-2.5 border-t border-border pt-2.5">
                            <Switch
                              id="charge-anticipate"
                              checked={anticipate}
                              onCheckedChange={setAnticipate}
                              className="mt-0.5"
                            />
                            <Label htmlFor="charge-anticipate" className="cursor-pointer">
                              <span className="block text-xs font-medium text-foreground">
                                {t.net.anticipateLabel}
                              </span>
                              <span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted-foreground">
                                {t.net.anticipateHint}
                              </span>
                            </Label>
                          </div>
                        )}
                      </>
                    )}

                    {/* "Cliente escolhe": líquido de cada meio habilitado. */}
                    {multiSimulation && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">{t.net.chooseTitle}</p>
                        <dl className="space-y-1 text-sm">
                          {multiSimulation.map((row) => (
                            <div key={row.key} className="flex items-baseline justify-between gap-3">
                              <dt className="text-muted-foreground">{row.label}</dt>
                              <dd className="font-semibold tabular-nums text-success">
                                {money(row.result.net)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    )}

                    <p className="text-[11px] leading-snug text-muted-foreground">{t.net.estimate}</p>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={create.isPending}>
                {t.cancel}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={create.isPending || !customerId || !amount || amount <= 0 || documentBlocked}
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

            {/* QR do link de pagamento — o dono mostra a tela pro cliente escanear
                e pagar na hora. Personalização (logo/estilo) vem do tenant via
                useBrandedQrConfig (white-label). Serve tanto no caso normal quanto
                órfão, pois ambos têm URL completa e funcional.
                allowPlatformLogoFallback=false: é artefato de PAGAMENTO — sem
                logo do tenant, QR fica limpo (nunca a marca da plataforma). */}
            {displayUrl && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-white p-4">
                <BrandedQRCode
                  value={displayUrl}
                  size={170}
                  logoUrl={qrConfig.logoUrl}
                  dotStyle={qrConfig.dotStyle}
                  cornerStyle={qrConfig.cornerStyle}
                  color={qrConfig.color}
                  allowPlatformLogoFallback={false}
                />
                <p className="text-xs font-medium text-muted-foreground">{t.success.qrCaption}</p>
              </div>
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
