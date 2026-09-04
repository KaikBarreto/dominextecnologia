import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CreditCard, ChevronDown, ChevronRight, Receipt, CheckCircle2, Clock, AlertCircle, ArrowLeft, Lock,
} from 'lucide-react';
import { type FinancialAccount } from '@/hooks/useFinancialAccounts';
import { AccountFormDialog } from './AccountFormDialog';
import { useCreditCardBills, effectiveBillStatus, type CreditCardBillWithTransactions } from '@/hooks/useCreditCardBills';
import { BankLogo } from './BankInstitutionCombobox';
import { cn } from '@/lib/utils';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';

function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

function formatMonth(dateStr: string) {
  return format(parseLocalDate(dateStr), 'MMMM yyyy', { locale: ptBR });
}

// Mesma regra do `CreditCardInvoiceRow` (única fonte da verdade da trava de
// UI): fechada (e liberada pra pagamento) quando hoje >= closing_date — o
// próprio dia do fechamento já libera, pois nenhuma compra nova entra mais
// nessa fatura a partir daí. A trava definitiva fica na RPC no servidor —
// esta só evita que o usuário chegue a clicar.
function canPayBill(bill: Pick<CreditCardBillWithTransactions, 'closing_date'>): boolean {
  const today = startOfDay(new Date());
  const closingDate = parseLocalDate(bill.closing_date);
  return !isBefore(today, closingDate);
}

interface CreditCardBillPanelProps {
  account: FinancialAccount;
  accounts: FinancialAccount[];
  /** Quando definido, mostra header com ação de voltar/fechar. */
  onClose?: () => void;
  /** Esconde o header (útil quando a tela hospedeira já tem header próprio). */
  hideHeader?: boolean;
}

/**
 * Painel de faturas de um cartão de crédito. Extraído de FinanceBanks pra ser
 * reusado pela tela "Movimentações Financeiras" (conteúdo da aba de cartão).
 * Fonte única do fluxo de pagamento/detalhe de fatura.
 */
