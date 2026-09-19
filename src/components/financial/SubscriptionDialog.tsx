import { useState, useEffect, useMemo } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { formatMoney, toBcp47 } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { NumericInput } from '@/components/ui/numeric-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/mobile/EmptyState';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import { CategorySelectField } from '@/components/financial/CategorySelectField';
import { CostCenterSelect } from '@/components/financial/CostCenterSelect';
import { useCostCenters } from '@/hooks/useCostCenters';
import { AlertTriangle, Calculator, ChevronDown, ChevronUp, Copy, ExternalLink, Info, Loader2, Users } from 'lucide-react';
import { useCustomers } from '@/hooks/useCustomers';
import {
  useTenantSubscriptions,
  MethodNotEnabledError,
  type SubscriptionCycle,
  type SubscriptionBillingType,
  type PixAutoAuthorization,
} from '@/hooks/useTenantSubscriptions';
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
import { computeSubscriptionTotals } from '@/lib/subscriptionSummary';
import { MAX_REPETITION_COUNT } from '@/lib/finance-installments';
import { readPastedCents } from '@/lib/money-paste-mask';

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

/**
 * Quantos dias faltam de hoje até `iso` (yyyy-mm-dd). Comparação dia-a-dia em
 * UTC a partir dos componentes da data local, nunca vira o dia por fuso.
 * Usado só pelo resumo (prazo de crédito da 1ª cobrança).
 */
function daysFromToday(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return 0;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((target - today) / 86400000));
}

