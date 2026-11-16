import { type ComponentType, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Check,
  CircleDollarSign,
  CreditCard,
  Handshake,
  Landmark,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Ticket,
  Vault,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PdvMoneyInput } from '@/components/pdv/caixa/PdvMoneyInput';
import {
  AccountOptionIcon,
  type AccountOptionSource,
} from '@/components/financial/accountSelectOptions';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { pdvCashErrorMessage } from '@/lib/pdv/cash-errors';
import { round2 } from '@/lib/pdv/cash';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { todayInTz } from '@/lib/timezone';
import { isPdvVoucherEligible } from '@/lib/pdv/voucherEligibility';
import { cn } from '@/lib/utils';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SignedImg } from '@/components/ui/SignedImg';
import { PixIcon } from '@/components/ui/PixIcon';
import { AnimatePresence, motion, useIsPresent, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { PdvCheckoutDisclosure } from './PdvCheckoutDisclosure';
import { usePdvCheckoutLayoutPreference } from '@/hooks/usePdvCheckoutLayoutPreference';
import {
  autofillPaymentRemainder,
  computeRemaining,
  computeRowChange,
  computeTotalChange,
  newPaymentRow,
  requiresAccount,
  sumFiado,
  sumPayments,
  toSettlePayload,
  validatePayments,
  type PaymentIssueCode,
  type PaymentRow,
  type PdvPaymentMethod,
} from '@/lib/pdv/payment';
import type { PdvCustomerCredit } from '@/hooks/usePdvSale';
import { usePdvCustomerPaymentOptions } from '@/hooks/usePdvCustomerPaymentOptions';
import { useIsCompact } from '@/hooks/use-mobile';
import type { pdv } from '@/lib/i18n/messages/app/pdv';
import './PdvCheckoutPreview.css';

type PaymentTexts = (typeof pdv)['pt-br']['cashier']['payment'];

export interface PdvPaymentSummaryItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
  imageUrl?: string | null;
}

export interface PdvPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  texts: PaymentTexts;
  /** Total da venda (subtotal − desconto). */
  total: number;
  /** Quantidade de linhas no carrinho (a RPC recusa pedido sem item). */
  itemCount: number;
  /** Nome do cliente do pedido, quando há. `null` = venda sem cliente. */
  customerName: string | null;
  summaryItems?: readonly PdvPaymentSummaryItem[];
  summarySubtotal?: number;
  summaryDiscount?: number;
  customerId?: string | null;
  /** Contrato v2: libera saldo, voucher e carnê. O legado continua simples. */
  advancedPaymentsEnabled?: boolean;
  /** Voucher já escolhido no resumo. Continua settlement no payload, mas não aparece como forma de recebimento. */
  appliedVoucher?: { voucherId: string; code: string; amount: number } | null;
  appliedVouchers?: readonly { voucherId: string; code: string; amount: number }[];
  /** Ação/linha de voucher para fluxos sem resumo de carrinho, como a fila do caixa. */
  appliedCreditContent?: ReactNode;
  /** Impede finalizar enquanto uma seção embutida, como a escolha de voucher, está em edição. */
  embeddedEditorOpen?: boolean;
  /** Limite e saldo devedor do cliente, pro fiado. */
  customerCredit: PdvCustomerCredit | null;
  customerCreditPending?: boolean;
  customerCreditError?: boolean;
  customerCreditErrorMessage?: string | null;
  onRetryCustomerCredit?: () => unknown;
  /** Contas que podem receber Pix, transferência e cartão (sem cartão de crédito). */
  accounts: AccountOptionSource[];
  /** Pode selecionar contas em pagamentos, sem necessariamente ver seus saldos. */
  canUseBankAccounts: boolean;
  /** Há caixa ABERTO? Sem ele a RPC recusa venda em dinheiro. */
  hasOpenCashSession: boolean;
  /** A empresa aponta conta de cofre em Configurações do PDV? */
  hasCofreAccount: boolean;
  /** Leva pro painel do Caixa (abrir o caixa). */
  onGoToCashPanel: () => void;
  /**
   * Finaliza. Lança em caso de erro (a mensagem do servidor é mostrada aqui
   * mesmo, pelo `pdvCashErrorMessage`, que preserva o texto PT-BR da RPC).
   */
  onConfirm: (payments: ReturnType<typeof toSettlePayload>) => Promise<void>;
}

/**
 * ORDEM CANÔNICA de exibição/processamento das formas de pagamento (pedido do
 * CEO 2026-10-18, no molde do `MultiPaymentDialog` da EcoSistema — lá é
 * Dinheiro → Pix/Transferência → Saldo; aqui é Dinheiro → Pix/Transferência →
 * Débito/Crédito → Fiado). Toda renderização de botão e toda linha de
 * pagamento respeita esta ordem.
 */
const PAYMENT_METHOD_ORDER: PdvPaymentMethod[] = [
  'dinheiro',
  'pix',
  'transferencia',
  'debito',
  'credito',
  'saldo_cliente',
  'fiado',
];

