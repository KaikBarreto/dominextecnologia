import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Handshake,
  Landmark,
  Loader2,
  QrCode,
  Vault,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { DatePicker } from '@/components/ui/DatePicker';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PdvMoneyInput } from '@/components/pdv/caixa/PdvMoneyInput';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { pdvCashErrorMessage } from '@/lib/pdv/cash-errors';
import { round2 } from '@/lib/pdv/cash';
import { cn } from '@/lib/utils';
import {
  PDV_PAYMENT_METHODS,
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
  accounts: Array<{ id: string; name: string }>;
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
const METHOD_META: Record<PdvPaymentMethod, { icon: typeof Banknote; activeClass: string }> = {
  dinheiro: { icon: Banknote, activeClass: 'border-emerald-600 bg-emerald-600 text-white' },
  pix: { icon: QrCode, activeClass: 'border-cyan-600 bg-cyan-600 text-white' },
  transferencia: { icon: Landmark, activeClass: 'border-blue-600 bg-blue-600 text-white' },
  debito: { icon: CreditCard, activeClass: 'border-violet-600 bg-violet-600 text-white' },
  credito: { icon: CircleDollarSign, activeClass: 'border-fuchsia-600 bg-fuchsia-600 text-white' },
  fiado: { icon: Handshake, activeClass: 'border-amber-600 bg-amber-600 text-white' },
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
 *  • o campo "Valor" é o valor LÍQUIDO aplicado ao pedido e o "Valor recebido"
 *    é só pro troco. Somar troco no valor estouraria a conferência da gaveta;
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
  // Trava síncrona: duplo clique não dispara duas finalizações.
  const submitGuard = useRef(false);

  const canReceiveCash = hasOpenCashSession && hasCofreAccount;

  /**
   * Abriu: uma linha só, já com o total inteiro (modo ÚNICO, o caminho de 95%
   * das vendas). Dinheiro é o default quando o caixa está aberto; sem caixa,
   * cai no Pix, que não depende da gaveta.
   */
  useEffect(() => {
    if (!open) return;
    const method: PdvPaymentMethod = canReceiveCash ? 'dinheiro' : 'pix';
    setRows([newPaymentRow(method, total, { accountId: accounts[0]?.id ?? null })]);
    setMultiplePayments(false);
    setServerError(null);
    setSubmitting(false);
    setTouched(false);
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
    setRows((prev) => {
      const next = prev.map((row) => (row.id === id ? { ...row, ...patch } : row));
      // Preenchimento automático (pedido do CEO 2026-10-18, no molde do
      // `MultiPaymentDialog` da EcoSistema): com exatamente 2 formas, editar
      // o VALOR de uma joga "o que falta" na outra automaticamente — o caso
      // mais comum de pagamento misto (metade Pix, metade dinheiro), sem o
      // operador somar na cabeça nem precisar clicar em "Usar o que falta"
      // toda vez. Com 3 formas o cálculo de "qual delas é a 'sobrando'"
      // fica ambíguo, então ali o botão manual segue sendo o caminho.
      if ('amount' in patch && next.length === 2) {
        const edited = next.find((row) => row.id === id);
        const other = next.find((row) => row.id !== id);
        if (edited && other) {
          const remaining = Math.max(0, round2(total - edited.amount));
          return next.map((row) => (row.id === other.id ? { ...row, amount: remaining } : row));
        }
      }
      return next;
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
    setTouched(true);
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
        const rest = sortByCanonicalOrder(prev.filter((row) => row.id !== existing.id));
        // Redistribui o valor da forma removida pra primeira linha restante
        // (ordem canônica) — "preenchimento automático" vale pra sair também.
        return rest.map((row, index) =>
          index === 0 ? { ...row, amount: round2(row.amount + existing.amount) } : row,
        );
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
      setRows((prev) => {
        const method = sortByCanonicalOrder(prev)[0]?.method ?? (canReceiveCash ? 'dinheiro' : 'pix');
        return [newPaymentRow(method, total, { accountId: accounts[0]?.id ?? null })];
      });
    }
  }

  /** "Usar o que falta": joga o restante nesta linha, sem o operador somar na cabeça. */
  function fillRemaining(id: string) {
    setTouched(true);
    setRows((prev) => {
      const others = prev.filter((row) => row.id !== id);
      const left = computeRemaining(total, others);
      return prev.map((row) => (row.id === id ? { ...row, amount: Math.max(0, left) } : row));
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

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '';
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
      className="sm:max-w-[560px]"
      footer={footer}
    >
      <div className="space-y-4">
        {/* Placar da venda, no molde do `MultiPaymentDialog` da EcoSistema
            (pedido do CEO 2026-10-19: "replique aquele jeito, em vez de
            inventar" — bloco neutro `bg-muted`, só Total em destaque, e
            "Falta"/"Excesso" aparece SÓ quando desbalanceado. Removido
            "Informado" e a linha "Falta receber: R$ 0,00" sempre visível —
            informação demais quando a soma já fecha, que é o caso comum. */}
        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="mb-1 text-xs text-muted-foreground">{texts.total}</p>
          <p className="text-2xl font-bold tabular-nums">{money(total)}</p>
          {remaining > 0.01 && (
            <p className="mt-2 text-sm font-semibold text-destructive">
              {texts.remaining}: {money(remaining)}
            </p>
          )}
          {remaining < -0.01 && (
            <p className="mt-2 text-sm font-semibold text-destructive">
              {texts.excess}: {money(Math.abs(remaining))}
            </p>
          )}
          {change > 0 && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-success">
              <Banknote className="h-4 w-4" />
              {texts.change}: {money(change)}
            </p>
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

        {/* Modo único (default, 95% das vendas) × múltiplas (até 3 formas). */}
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm">{texts.methodLabel}</Label>
          <LabeledSwitch
            value={multiplePayments ? 'multiple' : 'single'}
            onChange={changeMode}
            off={{ value: 'single', label: texts.modeSingle }}
            on={{ value: 'multiple', label: texts.modeMultiple }}
          />
        </div>

        {/* Botões SATURADOS por forma de pagamento, em ORDEM CANÔNICA
            (Dinheiro → Pix/Transferência → Débito/Crédito → Fiado). Ativo =
            fundo saturado + texto branco; inativo = neutro de verdade
            (outline), nunca pastel — régua do CEO. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAYMENT_METHOD_ORDER.map((method) => {
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
                className={cn(
                  'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-center text-xs font-semibold transition-colors',
                  active
                    ? meta.activeClass
                    : 'border-input bg-background text-foreground hover:bg-muted',
                  disabledByCap && 'cursor-not-allowed opacity-50',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-tight">{texts.methods[method]}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {sortedRows.map((row) => {
            const issue = rowIssue(row.id);
            const rowChange = computeRowChange(row);
            const meta = METHOD_META[row.method];
            const Icon = meta.icon;
            // Forma única em dinheiro: o valor da venda já está no placar e
            // corresponde ao total. No modo múltiplo o campo continua porque
            // define quanto da parcela será pago em dinheiro.
            const showPaymentAmount = multiplePayments || row.method !== 'dinheiro';
            return (
              <div
                key={row.id}
                className={cn(
                  'space-y-3 rounded-lg border p-3',
                  touched && issue ? 'border-destructive' : 'border-border',
                )}
              >
                {/* Múltiplas formas: cabeçalho mostra QUAL forma é esta linha
                    (o seletor virou os botões acima, não tem mais Select
                    por linha). Modo único esconde — já está óbvio no botão
                    marcado acima. */}
                {multiplePayments && (
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Icon className="h-4 w-4" />
                    {texts.methods[row.method]}
                  </div>
                )}

                <div className={cn('grid grid-cols-1 gap-3', showPaymentAmount && 'sm:grid-cols-2')}>
                  {showPaymentAmount && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`pdv-pay-amount-${row.id}`}>{texts.amountLabel}</Label>
                      <PdvMoneyInput
                        id={`pdv-pay-amount-${row.id}`}
                        value={row.amount}
                        autoFocus={sortedRows[0]?.id === row.id}
                        onChange={(value) => patchRow(row.id, { amount: value })}
                      />
                      {rows.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => fillRemaining(row.id)}
                        >
                          {texts.fillRemaining}
                        </Button>
                      )}
                    </div>
                  )}

                  {row.method === 'dinheiro' && (
                    <div className={cn('space-y-1.5', !showPaymentAmount && 'sm:max-w-sm')}>
                      <Label htmlFor={`pdv-pay-tendered-${row.id}`}>{texts.tenderedLabel}</Label>
                      <PdvMoneyInput
                        id={`pdv-pay-tendered-${row.id}`}
                        value={row.tendered}
                        autoFocus={!showPaymentAmount && sortedRows[0]?.id === row.id}
                        onChange={(value) => patchRow(row.id, { tendered: value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {rowChange > 0
                          ? texts.rowChange.replace('{value}', money(rowChange))
                          : texts.tenderedHint}
                      </p>
                    </div>
                  )}

                  {requiresAccount(row.method) && (
                    <div className="space-y-1.5">
                      <Label htmlFor={`pdv-pay-account-${row.id}`}>{texts.accountLabel}</Label>
                      <Select
                        value={row.accountId ?? undefined}
                        onValueChange={(v) => patchRow(row.id, { accountId: v })}
                      >
                        <SelectTrigger id={`pdv-pay-account-${row.id}`}>
                          <SelectValue placeholder={texts.accountPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.name}
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
                    <div className="space-y-1.5">
                      <Label htmlFor={`pdv-pay-due-${row.id}`}>{texts.dueDateLabel}</Label>
                      <DatePicker
                        id={`pdv-pay-due-${row.id}`}
                        value={row.dueDate ?? ''}
                        onValueChange={(value) => patchRow(row.id, { dueDate: value || null })}
                      />
                      <p className="text-xs text-muted-foreground">{texts.dueDateHint}</p>
                    </div>
                  )}
                </div>

                {row.method === 'dinheiro' && (
                  <p className="text-xs text-muted-foreground">{texts.cashGoesToCofre}</p>
                )}
                {row.method !== 'dinheiro' && requiresAccount(row.method) && row.accountId && (
                  <p className="text-xs text-muted-foreground">
                    {texts.goesToAccount.replace('{name}', accountName(row.accountId))}
                  </p>
                )}

                {touched && issue && (
                  <NoticeBanner variant="destructive">{issueText(issue)}</NoticeBanner>
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
