import { useState, useEffect, useMemo } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Card } from '@/components/ui/card';
import { AccountFormDialog } from './AccountFormDialog';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { Wallet, Landmark, CreditCard, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { buildInstallmentPlan } from '@/lib/finance-installments';
import { CostCenterSelect } from './CostCenterSelect';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { useCostCenters } from '@/hooks/useCostCenters';

/**
 * Modal de APROVAÇÃO de orçamento.
 *
 * Substitui o uso do `ReceivePaymentModal` nessa etapa. O `ReceivePaymentModal`
 * é a UI de BAIXA ("em que conta caiu e em que dia") — usá-lo na aprovação
 * obrigava o cliente a declarar que já tinha recebido o dinheiro, e a receita
 * nascia `is_paid: true`. Reclamação do cliente (set/2026): aprovar orçamento
 * não é receber; tem que virar conta a receber pra ele dar baixa conforme o
 * dinheiro entra.
 *
 * Dois modos, com o padrão vindo de `company_settings.quote_approval_revenue_mode`:
 * - `recebido`    — igual ao fluxo antigo (receita paga + tarifa do recebimento).
 * - `a_receber`   — gera N parcelas PENDENTES. Sem tarifa: tarifa é fato do
 *                   recebimento e será informada na baixa de cada parcela.
 */
export type ApproveQuoteMode = 'recebido' | 'a_receber';

export interface ApproveQuoteResult {
  mode: ApproveQuoteMode;
  /** modo 'recebido' — obrigatório nesse modo */
  account_id?: string;
  payment_method?: string;
  /** YYYY-MM-DD */
  paid_date?: string;
  fee_amount?: number;
  /** modo 'a_receber' */
  installments?: number;      // 1..60
  first_due_date?: string;    // YYYY-MM-DD
  /** conta prevista do recebimento, opcional; NÃO mexe em saldo enquanto pendente */
  expected_account_id?: string | null;
  /**
   * Centro de custo da receita gerada. SEMPRE opcional, vale nos DOIS modos: no
   * 'recebido' vai na receita (e na tarifa filha); no 'a_receber' vai em TODAS
   * as parcelas.
   */
  cost_center_id?: string | null;
  notes?: string;
}

export interface ApproveQuoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteNumber: number | null;
  amount: number;
  defaultMode: ApproveQuoteMode;
  defaultInstallments?: number;
  defaultFirstDueDate?: string | null;
  onConfirm: (result: ApproveQuoteResult) => Promise<void> | void;
  isSubmitting?: boolean;
}

/** Sentinela do "não definir conta agora". Radix Select proíbe value="" (crasha). */
const NO_ACCOUNT = '__none__';