function sortByCanonicalOrder(rows: PaymentRow[]): PaymentRow[] {
  return [...rows].sort(
    (a, b) => PAYMENT_METHOD_ORDER.indexOf(a.method) - PAYMENT_METHOD_ORDER.indexOf(b.method),
  );
}

/** Seis coberturas no contrato do balcão; o voucher aplicado ocupa uma delas. */
const MAX_MULTI_ROWS = 30;

/** Estados selecionados herdam primary/primary-foreground do tema. */
const METHOD_META: Record<PdvPaymentMethod, { icon: ComponentType<{ className?: string }> }> = {
  dinheiro: { icon: Banknote },
  pix: { icon: PixIcon },
  transferencia: { icon: Landmark },
  debito: { icon: CreditCard },
  credito: { icon: CircleDollarSign },
  saldo_cliente: { icon: WalletCards },
  voucher: { icon: Ticket },
  fiado: { icon: Handshake },
};

const EXTRA_METHOD_LABELS: Partial<Record<PdvPaymentMethod, string>> = {
  saldo_cliente: 'Saldo do cliente',
  voucher: 'Voucher',
};

/** A linha de saída continua animada, mas deixa de receber foco ou edição. */
function AnimatedPaymentFields({ children, ...props }: HTMLMotionProps<'section'>) {
  const present = useIsPresent();
  const inertProps = { inert: present ? undefined : '' };
  return <motion.section {...props} {...inertProps} aria-hidden={present ? undefined : true}>{children}</motion.section>;
}

/**
 * PAGAMENTO da venda de balcão (F4).
 *
 * MODO ÚNICO POR PADRÃO, MÚLTIPLAS É OPÇÃO (pedido do CEO 2026-10-18, no
 * molde do `MultiPaymentDialog` da EcoSistema): 95% das vendas usam uma forma
 * só, então o diálogo nasce com 1 linha (o total inteiro). O controle
 * "Uma forma/Várias formas" permite combinar os meios — cada clique ativa ou
 * desativa aquela forma como linha, com o restante preenchido automaticamente
 * na forma ainda não tocada (mesma lógica de "Usar o que falta").
 *
 * Decisões que não são estilo:
 *  • dinheiro tem UM campo visível, "Valor recebido". A parcela líquida
 *    aplicada ao pedido continua separada por baixo para o troco não inflar
 *    a venda; no pagamento misto ela é o restante depois das outras formas;
 *  • dinheiro NÃO escolhe conta: vai sempre pro cofre (a RPC ignora conta no
 *    dinheiro de propósito, pra ninguém furar a conferência);
 *  • caixa fechado é dito ANTES de a pessoa digitar, com o caminho pro painel,
 *    em vez de virar erro depois de a venda estar montada;
 *  • a mensagem de erro do servidor passa por `pdvCashErrorMessage`, nunca por
 *    `getErrorMessage`: as RPCs do PDV carregam texto que o operador precisa
 *    ("Cliente X já deve R$ Y e o limite é R$ Z") sob SQLSTATE genérico.
 */
