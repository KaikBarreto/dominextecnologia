import { useMemo, useState, useEffect, useRef } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { formatMoney, formatDate, toBcp47 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { Button } from '@/components/ui/button';
import { ServiceOrderSelectField } from '@/components/service-orders/ServiceOrderSelectField';
import { useServiceOrderOptions } from '@/hooks/useServiceOrderOptions';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/DatePicker';
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
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { CategorySelectField } from '@/components/financial/CategorySelectField';
import { CostCenterSelect } from '@/components/financial/CostCenterSelect';
import { useCostCenters } from '@/hooks/useCostCenters';
import { BrandedQRCode } from '@/components/BrandedQRCode';
import { useBrandedQrConfig } from '@/hooks/useBrandedQrConfig';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { Loader2, Copy, Check, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Calculator, UserCog, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCustomers, type CustomerInput } from '@/hooks/useCustomers';
import { useCustomerContacts } from '@/hooks/useCustomerContacts';
import {
  resolveCustomerWhatsappRecipients,
  type CustomerWhatsappRecipientCandidate,
  useCustomerWhatsappRoutes,
} from '@/hooks/useCustomerWhatsappRoutes';
import {
  useTenantCharges,
  buildCheckoutUrl,
  CreateChargeApiError,
  type TenantChargeBillingType,
  type CreateChargeResult,
  type CreateInstallmentBatchInput,
  type CreateInstallmentBatchResult,
} from '@/hooks/useTenantCharges';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { useTenantFees } from '@/hooks/useTenantCardFees';
import {
  simulateNetAmount,
  type PaymentMethod as SimulatorMethod,
  type SimulationResult,
  type SimulatorFees,
} from '@/lib/asaasFeeSimulator';
import {
  computeCustomerAmounts,
  LATE_SCENARIO_DAYS,
  type ChargeFineType,
} from '@/lib/chargeCustomerAmounts';
import { getDocumentStatus } from '@/lib/documentValidation';
import { buildWhatsAppLink } from '@/utils/shareLinks';
import { formatBRL } from '@/utils/currency';
import { readPastedCents } from '@/lib/money-paste-mask';
import { buildInstallmentPlan } from '@/lib/finance-installments';
import { todayInTz } from '@/lib/timezone';

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
  /** Pré-preenche o vencimento (yyyy-mm-dd). Ausente → hoje. */
  presetDueDate?: string;
  /** Origem da cobrança (repassada ao edge). Quando informada, flui para
   *  createCharge como source_type + source_id (dedupe ativo para 'quote' e
   *  'contract_installment').
   *
   *  'contract_installment' muda a tela em dois pontos, porque o servidor
   *  impõe o resto:
   *    · o VALOR é o da parcela e não pode ser editado (a edge recusa valor
   *      diferente; e cobrar menos daria baixa na parcela inteira);
   *    · não existe a opção "lançar no financeiro": o lançamento é a própria
   *      parcela do contrato, que a cobrança só passa a acompanhar.
   *
   *  'receivable' é o "COBRAR O SALDO" de uma conta a receber que JÁ EXISTE
   *  (chamado de 21/10/2026): muda a tela nos MESMOS dois pontos da parcela de
   *  contrato, e pela mesma razão — o servidor impõe o resto:
   *    · o VALOR é o SALDO em aberto da conta e não pode ser editado (a edge
   *      recusa qualquer outro valor, com tolerância de 1 centavo; é esse
   *      invariante que deixa a baixa parcial ser confiável);
   *    · não existe a opção "lançar no financeiro": o lançamento é a própria
   *      conta, que a cobrança só passa a acompanhar. */
  source?: { type: 'quote' | 'contract_installment' | 'service_order' | 'receivable'; id: string };
  /** Chamado depois de criar a cobrança com sucesso (normal OU órfã — os dois
   *  já existem no Asaas). Quem chama usa isto pra invalidar os PRÓPRIOS
   *  caches que não têm nada a ver com `useTenantCharges` (ex.: o estado de
   *  faturamento da OS em `OsBillingDialog`). As invalidações genéricas de
   *  Financeiro já saem de `useTenantCharges().create` — isto aqui é só o
   *  complemento específico de quem chama. */
  onCreated?: (result: CreateChargeResult) => void;
  /**
   * Chamado quando a edge recusa a criação porque JÁ EXISTE cobrança viva
   * ligada à origem (`error_code = 'live_charge_exists'`, só acontece com
   * `source.type = 'receivable'`).
   *
   * Por que devolver pro chamador em vez de resolver aqui: quem decide
   * cancelar a cobrança atual é o gestor, com os dois valores na frente, e a
   * substituição é de DOIS PASSOS (delete e só depois create). A edge de
   * criação nunca mata cobrança por conta própria. Sem este callback, o erro
   * vira só um toast e o usuário fica sem saída na tela.
   */
  onLiveChargeConflict?: (error: CreateChargeApiError) => void;
}

// Meios de pagamento efetivos (respeitam as flags allow_* da conta).
type BillingMethod = TenantChargeBillingType;

const WHATSAPP_RECIPIENT_COPY = {
  'pt-br': {
    label: 'Destinatário financeiro',
    sendingTo: 'A mensagem será aberta para',
    disabled: 'As mensagens financeiras estão desativadas para este cliente.',
    unavailable: 'Nenhum destinatário financeiro válido está configurado para este cliente.',
    loadError: 'Não foi possível confirmar o destinatário financeiro. Tente novamente.',
  },
  en: {
    label: 'Billing recipient', sendingTo: 'The message will open for', disabled: 'Billing messages are disabled for this customer.',
    unavailable: 'No valid billing recipient is configured for this customer.', loadError: 'Could not confirm the billing recipient. Try again.',
  },
  es: {
    label: 'Destinatario financiero', sendingTo: 'El mensaje se abrirá para', disabled: 'Los mensajes financieros están desactivados para este cliente.',
    unavailable: 'No hay un destinatario financiero válido configurado para este cliente.', loadError: 'No se pudo confirmar el destinatario financiero. Inténtalo de nuevo.',
  },
  fr: {
    label: 'Destinataire financier', sendingTo: 'Le message sera ouvert pour', disabled: 'Les messages financiers sont désactivés pour ce client.',
    unavailable: 'Aucun destinataire financier valide n’est configuré pour ce client.', loadError: 'Impossible de confirmer le destinataire financier. Réessayez.',
  },
} as const;

/** Converte string com vírgula ou ponto para número float. Retorna NaN se inválido. */
function parseDecimalInput(v: string): number {
  return parseFloat(v.replace(',', '.'));
}

/**
 * Quantos dias faltam de hoje até `iso` (yyyy-mm-dd). Comparação dia-a-dia em
 * UTC a partir dos componentes da data local — nunca vira o dia por fuso.
 * Nunca negativo (vencimento no passado conta como hoje).
 */
function daysFromToday(iso: string, todayIso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(todayIso ?? '');
  if (!m || !todayMatch) return 0;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(Number(todayMatch[1]), Number(todayMatch[2]) - 1, Number(todayMatch[3]));
  return Math.max(0, Math.round((target - today) / 86400000));
}

function createClientRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // WebViews antigos podem não expor randomUUID, mas a edge exige UUID v4.
  // getRandomValues continua sendo a fonte preferida; Math.random é apenas o
  // último fallback para ambientes de teste/legados sem Web Crypto.
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Meio de pagamento da cobrança → meio entendido pelo simulador de taxas. */
const METHOD_TO_SIMULATOR: Record<Exclude<BillingMethod, 'UNDEFINED'>, SimulatorMethod> = {
  PIX: 'pix',
  BOLETO: 'boleto',
  CREDIT_CARD: 'card',
};

