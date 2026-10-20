import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Check,
  CircleDollarSign,
  CreditCard,
  Handshake,
  Landmark,
  Loader2,
  QrCode,
  Vault,
  X,
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
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import {
  PDV_PAYMENT_METHODS,
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
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type PaymentTexts = (typeof pdv)['pt-br']['cashier']['payment'];

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
  /** Limite e saldo devedor do cliente, pro fiado. */
  customerCredit: PdvCustomerCredit | null;
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
  'fiado',
];

function sortByCanonicalOrder(rows: PaymentRow[]): PaymentRow[] {
  return [...rows].sort(
    (a, b) => PAYMENT_METHOD_ORDER.indexOf(a.method) - PAYMENT_METHOD_ORDER.indexOf(b.method),
  );
}

/** Máximo de formas simultâneas no modo "múltiplas" (mesmo teto da EcoSistema). */
const MAX_MULTI_ROWS = 3;

/**
 * Ícone + cor SATURADA por forma de pagamento. Decorativo/categórico (como a
 * bolinha de cor do refrigerante), não é token de AÇÃO (editar/excluir) — por
 * isso Tailwind cru aqui é a régua certa, não semantic token.
 */
const METHOD_META: Record<PdvPaymentMethod, { icon: typeof Banknote; color: string }> = {
  dinheiro: { icon: Banknote, color: '#059669' },
  pix: { icon: QrCode, color: '#0891b2' },
  transferencia: { icon: Landmark, color: '#2563eb' },
  debito: { icon: CreditCard, color: '#7c3aed' },
  credito: { icon: CircleDollarSign, color: '#c026d3' },
  fiado: { icon: Handshake, color: '#d97706' },
};

