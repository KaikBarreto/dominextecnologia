import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  CreditCard, ChevronDown, ChevronRight, Receipt, CheckCircle2, Clock, AlertCircle, ArrowLeft,
} from 'lucide-react';
import { type FinancialAccount } from '@/hooks/useFinancialAccounts';
import { useCreditCardBills, type CreditCardBillWithTransactions } from '@/hooks/useCreditCardBills';
import { BankLogo } from './BankInstitutionCombobox';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';

function formatMonth(dateStr: string) {
  return format(parseISO(dateStr + 'T12:00:00'), 'MMMM yyyy', { locale: ptBR });
}

const BILL_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  open: { label: 'Aberta', color: 'text-blue-600', icon: Clock },
  closed: { label: 'Fechada', color: 'text-orange-600', icon: AlertCircle },
  partial: { label: 'Parcial', color: 'text-yellow-600', icon: AlertCircle },
  paid: { label: 'Paga', color: 'text-green-600', icon: CheckCircle2 },
};

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

  const cashBankAccounts = accounts.filter(a => a.type !== 'cartao' && a.is_active);

  const filteredBills = statusFilter.length === 0
    ? bills
    : bills.filter(b => statusFilter.includes(b.status));

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
          aria-label="Voltar"
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
      {onClose && <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>}
    </div>
  );

  // Filtro por status — só faz sentido mostrar quando há ≥2 status entre as faturas.
  const distinctStatuses = new Set(bills.map(b => b.status));
  const showFilter = distinctStatuses.size > 1;

  const filterContent = (
    <FilterCheckboxGroup
      label="Status da fatura"
      selected={draftStatusFilter}
      onChange={setDraftStatusFilter}
      emptyLabel="Todas"
      options={[
        { value: 'open', label: 'Aberta' },
        { value: 'closed', label: 'Fechada' },
        { value: 'partial', label: 'Parcial' },
        { value: 'paid', label: 'Paga' },
      ]}
    />
  );

  // Renderiza linha de fatura — usado em mobile (MobileListItem) e detalhe.
  const renderBillMobile = (bill: CreditCardBillWithTransactions) => {
    const statusCfg = BILL_STATUS_CONFIG[bill.status] ?? BILL_STATUS_CONFIG.open;
    const StatusIcon = statusCfg.icon;
    const itemActions: ItemAction[] = [];
    if (bill.status !== 'paid') {
      itemActions.push({
        key: 'pay',
        label: 'Pagar fatura',
        icon: <CheckCircle2 className="h-4 w-4" />,
        onClick: () => openPayModal(bill),
      });
    }
    return (
      <MobileListItem
        key={bill.id}
        onClick={() => setDetailBill(bill)}
        actions={itemActions.length > 0 ? itemActions : undefined}
        leading={
          <div className={cn('rounded-full p-2.5 shrink-0 bg-muted', statusCfg.color)}>
            <Receipt className="h-4 w-4" />
          </div>
        }
        title={<span className="capitalize">{formatMonth(bill.reference_month)}</span>}
        subtitle={
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 gap-1', statusCfg.color)}>
              <StatusIcon className="h-2.5 w-2.5" />
              {statusCfg.label}
            </Badge>
            <span>Vence {format(parseISO(bill.due_date + 'T12:00:00'), 'dd/MM/yyyy')}</span>
          </div>
        }
        trailing={
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor</span>
            <span className={cn('font-semibold text-sm whitespace-nowrap', bill.status === 'paid' ? 'text-muted-foreground' : 'text-destructive')}>
              {formatBRL(bill.total_amount ?? 0)}
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
          <span>Fecha dia <strong>{account.closing_day}</strong></span>
          {account.due_day
            ? <span>Vence dia <strong>{account.due_day}</strong>{account.due_day <= (account.closing_day ?? 10) ? ' (mês seguinte)' : ''}</span>
            : <span>Vencimento <strong>{account.payment_due_days ?? 10} dias</strong> após fechamento</span>
          }
          {account.credit_limit && <span>Limite <strong>{formatBRL(account.credit_limit)}</strong></span>}
        </div>
      )}

      {/* Barra de filtros — só aparece no mobile e quando há ≥2 status distintos. */}
      {isMobile && showFilter && !isLoading && bills.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {filteredBills.length} de {bills.length} {bills.length === 1 ? 'fatura' : 'faturas'}
          </p>
          <FilterSheet
            triggerLabel="Filtros"
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
        <p className="text-sm text-muted-foreground py-4 text-center">Carregando faturas...</p>
      ) : bills.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<CreditCard className="h-10 w-10" />}
          title="Nenhuma fatura registrada"
          description="As faturas aparecem automaticamente quando você lança despesas neste cartão."
        />
      ) : isMobile ? (
        filteredBills.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<CreditCard className="h-10 w-10" />}
            title="Nenhuma fatura encontrada"
            description="Ajuste o filtro para ver outras faturas."
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
            const statusCfg = BILL_STATUS_CONFIG[bill.status] ?? BILL_STATUS_CONFIG.open;
            const StatusIcon = statusCfg.icon;
            const remaining = (bill.total_amount ?? 0) - Number(bill.amount_paid ?? 0);
            const isExpanded = expandedBill === bill.id;

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
                              Fecha {format(parseISO(bill.closing_date + 'T12:00:00'), 'dd/MM')} · Vence {format(parseISO(bill.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <p className="font-bold text-sm">{formatBRL(bill.total_amount ?? 0)}</p>
                          <Badge variant="outline" className={cn('text-[10px] gap-1', statusCfg.color)}>
                            <StatusIcon className="h-3 w-3" />
                            {statusCfg.label}
                          </Badge>
                        </div>
                      </div>

                      {bill.status !== 'paid' && (
                        <div className="mt-3 flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 gap-1"
                            onClick={(e) => { e.stopPropagation(); openPayModal(bill); }}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Pagar Fatura
                          </Button>
                        </div>
                      )}

                      {bill.status === 'partial' && (
                        <p className="text-xs text-yellow-600 mt-1 text-right">
                          Pago: {formatBRL(Number(bill.amount_paid ?? 0))} · Restante: {formatBRL(remaining)}
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
                          title="Sem lançamentos nesta fatura"
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
                              <p className="font-medium text-destructive">{formatBRL(Number(t.amount))}</p>
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
        title={detailBill ? formatMonth(detailBill.reference_month).replace(/^./, c => c.toUpperCase()) : 'Detalhes da fatura'}
        className="sm:max-w-[480px]"
      >
        {detailBill && (() => {
          const statusCfg = BILL_STATUS_CONFIG[detailBill.status] ?? BILL_STATUS_CONFIG.open;
          const StatusIcon = statusCfg.icon;
          const billTotal = detailBill.total_amount ?? 0;
          const alreadyPaid = Number(detailBill.amount_paid ?? 0);
          const remaining = billTotal - alreadyPaid;
          const transactions = detailBill.transactions ?? [];
          return (
            <div className="space-y-4">
              <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={cn('text-[10px] gap-1', statusCfg.color)}>
                    <StatusIcon className="h-3 w-3" />
                    {statusCfg.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Fecha {format(parseISO(detailBill.closing_date + 'T12:00:00'), 'dd/MM')} · Vence {format(parseISO(detailBill.due_date + 'T12:00:00'), 'dd/MM/yyyy')}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground">Total da fatura</span>
                  <span className="font-medium">{formatBRL(billTotal)}</span>
                </div>
                {alreadyPaid > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Já pago</span>
                      <span className="text-success">− {formatBRL(alreadyPaid)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 mt-1">
                      <span className="font-medium">Restante</span>
                      <span className="font-bold">{formatBRL(remaining)}</span>
                    </div>
                  </>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Lançamentos ({transactions.length})
                </p>
                {transactions.length === 0 ? (
                  <div className="border rounded-lg">
                    <EmptyState
                      size="compact"
                      icon={<CreditCard className="h-10 w-10" />}
                      title="Sem lançamentos nesta fatura"
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
                            {formatBRL(Number(t.amount))}
                          </span>
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {detailBill.status !== 'paid' && (
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    const b = detailBill;
                    setDetailBill(null);
                    openPayModal(b);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Pagar fatura
                </Button>
              )}
            </div>
          );
        })()}
      </ResponsiveModal>


      {/* Modal Pagar Fatura */}
      <ResponsiveModal
        open={!!payingBill}
        onOpenChange={(v) => { if (!v) setPayingBill(null); }}
        title="Pagar Fatura"
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
                <span className="text-muted-foreground">Total da fatura</span>
                <span className="font-medium">{formatBRL(billTotal)}</span>
              </div>
              {alreadyPaid > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Já pago</span>
                  <span className="text-success">− {formatBRL(alreadyPaid)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="font-medium">Restante a pagar</span>
                <span className="font-bold">{formatBRL(remaining)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pagar com *</Label>
              <Select value={payAccountId} onValueChange={setPayAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecione conta/caixa" /></SelectTrigger>
                <SelectContent>
                  {cashBankAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        {a.institution_name
                          ? <BankLogo code={a.institution_code} name={a.institution_name} size={16} />
                          : <div className="h-4 w-4 rounded-full" style={{ backgroundColor: a.color }} />
                        }
                        {a.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Data do pagamento *</Label>
              <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Valor a pagar (R$)</Label>
              <Input
                placeholder="0,00"
                value={payAmount > 0 ? payAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                onChange={handlePayAmountChange}
                inputMode="numeric"
              />
              {isFullPayment ? (
                <p className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1.5 rounded flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Fatura será completamente quitada
                </p>
              ) : afterPayment > 0.01 ? (
                <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1.5 rounded">
                  Pagamento parcial — ficará <strong>{formatBRL(afterPayment)}</strong> em aberto
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                placeholder="Opcional"
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setPayingBill(null)}>Cancelar</Button>
              <Button
                onClick={handlePay}
                disabled={!payAccountId || payAmount <= 0 || payBill.isPending}
              >
                {payBill.isPending ? 'Registrando...' : 'Confirmar Pagamento'}
              </Button>
            </div>
          </div>
          );
        })()}
      </ResponsiveModal>
    </div>
  );
}