/** Dia de HOJE em Brasília, como YYYY-MM-DD — via getters locais, nunca toISOString. */
function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Formata YYYY-MM-DD como dd/mm/aaaa sem passar por Date (imune a UTC-3). */
function formatDayBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function parseDecimal(v: string): number {
  if (!v) return 0;
  // aceita "1.234,56" ou "1234.56" — remove pontos de milhar, troca vírgula por ponto
  const normalized = v.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function getAccIcon(type: string) {
  if (type === 'caixa') return Wallet;
  if (type === 'cartao') return CreditCard;
  return Landmark;
}

export function ApproveQuoteModal({
  open,
  onOpenChange,
  quoteNumber,
  amount,
  defaultMode,
  defaultInstallments = 1,
  defaultFirstDueDate,
  onConfirm,
  isSubmitting,
}: ApproveQuoteModalProps) {
  const { locale, currency } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const t = fin.approveQuote;
  // Vocabulário canônico de forma de pagamento (src/lib/finance-payment-methods.ts).
  // Reusa os rótulos do ReceivePaymentModal de propósito: é a MESMA lista nos 4
  // idiomas — duplicar aqui só criaria chance de divergir.
  const tp = fin.receivePayment.paymentMethods;

  const { accounts } = useFinancialAccounts();
  // Quem não gerencia configuração não vê o "+" de criar conta/categoria na
  // hora: o banco recusa (RLS pede `can_manage_system`) e o erro chegava sem
  // explicação. Mesmo critério do CostCenterSelect.
  const canManageFinanceSettings = useCanManageFinanceSettings();
  const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts]);
  const { activeCostCenters } = useCostCenters();

  const accountOptions = useMemo(
    () => activeAccounts.map((a) => {
      const Icon = getAccIcon(a.type);
      return {
        value: a.id,
        label: a.name,
        icon: (
          <span className="rounded-full p-1" style={{ backgroundColor: a.color }}>
            <Icon className="h-3 w-3 text-white" />
          </span>
        ),
      };
    }),
    [activeAccounts],
  );

  // Conta prevista é OPCIONAL: a primeira opção limpa a escolha.
  const expectedAccountOptions = useMemo(
    () => [{ value: NO_ACCOUNT, label: t.expectedAccountNone }, ...accountOptions],
    [accountOptions, t.expectedAccountNone],
  );

  const paymentMethods = [
    { value: 'dinheiro', label: tp.dinheiro },
    { value: 'pix', label: tp.pix },
    { value: 'cartao_debito', label: tp.cartao_debito },
    { value: 'cartao_credito', label: tp.cartao_credito },
    { value: 'boleto', label: tp.boleto },
    { value: 'transferencia', label: tp.transferencia },
    { value: 'cheque', label: tp.cheque },
  ];

  const [mode, setMode] = useState<ApproveQuoteMode>(defaultMode);

  // ── modo 'recebido' ───────────────────────────────────────────────────────
  const [accountId, setAccountId] = useState('');
  const [method, setMethod] = useState('pix');
  const [paidDate, setPaidDate] = useState(todayLocalISO);
  const [feeAmount, setFeeAmount] = useState('');
  // Quick-create de conta bancária inline (compartilhado pelos dois modos).
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [accountInitialName, setAccountInitialName] = useState('');
  /** Qual campo abriu o quick-create — pra auto-selecionar a conta certa. */
  const [accountFormTarget, setAccountFormTarget] = useState<'paid' | 'expected'>('paid');

  // ── modo 'a_receber' ──────────────────────────────────────────────────────
  const [installments, setInstallments] = useState(defaultInstallments);
  const [firstDueDate, setFirstDueDate] = useState(todayLocalISO);
  const [expectedAccountId, setExpectedAccountId] = useState(NO_ACCOUNT);

  const [costCenterId, setCostCenterId] = useState<string | null>(null);

  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setMethod('pix');
    setPaidDate(todayLocalISO());
    setFeeAmount('');
    setNotes('');
    setInstallments(Math.min(60, Math.max(1, Math.floor(defaultInstallments || 1))));
    setFirstDueDate(defaultFirstDueDate || todayLocalISO());
    setExpectedAccountId(NO_ACCOUNT);
    setCostCenterId(null);
    if (activeAccounts[0]) setAccountId((prev) => prev || activeAccounts[0].id);
  }, [open, defaultMode, defaultInstallments, defaultFirstDueDate]); // eslint-disable-line

  // 2x..12x, igual ao parcelamento manual (TransactionFormDialog). Se o
  // orçamento já veio gravado com um número fora dessa faixa (a coluna aceita
  // até 60), a opção entra na lista em vez de ser silenciosamente rebaixada.
  const installmentOptions = useMemo(() => {
    const base = Array.from({ length: 11 }, (_, i) => i + 2);
    const d = Math.min(60, Math.max(1, Math.floor(defaultInstallments || 1)));
    if (d > 1 && !base.includes(d)) base.push(d);
    return base.sort((a, b) => a - b);
  }, [defaultInstallments]);

  const fmt = (v: number) => formatMoney(v, currency, locale);

  const fee = parseDecimal(feeAmount);
  const liquid = amount - fee;

  const isReceivable = mode === 'a_receber';

  // Preview das parcelas — MESMO motor da gravação (datas com clamp de fim de
  // mês, sobra do rateio na última). O que o cliente vê aqui é exatamente o
  // que vai pro banco.
  const plan = useMemo(
    () => (isReceivable && firstDueDate ? buildInstallmentPlan(firstDueDate, amount, installments) : []),
    [isReceivable, firstDueDate, amount, installments],
  );

  const canSubmit = isReceivable
    ? !!firstDueDate && installments >= 1
    : !!accountId;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    if (isReceivable) {
      await onConfirm({
        mode: 'a_receber',
        installments,
        first_due_date: firstDueDate,
        expected_account_id: expectedAccountId === NO_ACCOUNT ? null : expectedAccountId,
        cost_center_id: costCenterId,
        notes: notes.trim() || undefined,
      });
      return;
    }
    await onConfirm({
      mode: 'recebido',
      account_id: accountId,
      payment_method: method,
      paid_date: paidDate,
      fee_amount: fee,
      cost_center_id: costCenterId,
      notes: notes.trim() || undefined,
    });
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
        {t.cancelLabel}
      </Button>
      <Button
        onClick={handleSubmit}
        disabled={!canSubmit || isSubmitting}
        className="bg-success hover:bg-success/90 text-white"
      >
        {isSubmitting
          ? t.confirmingLabel
          : isReceivable ? t.confirmReceivableLabel : t.confirmReceivedLabel}
      </Button>
    </div>
  );

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={quoteNumber != null ? t.titleWithNumber.replace('{number}', String(quoteNumber)) : t.title}
        description={t.amountDescription.replace('{amount}', fmt(amount))}
        footer={footer}
      >
        <div className="space-y-4">
          {/* Seletor de modo — pills saturadas (a selecionada vai na cor, com
              texto branco; nunca outline dessaturado). */}
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'recebido' as const, label: t.modeReceivedLabel },
              { value: 'a_receber' as const, label: t.modeReceivableLabel },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                aria-pressed={mode === opt.value}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                  mode === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            {isReceivable ? t.modeReceivableHint : t.modeReceivedHint}
          </p>

          {/* ─────────────────────────── MODO "JÁ RECEBI" ─────────────────── */}
          {!isReceivable && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t.paymentMethodLabel}</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t.receivedDateLabel}</Label>
                  <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
                </div>
              </div>

              <div>
                <Label>{t.accountLabel}</Label>
                <SearchableSelect
                  options={accountOptions}
                  value={accountId}
                  onValueChange={setAccountId}
                  placeholder={t.accountPlaceholder}
                  searchPlaceholder={t.accountSearchPlaceholder}
                  onCreateOption={canManageFinanceSettings ? (query) => {
                    setAccountFormTarget('paid');
                    setAccountInitialName(query);
                    setAccountFormOpen(true);
                  } : undefined}
                  createOptionLabel={t.accountCreateLabel}
                  createAlwaysLabel={t.accountCreateAlwaysLabel}
                />
                {activeAccounts.length === 0 && (
                  <p className="text-xs text-destructive mt-1">{t.noAccountHint}</p>
                )}
              </div>

              <div>
                <Label>{t.feeLabel}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={t.feePlaceholder}
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">{t.feeHint}</p>
              </div>

              {fee > 0 && (
                <Card className="p-3 bg-muted/30 border-warning/30">
                  <div className="flex justify-between text-sm">
                    <span>{t.grossLabel}</span><span className="font-medium">{fmt(amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-destructive">
                    <span>{t.feeRowLabel}</span><span>− {fmt(fee)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold pt-1 border-t mt-1">
                    <span>{t.liquidLabel}</span><span className="text-success">{fmt(liquid)}</span>
                  </div>
                </Card>
              )}
            </>
          )}

          {/* ───────────────────── MODO "VOU RECEBER DEPOIS" ──────────────── */}
          {isReceivable && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t.installmentsLabel}</Label>
                  <Select value={String(installments)} onValueChange={(v) => setInstallments(parseInt(v, 10))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t.installmentSingle}</SelectItem>
                      {installmentOptions.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t.firstDueDateLabel}</Label>
                  <Input
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                    className={cn(!firstDueDate && 'border-destructive focus-visible:ring-destructive')}
                  />
                </div>
              </div>
              {installments > 1 && (
                <p className="text-xs text-muted-foreground -mt-2">{t.firstDueDateHint}</p>
              )}

              <div>
                <Label>{t.expectedAccountLabel}</Label>
                <SearchableSelect
                  options={expectedAccountOptions}
                  value={expectedAccountId}
                  onValueChange={setExpectedAccountId}
                  placeholder={t.expectedAccountPlaceholder}
                  searchPlaceholder={t.accountSearchPlaceholder}
                  onCreateOption={canManageFinanceSettings ? (query) => {
                    setAccountFormTarget('expected');
                    setAccountInitialName(query);
                    setAccountFormOpen(true);
                  } : undefined}
                  createOptionLabel={t.accountCreateLabel}
                  createAlwaysLabel={t.accountCreateAlwaysLabel}
                />
                {/* Invariante: saldo de conta só conta linha PAGA. Enquanto a
                    parcela estiver pendente, essa conta é só previsão. */}
                <p className="text-xs text-muted-foreground mt-1">{t.expectedAccountHint}</p>
              </div>

              {/* Preview das parcelas — espelha o visual do CreditCardBillSection. */}
              {plan.length > 0 && (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                  <p className="text-sm font-medium">{t.previewTitle}</p>
                  <div className="space-y-0.5">
                    {plan.map(({ number, date, amount: value }) => (
                      <div key={number} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground min-w-0 truncate">
                          {t.previewInstallmentPrefix} {number}/{plan.length} · {formatDayBR(date)}
                        </span>
                        <span className="font-medium shrink-0">{fmt(value)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold border-t pt-1.5">
                    <span>{t.previewTotalLabel}</span>
                    <span>{fmt(amount)}</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {t.noFeeHint}
              </p>
            </>
          )}

          {/* Centro de custo — vale nos DOIS modos (já recebi / vou receber
              depois), por isso fica fora dos blocos. Sempre opcional; some da
              tela quando a empresa não usa centro de custo. */}
          {activeCostCenters.length > 0 && (
            <div>
              <Label>{fin.costCenters.fieldLabel}</Label>
              <CostCenterSelect value={costCenterId} onValueChange={setCostCenterId} />
            </div>
          )}

          <div>
            <Label>{t.observationLabel}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </ResponsiveModal>

      {/* Quick-create de conta — auto-seleciona a nova conta no campo que abriu. */}
      <AccountFormDialog
        open={accountFormOpen}
        onOpenChange={setAccountFormOpen}
        initialName={accountInitialName}
        onCreated={(account) => {
          if (accountFormTarget === 'expected') setExpectedAccountId(account.id);
          else setAccountId(account.id);
        }}
      />
    </>
  );
}