export function CreditCardBillPanel({ account, accounts, onClose, hideHeader }: CreditCardBillPanelProps) {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const cc = MESSAGES[locale].app.finance.creditCard;
  const fmt = (v: number) => formatMoney(v, currency, locale);

  // Etiqueta SATURADA (fundo na cor + texto/ícone branco) — nunca outline
  // dessaturado. Ordem de urgência (não pagas primeiro, por vencimento; pagas
  // pro fim) já vem pronta do hook `useCreditCardBills` (`enriched.sort`).
  const BILL_STATUS_CONFIG: Record<string, { label: string; badgeClass: string; icon: React.ElementType }> = {
    open: { label: cc.statusOpen, badgeClass: 'bg-blue-600', icon: Clock },
    closed: { label: cc.statusClosed, badgeClass: 'bg-orange-600', icon: AlertCircle },
    partial: { label: cc.statusPartial, badgeClass: 'bg-amber-600', icon: AlertCircle },
    paid: { label: cc.statusPaid, badgeClass: 'bg-success', icon: CheckCircle2 },
  };

  const { bills, isLoading, payBill } = useCreditCardBills(account.id);
  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [detailBill, setDetailBill] = useState<CreditCardBillWithTransactions | null>(null);
  const [payingBill, setPayingBill] = useState<CreditCardBillWithTransactions | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payAmount, setPayAmount] = useState(0);
  const [payNotes, setPayNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [draftStatusFilter, setDraftStatusFilter] = useState<string[]>([]);
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [accountInitialName, setAccountInitialName] = useState('');

  const cashBankAccounts = accounts.filter(a => a.type !== 'cartao' && a.is_active);

  // Opções do SearchableSelect de conta — só contas não-cartão e ativas.
  const payAccountOptions = useMemo(
    () => cashBankAccounts.map(a => ({
      value: a.id,
      label: a.name,
    })),
    [cashBankAccounts],
  );

  const filteredBills = statusFilter.length === 0
    ? bills
    // Filtra pelo status EXIBIDO (fatura fechada lê "closed" mesmo gravada "open").
    : bills.filter(b => statusFilter.includes(effectiveBillStatus(b)));

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const openPayModal = (bill: CreditCardBillWithTransactions) => {
    const remaining = (bill.total_amount ?? 0) - Number(bill.amount_paid ?? 0);
    setPayingBill(bill);
    setPayAmount(remaining);
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayAccountId(cashBankAccounts[0]?.id ?? '');
    setPayNotes('');
  };

  const handlePay = async () => {
    if (!payingBill || !payAccountId || payAmount <= 0) return;
    await payBill.mutateAsync({
      bill: payingBill,
      paymentAccountId: payAccountId,
      paymentDate: payDate,
      amountToPay: payAmount,
      notes: payNotes || undefined,
    });
    setPayingBill(null);
    // Se acabei de pagar a fatura mostrada no detalhe, fecho — dados ficam stale.
    setDetailBill(null);
  };

  const handlePayAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setPayAmount(parseInt(raw || '0', 10) / 100);
  };

  // Header reaproveitado pra mobile (com seta voltar) e desktop (com botão Fechar).
  const headerNode = isMobile ? (
    <div className="flex items-center gap-2 -mx-1">
      {onClose && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onClose}
          aria-label={cc.backAriaLabel}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {(account.institution_name || account.bank_name) ? (
          <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: account.color }}>
            <BankLogo code={account.institution_code} name={account.institution_name || account.bank_name} size={28} />
          </div>
        ) : (
          <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: account.color }}>
            <CreditCard className="h-4 w-4 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold text-base leading-tight truncate">{account.name}</h3>
          {account.institution_name && (
            <p className="text-[11px] text-muted-foreground leading-tight truncate">{account.institution_name}</p>
          )}
        </div>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold">{account.name}</h3>
          {account.institution_name && (
            <p className="text-xs text-muted-foreground">{account.institution_name}</p>
          )}
        </div>
      </div>
      {onClose && <Button variant="ghost" size="sm" onClick={onClose}>{cc.closeButton}</Button>}
    </div>
  );

  // Filtro por status — só faz sentido mostrar quando há ≥2 status entre as faturas.
  // Usa o status EXIBIDO (open cujo fechamento já foi alcançado conta como "closed").
  const distinctStatuses = new Set(bills.map(b => effectiveBillStatus(b)));
  const showFilter = distinctStatuses.size > 1;

  const filterContent = (
    <FilterCheckboxGroup
      label={cc.filterLabel}
      selected={draftStatusFilter}
      onChange={setDraftStatusFilter}
      emptyLabel={cc.filterAll}
      options={[
        { value: 'open', label: cc.filterStatusOpen },
        { value: 'closed', label: cc.filterStatusClosed },
        { value: 'partial', label: cc.filterStatusPartial },
        { value: 'paid', label: cc.filterStatusPaid },
      ]}
    />
  );

  // Renderiza linha de fatura — usado em mobile (MobileListItem) e detalhe.
  const renderBillMobile = (bill: CreditCardBillWithTransactions) => {
    const statusCfg = BILL_STATUS_CONFIG[effectiveBillStatus(bill)] ?? BILL_STATUS_CONFIG.open;
    const StatusIcon = statusCfg.icon;
    const canPay = canPayBill(bill);
    const txnCount = bill.transactions?.length ?? 0;
    const itemActions: ItemAction[] = [];
    if (bill.status !== 'paid') {
      itemActions.push(
        canPay
          ? {
              key: 'pay',
              label: cc.payBillButton,
              icon: <CheckCircle2 className="h-4 w-4" />,
              onClick: () => openPayModal(bill),
            }
          : {
              // Travado, mas EXPLICA — nunca some nem deixa clicar pra dar erro depois.
              key: 'pay',
              label: cc.payLockedHint.replace('{date}', format(parseLocalDate(bill.closing_date), 'dd/MM/yyyy')),
              icon: <Lock className="h-4 w-4" />,
              disabled: true,
              onClick: () => {},
            }
      );
    }
    return (
      <MobileListItem
        key={bill.id}
        onClick={() => setDetailBill(bill)}
        actions={itemActions.length > 0 ? itemActions : undefined}
        leading={
          <div className={cn('rounded-full p-2.5 shrink-0 text-white', statusCfg.badgeClass)}>
            <Receipt className="h-4 w-4" />
          </div>
        }
        title={<span className="capitalize">{formatMonth(bill.reference_month)}</span>}
        subtitle={
          <div className="flex flex-col gap-1">
            <Badge className={cn('w-fit text-[10px] px-1.5 py-0 gap-1 text-white', statusCfg.badgeClass)}>
              <StatusIcon className="h-2.5 w-2.5" />
              {statusCfg.label}
            </Badge>
            <span>
              {cc.billSummaryLine
                .replace('{due}', format(parseLocalDate(bill.due_date), 'dd/MM/yyyy'))
                .replace('{closing}', format(parseLocalDate(bill.closing_date), 'dd/MM/yyyy'))
                .replace('{count}', String(txnCount))
                .replace('{noun}', txnCount === 1 ? cc.entryNounSingular : cc.entryNounPlural)}
            </span>
          </div>
        }
        trailing={
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor</span>
            <span className={cn('font-semibold text-sm whitespace-nowrap', bill.status === 'paid' ? 'text-muted-foreground' : 'text-destructive')}>
              {fmt(bill.total_amount ?? 0)}
            </span>
          </div>
        }
      />
    );
  };

  return (
    <div className="space-y-4">
      {!hideHeader && headerNode}

      {account.closing_day && (
        <div className="flex gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30 flex-wrap">
          <span>{cc.closesDay} <strong>{account.closing_day}</strong></span>
          {account.due_day
            ? <span>{cc.dueDay} <strong>{account.due_day}</strong>{account.due_day <= (account.closing_day ?? 10) ? ` ${cc.nextMonth}` : ''}</span>
            : <span>{cc.dueDay} <strong>{account.payment_due_days ?? 10}</strong> {cc.daysAfterClose}</span>
          }
          {account.credit_limit && <span>{cc.creditLimit} <strong>{fmt(account.credit_limit)}</strong></span>}
        </div>
      )}

      {/* Barra de filtros — só aparece no mobile e quando há ≥2 status distintos. */}
      {isMobile && showFilter && !isLoading && bills.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {cc.countBills
              .replace('{count}', String(filteredBills.length))
              .replace('{total}', String(bills.length))
              .replace('{noun}', bills.length === 1 ? cc.billNounSingular : cc.billNounPlural)}
          </p>
          <FilterSheet
            triggerLabel={cc.filtersLabel}
            activeCount={activeFilterCount}
            onClear={() => {
              setDraftStatusFilter([]);
              setStatusFilter([]);
            }}
            onApply={() => setStatusFilter(draftStatusFilter)}
          >
            {filterContent}
          </FilterSheet>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">{cc.loading}</p>
      ) : bills.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<CreditCard className="h-10 w-10" />}
          title={cc.emptyTitle}
          description={cc.emptyDescription}
        />
      ) : isMobile ? (
        filteredBills.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<CreditCard className="h-10 w-10" />}
            title={cc.emptyFilterTitle}
            description={cc.emptyFilterDescription}
          />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            {filteredBills.map(renderBillMobile)}
          </div>
        )
      ) : (
        // Desktop: grid 2-col em telas grandes (lg+). Faturas expandidas mantêm
        // sua coluna — não esticam pra full-width. CEO aprovou densidade extra.
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
          {bills.map(bill => {
            const statusCfg = BILL_STATUS_CONFIG[effectiveBillStatus(bill)] ?? BILL_STATUS_CONFIG.open;
            const StatusIcon = statusCfg.icon;
            const remaining = (bill.total_amount ?? 0) - Number(bill.amount_paid ?? 0);
            const isExpanded = expandedBill === bill.id;
            const canPay = canPayBill(bill);
            const txnCount = bill.transactions?.length ?? 0;

            return (
              <Card key={bill.id} className="overflow-hidden">
                <Collapsible open={isExpanded} onOpenChange={(v) => setExpandedBill(v ? bill.id : null)}>
                  <CollapsibleTrigger className="w-full">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          }
                          <div className="text-left">
                            <p className="font-medium capitalize text-sm">{formatMonth(bill.reference_month)}</p>
                            <p className="text-xs text-muted-foreground">
                              {cc.billSummaryLine
                                .replace('{due}', format(parseLocalDate(bill.due_date), 'dd/MM/yyyy'))
                                .replace('{closing}', format(parseLocalDate(bill.closing_date), 'dd/MM/yyyy'))
                                .replace('{count}', String(txnCount))
                                .replace('{noun}', txnCount === 1 ? cc.entryNounSingular : cc.entryNounPlural)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <p className="font-bold text-sm">{fmt(bill.total_amount ?? 0)}</p>
                          <Badge className={cn('text-[10px] gap-1 text-white', statusCfg.badgeClass)}>
                            <StatusIcon className="h-3 w-3" />
                            {statusCfg.label}
                          </Badge>
                        </div>
                      </div>

                      {bill.status !== 'paid' && (
                        <div className="mt-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
                          {canPay ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 gap-1"
                              onClick={(e) => { e.stopPropagation(); openPayModal(bill); }}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {cc.payBillButton}
                            </Button>
                          ) : (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {/* Wrapper span necessário: o Button fica disabled. */}
                                  <span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7 gap-1 opacity-60"
                                      disabled
                                    >
                                      <Lock className="h-3 w-3" />
                                      {cc.payBillButton}
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[260px] text-xs">
                                  {cc.payLockedHint.replace('{date}', format(parseLocalDate(bill.closing_date), 'dd/MM/yyyy'))}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      )}

                      {bill.status === 'partial' && (
                        <p className="text-xs text-yellow-600 mt-1 text-right">
                          {cc.alreadyPaid}: {fmt(Number(bill.amount_paid ?? 0))} · {cc.remaining}: {fmt(remaining)}
                        </p>
                      )}
                    </CardContent>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="border-t mx-4 mb-4">
                      {(bill.transactions ?? []).length === 0 ? (
                        <EmptyState
                          size="compact"
                          icon={<CreditCard className="h-10 w-10" />}
                          title={cc.noEntriesTitle}
                        />
                      ) : (
                        <div className="space-y-1 pt-3">
                          {(bill.transactions ?? []).map(t => (
                            <div key={t.id} className="flex items-center justify-between text-sm py-1">
                              <div>
                                <p className="text-sm">{t.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {format(parseISO(t.transaction_date + 'T12:00:00'), 'dd/MM/yyyy')}
                                  {t.category && ` · ${t.category}`}
                                </p>
                              </div>
                              <p className="font-medium text-destructive">{fmt(Number(t.amount))}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Detalhes da fatura (mobile drilldown) */}
      <ResponsiveModal
        open={!!detailBill}
        onOpenChange={(v) => { if (!v) setDetailBill(null); }}
        title={detailBill ? formatMonth(detailBill.reference_month).replace(/^./, c => c.toUpperCase()) : cc.detailTitle}
        className="sm:max-w-[480px]"
      >
        {detailBill && (() => {
          const statusCfg = BILL_STATUS_CONFIG[effectiveBillStatus(detailBill)] ?? BILL_STATUS_CONFIG.open;
          const StatusIcon = statusCfg.icon;
          const billTotal = detailBill.total_amount ?? 0;
          const alreadyPaid = Number(detailBill.amount_paid ?? 0);
          const remaining = billTotal - alreadyPaid;
          const transactions = detailBill.transactions ?? [];
          return (
            <div className="space-y-4">
              <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge className={cn('text-[10px] gap-1 text-white', statusCfg.badgeClass)}>
                    <StatusIcon className="h-3 w-3" />
                    {statusCfg.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {cc.closes} {format(parseLocalDate(detailBill.closing_date), 'dd/MM')} · {cc.due} {format(parseLocalDate(detailBill.due_date), 'dd/MM/yyyy')}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground">{cc.total}</span>
                  <span className="font-medium">{fmt(billTotal)}</span>
                </div>
                {alreadyPaid > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{cc.alreadyPaid}</span>
                      <span className="text-success">− {fmt(alreadyPaid)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="font-medium">{cc.remaining}</span>
                      <span className="font-bold">{fmt(remaining)}</span>
                    </div>
                  </>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  {cc.entriesLabel} ({transactions.length})
                </p>
                {transactions.length === 0 ? (
                  <div className="border rounded-lg">
                    <EmptyState
                      size="compact"
                      icon={<CreditCard className="h-10 w-10" />}
                      title={cc.noEntriesTitle}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border bg-card overflow-hidden max-h-[40vh] overflow-y-auto">
                    {transactions.map(t => (
                      <MobileListItem
                        key={t.id}
                        title={t.description}
                        subtitle={
                          <span>
                            {format(parseISO(t.transaction_date + 'T12:00:00'), 'dd/MM/yyyy')}
                            {t.category && ` · ${t.category}`}
                          </span>
                        }
                        trailing={
                          <span className="font-medium text-destructive text-sm whitespace-nowrap">
                            {fmt(Number(t.amount))}
                          </span>
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {detailBill.status !== 'paid' && (
                canPayBill(detailBill) ? (
                  <Button
                    className="w-full gap-2"
                    onClick={() => {
                      const b = detailBill;
                      setDetailBill(null);
                      openPayModal(b);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {cc.payBillButtonShort}
                  </Button>
                ) : (
                  <div className="rounded-lg border border-muted bg-muted/30 p-3 flex items-start gap-2 text-xs text-muted-foreground">
                    <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      {cc.payLockedHint.replace('{date}', format(parseLocalDate(detailBill.closing_date), 'dd/MM/yyyy'))}
                    </span>
                  </div>
                )
              )}
            </div>
          );
        })()}
      </ResponsiveModal>


      {/* Modal Pagar Fatura */}
      <ResponsiveModal
        open={!!payingBill}
        onOpenChange={(v) => { if (!v) setPayingBill(null); }}
        title={cc.payModalTitle}
        className="sm:max-w-[440px]"
      >
        {payingBill && (() => {
          const billTotal = payingBill.total_amount ?? 0;
          const alreadyPaid = Number(payingBill.amount_paid ?? 0);
          const remaining = billTotal - alreadyPaid;
          const afterPayment = remaining - payAmount;
          const isFullPayment = afterPayment <= 0.01;
          return (
          <div className="space-y-4">
            <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1">
              <p className="font-semibold capitalize mb-2">{formatMonth(payingBill.reference_month)}</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{cc.total}</span>
                <span className="font-medium">{fmt(billTotal)}</span>
              </div>
              {alreadyPaid > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{cc.alreadyPaid}</span>
                  <span className="text-success">− {fmt(alreadyPaid)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-medium">{cc.remainingToPay}</span>
                <span className="font-bold">{fmt(remaining)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{cc.payWith}</Label>
              <SearchableSelect
                options={payAccountOptions}
                value={payAccountId}
                onValueChange={setPayAccountId}
                placeholder={cc.payWithPlaceholder}
                searchPlaceholder={cc.payWithSearchPlaceholder}
                onCreateOption={(query) => {
                  setAccountInitialName(query);
                  setAccountFormOpen(true);
                }}
                createAlwaysLabel={cc.payWithNewAccount}
              />
              {cashBankAccounts.length === 0 && (
                <p className="text-xs text-destructive mt-1">{cc.noAccountHint}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{cc.payDate}</Label>
              <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>{cc.payAmount}</Label>
              <Input
                placeholder="0,00"
                value={payAmount > 0 ? payAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                onChange={handlePayAmountChange}
                inputMode="numeric"
              />
              {/* Aviso de estado do pagamento. Card BRANCO (bg-card/border-border)
                  com título e ícone saturados em negrito, nunca card tingido
                  dessaturado (régua de UI). Pagamento parcial NÃO quita as
                  compras da fatura de propósito (não dá pra saber quais foram
                  pagas), então o usuário precisa saber que aquele custo só
                  aparece no Regime de Caixa depois da quitação total. */}
              {isFullPayment ? (
                <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-px text-success" />
                  <p className="text-xs font-bold text-success">{cc.payFullHint}</p>
                </div>
              ) : afterPayment > 0.01 ? (
                <div className="rounded-lg border border-border bg-card px-3 py-2 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-px text-warning" />
                    <p className="text-xs font-bold text-warning">
                      {cc.payPartialHint.replace('{amount}', fmt(afterPayment))}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">
                    {cc.payPartialRegimeHint}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>{cc.payNotes}</Label>
              <Textarea
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                placeholder={cc.payNotesPlaceholder}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setPayingBill(null)}>{cc.cancelLabel}</Button>
              <Button
                onClick={handlePay}
                disabled={!payAccountId || payAmount <= 0 || payBill.isPending}
              >
                {payBill.isPending ? cc.confirmingPay : cc.confirmPay}
              </Button>
            </div>
          </div>
          );
        })()}
      </ResponsiveModal>

      {/* Quick-create de conta — auto-seleciona a nova conta ao criar. */}
      <AccountFormDialog
        open={accountFormOpen}
        onOpenChange={setAccountFormOpen}
        initialName={accountInitialName}
        onCreated={(account) => setPayAccountId(account.id)}
      />
    </div>
  );
}