/**
 * PAGAMENTO da venda de balcão (F4).
 *
 * MODO ÚNICO POR PADRÃO, MÚLTIPLAS É OPÇÃO (pedido do CEO 2026-10-18, no
 * molde do `MultiPaymentDialog` da EcoSistema): 95% das vendas usam uma forma
 * só, então o diálogo nasce com 1 linha (o total inteiro) e botões SATURADOS
 * pra escolher a forma com um toque. O `LabeledSwitch` "Uma forma/Múltiplas"
 * libera somar até 3 formas — cada clique num botão (modo múltiplas) ativa ou
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
  customerCredit,
  accounts,
  canUseBankAccounts,
  hasOpenCashSession,
  hasCofreAccount,
  onGoToCashPanel,
  onConfirm,
}: PdvPaymentDialogProps) {
  const { money } = useLocaleFormatters();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [multiplePayments, setMultiplePayments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  // Fila de edição usada pelo complemento automático com 2 ou 3 formas.
  // A última forma digitada permanece estável; a mais antiga recebe o resto.
  const amountEditOrderRef = useRef<string[]>([]);
  // Depois que o operador informa o dinheiro entregue, não sobrescrevemos
  // esse valor ao redistribuir as parcelas (senão o troco sumiria).
  const tenderedEditedIdsRef = useRef<Set<string>>(new Set());
  // Trava síncrona: duplo clique não dispara duas finalizações.
  const submitGuard = useRef(false);

  const canReceiveCash = hasOpenCashSession && hasCofreAccount;
  const availableMethods = canUseBankAccounts
    ? PAYMENT_METHOD_ORDER
    : PAYMENT_METHOD_ORDER.filter((method) => !requiresAccount(method));

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
    setRows([newPaymentRow(method, total, { accountId: accounts[0]?.id ?? null })]);
    setMultiplePayments(false);
    setServerError(null);
    setSubmitting(false);
    setTouched(false);
    amountEditOrderRef.current = [];
    tenderedEditedIdsRef.current = new Set();
    submitGuard.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const remaining = computeRemaining(total, rows);
  const paid = sumPayments(rows);
  const change = computeTotalChange(rows);
  const fiado = sumFiado(rows);

  const validation = useMemo(
    () =>
      validatePayments(rows, {
        total,
        itemCount,
        hasCustomer: !!customerName,
        hasOpenCashSession,
        hasCofreAccount,
        customerCreditLimit: customerCredit?.creditLimit ?? null,
        customerDebt: customerCredit?.debt ?? 0,
      }),
    [rows, total, itemCount, customerName, hasOpenCashSession, hasCofreAccount, customerCredit],
  );

  /** Mensagem PT-BR de um problema, já com os valores que o operador precisa. */
  function issueText(code: PaymentIssueCode): string {
    const base = texts.issues[code] ?? '';
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
  const globalIssues = validation.issues.filter((i) => !i.rowId);
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
            total,
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
   * quebrar sozinha). Nunca deixa ficar sem nenhuma linha, nunca passa de 3.
   */
  function clickMethod(method: PdvPaymentMethod) {
    setServerError(null);

    if (!multiplePayments) {
      setRows((prev) => {
        if (prev[0]?.method === method) return prev;
        return [newPaymentRow(method, total, { accountId: accounts[0]?.id ?? null })];
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
      if (prev.length >= MAX_MULTI_ROWS) return prev;
      const left = computeRemaining(total, prev);
      const newRow = newPaymentRow(method, Math.max(0, left), { accountId: accounts[0]?.id ?? null });
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
        return [newPaymentRow(method, total, { accountId: accounts[0]?.id ?? null })];
      });
    }
  }

  /** "Usar o que falta": joga o restante nesta linha, sem o operador somar na cabeça. */
  function fillRemaining(id: string) {
    setTouched(true);
    amountEditOrderRef.current = [
      ...amountEditOrderRef.current.filter((rowId) => rowId !== id),
      id,
    ];
    setRows((prev) => {
      const others = prev.filter((row) => row.id !== id);
      const left = computeRemaining(total, others);
      return prev.map((row) => {
        if (row.id !== id) return row;
        const amount = Math.max(0, left);
        return {
          ...row,
          amount,
          tendered:
            row.method === 'dinheiro' && !tenderedEditedIdsRef.current.has(row.id)
              ? amount
              : row.tendered,
        };
      });
    });
  }

  async function handleConfirm() {
    setTouched(true);
    if (submitGuard.current || !validation.ok) return;
    submitGuard.current = true;
    setSubmitting(true);
    setServerError(null);
    try {
      await onConfirm(toSettlePayload(rows));
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
      if (e.key === 'F9') {
        e.preventDefault();
        e.stopPropagation();
        void handleConfirm();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  const sortedRows = sortByCanonicalOrder(rows);
  const atMultiCap = multiplePayments && rows.length >= MAX_MULTI_ROWS;

  const footer = (
    <div className="flex flex-col gap-2">
      {/* Problemas gerais: só depois do primeiro toque, pra o diálogo não
          abrir já cheio de vermelho no caminho normal. */}
      {touched &&
        globalIssues.map((issue) => (
          <NoticeBanner key={issue.code} variant="destructive">
            {issueText(issue.code)}
          </NoticeBanner>
        ))}
      {serverError && <NoticeBanner variant="destructive">{serverError}</NoticeBanner>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
          {texts.cancel}
        </Button>
        <Button
          type="button"
          className="font-semibold"
          disabled={submitting || !validation.ok}
          onClick={handleConfirm}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? texts.submitting : texts.confirm}
          <kbd className="ml-1 rounded border border-current/30 px-1 text-[10px] opacity-70">F9</kbd>
        </Button>
      </div>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => {
        if (!v && !submitting) onOpenChange(false);
      }}
      title={texts.title}
      description={texts.description}
      className="sm:max-w-[960px]"
      footer={footer}
    >
      <div className="space-y-3">
        {/* Pagamento dividido precisa expor a equação sem exigir soma mental:
            total = informado + falta (ou troco). No caminho simples, total e
            eventual troco continuam compactos. */}
        <div
          className={cn(
            'grid min-h-16 overflow-hidden rounded-lg bg-muted',
            multiplePayments ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1',
          )}
        >
          <div
            className={cn(
              'px-4 py-3',
              multiplePayments && 'col-span-2 border-b border-border sm:col-span-1 sm:border-b-0',
            )}
          >
            <p className="text-xs text-muted-foreground">{texts.total}</p>
            <p className="truncate text-lg font-bold tabular-nums sm:text-2xl">{money(total)}</p>
          </div>
          {multiplePayments && (
            <>
              <div className="border-r border-border px-4 py-3 sm:border-l sm:border-r-0 sm:text-center">
                <p className="text-xs text-muted-foreground">{texts.paid}</p>
                <p className="truncate text-lg font-bold tabular-nums sm:text-2xl">{money(paid)}</p>
              </div>
              <div className="px-4 py-3 text-right">
                <p className="text-xs text-muted-foreground">
                  {change > 0
                    ? texts.change
                    : remaining < -0.01
                      ? texts.excess
                      : texts.remaining}
                </p>
                <p
                  className={cn(
                    'truncate text-lg font-bold tabular-nums sm:text-2xl',
                    remaining > 0.01 || remaining < -0.01
                      ? 'text-destructive'
                      : 'text-success',
                  )}
                >
                  {money(change > 0 ? change : Math.abs(remaining))}
                </p>
              </div>
            </>
          )}
          {!multiplePayments && change > 0 && (
            <div className="border-t border-border px-4 py-2 text-right">
              <p className="flex items-center justify-end gap-1.5 text-sm font-semibold text-success">
                <Banknote className="h-4 w-4" />
                {texts.change}: {money(change)}
              </p>
            </div>
          )}
        </div>

        {/* Caixa fechado dito ANTES de digitar, com o caminho pro painel. */}
        {!hasOpenCashSession && (
          <NoticeBanner
            variant="warning"
            icon={Vault}
            title={texts.cashClosedTitle}
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-warning-foreground/40 bg-transparent text-warning-foreground hover:bg-warning-foreground/10"
                onClick={onGoToCashPanel}
              >
                {texts.cashClosedAction}
              </Button>
            }
          >
            {texts.cashClosedDescription}
          </NoticeBanner>
        )}
        {hasOpenCashSession && !hasCofreAccount && (
          <NoticeBanner variant="warning" icon={Vault} title={texts.cofreMissingTitle}>
            {texts.cofreMissingDescription}
          </NoticeBanner>
        )}

        {/* Conta corrente do cliente: o que a RPC usaria pra bloquear o fiado,
            dito antes. Sem cliente, o fiado nem é oferecido como válido. */}
        {fiado > 0 && customerName && customerCredit && (
          <NoticeBanner variant={customerCredit.creditLimit == null ? 'warning' : 'info'}>
            {customerCredit.creditLimit == null
              ? texts.creditNoLimit
                  .replace('{name}', customerName)
                  .replace('{debt}', money(customerCredit.debt))
              : texts.creditInfo
                  .replace('{name}', customerName)
                  .replace('{debt}', money(customerCredit.debt))
                  .replace('{limit}', money(customerCredit.creditLimit))}
          </NoticeBanner>
        )}

        {/* Uma decisão binária deve parecer binária. O status textual reforça
            o switch sem depender só da posição ou da cor. */}
        <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/70 px-3 py-2.5">
          <div className="min-w-0">
            <Label htmlFor="pdv-multiple-payments" className="cursor-pointer text-sm font-semibold">
              {texts.multiplePaymentsLabel}
            </Label>
            <p className="text-xs text-muted-foreground">
              {multiplePayments ? texts.multiplePaymentsOnHint : texts.multiplePaymentsOffHint}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground" aria-hidden="true">
              {multiplePayments ? texts.toggleOn : texts.toggleOff}
            </span>
            <Switch
              id="pdv-multiple-payments"
              checked={multiplePayments}
              onCheckedChange={(checked) => changeMode(checked ? 'multiple' : 'single')}
              aria-label={texts.multiplePaymentsLabel}
            />
          </div>
        </div>

        {/* Botões SATURADOS por forma de pagamento, em ORDEM CANÔNICA
            (Dinheiro → Pix/Transferência → Débito/Crédito → Fiado). Ativo =
            fundo saturado + texto branco; inativo = neutro de verdade
            (outline), nunca pastel — régua do CEO. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {availableMethods.map((method) => {
            const meta = METHOD_META[method];
            const Icon = meta.icon;
            const active = rows.some((row) => row.method === method);
            const disabledByCap = multiplePayments && !active && atMultiCap;
            return (
              <button
                key={method}
                type="button"
                disabled={disabledByCap}
                onClick={() => clickMethod(method)}
                aria-pressed={active}
                style={active ? { backgroundColor: meta.color, borderColor: meta.color, color: '#fff' } : undefined}
                className={cn(
                  'relative flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-xs font-semibold transition-colors lg:min-h-[52px] lg:flex-row lg:gap-2',
                  active
                    ? 'text-white'
                    : 'border-input bg-background text-foreground hover:bg-muted',
                  disabledByCap && 'cursor-not-allowed opacity-50',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-tight">{texts.methods[method]}</span>
                {active && <Check className="h-3.5 w-3.5 lg:absolute lg:right-2 lg:top-2" />}
              </button>
            );
          })}
        </div>

        {/* Lista de recebimentos: forma, valor, destino e remoção compartilham
            colunas. A leitura vira uma soma vertical, não três cartões soltos. */}
        <div className="overflow-hidden rounded-lg border divide-y divide-border">
          {sortedRows.map((row) => {
            const issue = rowIssue(row.id);
            const rowChange = computeRowChange(row);
            const meta = METHOD_META[row.method];
            const Icon = meta.icon;
            // Dinheiro nunca mostra dois números. `amount` continua sendo a
            // parcela líquida do pedido; o único campo editável é `tendered`,
            // que representa o que o cliente entregou e gera troco no excedente.
            const showPaymentAmount = row.method !== 'dinheiro';
            return (
              <div
                key={row.id}
                className={cn(
                  'grid grid-cols-1 gap-3 p-3 md:grid-cols-[minmax(150px,0.8fr)_minmax(190px,1fr)_minmax(210px,1.15fr)_40px] md:items-center',
                  touched && issue && 'bg-destructive/5 ring-1 ring-inset ring-destructive/60',
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: meta.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {multiplePayments ? `#${sortedRows.indexOf(row) + 1}` : texts.methodLabel}
                    </p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {texts.methods[row.method]}
                    </p>
                  </div>
                </div>

                {showPaymentAmount && (
                  <div className="min-w-0 space-y-1 text-center">
                    <div className="relative flex min-h-6 items-center justify-center">
                      <Label
                        htmlFor={`pdv-pay-amount-${row.id}`}
                        className="text-center text-xs font-semibold text-muted-foreground"
                      >
                        {texts.amountLabel}
                      </Label>
                      {rows.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 h-6 px-1.5 text-[11px]"
                          onClick={() => fillRemaining(row.id)}
                        >
                          {texts.fillRemaining}
                        </Button>
                      )}
                    </div>
                    <PdvMoneyInput
                      id={`pdv-pay-amount-${row.id}`}
                      value={row.amount}
                      autoFocus={sortedRows[0]?.id === row.id}
                      selectOnFocus
                      className="h-auto rounded-none border-0 border-b-2 border-foreground/30 bg-transparent px-2 py-1 text-center text-2xl font-bold shadow-none focus-visible:border-primary focus-visible:ring-0"
                      onChange={(value) => patchRow(row.id, { amount: value })}
                      onEnter={() => void handleConfirm()}
                    />
                  </div>
                )}

                {row.method === 'dinheiro' && (
                  <div className="min-w-0 space-y-1 text-center">
                    <Label
                      htmlFor={`pdv-pay-tendered-${row.id}`}
                      className="block text-center text-xs font-semibold text-muted-foreground"
                    >
                      {texts.tenderedLabel}
                    </Label>
                    <PdvMoneyInput
                      id={`pdv-pay-tendered-${row.id}`}
                      value={row.tendered}
                      autoFocus={sortedRows[0]?.id === row.id}
                      selectOnFocus
                      className="h-auto rounded-none border-0 border-b-2 border-foreground/30 bg-transparent px-2 py-1 text-center text-2xl font-bold shadow-none focus-visible:border-primary focus-visible:ring-0"
                      onChange={(value) => patchRow(row.id, { tendered: value })}
                      onEnter={() => void handleConfirm()}
                    />
                  </div>
                )}

                <div className="min-w-0">
                  {row.method === 'dinheiro' && (
                    <div className="rounded-md bg-muted/70 px-3 py-2 text-sm">
                      {multiplePayments && (
                        <p className="text-muted-foreground">
                          {texts.appliedAmount}:{' '}
                          <span className="font-semibold text-foreground">{money(row.amount)}</span>
                        </p>
                      )}
                      <p
                        className={cn(
                          rowChange > 0 ? 'font-semibold text-success' : 'text-muted-foreground',
                        )}
                      >
                        {rowChange > 0
                          ? texts.rowChange.replace('{value}', money(rowChange))
                          : texts.tenderedHint}
                      </p>
                    </div>
                  )}

                  {requiresAccount(row.method) && (
                    <div className="space-y-1">
                      <Label
                        htmlFor={`pdv-pay-account-${row.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        {texts.accountLabel}
                      </Label>
                      <Select
                        value={row.accountId ?? undefined}
                        onValueChange={(v) => patchRow(row.id, { accountId: v })}
                      >
                        <SelectTrigger id={`pdv-pay-account-${row.id}`} className="h-11">
                          <SelectValue placeholder={texts.accountPlaceholder}>
                            {row.accountId
                              ? (() => {
                                  const selectedAccount = accounts.find((account) => account.id === row.accountId);
                                  return selectedAccount ? (
                                    <span className="flex min-w-0 items-center gap-2">
                                      <AccountOptionIcon account={selectedAccount} />
                                      <span className="truncate">{selectedAccount.name}</span>
                                    </span>
                                  ) : null;
                                })()
                              : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id} textValue={acc.name}>
                              <span className="flex min-w-0 items-center gap-2">
                                <AccountOptionIcon account={acc} />
                                <span className="truncate">{acc.name}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {accounts.length === 0 && (
                        <p className="text-xs text-muted-foreground">{texts.noAccounts}</p>
                      )}
                    </div>
                  )}

                  {row.method === 'fiado' && (
                    <div className="space-y-1">
                      <Label
                        htmlFor={`pdv-pay-due-${row.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        {texts.dueDateLabel}
                      </Label>
                      <DatePicker
                        id={`pdv-pay-due-${row.id}`}
                        value={row.dueDate ?? ''}
                        onValueChange={(value) => patchRow(row.id, { dueDate: value || null })}
                      />
                      <p className="text-xs text-muted-foreground">{texts.dueDateHint}</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end md:justify-center">
                  {multiplePayments && rows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                      aria-label={texts.removeRow}
                      title={texts.removeRow}
                      onClick={() => clickMethod(row.method)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>

                {touched && issue && (
                  <div className="md:col-span-full">
                    <NoticeBanner variant="destructive">{issueText(issue)}</NoticeBanner>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {validation.warnings.map((code) => (
          <NoticeBanner key={code} variant="warning">
            {texts.warnings[code]}
          </NoticeBanner>
        ))}
      </div>
    </ResponsiveModal>
  );
}