export function ChargeDialog({ open, onOpenChange, presetCustomerId, lockCustomer, presetAmount, presetDescription, presetDueDate, source, onCreated, onLiveChargeConflict }: ChargeDialogProps) {
  // Vínculo com a OS escolhido NA TELA. Só entra em cena quando o chamador não
  // passou `source`: cobrança aberta pelo Financeiro não tem origem nenhuma e,
  // sem isto, nascia solta — a OS ficava sem selo de "Faturada" e a trava de
  // contagem dupla não enxergava essa cobrança.
  const [osVinculada, setOsVinculada] = useState('');
  const { serviceOrders: osOptions } = useServiceOrderOptions(open && !source, null);
  const { locale, timezone, countryCode } = useAppLocaleContext();
  const today = useMemo(() => todayInTz(timezone), [timezone]);
  const t = MESSAGES[locale].app.charges.cobrar;
  const fin = MESSAGES[locale].app.finance;
  const { toast } = useToast();

  // Cobrança de PARCELA DE CONTRATO: valor travado no valor da parcela e sem
  // aba Financeiro (a parcela JÁ é o lançamento; a cobrança só se liga a ela).
  const isContractInstallment = source?.type === 'contract_installment';
  // Cobrança do SALDO de uma CONTA A RECEBER que já existe: a conta já é o
  // lançamento, e o valor é o saldo em aberto (travado, a edge recusa outro).
  const isReceivableBalance = source?.type === 'receivable';
  /**
   * As duas origens que se LIGAM a um lançamento que já existe, em vez de
   * criar um. As duas travam o valor e as duas não têm aba Financeiro. A copy
   * difere (parcela x conta), por isso os dois booleanos continuam separados.
   */
  const isLinkedToExistingEntry = isContractInstallment || isReceivableBalance;
  // Textos da origem ligada — nunca lidos quando `isLinkedToExistingEntry` é
  // false (os blocos que usam isto só renderizam nesse caso).
  const tLinked = isReceivableBalance ? t.receivableBalance : t.contractInstallment;

  const { customers, updateCustomer } = useCustomers();
  const { create, createInstallmentBatch } = useTenantCharges();
  const { activeCostCenters } = useCostCenters();
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
    autoPostToFinance,
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
  const [dueDate, setDueDate] = useState(() => todayInTz(timezone));
  const [description, setDescription] = useState('');
  // Categoria do recebível gerado no Financeiro. Vazia = usa o default da conta.
  const [category, setCategory] = useState('');
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  // Lançar (ou não) esta cobrança no Financeiro. Decisão do CEO: é uma opção
  // por cobrança, com o padrão vindo da configuração da conta de recebimento
  // (auto_post_to_finance).
  const [postToFinance, setPostToFinance] = useState(true);
  const [method, setMethod] = useState<BillingMethod>('UNDEFINED');
  const [installmentCount, setInstallmentCount] = useState(1);
  // Quem paga a taxa do cartão: 'company' (empresa absorve) ou 'customer'
  // (repasse ao cliente — o total é inflado no servidor pela taxa real do Asaas).
  const [feePayer, setFeePayer] = useState<'company' | 'customer'>('company');
  // Parcelamento no cartão: 'fixed' = a empresa define o nº de parcelas (o de
  // sempre); 'customer' = a empresa define só o TETO e o pagador escolhe no
  // checkout. No modo 'customer', `installmentCount` guarda o teto.
  const [installmentMode, setInstallmentMode] = useState<'fixed' | 'customer'>('fixed');

  // ── Abas do modal (reorganização de rolagem única em 4 grupos) ─────────────
  const TAB_COBRANCA = 'cobranca';
  const TAB_PAGAMENTO = 'pagamento';
  const TAB_ENCARGOS = 'encargos';
  const TAB_FINANCEIRO = 'financeiro';
  type ChargeTabKey = typeof TAB_COBRANCA | typeof TAB_PAGAMENTO | typeof TAB_ENCARGOS | typeof TAB_FINANCEIRO;
  const [activeTab, setActiveTab] = useState<ChargeTabKey>(TAB_COBRANCA);
  // Campos que falharam na ÚLTIMA tentativa de salvar — usados para levar o
  // usuário até a aba certa e destacar o campo (nunca deixar um erro preso
  // numa aba escondida). Cada flag some sozinha quando a condição
  // correspondente deixa de ser verdadeira, sem precisar de limpeza manual
  // no onChange de cada campo (ver showXxxError abaixo).
  const [fieldErrors, setFieldErrors] = useState<{ customer?: boolean; amount?: boolean; dueDate?: boolean; document?: boolean }>({});
  // Resumo do recebimento: fica fixo no rodapé do modal, FORA das abas (nunca
  // some ao trocar de aba). Só a linha do líquido fica sempre visível; o
  // detalhamento (composição da taxa, antecipação, cronograma) abre aqui.
  const [netExpanded, setNetExpanded] = useState(false);

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
  //
  // A multa tem DOIS campos e um seletor de unidade: a Asaas aceita
  // `fine.type = PERCENTAGE | FIXED`, e o CEO pediu multa em reais. Os valores
  // são guardados separados de propósito — alternar % ↔ R$ e voltar não
  // reinterpreta "2" como "R$ 2,00" nem "50" como "50%".
  const [fineType, setFineType] = useState<ChargeFineType>('PERCENTAGE');
  const [fineAmount, setFineAmount] = useState(0); // em reais, máscara de centavos
  const [finePercent, setFinePercent] = useState('');
  const [interestPercent, setInterestPercent] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountDays, setDiscountDays] = useState('');
  const accountDefaultsTouchedRef = useRef({
    fine: false,
    interest: false,
    discount: false,
    discountDays: false,
    description: false,
    postToFinance: false,
    feePayer: false,
  });

  // Resultado (link gerado) — resultado normalizado da mutation
  const [result, setResult] = useState<CreateChargeResult | null>(null);
  const [batchResult, setBatchResult] = useState<CreateInstallmentBatchResult | null>(null);
  // O mesmo payload (inclusive client_request_id) é reenviado no retry. Não
  // reconstruir a partir do formulário evita mudar o hash e duplicar cobranças.
  const batchInputRef = useRef<CreateInstallmentBatchInput | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedInstallment, setCopiedInstallment] = useState<number | null>(null);

  // Helper derivado do resultado normalizado
  const isOrphan = result?.orphan === true;
  // Cobrança criada normalmente, mas o lançamento no Financeiro falhou (edge
  // não-fatal). Persiste na tela de sucesso — não é só um toast que some.
  const financeWarning = (() => {
    if (!result || result.orphan !== false) return null;
    return result.charge.financeWarning;
  })();

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );
  const {
    contacts: customerContacts,
    refetch: refetchCustomerContacts,
  } = useCustomerContacts(customerId || undefined);
  const customerWhatsappRoutes = useCustomerWhatsappRoutes(
    customerId || undefined,
    open && Boolean(customerId),
    selectedCustomer?.company_id,
  );
  const billingWhatsappRoute = useMemo(
    () => customerWhatsappRoutes.routes.find((route) => route.category === 'billing'),
    [customerWhatsappRoutes.routes],
  );
  const billingWhatsappRecipients = useMemo(() => resolveCustomerWhatsappRecipients(
    billingWhatsappRoute,
    {
      name: selectedCustomer?.name ?? '',
      phone: selectedCustomer?.celular?.trim() || selectedCustomer?.phone?.trim(),
    },
    customerContacts,
    customerWhatsappRoutes.optedOutPhones,
    countryCode,
  ), [billingWhatsappRoute, countryCode, customerContacts, customerWhatsappRoutes.optedOutPhones, selectedCustomer]);
  const [whatsappRecipientKey, setWhatsappRecipientKey] = useState('');
  const whatsappRecipientOptions = useMemo(
    () => billingWhatsappRecipients.recipients.map((recipient) => ({
      ...recipient,
      key: `${recipient.kind}:${recipient.contactId ?? 'primary'}`,
    })),
    [billingWhatsappRecipients.recipients],
  );
  const selectedWhatsappRecipient = useMemo(
    () => whatsappRecipientOptions.find((recipient) => recipient.key === whatsappRecipientKey)
      ?? whatsappRecipientOptions[0]
      ?? null,
    [whatsappRecipientKey, whatsappRecipientOptions],
  );

  useEffect(() => {
    const firstKey = whatsappRecipientOptions[0]?.key ?? '';
    if (!whatsappRecipientOptions.some((recipient) => recipient.key === whatsappRecipientKey)) {
      setWhatsappRecipientKey(firstKey);
    }
  }, [whatsappRecipientKey, whatsappRecipientOptions]);

  // Inicializa uma nova sessão do formulário. A jornada de carregamento da
  // conta (fallback imediato -> valores persistidos) é tratada separadamente
  // abaixo, para não reidratar o formulário inteiro por cima do usuário.
  useEffect(() => {
    if (open) {
      accountDefaultsTouchedRef.current = {
        fine: false,
        interest: false,
        discount: false,
        discountDays: false,
        description: false,
        postToFinance: false,
        feePayer: false,
      };
      // O default da CONTA é percentual (default_fine_percent), então abrir
      // sempre começa em %. A escolha de reais vale só para a cobrança atual.
      setFineType('PERCENTAGE');
      setFineAmount(0);
      setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
      setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
      setDiscountPercent(defaultDiscountPercent != null ? String(defaultDiscountPercent) : '');
      setDiscountDays(defaultDiscountDays != null ? String(defaultDiscountDays) : '');
      setDescription(presetDescription ?? defaultDescription ?? '');
      setOsVinculada('');
      setCategory('');
      setCostCenterId(null);
      setPostToFinance(autoPostToFinance);
      setFeePayer(feePayerDefault === 'customer' ? 'customer' : 'company');
      setInstallmentMode('fixed');
      if (presetAmount != null && presetAmount > 0) {
        setAmount(presetAmount);
      }
      // Vencimento herdado da origem (ex.: a data da parcela do contrato). Quem
      // chama já garante que não é data passada — a edge recusaria.
      if (presetDueDate) {
        setDueDate(presetDueDate);
      }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // A conta pode resolver/refazer a query com o modal aberto. Cada default só
  // preenche o campo enquanto ele ainda não foi tocado nesta cobrança.
  useEffect(() => {
    if (!open) return;
    const touched = accountDefaultsTouchedRef.current;
    if (!touched.fine) setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
    if (!touched.interest) setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
    if (!touched.discount) setDiscountPercent(defaultDiscountPercent != null ? String(defaultDiscountPercent) : '');
    if (!touched.discountDays) setDiscountDays(defaultDiscountDays != null ? String(defaultDiscountDays) : '');
    if (!touched.description) setDescription(presetDescription ?? defaultDescription ?? '');
    if (!touched.postToFinance) setPostToFinance(autoPostToFinance);
    if (!touched.feePayer) setFeePayer(feePayerDefault === 'customer' ? 'customer' : 'company');
  }, [open, defaultFinePercent, defaultInterestPercent, defaultDiscountPercent, defaultDiscountDays, defaultDescription, autoPostToFinance, presetDescription, feePayerDefault]);

  useEffect(() => {
    if (open && presetAmount != null && presetAmount > 0) setAmount(presetAmount);
  }, [open, presetAmount]);

  useEffect(() => {
    if (open && presetDueDate) setDueDate(presetDueDate);
  }, [open, presetDueDate]);

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

  // Abrir para criar SEMPRE começa na 1ª aba, sem pendência marcada da
  // tentativa anterior — nunca herda erro nem aba de uma abertura passada.
  useEffect(() => {
    if (open) {
      setActiveTab(TAB_COBRANCA);
      setFieldErrors({});
      setNetExpanded(false);
    }
  }, [open]);

  const resetForm = () => {
    accountDefaultsTouchedRef.current = {
      fine: false,
      interest: false,
      discount: false,
      discountDays: false,
      description: false,
      postToFinance: false,
      feePayer: false,
    };
    setCustomerId(presetCustomerId ?? '');
    // "Nova cobrança" a partir de uma origem (parcela/orçamento) volta pro
    // valor da origem, nunca pra zero — no caso da parcela o valor é travado.
    setAmount(presetAmount != null && presetAmount > 0 ? presetAmount : 0);
    setDueDate(presetDueDate || today);
    setDescription(presetDescription ?? defaultDescription ?? '');
    setCategory('');
    setCostCenterId(null);
    setPostToFinance(autoPostToFinance);
    setMethod(methodOptions[0]?.value ?? 'UNDEFINED');
    setInstallmentCount(1);
    setInstallmentMode('fixed');
    setFeePayer(feePayerDefault === 'customer' ? 'customer' : 'company');
    setAnticipate(false);
    setShowSchedule(false);
    setActiveTab(TAB_COBRANCA);
    setFieldErrors({});
    setNetExpanded(false);
    setFineType('PERCENTAGE');
    setFineAmount(0);
    setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
    setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
    setDiscountPercent(defaultDiscountPercent != null ? String(defaultDiscountPercent) : '');
    setDiscountDays(defaultDiscountDays != null ? String(defaultDiscountDays) : '');
    setResult(null);
    setBatchResult(null);
    batchInputRef.current = null;
    setCopied(false);
    setCopiedInstallment(null);
  };

  // URL exibida no bloco de resultado — checkout próprio no caso normal,
  // invoice_url do Asaas no caso órfão.
  //
  // No caso normal usamos SEMPRE a URL COMPLETA via buildCheckoutUrl(short_code)
  // (https://www.dominex.app/pagar/<code>). O `charge.checkout_url` do edge vem
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

  // ── Erro por campo (aba Cobrança) ───────────────────────────────────────────
  // Deriva do estado atual + da última tentativa de salvar: some sozinho
  // assim que o campo é corrigido, sem precisar de onChange dedicado.
  const showCustomerError = !!fieldErrors.customer && !customerId;
  const showAmountError = !!fieldErrors.amount && (!amount || amount <= 0);
  const showDueDateError = !!fieldErrors.dueDate && !dueDate;
  const showDocumentError = !!fieldErrors.document && documentBlocked;
  const cobrancaTabHasError = showCustomerError || showAmountError || showDueDateError || showDocumentError;

  // ── Resumo do líquido (estimativa) ─────────────────────────────────────────
  // Fórmula ÚNICA do front: src/lib/asaasFeeSimulator.ts (o mesmo helper do
  // Simulador de venda em Ajustes). O número contratual continua sendo o do
  // edge `tenant-asaas-create-charge`, que recalcula com a taxa real.
  const dueDays = useMemo(() => daysFromToday(dueDate, today), [dueDate, today]);

  const simulatorMethod: SimulatorMethod | null =
    method === 'UNDEFINED' ? null : METHOD_TO_SIMULATOR[method];

  // "Cliente escolhe as parcelas": só no cartão, com mais de 1 parcela
  // liberada na conta, e nunca quando a cobrança LIGA a um lançamento que já
  // existe (parcela de contrato / conta a receber) — a edge recusa esses.
  const cardMaxInstallments = Math.max(1, defaultMaxInstallments ?? 1);
  const canOfferCustomerInstallments =
    method === 'CREDIT_CARD' && cardMaxInstallments > 1 && !isLinkedToExistingEntry;
  const customerChoosesInstallments =
    canOfferCustomerInstallments && installmentMode === 'customer';

  const simulation = useMemo<SimulationResult | null>(() => {
    if (!simulatorMethod || !tenantFees || amount <= 0) return null;
    return simulateNetAmount({
      amount,
      method: simulatorMethod,
      // No "cliente escolhe" a cobrança nasce à vista: o detalhe é o do 1x e
      // a faixa até o teto aparece em `simulationAtMax`.
      installments: simulatorMethod === 'card' && !customerChoosesInstallments ? installmentCount : 1,
      // Repasse ao cliente só existe no cartão (é o que o edge faz); nos demais
      // meios a empresa sempre absorve a taxa.
      feePayer: simulatorMethod === 'card' ? feePayer : 'company',
      fees: tenantFees,
      anticipate,
      dueDays,
    });
  }, [simulatorMethod, tenantFees, amount, installmentCount, feePayer, anticipate, dueDays, customerChoosesInstallments]);

  // Faixa do "cliente escolhe": quanto a empresa recebe se o pagador usar o
  // MÁXIMO de parcelas (o à vista é a `simulation` acima).
  const simulationAtMax = useMemo<SimulationResult | null>(() => {
    if (!customerChoosesInstallments || !tenantFees || amount <= 0) return null;
    return simulateNetAmount({
      amount,
      method: 'card',
      installments: installmentCount,
      feePayer,
      fees: tenantFees,
      anticipate,
      dueDays,
    });
  }, [customerChoosesInstallments, tenantFees, amount, installmentCount, feePayer, anticipate, dueDays]);
  // Com o cliente pagando a taxa o líquido é ~o mesmo em toda opção: 1 linha.
  const netRange = simulation && simulationAtMax
    ? {
        min: Math.min(simulation.netAfterAnticipation, simulationAtMax.netAfterAnticipation),
        max: Math.max(simulation.netAfterAnticipation, simulationAtMax.netAfterAnticipation),
        cash: simulation.netAfterAnticipation,
        atMax: simulationAtMax.netAfterAnticipation,
        collapsed: Math.abs(simulation.netAfterAnticipation - simulationAtMax.netAfterAnticipation) < 0.05,
      }
    : null;

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

  // ── Quanto o CLIENTE paga (adiantado com desconto / atrasado com encargos) ─
  // O resumo do rodapé respondia só "quanto sobra pra empresa". O CEO pediu o
  // outro lado: o que sai do bolso do cliente nos dois extremos. A conta mora
  // num módulo puro com teste (`chargeCustomerAmounts`), nunca aqui dentro.
  const numOrZero = (raw: string) => {
    const v = parseDecimalInput(raw);
    return Number.isFinite(v) ? v : 0;
  };
  const finePercentValue = numOrZero(finePercent);
  const interestPercentValue = numOrZero(interestPercent);
  const discountPercentValue = numOrZero(discountPercent);
  const discountDaysValue = Number.isFinite(parseInt(discountDays, 10)) ? parseInt(discountDays, 10) : 0;

  // Base = o que o cliente vê na cobrança. Com repasse da taxa do cartão é o
  // valor JÁ inflado (`simulation.gross`), não o líquido que a empresa quer.
  const customerBase = simulation?.gross ?? amount;

  const customerAmounts = useMemo(
    () =>
      computeCustomerAmounts({
        baseAmount: customerBase,
        fineType,
        finePercent: finePercentValue,
        fineAmount,
        interestPercent: interestPercentValue,
        discountPercent: discountPercentValue,
        discountDays: discountDaysValue,
        lateDays: LATE_SCENARIO_DAYS,
      }),
    [
      customerBase,
      fineType,
      finePercentValue,
      fineAmount,
      interestPercentValue,
      discountPercentValue,
      discountDaysValue,
    ],
  );

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
  // Colar um valor pronto (ex. "4.550" de planilha) NÃO passa pela regra de
  // centavos comum: daria R$ 45,50 (100x menor). Ver `money-paste-mask.ts`.
  const handleAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents != null) setAmount(cents / 100);
  };
  const amountDisplay = amount
    ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  // Multa em R$ usa a MESMA máscara canônica do valor (dígitos entram como
  // centavos pela direita; colar passa por readPastedCents). Em %, o campo
  // segue como texto decimal livre, como sempre foi.
  const handleFineAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    accountDefaultsTouchedRef.current.fine = true;
    const raw = e.target.value.replace(/\D/g, '');
    setFineAmount(parseInt(raw || '0', 10) / 100);
  };
  const handleFineAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents != null) {
      accountDefaultsTouchedRef.current.fine = true;
      setFineAmount(cents / 100);
    }
  };
  const fineAmountDisplay = fineAmount
    ? fineAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  // Cartão respeita o limite configurado na conta. Pix, boleto e "cliente
  // escolhe" geram cobranças mensais independentes e usam o limite da edge.
  const installmentOptions = useMemo(() => {
    const max = method === 'CREDIT_CARD'
      ? Math.max(1, defaultMaxInstallments ?? 1)
      : 12;
    const all = Array.from({ length: max }, (_, i) => i + 1);
    // "Cliente escolhe": o select é o TETO, de 2x até o limite da conta.
    return customerChoosesInstallments ? all.filter((n) => n >= 2) : all;
  }, [defaultMaxInstallments, method, customerChoosesInstallments]);

  const canCreateInstallmentBatch = !source && !osVinculada && method !== 'CREDIT_CARD';
  const isInstallmentBatch = canCreateInstallmentBatch && installmentCount > 1;
  const installmentPlan = useMemo(
    () => isInstallmentBatch && dueDate && amount > 0
      ? buildInstallmentPlan(dueDate, amount, installmentCount)
      : [],
    [amount, dueDate, installmentCount, isInstallmentBatch],
  );
  const batchHasInstallmentBelowMinimum = installmentPlan.some((row) => row.amount < 5);

  // Escolher uma OS transforma a cobrança em fluxo de origem. O backend do
  // lote é deliberadamente avulso; volta para 1x para não sugerir um recurso
  // que seria recusado no servidor.
  useEffect(() => {
    if ((source || osVinculada) && method !== 'CREDIT_CARD' && installmentCount > 1) {
      setInstallmentCount(1);
    }
  }, [installmentCount, method, osVinculada, source]);

  const handleSubmit = async () => {
    // Todo campo obrigatório mora na aba Cobrança: ao falhar, leva o usuário
    // até lá e marca o campo (nunca deixa um erro preso numa aba escondida).
    if (!customerId) {
      setFieldErrors({ customer: true });
      setActiveTab(TAB_COBRANCA);
      toast({ variant: 'destructive', title: t.validation.customerRequired });
      return;
    }
    if (!amount || amount <= 0) {
      setFieldErrors({ amount: true });
      setActiveTab(TAB_COBRANCA);
      toast({ variant: 'destructive', title: t.validation.valueRequired });
      return;
    }
    if (!dueDate) {
      setFieldErrors({ dueDate: true });
      setActiveTab(TAB_COBRANCA);
      toast({ variant: 'destructive', title: t.validation.dueDateRequired });
      return;
    }
    // Espelho do gate do edge: sem CPF/CNPJ válido a Asaas recusa a cobrança.
    // Evita uma ida à edge só para receber o erro de volta.
    if (documentBlocked && documentMessage) {
      setFieldErrors({ document: true });
      setActiveTab(TAB_COBRANCA);
      toast({ variant: 'destructive', title: documentMessage });
      return;
    }
    setFieldErrors({});

    const parsedFine = parseDecimalInput(finePercent);
    const parsedInterest = parseDecimalInput(interestPercent);
    const parsedDiscount = parseDecimalInput(discountPercent);
    const parsedDiscountDays = parseInt(discountDays, 10);

    if (isInstallmentBatch && batchHasInstallmentBelowMinimum) {
      setActiveTab(TAB_PAGAMENTO);
      toast({
        variant: 'destructive',
        title: t.installments.minimumTitle,
        description: t.installments.minimumDescription,
      });
      return;
    }

    try {
      if (isInstallmentBatch) {
        const payloadWithoutId: Omit<CreateInstallmentBatchInput, 'client_request_id'> = {
          customer_id: customerId,
          total_value: amount,
          installment_count: installmentCount,
          first_due_date: dueDate,
          billing_type: method as Exclude<TenantChargeBillingType, 'CREDIT_CARD'>,
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          cost_center_id: costCenterId,
          fine_type: fineType === 'FIXED' ? 'FIXED' : undefined,
          fine_value: fineType === 'FIXED' ? fineAmount : undefined,
          fine_percent: fineType === 'FIXED' || isNaN(parsedFine) ? undefined : parsedFine,
          interest_percent: isNaN(parsedInterest) ? undefined : parsedInterest,
          discount_percent: isNaN(parsedDiscount) ? undefined : parsedDiscount,
          discount_days: isNaN(parsedDiscountDays) ? undefined : parsedDiscountDays,
          post_to_finance: postToFinance,
        };
        const previousPayload = batchInputRef.current;
        const previousWithoutId = previousPayload
          ? { ...previousPayload, client_request_id: undefined }
          : null;
        const sameRequest = previousWithoutId != null
          && JSON.stringify(previousWithoutId) === JSON.stringify({ ...payloadWithoutId, client_request_id: undefined });
        const batchInput: CreateInstallmentBatchInput = {
          ...payloadWithoutId,
          client_request_id: sameRequest && previousPayload
            ? previousPayload.client_request_id
            : createClientRequestId(),
        };
        batchInputRef.current = batchInput;
        const nextBatchResult = await createInstallmentBatch.mutateAsync(batchInput);
        setBatchResult(nextBatchResult);
        setResult(null);
        toast({
          title: nextBatchResult.completed
            ? t.installments.batchSuccessTitle
            : t.installments.batchPartialTitle,
          description: nextBatchResult.completed
            ? t.installments.batchSuccessDescription(nextBatchResult.total)
            : t.installments.batchPartialDescription(nextBatchResult.total - nextBatchResult.failed, nextBatchResult.failed),
        });
        return;
      }

      const chargeResult = await create.mutateAsync({
        customer_id: customerId,
        // Valor ORIGINAL — o repasse de taxa (quando cliente paga) é calculado
        // no servidor com a taxa real do Asaas. Nunca inflamos no client.
        value: amount,
        due_date: dueDate,
        billing_type: method,
        description: description.trim() || undefined,
        // Categoria/centro de custo só existem pro recebível que a cobrança
        // cria. Parcela de contrato não cria recebível nenhum (o lançamento é
        // a própria parcela), então mandar isso seria ruído ignorado.
        category: isLinkedToExistingEntry ? undefined : category.trim() || undefined,
        cost_center_id: isLinkedToExistingEntry ? null : costCenterId,
        // Multa: manda SÓ o campo do modo escolhido, nunca os dois.
        //
        // Em % o payload é byte-a-byte o de antes (sem `fine_type`), então
        // nada muda pra quem não usa multa em reais. Em R$ o percentual NÃO é
        // enviado: assim, se este front rodar contra uma edge antiga (janela de
        // deploy), a edge não acha `fine_percent`, cai no padrão da conta e a
        // multa em reais é só ignorada. Mandar o valor em `fine_percent` com um
        // flag faria a edge antiga cobrar "R$ 50" como "50%".
        fine_type: fineType === 'FIXED' ? 'FIXED' : undefined,
        fine_value: fineType === 'FIXED' ? fineAmount : undefined,
        fine_percent: fineType === 'FIXED' || isNaN(parsedFine) ? undefined : parsedFine,
        interest_percent: isNaN(parsedInterest) ? undefined : parsedInterest,
        discount_percent: isNaN(parsedDiscount) ? undefined : parsedDiscount,
        discount_days: isNaN(parsedDiscountDays) ? undefined : parsedDiscountDays,
        // "Cliente escolhe": manda só o teto; installment_count NÃO vai
        // (a cobrança nasce 1x e o pagador escolhe no checkout).
        installment_count: !customerChoosesInstallments && method === 'CREDIT_CARD' && installmentCount > 1
          ? installmentCount
          : undefined,
        customer_max_installments: customerChoosesInstallments ? installmentCount : undefined,
        // Quem paga a taxa — só faz sentido no cartão; o edge ignora nos demais.
        fee_payer: method === 'CREDIT_CARD' ? feePayer : undefined,
        // Origem da cobrança: ativa o dedupe no edge (orçamento ou parcela).
        // Origem do CHAMADOR tem prioridade (orçamento, parcela, "Faturar OS").
        // Sem ela, vale a OS escolhida na tela; sem nenhuma das duas, avulsa.
        source_type: source?.type ?? (osVinculada ? 'service_order' : undefined),
        source_id: source?.id ?? (osVinculada || null),
        // Opção por cobrança (padrão vem da conta): lançar ou não no Financeiro.
        // Parcela de contrato não tem essa escolha — o lançamento é a própria
        // parcela, e a edge ignora o campo. Nem enviamos, pra não fingir opção.
        post_to_finance: isLinkedToExistingEntry ? undefined : postToFinance,
      });
      setResult(chargeResult);
      onCreated?.(chargeResult);
      toast({ title: t.success.title, description: t.success.description });
      // Falha em dinheiro nunca pode ser silenciosa: se a cobrança foi criada
      // mas o lançamento no Financeiro não, avisa com um toast à parte (some
      // do drawer; o aviso persistente fica no bloco de sucesso abaixo).
      if (chargeResult.orphan === false && chargeResult.charge.financeWarning) {
        toast({
          variant: 'destructive',
          // Na parcela de contrato o aviso não é "não lançou no financeiro" (o
          // lançamento é a parcela): é "não conseguimos ligar a cobrança à
          // parcela". O texto vem pronto do servidor, só o título muda.
          title: isLinkedToExistingEntry ? tLinked.warningTitle : t.financeWarning.title,
          description: chargeResult.charge.financeWarning || t.financeWarning.description,
        });
      }
    } catch (err) {
      // JÁ EXISTE cobrança viva ligada à origem ("cobrar o saldo"): apareceu
      // outra entre abrir esta tela e clicar em gerar. Um toast aqui seria
      // beco sem saída — devolvemos ao chamador, que é quem sabe oferecer a
      // SUBSTITUIÇÃO explícita (cancelar a atual, depois emitir a nova).
      if (
        err instanceof CreateChargeApiError
        && err.code === 'live_charge_exists'
        && onLiveChargeConflict
      ) {
        onLiveChargeConflict(err);
        onOpenChange(false);
        return;
      }
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

  const getBatchChargeUrl = (item: CreateInstallmentBatchResult['installments'][number]) => {
    if (!item.charge) return '';
    if (item.charge.public_short_code) return buildCheckoutUrl(item.charge.public_short_code);
    return item.charge.invoice_url ?? '';
  };

  const handleCopyInstallment = async (number: number, url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInstallment(number);
      toast({ title: t.success.copied });
      setTimeout(() => setCopiedInstallment(null), 2000);
    } catch {
      toast({ variant: 'destructive', title: t.copyFallback });
    }
  };

  const handleRetryInstallmentBatch = async () => {
    const batchInput = batchInputRef.current;
    if (!batchInput) return;
    try {
      const nextBatchResult = await createInstallmentBatch.mutateAsync(batchInput);
      setBatchResult(nextBatchResult);
      toast({
        title: nextBatchResult.completed
          ? t.installments.batchSuccessTitle
          : t.installments.batchPartialTitle,
        description: nextBatchResult.completed
          ? t.installments.batchSuccessDescription(nextBatchResult.total)
          : t.installments.batchPartialDescription(nextBatchResult.total - nextBatchResult.failed, nextBatchResult.failed),
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t.installments.retryErrorTitle,
        description: err instanceof Error ? err.message : t.error,
      });
    }
  };

  const handleSendWhatsapp = async () => {
    if (!result) return;
    const recipientCopy = WHATSAPP_RECIPIENT_COPY[locale];
    if (customerWhatsappRoutes.isError) {
      toast({ variant: 'destructive', title: recipientCopy.loadError });
      return;
    }
    let currentRecipients = billingWhatsappRecipients;
    let currentSelected: CustomerWhatsappRecipientCandidate | null = selectedWhatsappRecipient;
    try {
      const [routeSnapshot, contactsSnapshot] = await Promise.all([
        customerWhatsappRoutes.refetch(),
        refetchCustomerContacts(),
      ]);
      if (contactsSnapshot.error) throw contactsSnapshot.error;
      currentRecipients = resolveCustomerWhatsappRecipients(
        routeSnapshot.routes.find((route) => route.category === 'billing'),
        {
          name: selectedCustomer?.name ?? '',
          phone: selectedCustomer?.celular?.trim() || selectedCustomer?.phone?.trim(),
        },
        contactsSnapshot.data ?? [],
        routeSnapshot.optedOutPhones,
        countryCode,
      );
      currentSelected = whatsappRecipientKey
        ? currentRecipients.recipients.find((recipient) =>
          `${recipient.kind}:${recipient.contactId ?? 'primary'}` === whatsappRecipientKey) ?? null
        : currentRecipients.recipients[0] ?? null;
    } catch {
      toast({ variant: 'destructive', title: recipientCopy.loadError });
      return;
    }
    if (currentRecipients.disabled) {
      toast({ variant: 'destructive', title: recipientCopy.disabled });
      return;
    }
    if (currentRecipients.isExplicit && !currentSelected) {
      toast({ variant: 'destructive', title: recipientCopy.unavailable });
      return;
    }
    // No caso órfão não há `charge`, usamos o `amount` do formulário (estado local).
    const chargeValue = result.orphan || !('charge' in result) ? amount : result.charge.value;
    const valueLabel = formatBRL(chargeValue);
    const descPart = description.trim() ? ` (${description.trim()})` : '';
    const message = `${t.whatsappMessage
      .replace('{value}', valueLabel)
      .replace('{description}', descPart)}\n${displayUrl}`;
    const phone = currentSelected?.phone ?? '';
    const link = buildWhatsAppLink(phone, message, countryCode);
    // O fallback sem destinatário existe apenas no modo legado. Uma rota
    // financeira explícita nunca pode escapar para a pessoa errada.
    if (!link && currentRecipients.isExplicit) {
      toast({ variant: 'destructive', title: recipientCopy.unavailable });
      return;
    }
    window.open(link ?? `https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  // ── Rodapé (fora das abas, fora do scroll) ──────────────────────────────────
  // Só existe enquanto o formulário de criação está aberto (na tela de
  // sucesso os botões já vêm embutidos no conteúdo, como antes). Contém o
  // resumo do líquido — sempre visível, reage a forma/parcelas/taxa/
  // antecipação independente da aba ativa — e as ações Cancelar/Gerar.
  /**
   * Abas VISÍVEIS, na ordem. Contrato-parcela não mostra a aba Financeiro (a
   * parcela já tem destino financeiro), então a "última aba" muda de acordo.
   */
  const visibleTabKeys: ChargeTabKey[] = [
    TAB_COBRANCA,
    TAB_PAGAMENTO,
    TAB_ENCARGOS,
    ...(isLinkedToExistingEntry ? [] : [TAB_FINANCEIRO as ChargeTabKey]),
  ];
  const activeTabIndex = visibleTabKeys.indexOf(activeTab);
  const isLastTab = activeTabIndex === visibleTabKeys.length - 1;
  const goToNextTab = () => {
    const next = visibleTabKeys[activeTabIndex + 1];
    if (next) setActiveTab(next);
  };

  const netLoading = amount > 0 && feesLoading && !tenantFees;
  const netFeesUnavailable = amount > 0 && !feesLoading && !tenantFees;
  const netHasDetail = amount > 0 && !!tenantFees && (!!simulation || !!multiSimulation);
  const isSubmitting = create.isPending || createInstallmentBatch.isPending;

  const footer = !result && !batchResult ? (
    <div className="space-y-2">
      {amount > 0 && !isInstallmentBatch && (
        <div className="overflow-hidden rounded-md border border-border bg-muted/40">
          {netLoading && (
            <div className="flex items-center gap-2 px-3 py-2">
              <Calculator className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t.net.loading}</p>
            </div>
          )}

          {netFeesUnavailable && (
            <div className="flex items-start gap-2 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-xs leading-snug text-foreground">{t.net.fallbackWarning}</p>
            </div>
          )}

          {netHasDetail && (
            <>
              {/* Cabeçalho SEMPRE visível: só a linha do líquido. O
                  detalhamento completo (taxa, antecipação, cronograma) abre
                  ao tocar aqui — grande demais pra caber inteiro fixo. */}
              <button
                type="button"
                onClick={() => setNetExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                aria-expanded={netExpanded}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Calculator className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t.net.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {netRange && !netRange.collapsed ? (
                    <span className="text-sm font-bold tabular-nums text-success">
                      {t.net.rangeCompact(money(netRange.min), money(netRange.max))}
                    </span>
                  ) : simulation ? (
                    <span className="text-sm font-bold tabular-nums text-success">
                      {money(simulation.netAfterAnticipation)}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">{t.net.chooseCompact}</span>
                  )}
                  {netExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </span>
              </button>

              {netExpanded && (
                <div className="max-h-[42vh] space-y-2.5 overflow-y-auto border-t border-border px-3 pb-3 pt-3">
                  {/* Taxa não veio da conta do tenant: o número é referência,
                      e o usuário precisa saber disso antes de confiar nele. */}
                  {feesAreReference && (
                    <NoticeBanner variant="warning">{t.net.fallbackWarning}</NoticeBanner>
                  )}

                  {/* "Cliente escolhe": a faixa do que a empresa recebe, do
                      à vista ao máximo de parcelas. O detalhe abaixo é o 1x. */}
                  {netRange && (
                    <dl className="space-y-1.5 border-b border-border pb-2.5 text-sm">
                      {netRange.collapsed ? (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-muted-foreground">{t.net.rangeAny}</dt>
                          <dd className="font-bold tabular-nums text-success">{money(netRange.cash)}</dd>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-muted-foreground">{t.net.rangeCash}</dt>
                            <dd className="font-bold tabular-nums text-success">{money(netRange.cash)}</dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-muted-foreground">{t.net.rangeMax(installmentCount)}</dt>
                            <dd className="font-bold tabular-nums text-success">{money(netRange.atMax)}</dd>
                          </div>
                        </>
                      )}
                    </dl>
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

                  {/* ── Quanto o CLIENTE paga ──────────────────────────────
                      Só desenha o cenário que EXISTE: sem desconto
                      configurado não há linha de desconto, sem multa/juros não
                      há linha de atraso. O recorte de atraso (30 dias) vai
                      escrito no próprio rótulo, porque juros da Asaas são ao
                      mês e crescem por dia: número de encargo sem premissa
                      declarada vira discussão com o cliente final. */}
                  {(customerAmounts.hasDiscount || customerAmounts.hasLateCharges) && (
                    <div className="space-y-1.5 border-t border-border pt-2.5">
                      <p className="text-xs font-medium text-muted-foreground">{t.net.customerTitle}</p>
                      <dl className="space-y-1.5 text-sm">
                        {customerAmounts.hasDiscount && (
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="min-w-0 text-muted-foreground">
                              {customerAmounts.discountDays > 0
                                ? t.net.customerOnTimeUntil(customerAmounts.discountDays)
                                : t.net.customerOnTime}
                              <span className="block text-[11px] leading-snug text-muted-foreground">
                                {t.net.customerDiscountNote(
                                  percentLabel(discountPercentValue),
                                  money(customerAmounts.discountAmount),
                                )}
                              </span>
                            </dt>
                            <dd className="shrink-0 font-medium tabular-nums text-foreground">
                              {money(customerAmounts.amountOnTime)}
                            </dd>
                          </div>
                        )}

                        {customerAmounts.hasLateCharges && (
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="min-w-0 text-muted-foreground">
                              {t.net.customerLate(customerAmounts.lateDays)}
                              <span className="block text-[11px] leading-snug text-muted-foreground">
                                {customerAmounts.fineAmount > 0 && customerAmounts.interestAmount > 0
                                  ? t.net.customerLateBoth(
                                      money(customerAmounts.fineAmount),
                                      money(customerAmounts.interestAmount),
                                      percentLabel(interestPercentValue),
                                    )
                                  : customerAmounts.fineAmount > 0
                                    ? t.net.customerLateFine(money(customerAmounts.fineAmount))
                                    : t.net.customerLateInterest(
                                        money(customerAmounts.interestAmount),
                                        percentLabel(interestPercentValue),
                                      )}
                              </span>
                            </dt>
                            <dd className="shrink-0 font-medium tabular-nums text-warning">
                              {money(customerAmounts.amountWhenLate)}
                            </dd>
                          </div>
                        )}
                      </dl>
                      {customerAmounts.hasLateCharges && (
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          {t.net.customerLateHint(customerAmounts.lateDays)}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="text-[11px] leading-snug text-muted-foreground">{t.net.estimate}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Fora da última aba, a ação principal é AVANÇAR: gerar a cobrança já na
          primeira aba fazia o usuário passar direto por Pagamento, Encargos e
          Financeiro sem nem saber que existiam. Quem não precisa configurar o
          resto continua com o atalho de gerar agora, em botão secundário, pra
          não trocar um incômodo por três cliques obrigatórios. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => handleClose(false)} disabled={isSubmitting}>
          {t.cancel}
        </Button>
        {!isLastTab && (
          <Button
            variant="ghost"
            onClick={handleSubmit}
            disabled={isSubmitting || !customerId || !amount || amount <= 0 || documentBlocked}
          >
            {t.submitNow}
          </Button>
        )}
        <Button
          onClick={isLastTab ? handleSubmit : goToNextTab}
          disabled={
            isLastTab
              ? isSubmitting || !customerId || !amount || amount <= 0 || documentBlocked
              : isSubmitting
          }
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t.submitting}
            </>
          ) : isLastTab ? (
            t.submit
          ) : (
            <>
              {t.nextStep}
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  ) : null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleClose}
      title={t.dialogTitle}
      description={t.dialogDescription}
      footer={footer}
    >
      <div className="space-y-4 pb-1">
        {!result && !batchResult ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChargeTabKey)} className="space-y-4">
            <MobilePillTabs
              variant="underline"
              tabs={[
                {
                  value: TAB_COBRANCA,
                  label: t.tabs.charge,
                  icon: cobrancaTabHasError ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
                  ) : undefined,
                },
                { value: TAB_PAGAMENTO, label: t.tabs.payment },
                { value: TAB_ENCARGOS, label: t.tabs.fees },
                // Parcela de contrato não tem aba Financeiro: não existe escolha
                // de lançamento (a parcela já é o lançamento), e uma aba que só
                // mostra opção ignorada seria mentira na tela.
                ...(isLinkedToExistingEntry ? [] : [{ value: TAB_FINANCEIRO, label: t.tabs.finance }]),
              ]}
              activeTab={activeTab}
              onTabChange={(v) => setActiveTab(v as ChargeTabKey)}
            />

            {/* ── Aba: Cobrança (cliente, valor, vencimento, descrição) ────── */}
            <TabsContent value={TAB_COBRANCA} className="space-y-4">
              {/* Origem ligada a um lançamento que já existe (parcela de
                  contrato ou saldo de conta a receber): diz o que vai acontecer
                  quando o cliente pagar (a baixa vem sozinha) e por que não há
                  opção de lançar no financeiro. Sem isso, o sumiço da aba
                  parece bug. */}
              {isLinkedToExistingEntry && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                  <p className="text-xs leading-snug text-muted-foreground">
                    {tLinked.notice}
                  </p>
                </div>
              )}

              {/* Cliente */}
              <div className="space-y-2">
                <Label
                  htmlFor="charge-customer"
                  className={cn('text-sm font-medium', showCustomerError && 'text-destructive')}
                >
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
                    className={showCustomerError ? 'border-destructive ring-1 ring-destructive' : undefined}
                  />
                )}

                {/* Vínculo com a OS. Só aparece quando a cobrança NÃO nasceu de
                    uma origem (orçamento, parcela, "Faturar OS") — nesses casos o
                    vínculo já vem pronto e deixar o usuário trocar confundiria.
                    Aberta pelo Financeiro, é aqui que se amarra na OS. */}
                {!source && (
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor="charge-service-order">{t.fields.serviceOrderLabel}</Label>
                    <ServiceOrderSelectField
                      id="charge-service-order"
                      value={osVinculada}
                      onValueChange={setOsVinculada}
                      serviceOrders={osOptions}
                      placeholder={t.fields.serviceOrderPlaceholder}
                      searchPlaceholder={t.fields.serviceOrderSearchPlaceholder}
                      emptyMessage={t.fields.serviceOrderEmpty}
                      noneLabel={t.fields.serviceOrderNone}
                    />
                  </div>
                )}

                {/* Cliente sem CPF/CNPJ (ou com documento errado): avisa AQUI e
                    deixa completar o cadastro sem perder o que já foi preenchido.
                    Vale também no modo travado (cobrança vinda de um orçamento). */}
                {documentBlocked && documentMessage && (
                  <NoticeBanner
                    variant={showDocumentError ? 'destructive' : 'warning'}
                    action={
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditCustomerOpen(true)}
                      >
                        <UserCog className="mr-2 h-4 w-4" />
                        {t.missingDocument.cta}
                      </Button>
                    }
                  >
                    {documentMessage}
                  </NoticeBanner>
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
                    return updateCustomer.mutateAsync({ ...(data as CustomerInput), id: selectedCustomer.id });
                  }}
                  isLoading={updateCustomer.isPending}
                />
              )}

              {/* Valor (máscara de dinheiro, NÃO NumericInput) */}
              <div className="space-y-2">
                <Label
                  htmlFor="charge-amount"
                  className={cn('text-sm font-medium', showAmountError && 'text-destructive')}
                >
                  {isInstallmentBatch ? t.fields.totalValue : t.fields.value}
                </Label>
                {isLinkedToExistingEntry ? (
                  // Valor TRAVADO: a edge exige que a cobrança valha
                  // exatamente o da parcela (ou o SALDO da conta, no "cobrar o
                  // saldo"), com tolerância de 1 centavo. Se desse pra digitar,
                  // o usuário só descobriria o erro depois de clicar.
                  <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm font-medium text-foreground">
                    R$ {amountDisplay || '0,00'}
                  </div>
                ) : (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      R$
                    </span>
                    <Input
                      id="charge-amount"
                      className={cn('pl-9', showAmountError && 'border-destructive ring-1 ring-destructive')}
                      inputMode="numeric"
                      placeholder={t.fields.valuePlaceholder}
                      value={amountDisplay}
                      onChange={handleAmountChange}
                      onPaste={handleAmountPaste}
                    />
                  </div>
                )}
                {isLinkedToExistingEntry && (
                  <p className="text-xs text-muted-foreground">{tLinked.amountLockedHint}</p>
                )}
              </div>

              {/* Vencimento */}
              <div className="space-y-2">
                <Label
                  htmlFor="charge-due"
                  className={cn('text-sm font-medium', showDueDateError && 'text-destructive')}
                >
                  {t.fields.dueDate}
                </Label>
                <DatePicker
                  id="charge-due"
                  value={dueDate}
                  min={today}
                  onValueChange={setDueDate}
                  className={showDueDateError ? 'border-destructive ring-1 ring-destructive' : undefined}
                />
                {/* Vencimento e competência são coisas diferentes e o usuário
                    confundia as duas: o vencimento é quando o cliente tem que
                    pagar; a competência (o mês em que a receita aparece na DRE
                    por Regime de Competência) é a data de HOJE, porque é hoje
                    que a venda está sendo registrada. */}
                <p className="text-xs text-muted-foreground">
                  {t.fields.dueDateAccrualHint.replace('{date}', formatDate(today, locale, timezone))}
                </p>
              </div>

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
                  onChange={(e) => {
                    accountDefaultsTouchedRef.current.description = true;
                    setDescription(e.target.value);
                  }}
                />
              </div>
            </TabsContent>

            {/* ── Aba: Pagamento (forma, parcelas, quem paga a taxa) ────────── */}
            <TabsContent value={TAB_PAGAMENTO} className="space-y-4">
              {/* Forma de pagamento — só meios habilitados na conta */}
              <div className="space-y-2">
                <Label htmlFor="charge-method" className="text-sm font-medium">{t.fields.method}</Label>
                <Select
                  value={method}
                  onValueChange={(v) => {
                    setMethod(v as BillingMethod);
                    setInstallmentCount(1);
                    setInstallmentMode('fixed');
                  }}
                >
                  <SelectTrigger id="charge-method">
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
                {/* Só 1 meio habilitado: não há escolha real aqui — a aba não
                    fica vazia (o select some sozinho, mas o aviso some com o
                    caminho pra ativar mais meios). */}
                {methodOptions.length <= 1 && (
                  <p className="text-xs text-muted-foreground">{t.fields.methodSingleHint}</p>
                )}
              </div>

              {/* Cartão usa o parcelamento do próprio pagamento. Nos outros
                  meios, somente a cobrança avulsa gera N cobranças mensais. */}
              {/* Cartão: quem decide as parcelas. "Cliente escolhe" troca o
                  select abaixo pelo TETO (de 2x ao limite da conta). */}
              {canOfferCustomerInstallments && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t.installments.modeLabel}</Label>
                  <SegmentedControl
                    options={[
                      { value: 'fixed' as const, label: t.installments.modeFixed },
                      { value: 'customer' as const, label: t.installments.modeCustomer },
                    ]}
                    value={installmentMode}
                    onValueChange={(v) => {
                      setInstallmentMode(v);
                      setInstallmentCount(v === 'customer' ? cardMaxInstallments : 1);
                    }}
                    aria-label={t.installments.modeLabel}
                  />
                </div>
              )}

              {((method === 'CREDIT_CARD' && (customerChoosesInstallments || installmentOptions.length > 1)) || canCreateInstallmentBatch) && (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor="charge-installments" className="text-sm font-medium">
                      {customerChoosesInstallments ? t.installments.upToLabel : t.installments.label}
                    </Label>
                    <span className="text-right text-xs text-muted-foreground">
                      {customerChoosesInstallments
                        ? t.installments.customerModeHint
                        : method === 'CREDIT_CARD' ? t.installments.cardHint : t.installments.batchHint}
                    </span>
                  </div>
                  <Select
                    value={String(installmentCount)}
                    onValueChange={(v) => setInstallmentCount(Number(v))}
                  >
                    <SelectTrigger id="charge-installments">
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

                  {isInstallmentBatch && installmentPlan.length > 0 && (
                    <div className="space-y-1 border-l-2 border-primary/40 pl-3 text-xs">
                      <p className="font-medium tabular-nums text-foreground">
                        {t.installments.batchPreviewSummary(installmentCount, money(amount))}
                      </p>
                      <p className="tabular-nums text-muted-foreground">
                        {installmentPlan[0].amount === installmentPlan[installmentPlan.length - 1].amount
                          ? t.installments.batchPreviewEqual(
                              installmentCount,
                              money(installmentPlan[0].amount),
                            )
                          : t.installments.batchPreviewRemainder(
                              installmentCount - 1,
                              money(installmentPlan[0].amount),
                              money(installmentPlan[installmentPlan.length - 1].amount),
                            )}
                      </p>
                      <p className="text-muted-foreground">
                        {t.installments.batchPreviewDates(
                          formatDate(installmentPlan[0].date, locale, timezone),
                          formatDate(installmentPlan[installmentPlan.length - 1].date, locale, timezone),
                        )}
                      </p>
                      <p className="text-muted-foreground">{t.installments.batchFeesHint}</p>
                      {batchHasInstallmentBelowMinimum && (
                        <p className="font-medium text-destructive">{t.installments.minimumDescription}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Quem paga a taxa do cartão. Vale em QUALQUER cobrança de cartão
                  (inclusive à vista): o edge aplica o repasse sempre que
                  billingType = CREDIT_CARD, então esconder no 1x escondia um
                  repasse que acontecia mesmo assim. O efeito no dinheiro aparece
                  no resumo do recebimento, fixo no rodapé. */}
              {method === 'CREDIT_CARD' && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t.installments.feePayerLabel}</Label>
                  <SegmentedControl
                    options={[
                      { value: 'company' as const, label: t.installments.feePayerCompany },
                      { value: 'customer' as const, label: t.installments.feePayerCustomer },
                    ]}
                    value={feePayer}
                    onValueChange={(v) => {
                      accountDefaultsTouchedRef.current.feePayer = true;
                      setFeePayer(v);
                    }}
                    aria-label={t.installments.feePayerLabel}
                  />
                  <p className="text-xs text-muted-foreground">
                    {feePayer === 'customer'
                      ? t.installments.feePayerCustomerHint
                      : t.installments.feePayerCompanyHint}
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ── Aba: Encargos (multa, juros, desconto, dias) ──────────────── */}
            <TabsContent value={TAB_ENCARGOS} className="space-y-3">
              {/* Multa e Juros. A multa ganhou seletor de unidade (% ou R$) e
                  passou a ocupar a linha inteira no mobile: com o seletor ao
                  lado do rótulo, meia largura em 390px espremia o campo de
                  dinheiro a ponto de esconder o valor digitado. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="adv-fine" className="text-xs font-medium">
                      {fineType === 'FIXED' ? t.advanced.fineFixed : t.advanced.finePercent}
                    </Label>
                    {/* A Asaas aceita fine.type = PERCENTAGE ou FIXED; a escolha
                        vale por cobrança (o padrão da conta segue percentual). */}
                    <SegmentedControl
                      size="sm"
                      className="w-[96px] shrink-0"
                      options={[
                        { value: 'PERCENTAGE' as ChargeFineType, label: '%' },
                        { value: 'FIXED' as ChargeFineType, label: 'R$' },
                      ]}
                      value={fineType}
                      // Arrow (e não `setFineType` direto): passar o setter cru
                      // faz o TS inferir T = string e perder o tipo da união.
                      onValueChange={(v) => {
                        accountDefaultsTouchedRef.current.fine = true;
                        setFineType(v);
                      }}
                      aria-label={t.advanced.fineTypeAria}
                    />
                  </div>
                  {fineType === 'FIXED' ? (
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        R$
                      </span>
                      <Input
                        id="adv-fine"
                        className="pl-9"
                        inputMode="numeric"
                        placeholder="0,00"
                        value={fineAmountDisplay}
                        onChange={handleFineAmountChange}
                        onPaste={handleFineAmountPaste}
                      />
                    </div>
                  ) : (
                    <Input
                      id="adv-fine"
                      inputMode="decimal"
                      placeholder="2"
                      value={finePercent}
                      onChange={(e) => {
                        accountDefaultsTouchedRef.current.fine = true;
                        setFinePercent(e.target.value);
                      }}
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  {/* min-h casa a altura com a linha do rótulo da multa (que
                      carrega o seletor de unidade), senão os dois campos ficam
                      desalinhados lado a lado no desktop. */}
                  <div className="flex min-h-[30px] items-center">
                    <Label htmlFor="adv-interest" className="text-xs font-medium">
                      {t.advanced.interestPercent}
                    </Label>
                  </div>
                  <Input
                    id="adv-interest"
                    inputMode="decimal"
                    placeholder="1"
                    value={interestPercent}
                    onChange={(e) => {
                      accountDefaultsTouchedRef.current.interest = true;
                      setInterestPercent(e.target.value);
                    }}
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
                    onChange={(e) => {
                      accountDefaultsTouchedRef.current.discount = true;
                      setDiscountPercent(e.target.value);
                    }}
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
                    onChange={(e) => {
                      accountDefaultsTouchedRef.current.discountDays = true;
                      setDiscountDays(e.target.value.replace(/\D/g, ''));
                    }}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ── Aba: Financeiro (lançar no financeiro, categoria) ─────────── */}
            {!isLinkedToExistingEntry && (
            <TabsContent value={TAB_FINANCEIRO} className="space-y-4">
              {/* Lançar (ou não) esta cobrança no Financeiro — opção POR COBRANÇA
                  (pedido do CEO: nem toda cobrança precisa virar conta a
                  receber). O padrão vem da configuração da conta de recebimento. */}
              <div className="space-y-1.5 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">{t.postToFinance.label}</Label>
                  <LabeledSwitch<'no' | 'yes'>
                    value={postToFinance ? 'yes' : 'no'}
                    onChange={(v) => {
                      accountDefaultsTouchedRef.current.postToFinance = true;
                      setPostToFinance(v === 'yes');
                    }}
                    off={{ value: 'no', label: t.postToFinance.no }}
                    on={{ value: 'yes', label: t.postToFinance.yes }}
                    aria-label={t.postToFinance.label}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {postToFinance ? t.postToFinance.hintOn : t.postToFinance.hintOff}
                </p>
              </div>

              {/* Categoria do recebível no Financeiro — só faz sentido quando a
                  cobrança vai gerar lançamento. Opcional, sobrescreve o default
                  da conta de recebimento quando escolhida. */}
              {postToFinance && (
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
              )}

              {/* Centro de custo do recebível — mesma régua do resto do domínio:
                  sempre opcional, some da tela pra quem não usa (zero centros
                  ativos cadastrados). Só faz sentido junto do lançamento no
                  Financeiro, por isso vive dentro do mesmo `postToFinance`. */}
              {postToFinance && activeCostCenters.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{fin.costCenters.fieldLabel}</Label>
                  <CostCenterSelect
                    value={costCenterId}
                    onValueChange={setCostCenterId}
                  />
                  <p className="text-xs text-muted-foreground">{t.fields.costCenterHint}</p>
                </div>
              )}
            </TabsContent>
            )}
          </Tabs>
        ) : batchResult ? (
          /* ── Resultado do lote: compacto, com recuperação das falhas ───── */
          <div className="space-y-4">
            <div className={cn(
              'flex items-center gap-2',
              batchResult.completed ? 'text-emerald-600' : 'text-amber-600',
            )}>
              {batchResult.completed
                ? <CheckCircle2 className="h-5 w-5 shrink-0" />
                : <AlertTriangle className="h-5 w-5 shrink-0" />}
              <p className="text-sm font-semibold">
                {batchResult.completed
                  ? t.installments.batchSuccessTitle
                  : t.installments.batchPartialTitle}
              </p>
            </div>

            <p className="text-sm text-muted-foreground">
              {batchResult.completed
                ? t.installments.batchSuccessDescription(batchResult.total)
                : t.installments.batchPartialDescription(
                    batchResult.total - batchResult.failed,
                    batchResult.failed,
                  )}
            </p>

            {!batchResult.completed && (
              <NoticeBanner variant="warning" title={t.installments.batchPartialNoticeTitle}>
                {t.installments.batchPartialNotice}
              </NoticeBanner>
            )}

            <div className="max-h-[42vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
              {batchResult.installments.map((item) => {
                const planned = installmentPlan.find((row) => row.number === item.number);
                const url = getBatchChargeUrl(item);
                const itemValue = item.charge?.value ?? planned?.amount ?? 0;
                const itemDate = item.charge?.due_date ?? planned?.date ?? null;
                return (
                  <div key={item.number} className="space-y-1.5 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {t.installments.batchItem(item.number, batchResult.total)}
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {money(itemValue)}
                          {itemDate ? ` · ${formatDate(itemDate, locale, timezone)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className={cn(
                          'mr-1 text-xs font-medium',
                          item.status === 'failed' ? 'text-destructive' : 'text-emerald-600',
                        )}>
                          {item.status === 'failed'
                            ? t.installments.batchStatusFailed
                            : item.status === 'existing'
                              ? t.installments.batchStatusExisting
                              : t.installments.batchStatusCreated}
                        </span>
                        {url && (
                          <>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={t.installments.openInstallment(item.number)}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleCopyInstallment(item.number, url)}
                              aria-label={t.installments.copyInstallment(item.number)}
                            >
                              {copiedInstallment === item.number
                                ? <Check className="h-4 w-4 text-emerald-600" />
                                : <Copy className="h-4 w-4" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {item.error && (
                      <p className="text-xs leading-snug text-destructive">{item.error}</p>
                    )}
                    {item.charge?.financeWarning && (
                      <p className="text-xs leading-snug text-amber-700 dark:text-amber-400">
                        {item.charge.financeWarning}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
              {batchResult.failed > 0 && (
                <Button
                  type="button"
                  onClick={handleRetryInstallmentBatch}
                  disabled={createInstallmentBatch.isPending}
                >
                  {createInstallmentBatch.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <RefreshCw className="mr-2 h-4 w-4" />}
                  {createInstallmentBatch.isPending
                    ? t.installments.retrying
                    : t.installments.retryFailed(batchResult.failed)}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={createInstallmentBatch.isPending}
              >
                {t.success.newCharge}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleClose(false)}
                disabled={createInstallmentBatch.isPending}
              >
                {t.success.close}
              </Button>
            </div>
          </div>
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

            {/* Aviso PERSISTENTE (não só toast): a cobrança foi criada mas o
                lançamento automático no Financeiro falhou. Dinheiro não pode
                ter falha silenciosa. */}
            {financeWarning && (
              <NoticeBanner
                variant="warning"
                title={isLinkedToExistingEntry ? tLinked.warningTitle : t.financeWarning.title}
              >
                {financeWarning}
              </NoticeBanner>
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

            {customerWhatsappRoutes.isError ? (
              <NoticeBanner variant="warning">
                {WHATSAPP_RECIPIENT_COPY[locale].loadError}
              </NoticeBanner>
            ) : billingWhatsappRecipients.disabled ? (
              <NoticeBanner variant="warning">
                {WHATSAPP_RECIPIENT_COPY[locale].disabled}
              </NoticeBanner>
            ) : billingWhatsappRecipients.isExplicit && whatsappRecipientOptions.length === 0 ? (
              <NoticeBanner variant="warning">
                {WHATSAPP_RECIPIENT_COPY[locale].unavailable}
              </NoticeBanner>
            ) : whatsappRecipientOptions.length > 1 ? (
              <div className="space-y-2">
                <Label htmlFor="charge-whatsapp-recipient">
                  {WHATSAPP_RECIPIENT_COPY[locale].label}
                </Label>
                <Select value={selectedWhatsappRecipient?.key ?? ''} onValueChange={setWhatsappRecipientKey}>
                  <SelectTrigger id="charge-whatsapp-recipient">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {whatsappRecipientOptions.map((recipient) => (
                      <SelectItem key={recipient.key} value={recipient.key}>
                        {recipient.name} · {recipient.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : selectedWhatsappRecipient ? (
              <p className="text-xs text-muted-foreground">
                {WHATSAPP_RECIPIENT_COPY[locale].sendingTo} <span className="font-medium text-foreground">{selectedWhatsappRecipient.name}</span>.
              </p>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button
                type="button"
                onClick={handleSendWhatsapp}
                disabled={
                  customerWhatsappRoutes.isLoading
                  || customerWhatsappRoutes.isError
                  || billingWhatsappRecipients.disabled
                  || (billingWhatsappRecipients.isExplicit && !selectedWhatsappRecipient)
                }
                className="bg-[#25D366] hover:bg-[#1fb955] text-white"
              >
                {customerWhatsappRoutes.isLoading
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <WhatsAppIcon className="mr-2 h-4 w-4" />}
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