export function PdvPaymentDialog({
  open,
  onOpenChange,
  texts,
  total,
  itemCount,
  customerName,
  summaryItems = [],
  summarySubtotal,
  summaryDiscount,
  customerId = null,
  advancedPaymentsEnabled = true,
  appliedVoucher = null,
  appliedVouchers,
  appliedCreditContent,
  embeddedEditorOpen = false,
  customerCredit,
  customerCreditPending = false,
  customerCreditError = false,
  customerCreditErrorMessage = null,
  onRetryCustomerCredit,
  accounts,
  canUseBankAccounts,
  hasOpenCashSession,
  hasCofreAccount,
  onGoToCashPanel,
  onConfirm,
}: PdvPaymentDialogProps) {
  const { money } = useLocaleFormatters();
  const { timezone } = useAppLocaleContext();
  const companyToday = todayInTz(timezone);
  const companyDate = new Date(`${companyToday}T12:00:00`);
  const isCompact = useIsCompact();
  const { expanded, setExpanded } = usePdvCheckoutLayoutPreference();
  const reduceMotion = useReducedMotion();
  const storedValue = usePdvCustomerPaymentOptions(
    customerId,
    open && advancedPaymentsEnabled,
  );
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [multiplePayments, setMultiplePayments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  // Fila de edição usada pelo complemento automático entre as formas ativas.
  // A última forma digitada permanece estável; a mais antiga recebe o resto.
  const amountEditOrderRef = useRef<string[]>([]);
  // Depois que o operador informa o dinheiro entregue, não sobrescrevemos
  // esse valor ao redistribuir as parcelas (senão o troco sumiria).
  const tenderedEditedIdsRef = useRef<Set<string>>(new Set());
  // Trava síncrona: duplo clique não dispara duas finalizações.
  const submitGuard = useRef(false);

  const canReceiveCash = hasOpenCashSession && hasCofreAccount;
  const baseMethods = canUseBankAccounts
    ? PAYMENT_METHOD_ORDER
    : PAYMENT_METHOD_ORDER.filter((method) => !requiresAccount(method));
  const availableMethods = baseMethods.filter((method) => {
    if (method === 'voucher') return false;
    if (!advancedPaymentsEnabled && method === 'saldo_cliente') {
      return false;
    }
    if (method === 'saldo_cliente') return !!customerId && (storedValue.data?.availableCredit ?? 0) > 0;
    return true;
  });

  const appliedVoucherRows = useMemo<PaymentRow[]>(
    () => (appliedVouchers ?? (appliedVoucher ? [appliedVoucher] : []))
      .filter(value => value.amount > 0).map(value => ({
        id: `applied-voucher-${value.voucherId}`, method: 'voucher', amount: round2(value.amount),
        tendered: 0, accountId: null, dueDate: null, referenceId: value.voucherId,
      })),
    [appliedVouchers, appliedVoucher],
  );
  const payableTotal = Math.max(0, round2(total - sumPayments(appliedVoucherRows)));

  const methodLabel = (method: PdvPaymentMethod) =>
    EXTRA_METHOD_LABELS[method]
    ?? (texts.methods as Record<string, string>)[method]
    ?? method;

  /**
   * Abriu: uma linha só, já com o total inteiro (modo ÚNICO, o caminho de 95%
   * das vendas). Dinheiro é o default quando o caixa está aberto; sem caixa,
   * cai no Pix, que não depende da gaveta.
   */
  useEffect(() => {
    if (!open) return;
    const method: PdvPaymentMethod = canReceiveCash
      ? 'dinheiro'
      : (availableMethods.find((candidate) => candidate !== 'dinheiro') ?? 'fiado');
    setRows(payableTotal > 0
      ? [newPaymentRow(method, payableTotal, { accountId: accounts[0]?.id ?? null, today: companyDate })]
      : []);
    setMultiplePayments(false);
    setServerError(null);
    setSubmitting(false);
    setTouched(false);
    amountEditOrderRef.current = [];
    tenderedEditedIdsRef.current = new Set();
    submitGuard.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payableTotal]);

  const remaining = computeRemaining(payableTotal, rows);
  const paid = sumPayments(rows);
  const change = computeTotalChange(rows);
  const fiado = sumFiado(rows);
  const creditUnavailable = fiado > 0 && Boolean(customerId) && (customerCreditPending || customerCreditError);

  const validation = useMemo(
    () =>
      validatePayments([...appliedVoucherRows, ...rows], {
        total,
        itemCount,
        hasCustomer: !!customerId,
        hasOpenCashSession,
        hasCofreAccount,
        customerCreditLimit: customerCredit?.creditLimit ?? null,
        customerDebt: customerCredit?.debt ?? 0,
        availableCustomerBalance: storedValue.data?.availableCredit ?? null,
        voucherBalances: Object.fromEntries(
          (storedValue.data?.vouchers ?? []).filter(voucher => isPdvVoucherEligible(voucher, companyToday)).map((voucher) => [voucher.id, voucher.balance]),
        ),
      }),
    [
      rows,
      appliedVoucherRows,
      total,
      itemCount,
      customerId,
      hasOpenCashSession,
      hasCofreAccount,
      customerCredit,
      storedValue.data,
      companyToday,
    ],
  );

  /** Mensagem PT-BR de um problema, já com os valores que o operador precisa. */
  function issueText(code: PaymentIssueCode): string {
    const extra: Partial<Record<PaymentIssueCode, string>> = {
      valor_armazenado_sem_cliente: 'Selecione o cliente para usar saldo ou voucher.',
      valor_armazenado_sem_referencia: 'Escolha o voucher que será usado.',
      saldo_cliente_insuficiente: 'O saldo do cliente não cobre este valor.',
      voucher_insuficiente: 'O voucher escolhido não cobre este valor.',
      fiado_parcelas_invalidas: 'Use parcelas com pelo menos R$ 0,01 cada.',
      voucher_repetido: 'Cada voucher pode ser aplicado uma vez nesta venda.',
      limite_pagamentos: 'Use no máximo 30 parcelas e formas de pagamento.',
    };
    const base = (texts.issues as Partial<Record<PaymentIssueCode, string>>)[code] ?? extra[code] ?? '';
    if (code === 'falta_valor') return base.replace('{value}', money(Math.max(0, remaining)));
    if (code === 'valor_excede') return base.replace('{value}', money(Math.abs(remaining)));
    if (code === 'fiado_acima_do_limite' && customerCredit) {
      return base
        .replace('{name}', customerName ?? '')
        .replace('{debt}', money(customerCredit.debt))
        .replace('{limit}', money(customerCredit.creditLimit ?? 0))
        .replace('{value}', money(fiado));
    }
    return base;
  }

  /** Problemas de linha ficam na linha; o resto vai pro rodapé. */
  const editableRowIds = new Set(rows.map((row) => row.id));
  const globalIssues = validation.issues.filter((i) => !i.rowId || !editableRowIds.has(i.rowId));
  function rowIssue(rowId: string): PaymentIssueCode | null {
    const found = validation.issues.find((i) => i.rowId === rowId);
    return found ? found.code : null;
  }

  function patchRow(id: string, patch: Partial<PaymentRow>) {
    setTouched(true);
    setServerError(null);
    if ('amount' in patch) {
      amountEditOrderRef.current = [
        ...amountEditOrderRef.current.filter((rowId) => rowId !== id),
        id,
      ];
    }
    if ('tendered' in patch) tenderedEditedIdsRef.current.add(id);
    setRows((prev) => {
      const next = prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, ...patch };
        if (
          'amount' in patch
          && row.method === 'dinheiro'
          && !tenderedEditedIdsRef.current.has(id)
        ) {
          updated.tendered = Number(patch.amount) || 0;
        }
        return updated;
      });
      return 'amount' in patch
        ? autofillPaymentRemainder(
            payableTotal,
            next,
            amountEditOrderRef.current,
            tenderedEditedIdsRef.current,
          )
        : next;
    });
  }

  /**
   * Clique num botão de forma. MODO ÚNICO: troca a única linha pro método
   * clicado (no-op se já era essa). MODO MÚLTIPLAS: alterna a forma —
   * adiciona linha nova (com "o que falta" pré-preenchido) ou remove a linha
   * existente (redistribuindo o valor dela pra outra linha, pra a soma não
   * quebrar sozinha). Nunca deixa ficar sem nenhuma linha.
   */
  function clickMethod(method: PdvPaymentMethod) {
    setServerError(null);

    if (!multiplePayments) {
      setRows((prev) => {
        if (prev[0]?.method === method) return prev;
        return [newPaymentRow(method, payableTotal, { accountId: accounts[0]?.id ?? null, today: companyDate })];
      });
      return;
    }

    setRows((prev) => {
      const existing = prev.find((row) => row.method === method);
      if (existing) {
        if (prev.length <= 1) return prev; // nunca fica sem nenhuma forma
        amountEditOrderRef.current = amountEditOrderRef.current.filter((id) => id !== existing.id);
        tenderedEditedIdsRef.current.delete(existing.id);
        const rest = sortByCanonicalOrder(prev.filter((row) => row.id !== existing.id));
        // Redistribui o valor da forma removida pra primeira linha restante
        // (ordem canônica) — "preenchimento automático" vale pra sair também.
        return rest.map((row, index) => {
          if (index !== 0) return row;
          const amount = round2(row.amount + existing.amount);
          return {
            ...row,
            amount,
            tendered:
              row.method === 'dinheiro' && !tenderedEditedIdsRef.current.has(row.id)
                ? amount
                : row.tendered,
          };
        });
      }
      if (prev.length + appliedVoucherRows.length >= MAX_MULTI_ROWS) return prev;
      const left = computeRemaining(payableTotal, prev);
      const newRow = newPaymentRow(method, Math.max(0, left), { accountId: accounts[0]?.id ?? null, today: companyDate });
      return sortByCanonicalOrder([...prev, newRow]);
    });
  }

  /**
   * Troca "Uma forma" ↔ "Múltiplas". Saindo de múltiplas, colapsa pra uma
   * linha só (a primeira em ordem canônica), com o total inteiro — igual ao
   * estado inicial do modo único.
   */
  function changeMode(mode: 'single' | 'multiple') {
    const isMultiple = mode === 'multiple';
    setMultiplePayments(isMultiple);
    if (!isMultiple) {
      amountEditOrderRef.current = [];
      tenderedEditedIdsRef.current = new Set();
      setRows((prev) => {
        const method = sortByCanonicalOrder(prev)[0]?.method
          ?? (canReceiveCash ? 'dinheiro' : (availableMethods[0] ?? 'fiado'));
        return payableTotal > 0
          ? [newPaymentRow(method, payableTotal, { accountId: accounts[0]?.id ?? null, today: companyDate })]
          : [];
      });
    }
  }


  async function handleConfirm() {
    setTouched(true);
    if (embeddedEditorOpen || submitGuard.current || !validation.ok || creditUnavailable) return;
    submitGuard.current = true;
    setSubmitting(true);
    setServerError(null);
    try {
      await onConfirm(toSettlePayload([...appliedVoucherRows, ...rows]));
      // Quem fecha o diálogo é a página (ela limpa o carrinho e devolve o foco
      // pra busca no mesmo gesto, pra a tela já estar pronta pro próximo).
    } catch (error) {
      setServerError(pdvCashErrorMessage(error));
    } finally {
      setSubmitting(false);
      submitGuard.current = false;
    }
  }

  // F9 confirma com o diálogo aberto (o atalho global da página abre o
  // diálogo; aqui ele passa a ser "finalizar"). Enter num campo de valor
  // também finaliza, que é o ritmo do balcão.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'F9' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
        e.preventDefault();
        e.stopPropagation();
        void handleConfirm();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  const sortedRows = sortByCanonicalOrder(rows);
  const atMultiCap = multiplePayments && rows.length + appliedVoucherRows.length >= MAX_MULTI_ROWS;

  function paymentFields(row: PaymentRow) {
    const issue = rowIssue(row.id);
    const rowChange = computeRowChange(row);
    const amountInputClass = 'h-10 rounded-md border border-input bg-background px-2 text-right text-lg font-bold tabular-nums shadow-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary';
    return <div className="channelinput payment-row-fields">
        <div className="payment-amount-field min-w-0 space-y-1">
          <Label htmlFor={`pdv-pay-${row.method === 'dinheiro' ? 'tendered' : 'amount'}-${row.id}`} className="block text-xs text-muted-foreground">
            {row.method === 'dinheiro' ? texts.tenderedLabel : texts.amountLabel}
          </Label>
          <div className="currencyinput"><span aria-hidden="true">R$</span>{row.method === 'dinheiro' ? <PdvMoneyInput id={`pdv-pay-tendered-${row.id}`} value={row.tendered}
            autoFocus={!isCompact && sortedRows[0]?.id === row.id} selectOnFocus disabled={submitting} className={amountInputClass}
            onChange={(value) => patchRow(row.id, { tendered: value })} onEnter={() => void handleConfirm()} />
            : <PdvMoneyInput id={`pdv-pay-amount-${row.id}`} value={row.amount}
              autoFocus={!isCompact && sortedRows[0]?.id === row.id} selectOnFocus disabled={submitting} className={amountInputClass}
              onChange={(value) => patchRow(row.id, { amount: value })} onEnter={() => void handleConfirm()} />}</div>
        </div>
        {row.method === 'fiado' && <div className="payment-due-field min-w-0 space-y-1">
          <Label htmlFor={`pdv-pay-due-${row.id}`} className="block text-xs text-muted-foreground">{texts.dueDateLabel}</Label>
          <DatePicker id={`pdv-pay-due-${row.id}`} value={row.dueDate ?? ''} placeholder={(row.installmentCount ?? 1) > 1 ? 'Primeiro vencimento' : 'Sem vencimento'} disabled={submitting} className="h-10 min-w-0 px-2 text-[11px] sm:[&>svg]:hidden" onValueChange={(value) => patchRow(row.id, { dueDate: value || null })} />
          {(row.installmentCount ?? 1) === 1 && <Button type="button" variant="ghost" size="sm" className="h-auto px-0 text-xs" disabled={submitting} onClick={() => patchRow(row.id, { dueDate: null })}>Sem vencimento</Button>}
          {!row.dueDate && <p className="text-xs text-muted-foreground">{(row.installmentCount ?? 1) > 1 ? 'Informe o primeiro vencimento para parcelar.' : 'Pagamento sem data de vencimento.'}</p>}
        </div>}
      {requiresAccount(row.method) && <div className="paymentdestination min-w-0 space-y-1">
        <Label htmlFor={`pdv-pay-account-${row.id}`} className="block text-xs text-muted-foreground">{texts.accountLabel}</Label>
        <Select value={row.accountId ?? undefined} disabled={submitting} onValueChange={(value) => patchRow(row.id, { accountId: value })}>
          <SelectTrigger id={`pdv-pay-account-${row.id}`} className="h-10 min-w-0 text-xs [&>span]:truncate"><SelectValue placeholder={texts.accountPlaceholder}>{accounts.find(account => account.id === row.accountId)?.name}</SelectValue></SelectTrigger>
          <SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id} textValue={account.name}><span className="flex min-w-0 items-center gap-2"><AccountOptionIcon account={account} /><span>{account.name}</span></span></SelectItem>)}</SelectContent>
        </Select>
        {accounts.length === 0 && <p className="text-xs text-muted-foreground">{texts.noAccounts}</p>}
      </div>}
      {row.method === 'dinheiro' && <div className="payment-row-hint space-y-1 text-xs text-muted-foreground">
        <p>{multiplePayments ? <>{texts.appliedAmount}: <strong className="whitespace-nowrap font-semibold text-foreground">{money(row.amount)}</strong></> : texts.tenderedHint}</p>
        {rowChange > 0 && <p className="font-semibold text-success">{texts.rowChange.replace('{value}', money(rowChange))}</p>}
        <p>Destino: caixa aberto</p>
      </div>}
      {row.method === 'fiado' && advancedPaymentsEnabled && <div className="payment-installments-field min-w-0 space-y-1">
        <Label htmlFor={`pdv-pay-installments-${row.id}`} className="text-xs text-muted-foreground">Parcelas</Label>
        <Select value={String(row.installmentCount ?? 1)} disabled={submitting} onValueChange={(value) => patchRow(row.id, { installmentCount: Number(value) })}>
          <SelectTrigger id={`pdv-pay-installments-${row.id}`} className="h-10 w-full text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((count) => <SelectItem key={count} value={String(count)}>{count}x</SelectItem>)}</SelectContent>
        </Select>
      </div>}
      {row.method === 'saldo_cliente' && <p className="text-xs text-muted-foreground">Disponível: <strong className="whitespace-nowrap text-foreground">{money(storedValue.data?.availableCredit ?? 0)}</strong></p>}
      {touched && issue && <NoticeBanner variant="destructive" className="payment-row-issue text-xs">{issueText(issue)}</NoticeBanner>}
    </div>;
  }

  const balanceRow = rows.find((row) => row.method === 'saldo_cliente');
  const balanceAvailable = availableMethods.includes('saldo_cliente');
  const displayedMethods: PdvPaymentMethod[] = ['dinheiro', 'pix', 'debito', 'credito', 'transferencia', 'fiado'];
  function renderPaymentMethod(method: PdvPaymentMethod) {
    const row = rows.find((entry) => entry.method === method), Icon = METHOD_META[method].icon;
    const disabledByCap = multiplePayments && !row && atMultiCap;
    return <button key={method} type="button" aria-label={method === 'fiado' ? 'Fiado/Saldo' : methodLabel(method)} disabled={submitting || disabledByCap} onClick={() => clickMethod(method)} aria-pressed={!!row}
      data-payment-option={method}
      className={cn('payment-method-option inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', row ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background text-foreground hover:bg-muted')}>
      <Icon className="h-4 w-4 shrink-0" /><span>{method === 'fiado' ? 'Fiado/Saldo' : methodLabel(method)}</span>{row ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0" />}
    </button>;
  }
  function renderSelectedPayment(row: PaymentRow) {
    const Icon = METHOD_META[row.method].icon;
    return <AnimatedPaymentFields key={row.id} aria-label={`Pagamento: ${methodLabel(row.method)}`} data-payment-method={row.method}
      initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.25, 0.65, 0.25, 1] }} className="payment-active-row overflow-hidden rounded-lg border border-input bg-background">
      <div className="payment-row-content">
        <div className="payment-row-name"><Icon className="h-4 w-4 shrink-0" /><strong>{row.method === 'fiado' ? 'Fiado/Saldo' : methodLabel(row.method)}</strong></div>
        {paymentFields(row)}
      </div>
    </AnimatedPaymentFields>;
  }

  const creditSummary = <div className="space-y-3">
    {appliedCreditContent}
    {!appliedCreditContent && appliedVoucherRows.length > 0 && <div className="flex items-center gap-2 rounded-md bg-rose-600 px-3 py-2 text-white"><Ticket className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-wide">Crédito da loja · Troca e devolução</span><strong className="text-sm">{(appliedVouchers ?? (appliedVoucher ? [appliedVoucher] : [])).map(value => value.code).join(' · ')}</strong></span><strong className="whitespace-nowrap text-sm tabular-nums">− {money(sumPayments(appliedVoucherRows))}</strong></div>}
    {balanceAvailable && <section className={cn('overflow-hidden rounded-lg border', balanceRow ? 'border-primary' : 'border-input')}>
      <button type="button" disabled={submitting || (!balanceRow && atMultiCap)} aria-pressed={!!balanceRow} aria-label="Saldo do cliente" onClick={() => clickMethod('saldo_cliente')}
        className={cn('flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors', balanceRow ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>
        <WalletCards className="h-4 w-4" /><span className="flex-1">Saldo do cliente</span><strong className="whitespace-nowrap tabular-nums">{money(storedValue.data?.availableCredit ?? 0)}</strong>{balanceRow && <Check className="h-4 w-4" />}
      </button>
      <AnimatePresence initial={false}>{balanceRow && <AnimatedPaymentFields key={balanceRow.id} initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduceMotion ? undefined : { height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.34 }} className="overflow-hidden">{paymentFields(balanceRow)}</AnimatedPaymentFields>}</AnimatePresence>
    </section>}
  </div>;

  const itemSummary = summaryItems.length > 0 ? <PdvCheckoutDisclosure label={`${itemCount} ${itemCount === 1 ? 'material' : 'materiais'}`} forceOpen={expanded && !isCompact}>
      <div className="divide-y">{summaryItems.map((item) => <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0"><SignedImg src={item.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded object-contain" fallbackLabel="" /><span className="min-w-0 flex-1"><strong className="block text-xs leading-relaxed">{item.name}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.quantity} {item.unit} × {money(item.unitPrice)}</span></span><strong className="whitespace-nowrap text-xs tabular-nums">{money(item.total)}</strong></div>)}</div>
    </PdvCheckoutDisclosure> : null;

  const summary = <aside className="paymentleftsummary space-y-5" data-checkout-summary>
    <header className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="checkout-eyebrow text-xs font-medium text-muted-foreground">Resumo do pedido</p><h3 className={cn('mt-1 font-bold leading-snug', expanded ? 'text-xl' : 'text-base')}>{customerName || 'Venda sem cliente'}</h3></div>{!expanded && <div className="compact-payment-due"><p>Valor a receber</p><strong>{money(payableTotal)}</strong></div>}{!expanded && <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)} className="shrink-0 gap-2"><Maximize2 className="h-4 w-4" />Ampliar</Button>}</header>
    {expanded && itemSummary}
    <section className="checkoutfinancial space-y-3 border-y py-4" aria-label="Resumo financeiro">
      <h4>Resumo financeiro</h4>
      {summarySubtotal != null && <div className="grid grid-cols-[minmax(0,1fr)_auto_16px] gap-2 text-sm"><span>Subtotal</span><strong className="whitespace-nowrap tabular-nums">{money(summarySubtotal)}</strong><span /></div>}
      {(summaryDiscount ?? 0) > 0 && <PdvCheckoutDisclosure label="Descontos" value={`− ${money(summaryDiscount!)}`}><p className="text-xs text-muted-foreground">Descontos já incluídos no total do pedido.</p></PdvCheckoutDisclosure>}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_16px] gap-2 text-sm"><strong>Total da venda</strong><strong className="whitespace-nowrap tabular-nums">{money(total)}</strong><span /></div>
      {(appliedCreditContent || appliedVoucherRows.length > 0 || balanceAvailable || (advancedPaymentsEnabled && customerId)) && <PdvCheckoutDisclosure label="Créditos do cliente" value={appliedVoucherRows.length > 0 ? `− ${money(sumPayments(appliedVoucherRows))}` : undefined} forceOpen={embeddedEditorOpen}>{creditSummary}</PdvCheckoutDisclosure>}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_16px] items-baseline gap-2 border-t pt-3"><span className="text-sm font-semibold">Valor deste recebimento</span><strong className="whitespace-nowrap text-xl font-bold tabular-nums">{money(payableTotal)}</strong><span /></div>
    </section>
    {!expanded && itemSummary}
  </aside>;

  const footer = <div className="checkout-footer space-y-2">
    {touched && globalIssues.map((issue) => <NoticeBanner key={issue.code} variant="destructive">{issueText(issue.code)}</NoticeBanner>)}
    {serverError && <NoticeBanner variant="destructive">{serverError}</NoticeBanner>}
    {embeddedEditorOpen ? <p className="py-1 text-center text-sm font-medium text-muted-foreground" role="status">Aplique ou cancele a escolha do voucher acima para continuar.</p> : <div className="flex gap-3">
      <Button type="button" variant="cancel-ghost" disabled={submitting} onClick={() => onOpenChange(false)} className="h-[52px] font-bold sm:h-14">{texts.cancel}</Button>
      <Button type="button" className="h-[52px] flex-1 font-bold sm:h-14" autoFocus={payableTotal === 0 && !isCompact} disabled={submitting || !validation.ok || creditUnavailable} onClick={handleConfirm}>{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitting ? texts.submitting : texts.confirm}<kbd className="ml-1 hidden rounded border border-current/30 px-1 text-[10px] opacity-70 sm:inline">F9</kbd></Button>
    </div>}
  </div>;

  return <ResponsiveModal open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }} title={expanded ? 'Finalizar pedido' : texts.title}
    description={undefined} fullScreen={expanded} density="compact" className={cn('pdv-checkout-dialog checkoutmodal transition-[width,max-width,height] duration-300 motion-reduce:transition-none', expanded ? 'paymentfullscreen' : 'sm:max-w-[1000px]')}
    drawerClassName="pdv-checkout-dialog checkoutmodal"
    bodyClassName={expanded ? 'pdv-checkout-body' : undefined}
    headerActions={<Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => setExpanded(!expanded)} className="gap-2"><Minimize2 className="h-4 w-4" />Reduzir</Button>}
    footer={footer}>
    <motion.div layout={!reduceMotion} transition={{ duration: reduceMotion ? 0 : 0.34 }} className={cn('grid gap-6', expanded && 'paymentfullbody')} data-pdv-checkout data-checkout-expanded={expanded || undefined}>
      {summary}
      <section className={cn('paymentright min-w-0 space-y-4', expanded && 'space-y-2.5')} data-checkout-receiving>
        <header className="paymentheadline flex flex-wrap items-center justify-between gap-3">
          {expanded ? <div className="paymentdue"><p className="text-xs text-muted-foreground">Valor a receber</p><strong className={cn('mt-1 block whitespace-nowrap font-bold tabular-nums', expanded ? 'text-3xl' : 'text-2xl')}>{money(payableTotal)}</strong></div> : <h4 className="receiving-title">Recebimento</h4>}
          {payableTotal > 0 && <div className="paymentmode min-w-0"><SegmentedControl className="paymentsegments" options={[{ value: 'single', label: 'Uma forma' }, { value: 'multiple', label: 'Combinar formas' }]} value={multiplePayments ? 'multiple' : 'single'} onValueChange={changeMode} disabled={submitting} size="sm" aria-label="Formas de pagamento" /></div>}
        </header>
        {payableTotal > 0 && <p className="paymentinstruction text-xs leading-relaxed text-muted-foreground">{multiplePayments ? 'Escolha as formas e informe quanto será pago em cada uma. Ex.: parte no Pix e parte no cartão.' : 'Escolha como receber. Para usar Pix + cartão, por exemplo, selecione “Combinar formas”.'}</p>}
        {!appliedCreditContent && advancedPaymentsEnabled && customerId && storedValue.isLoading && <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />Consultando saldo e vouchers do cliente…</p>}
        {!appliedCreditContent && advancedPaymentsEnabled && customerId && storedValue.isError && <NoticeBanner variant="destructive" title="Saldo e vouchers indisponíveis" className="flex-wrap sm:flex-nowrap [&>span:last-child]:basis-full [&>span:last-child]:pl-[26px] sm:[&>span:last-child]:basis-auto sm:[&>span:last-child]:pl-0" action={<Button size="sm" variant="outline" className="border-destructive-foreground bg-transparent text-destructive-foreground hover:bg-destructive-foreground hover:text-destructive" onClick={() => void storedValue.refetch()}>Tentar novamente</Button>}>Use outra forma de pagamento ou tente consultar de novo.</NoticeBanner>}
        {payableTotal > 0 && !hasOpenCashSession && <NoticeBanner variant="warning" icon={Vault} title={texts.cashClosedTitle} action={<Button type="button" size="sm" variant="outline" className="border-warning-foreground bg-transparent text-warning-foreground" onClick={onGoToCashPanel}>{texts.cashClosedAction}</Button>}>{texts.cashClosedDescription}</NoticeBanner>}
        {payableTotal > 0 && hasOpenCashSession && !hasCofreAccount && <NoticeBanner variant="warning" icon={Vault} title={texts.cofreMissingTitle}>{texts.cofreMissingDescription}</NoticeBanner>}
        {payableTotal > 0 ? <div className="space-y-3" data-checkout-methods>
          <div className="payment-method-options" aria-label="Escolher formas de recebimento">{displayedMethods.filter((method) => availableMethods.includes(method)).map(renderPaymentMethod)}</div>
          <div className="payment-active-rows"><AnimatePresence initial={false}>{sortedRows.filter(row => row.method !== 'saldo_cliente').map(renderSelectedPayment)}</AnimatePresence></div>
        </div> : <NoticeBanner variant="success" icon={Ticket} title="Venda coberta pelo voucher" role="status">Nenhum outro recebimento é necessário. Confirme para concluir a venda.</NoticeBanner>}

        {creditUnavailable && <div className="flex flex-wrap items-center justify-between gap-2" role={customerCreditError ? 'alert' : 'status'}>
          <p className={customerCreditError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{customerCreditError ? (customerCreditErrorMessage || 'Não foi possível conferir a dívida e o limite do cliente.') : 'Conferindo a dívida e o limite do cliente…'}</p>
          {customerCreditError && onRetryCustomerCredit && <Button type="button" variant="outline" size="sm" onClick={() => void onRetryCustomerCredit()}>Tentar novamente</Button>}
        </div>}
        {fiado > 0 && customerName && customerCredit && <p className="text-xs leading-relaxed text-muted-foreground">{(customerCredit.debt < 0 ? texts.creditBalanceInfo : customerCredit.creditLimit != null ? texts.creditInfo : texts.creditDebtInfo).replace('{name}', customerName).replace('{debt}', money(customerCredit.debt)).replace('{balance}', money(Math.abs(customerCredit.debt))).replace('{limit}', money(customerCredit.creditLimit ?? 0))}</p>}
        {(multiplePayments || change > 0) && <div className="paymentsplitstatus grid grid-cols-2 gap-3 border-t pt-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Distribuído</p><strong className="whitespace-nowrap tabular-nums">{money(paid)}</strong></div>
          <div className="text-right"><p className="text-xs text-muted-foreground">{change > 0 ? texts.change : remaining < -0.01 ? texts.excess : texts.remaining}</p><strong className="whitespace-nowrap tabular-nums">{money(change > 0 ? change : Math.abs(remaining))}</strong></div>
          <div className="payprogress" aria-hidden="true"><div style={{ width: `${Math.min(100, Math.max(0, payableTotal ? paid / payableTotal * 100 : 100))}%` }} /></div>
        </div>}
        {validation.warnings.filter(code => !creditUnavailable || code !== 'cliente_sem_limite_definido').map((code) => <NoticeBanner key={code} variant="warning">{texts.warnings[code]}</NoticeBanner>)}
      </section>
    </motion.div>
  </ResponsiveModal>;
}