/** Forma de pagamento da assinatura → meio entendido pelo simulador de taxas. */
const METHOD_TO_SIMULATOR: Record<'PIX' | 'BOLETO' | 'CREDIT_CARD', SimulatorMethod> = {
  PIX: 'pix',
  BOLETO: 'boleto',
  CREDIT_CARD: 'card',
};

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
  // O resumo do recebimento reusa a copy da cobrança avulsa (taxa da Asaas,
  // "você recebe", "quanto o cliente paga"): é a MESMA conta, com as mesmas
  // palavras, já traduzida nos 4 idiomas. Só o que é específico de assinatura
  // (por cobrança x total) vive em `t.net`.
  const tCobrar = MESSAGES[locale].app.charges.cobrar;
  const fin = MESSAGES[locale].app.finance;

  const { customers } = useCustomers();
  const { createSubscription, authorizePixAuto } = useTenantSubscriptions();
  const paymentAccount = useTenantPaymentAccount();
  const { activeCostCenters } = useCostCenters();

  const { defaultFinePercent, defaultInterestPercent, cardRecurringEnabled, pixAutoEnabled } = paymentAccount;

  // Taxas EFETIVAS da conta Asaas do tenant, usadas no RESUMO do líquido de
  // CADA cobrança da assinatura. É estimativa mostrada antes de criar: o número
  // contratual é o que a Asaas aplica em cada ciclo.
  const {
    card: cardFees,
    pix: pixFee,
    bankSlip: bankSlipFee,
    anticipation: anticipationFee,
    settlementDays: accountSettlementDays,
    source: cardFeesSource,
    extrasSource: feeExtrasSource,
    isLoading: feesLoading,
  } = useTenantFees({ enabled: open });

  // ── Form state ─────────────────────────────────────────────────────────────
  const [customerId, setCustomerId] = useState(presetCustomerId ?? '');
  const [amount, setAmount] = useState(0);
  const [cycle, setCycle] = useState<SubscriptionCycle>(presetCycle ?? 'MONTHLY');
  const [billingType, setBillingType] = useState<SubscriptionBillingType>('UNDEFINED');
  const [firstDueDate, setFirstDueDate] = useState(todayISO());
  const [description, setDescription] = useState(presetDescription ?? '');
  // Categoria do recebível recorrente no Financeiro. Vazia = usa o default da conta.
  const [category, setCategory] = useState('');
  // Centro de custo do recebível recorrente. Sem default de conta (sempre null se não escolhido).
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // A multa tem DOIS campos e um seletor de unidade: a Asaas aceita
  // `fine.type = PERCENTAGE | FIXED`. Os valores são guardados separados de
  // propósito, alternar % ↔ R$ e voltar não reinterpreta "2" como "R$ 2,00"
  // nem "50" como "50%" (mesmo desenho da cobrança avulsa).
  const [fineType, setFineType] = useState<ChargeFineType>('PERCENTAGE');
  const [fineAmount, setFineAmount] = useState(0); // em reais, máscara de centavos
  const [finePercent, setFinePercent] = useState('');
  const [interestPercent, setInterestPercent] = useState('');
  // Resumo do recebimento: fica no rodapé do modal, sempre visível. Só a linha
  // do líquido por cobrança aparece fechada; o detalhamento abre aqui.
  const [netExpanded, setNetExpanded] = useState(false);
  // Duração: assinatura nasce CONTÍNUA (sem fim) — o oposto do padrão da
  // tarefa recorrente, que nasce COM fim. Ver TaskFormDialog.tsx.
  const [durationLimited, setDurationLimited] = useState(false);
  const [maxCycles, setMaxCycles] = useState('');

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
      // O default da CONTA é percentual (default_fine_percent), então abrir
      // sempre começa em %. A escolha de reais vale só para esta assinatura.
      setFineType('PERCENTAGE');
      setFineAmount(0);
      setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
      setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
      setNetExpanded(false);
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
    setCategory('');
    setCostCenterId(null);
    setShowAdvanced(false);
    setFineType('PERCENTAGE');
    setFineAmount(0);
    setFinePercent(defaultFinePercent != null ? String(defaultFinePercent) : '');
    setInterestPercent(defaultInterestPercent != null ? String(defaultInterestPercent) : '');
    setDurationLimited(false);
    setMaxCycles('');
    setNetExpanded(false);
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
  // segue como texto decimal livre.
  const handleFineAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setFineAmount(parseInt(raw || '0', 10) / 100);
  };
  const handleFineAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents != null) setFineAmount(cents / 100);
  };
  const fineAmountDisplay = fineAmount
    ? fineAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  // Verifica se o billingType selecionado é Pix Auto (sentinel string)
  const isPixAuto = billingType === ('PIX_AUTO' as SubscriptionBillingType);
  const isCreditCard = billingType === 'CREDIT_CARD';

  // Só se aplica a Pix/Boleto/Cliente escolhe/Cartão (POST /subscriptions da
  // Asaas). Pix Automático usa outro recurso na Asaas (autorização, não
  // assinatura) que não aceita limitar por número de ciclos — por isso o
  // switch de Duração nem aparece nesse fluxo (ver JSX abaixo).
  //
  // O TETO é o mesmo do motor de parcelamento do Financeiro
  // (`MAX_REPETITION_COUNT` = 120 = 10 anos de mensalidade): o limite físico
  // mora no motor e a mensagem em PT-BR mora aqui. Sem teto, "1200" numa
  // assinatura mensal vira cem anos de cobrança automática, e quem paga a
  // conta é o cliente do cliente. A edge recusa o mesmo número, pra quem
  // chamar direto.
  const parsedMaxCycles = parseInt(maxCycles, 10);
  const maxCyclesFilled = maxCycles.trim() !== '';
  const maxCyclesTooHigh = maxCyclesFilled && Number.isFinite(parsedMaxCycles) && parsedMaxCycles > MAX_REPETITION_COUNT;
  const maxCyclesValid =
    Number.isInteger(parsedMaxCycles) && parsedMaxCycles >= 1 && parsedMaxCycles <= MAX_REPETITION_COUNT;
  const maxPayments = !isPixAuto && durationLimited && maxCyclesValid ? parsedMaxCycles : undefined;
  // Duração limitada sem um número válido não pode sair: mandar sem
  // `max_payments` criaria uma assinatura CONTÍNUA sem ninguém pedir.
  const durationBlocked = !isPixAuto && durationLimited && !maxCyclesValid;

  const handleSubmit = async () => {
    if (!customerId || !amount || amount <= 0) return;
    if (durationBlocked) return;

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
          // Destino contábil vale em QUALQUER forma de pagamento. Antes estes
          // dois campos sumiam da tela no Pix Automático e o que o usuário
          // tinha digitado era descartado aqui, em silêncio.
          category: category.trim() || undefined,
          cost_center_id: costCenterId,
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
          category: category.trim() || undefined,
          cost_center_id: costCenterId,
          // Multa: manda SÓ o campo do modo escolhido, nunca os dois. Em % o
          // payload é o de sempre (sem `fine_type`); em R$ o percentual não vai,
          // então uma edge antiga (janela de deploy) só ignora a multa fixa em
          // vez de cobrar "R$ 50" como "50%" todo mês. Ver hook e 1.24.51.
          fine_type: fineType === 'FIXED' ? 'FIXED' : undefined,
          fine_value: fineType === 'FIXED' ? fineAmount : undefined,
          fine_percent: fineType === 'FIXED' || isNaN(parsedFine) ? undefined : parsedFine,
          interest_percent: isNaN(parsedInterest) ? undefined : parsedInterest,
          source_type: source?.type,
          source_id: source?.id,
          max_payments: maxPayments,
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
      category: category.trim() || undefined,
      cost_center_id: costCenterId,
      // Multa: manda SÓ o campo do modo escolhido, nunca os dois (ver o bloco
      // do cartão acima e o hook `useTenantSubscriptions`).
      fine_type: fineType === 'FIXED' ? 'FIXED' : undefined,
      fine_value: fineType === 'FIXED' ? fineAmount : undefined,
      fine_percent: fineType === 'FIXED' || isNaN(parsedFine) ? undefined : parsedFine,
      interest_percent: isNaN(parsedInterest) ? undefined : parsedInterest,
      source_type: source?.type,
      source_id: source?.id,
      max_payments: maxPayments,
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
  const isValid = !!customerId && amount > 0 && !durationBlocked;

  // ── Resumo do recebimento POR COBRANÇA ──────────────────────────────────────
  // Mesma régua da cobrança avulsa: a fórmula do líquido é a do
  // `asaasFeeSimulator` e a do que o cliente paga é a do `chargeCustomerAmounts`
  // — nenhuma conta de dinheiro nasce dentro deste componente. A diferença da
  // assinatura é que TODO número aqui é de UMA cobrança: o que multiplica pelo
  // número de ciclos (quando a assinatura tem fim) é o `subscriptionSummary`.
  const dueDays = useMemo(() => daysFromToday(firstDueDate), [firstDueDate]);

  const simulatorMethod: SimulatorMethod | null = isPixAuto
    // Pix Automático é debitado por Pix: a taxa que a Asaas cobra é a do Pix.
    ? 'pix'
    : billingType === 'UNDEFINED'
      ? null
      : METHOD_TO_SIMULATOR[billingType as 'PIX' | 'BOLETO' | 'CREDIT_CARD'];

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

  const simulation = useMemo<SimulationResult | null>(() => {
    if (!simulatorMethod || !tenantFees || amount <= 0) return null;
    return simulateNetAmount({
      amount,
      method: simulatorMethod,
      // Uma cobrança por ciclo: assinatura não parcela no cartão, ela repete.
      installments: 1,
      // Não existe repasse de taxa na assinatura (a edge não infla o valor
      // recorrente), então a empresa sempre absorve.
      feePayer: 'company',
      fees: tenantFees,
      anticipate: false,
      dueDays,
    });
  }, [simulatorMethod, tenantFees, amount, dueDays]);

  // "Cliente escolhe": não dá pra saber a taxa antes, então mostramos quanto
  // sobra por cobrança em cada meio habilitado.
  const multiSimulation = useMemo(() => {
    if (simulatorMethod !== null || !tenantFees || amount <= 0) return null;
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
    if (paymentAccount.allowPix) rows.push({ key: 'pix', label: t.billing_types.PIX, result: run('pix') });
    if (paymentAccount.allowBoleto) rows.push({ key: 'boleto', label: t.billing_types.BOLETO, result: run('boleto') });
    return rows.length > 0 ? rows : null;
  }, [simulatorMethod, tenantFees, amount, dueDays, paymentAccount.allowPix, paymentAccount.allowBoleto, t.billing_types]);

  // Alguma taxa mostrada NÃO veio da conta do tenant (caiu na tabela de
  // referência). Nesse caso o número é aproximado e a UI tem que dizer isso.
  const feesAreReference =
    (simulatorMethod === 'card'
      ? cardFeesSource === 'fallback'
      : simulatorMethod != null
        ? feeExtrasSource === 'fallback'
        : cardFeesSource === 'fallback' || feeExtrasSource === 'fallback') ||
    simulation?.usedReferenceFees === true ||
    multiSimulation?.some((r) => r.result.usedReferenceFees) === true;

  // Quanto o CLIENTE paga numa cobrança atrasada. A assinatura não oferece
  // desconto por antecipação hoje (não há campo), então só o lado do atraso
  // aparece — o módulo já devolve `hasDiscount: false` e a UI não inventa linha.
  const numOrZero = (raw: string) => {
    const v = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(v) ? v : 0;
  };
  const finePercentValue = numOrZero(finePercent);
  const interestPercentValue = numOrZero(interestPercent);

  const customerAmounts = useMemo(
    () =>
      computeCustomerAmounts({
        baseAmount: amount,
        fineType,
        finePercent: finePercentValue,
        fineAmount,
        interestPercent: interestPercentValue,
        lateDays: LATE_SCENARIO_DAYS,
      }),
    [amount, fineType, finePercentValue, fineAmount, interestPercentValue],
  );

  // Por cobrança x total da assinatura. `cycles` só existe quando a duração é
  // limitada E o número é válido: contínua não tem total, e mostrar um total
  // chutado seria mentir sobre dinheiro.
  const totals = useMemo(
    () =>
      computeSubscriptionTotals({
        netPerCycle: simulation?.net ?? 0,
        customerPerCycle: amount,
        cycles: !isPixAuto && durationLimited && maxCyclesValid ? parsedMaxCycles : null,
      }),
    [simulation, amount, isPixAuto, durationLimited, maxCyclesValid, parsedMaxCycles],
  );

  const money = (v: number) => formatMoney(v, 'BRL', locale);
  const percentLabel = (v: number) => {
    try {
      return `${v.toLocaleString(toBcp47(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    } catch {
      return `${v.toFixed(2)}%`;
    }
  };

  const netLoading = amount > 0 && feesLoading && !tenantFees;
  const netFeesUnavailable = amount > 0 && !feesLoading && !tenantFees;
  const netHasDetail = amount > 0 && !!tenantFees && (!!simulation || !!multiSimulation);

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

  // ── Rodapé (fora do scroll) ────────────────────────────────────────────────
  // Só existe enquanto o formulário de criação está aberto: nas telas de QR do
  // Pix Automático e de "método não habilitado" as ações já vêm embutidas no
  // conteúdo. O resumo fica aqui, sempre visível, porque é a informação que
  // decide o "criar ou não" e ninguém deveria precisar rolar pra achá-la.
  const showForm = customers.length > 0 && !methodNotEnabled && !pixAuth;
  const footer = showForm ? (
    <div className="space-y-2">
      {amount > 0 && (
        <div className="overflow-hidden rounded-md border border-border bg-muted/40">
          {netLoading && (
            <div className="flex items-center gap-2 px-3 py-2">
              <Calculator className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{tCobrar.net.loading}</p>
            </div>
          )}

          {netFeesUnavailable && (
            <div className="flex items-start gap-2 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p className="text-xs leading-snug text-foreground">{tCobrar.net.fallbackWarning}</p>
            </div>
          )}

          {netHasDetail && (
            <>
              {/* Cabeçalho SEMPRE visível. O título diz "por cobrança" e o
                  valor ao lado é o de UMA cobrança: numa assinatura de 12x,
                  um número solto seria lido como o total do contrato. */}
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
                  {simulation ? (
                    <span className="text-sm font-bold tabular-nums text-success">
                      {money(simulation.net)}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">{tCobrar.net.chooseCompact}</span>
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
                  {feesAreReference && (
                    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <p className="text-xs leading-snug text-foreground">{tCobrar.net.fallbackWarning}</p>
                    </div>
                  )}

                  {simulation && (
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">{tCobrar.net.gross}</dt>
                        <dd className="font-medium tabular-nums text-foreground">{money(amount)}</dd>
                      </div>

                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-muted-foreground">
                          {tCobrar.net.fee}
                          <span className="block text-[11px] leading-snug text-muted-foreground">
                            {simulation.feeBreakdown.percent > 0
                              ? tCobrar.net.feeComposition(
                                  percentLabel(simulation.feeBreakdown.percent),
                                  money(simulation.feeBreakdown.fixed),
                                )
                              : tCobrar.net.feeFixedOnly(money(simulation.feeBreakdown.fixed))}
                          </span>
                        </dt>
                        <dd className="font-medium tabular-nums text-destructive">
                          - {money(simulation.feeTotal)}
                        </dd>
                      </div>

                      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                        <dt className="font-semibold text-foreground">{tCobrar.net.net}</dt>
                        <dd className="text-base font-bold tabular-nums text-success">
                          {money(simulation.net)}
                        </dd>
                      </div>
                    </dl>
                  )}

                  {/* "Cliente escolhe": líquido POR COBRANÇA em cada meio. */}
                  {multiSimulation && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">{tCobrar.net.chooseTitle}</p>
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

                  {/* A premissa do resumo, escrita: é UMA cobrança, com a
                      frequência escolhida. Sem esta linha o número de cima
                      parece o total da assinatura. */}
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {t.net.perCycleNote(t.cycles[cycle])}
                  </p>

                  {/* Total: só quando a assinatura TEM fim. Contínua não tem
                      total fechado, e o texto diz isso em vez de omitir. */}
                  {totals.isLimited && totals.netTotal != null && totals.cycles != null ? (
                    <p className="text-xs leading-snug text-foreground">
                      {t.net.totalLimited(totals.cycles, money(totals.netTotal))}
                      {totals.customerTotal != null && (
                        <span className="block text-[11px] text-muted-foreground">
                          {t.net.customerTotalLimited(totals.cycles, money(totals.customerTotal))}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] leading-snug text-muted-foreground">{t.net.continuousNote}</p>
                  )}

                  {/* Quanto o CLIENTE paga atrasado. Só aparece quando há
                      multa/juros de verdade configurados; o recorte de atraso
                      vai escrito junto do número (juros da Asaas são ao mês e
                      crescem por dia). Nunca no Pix Automático: aquele fluxo
                      não manda multa nem juros pra Asaas (o formulário nem
                      mostra os campos), então a linha seria mentira. */}
                  {!isPixAuto && customerAmounts.hasLateCharges && (
                    <div className="space-y-1.5 border-t border-border pt-2.5">
                      <p className="text-xs font-medium text-muted-foreground">{tCobrar.net.customerTitle}</p>
                      <dl className="space-y-1.5 text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="min-w-0 text-muted-foreground">
                            {tCobrar.net.customerLate(customerAmounts.lateDays)}
                            <span className="block text-[11px] leading-snug text-muted-foreground">
                              {customerAmounts.fineAmount > 0 && customerAmounts.interestAmount > 0
                                ? tCobrar.net.customerLateBoth(
                                    money(customerAmounts.fineAmount),
                                    money(customerAmounts.interestAmount),
                                    percentLabel(interestPercentValue),
                                  )
                                : customerAmounts.fineAmount > 0
                                  ? tCobrar.net.customerLateFine(money(customerAmounts.fineAmount))
                                  : tCobrar.net.customerLateInterest(
                                      money(customerAmounts.interestAmount),
                                      percentLabel(interestPercentValue),
                                    )}
                            </span>
                          </dt>
                          <dd className="shrink-0 font-medium tabular-nums text-warning">
                            {money(customerAmounts.amountWhenLate)}
                          </dd>
                        </div>
                      </dl>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        {tCobrar.net.customerLateHint(customerAmounts.lateDays)}
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] leading-snug text-muted-foreground">{tCobrar.net.estimate}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => handleClose(false)} disabled={isPending}>
          {t.cancel}
        </Button>
        <Button onClick={handleSubmit} disabled={isPending || !isValid}>
          {submitLabel()}
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
                    <CustomerSelectField
                      customers={customers}
                      value={customerId}
                      onValueChange={setCustomerId}
                      placeholder={t.fields.customerPlaceholder}
                      requireDocument
                    />
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
                      onPaste={handleAmountPaste}
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

                {/* Duração: quantos ciclos a assinatura vai durar.
                    Nasce CONTÍNUA (oposto da tarefa recorrente, que nasce com
                    fim). Vira `maxPayments` no POST /subscriptions da Asaas, que
                    encerra a assinatura sozinha ao esgotar e dispara o webhook.
                    Não aparece no Pix Automático: aquele fluxo é autorização,
                    não assinatura, e não aceita limite de ciclos. */}
                {!isPixAuto && (
                  // flex-col (não space-y): Label é inline e LabeledSwitch é
                  // inline-flex — em space-y os dois colam na mesma linha.
                  <div className="flex flex-col items-start gap-2">
                    <Label className="text-sm font-medium">{t.fields.duration}</Label>
                    <LabeledSwitch
                      value={durationLimited ? 'limited' : 'continuous'}
                      onChange={(v) => setDurationLimited(v === 'limited')}
                      off={{ value: 'continuous', label: t.fields.durationContinuous }}
                      on={{ value: 'limited', label: t.fields.durationLimited }}
                      aria-label={t.fields.duration}
                    />

                    {durationLimited ? (
                      <div className="space-y-2 pt-1">
                        <Label htmlFor="sub-max-cycles" className="text-sm font-medium">
                          {t.fields.maxCycles}
                        </Label>
                        <NumericInput
                          id="sub-max-cycles"
                          value={maxCycles}
                          onValueChange={setMaxCycles}
                          placeholder="12"
                          className={maxCyclesTooHigh ? 'border-destructive ring-1 ring-destructive' : undefined}
                          aria-invalid={maxCyclesTooHigh || undefined}
                        />
                        {/* Acima do teto, a mensagem em PT-BR aparece NO campo
                            e o botão de criar fica desabilitado: nada de clamp
                            silencioso trocando o número digitado sem avisar. */}
                        {maxCyclesTooHigh ? (
                          <p className="text-xs font-medium text-destructive">
                            {t.validation.maxCyclesTooHigh(MAX_REPETITION_COUNT)}
                          </p>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground">{t.fields.maxCyclesHint}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.fields.maxCyclesMaxHint(MAX_REPETITION_COUNT)}
                            </p>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2.5">
                        {t.fields.durationContinuousHint}
                      </p>
                    )}
                  </div>
                )}

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

                {/* Categoria do recebível recorrente no Financeiro — opcional,
                    sobrescreve o default da conta de recebimento quando escolhida.
                    Aparece em TODAS as formas de pagamento, inclusive Pix e Pix
                    Automático: categoria é destino contábil do recebível, não
                    configuração do meio de pagamento. Escondê-la no Pix
                    Automático (como era até aqui) fazia o valor já digitado ser
                    descartado em silêncio no envio. */}
                <div className="space-y-2">
                  <Label htmlFor="sub-category" className="text-sm font-medium">
                    {t.fields.category}
                  </Label>
                  <CategorySelectField
                    id="sub-category"
                    type="entrada"
                    value={category}
                    onValueChange={setCategory}
                  />
                  <p className="text-xs text-muted-foreground">{t.fields.categoryHint}</p>
                </div>

                {/* Centro de custo do recebível recorrente — mesma régua do
                    resto do domínio: sempre opcional, some da tela pra quem
                    não usa (zero centros ativos cadastrados). Também vale em
                    qualquer forma de pagamento, pelo mesmo motivo da categoria. */}
                {activeCostCenters.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{fin.costCenters.fieldLabel}</Label>
                    <CostCenterSelect
                      value={costCenterId}
                      onValueChange={setCostCenterId}
                    />
                    <p className="text-xs text-muted-foreground">{t.fields.costCenterHint}</p>
                  </div>
                )}

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

                    {/* Multa e juros de CADA cobrança da assinatura. A multa
                        ganhou seletor de unidade (% ou R$) e ocupa a linha
                        inteira no mobile: com o seletor ao lado do rótulo,
                        meia largura em 390px espremia o campo de dinheiro. */}
                    {showAdvanced && (
                      <div className="grid grid-cols-1 gap-3 border-t border-border px-3 pb-3 pt-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="sub-fine" className="text-xs font-medium">
                              {fineType === 'FIXED' ? t.advanced.fineFixed : t.advanced.finePercent}
                            </Label>
                            {/* A Asaas aceita fine.type = PERCENTAGE ou FIXED; a
                                escolha vale por assinatura (o padrão da conta
                                segue percentual). */}
                            <SegmentedControl
                              size="sm"
                              className="w-[96px] shrink-0"
                              options={[
                                { value: 'PERCENTAGE' as ChargeFineType, label: '%' },
                                { value: 'FIXED' as ChargeFineType, label: 'R$' },
                              ]}
                              value={fineType}
                              // Arrow (e não `setFineType` direto): passar o setter
                              // cru faz o TS inferir T = string e perder a união.
                              onValueChange={(v) => setFineType(v)}
                              aria-label={t.advanced.fineTypeAria}
                            />
                          </div>
                          {fineType === 'FIXED' ? (
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                R$
                              </span>
                              <Input
                                id="sub-fine"
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
                              id="sub-fine"
                              inputMode="decimal"
                              placeholder="2"
                              value={finePercent}
                              onChange={(e) => setFinePercent(e.target.value)}
                            />
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {/* min-h casa a altura com a linha do rótulo da multa
                              (que carrega o seletor de unidade), senão os dois
                              campos ficam desalinhados lado a lado no desktop. */}
                          <div className="flex min-h-[30px] items-center">
                            <Label htmlFor="sub-interest" className="text-xs font-medium">
                              {t.advanced.interestPercent}
                            </Label>
                          </div>
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

                {/* As ações (Cancelar / Criar assinatura) moraram aqui até a
                    chegada do resumo: agora vivem no rodapé do modal, junto
                    dele, fora do scroll. */}
              </>
            )}
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
