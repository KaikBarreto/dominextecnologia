import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  Plus, Pencil, Trash2, ArrowLeftRight, Landmark, Wallet, CreditCard,
  ChevronDown, ChevronRight, Receipt, CheckCircle2, Clock, AlertCircle, ArrowRight,
  Calculator, Loader2, ArrowLeft, Tags,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFinancialAccounts, type FinancialAccount, type AccountInput } from '@/hooks/useFinancialAccounts';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { useCreditCardBills, type CreditCardBillWithTransactions } from '@/hooks/useCreditCardBills';
import { useRecalculateBills } from '@/hooks/useRecalculateBills';
import { TransferFormDialog } from './TransferFormDialog';
import { BankInstitutionCombobox, BankLogo } from './BankInstitutionCombobox';
import { FinanceCategorias } from './FinanceCategorias';
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

const ACCOUNT_TYPES = [
  { value: 'caixa', label: 'Caixa', icon: Wallet },
  { value: 'banco', label: 'Conta Bancária', icon: Landmark },
  { value: 'cartao', label: 'Cartão de Crédito', icon: CreditCard },
];

const ACCOUNT_COLORS = [
  '#0F172A', '#1E293B', '#334155', '#0EA5E9', '#0284C7', '#1D4ED8',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4',
];

const CLOSING_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const DUE_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const BILL_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  open: { label: 'Aberta', color: 'text-blue-600', icon: Clock },
  closed: { label: 'Fechada', color: 'text-orange-600', icon: AlertCircle },
  partial: { label: 'Parcial', color: 'text-yellow-600', icon: AlertCircle },
  paid: { label: 'Paga', color: 'text-green-600', icon: CheckCircle2 },
};

function getTypeIcon(type: string) {
  const found = ACCOUNT_TYPES.find(t => t.value === type);
  return found?.icon || Landmark;
}

// ─── Painel de Faturas ──────────────────────────────────────────────────────

interface BillPanelProps {
  account: FinancialAccount;
  accounts: FinancialAccount[];
  onClose: () => void;
}

function BillPanel({ account, accounts, onClose }: BillPanelProps) {
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
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={onClose}
        aria-label="Voltar"
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>
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
      <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
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
      {headerNode}

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
        isMobile ? (
          <EmptyState
            icon={<Receipt className="h-10 w-10" />}
            title="Nenhuma fatura registrada"
            description="As faturas aparecem automaticamente quando você lança despesas neste cartão"
          />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma fatura registrada</p>
            <p className="text-xs mt-1">As faturas aparecem automaticamente quando você lança despesas neste cartão</p>
          </div>
        )
      ) : isMobile ? (
        filteredBills.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-10 w-10" />}
            title="Nenhuma fatura encontrada"
            description="Ajuste o filtro para ver outras faturas"
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
                        <p className="text-xs text-muted-foreground py-3 text-center">Sem transações nesta fatura</p>
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
                  <p className="text-xs text-muted-foreground py-3 text-center border rounded-lg">
                    Sem lançamentos nesta fatura
                  </p>
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

// ─── Componente Principal ────────────────────────────────────────────────────

export function FinanceBanks() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { accounts, balances, cardBillTotals, isLoading, createAccount, updateAccount, deleteAccount, transfer } = useFinancialAccounts();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialAccount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<FinancialAccount | null>(null);
  const [recalcCard, setRecalcCard] = useState<FinancialAccount | null>(null);
  const recalculateBills = useRecalculateBills();

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('banco');
  const [institution, setInstitution] = useState<{ code: number | null; name: string; ispb?: string | null } | null>(null);
  const [initialBalance, setInitialBalance] = useState(0);
  const [color, setColor] = useState('#3b82f6');
  const [closingDay, setClosingDay] = useState<number>(10);
  const [dueDay, setDueDay] = useState<number>(20);
  const [creditLimit, setCreditLimit] = useState<number>(0);

  const cashBankAccounts = accounts.filter(a => a.type !== 'cartao');
  const cardAccounts = accounts.filter(a => a.type === 'cartao');

  const totalCashBalance = cashBankAccounts.reduce((sum, a) => sum + (balances[a.id] ?? a.initial_balance), 0);
  const totalOpenBills = cardAccounts.reduce((sum, a) => sum + (cardBillTotals[a.id] ?? 0), 0);

  const openNew = (initialType: string = 'banco') => {
    setEditing(null);
    setName(''); setType(initialType); setInstitution(null); setInitialBalance(0); setColor('#3b82f6');
    setClosingDay(10); setDueDay(20); setCreditLimit(0);
    setFormOpen(true);
  };

  const openEdit = (a: FinancialAccount) => {
    setEditing(a);
    setName(a.name);
    setType(a.type);
    setInstitution(a.institution_name ? { code: a.institution_code ?? null, name: a.institution_name, ispb: a.institution_ispb } : (a.bank_name ? { code: null, name: a.bank_name } : null));
    setInitialBalance(a.initial_balance);
    setColor(a.color);
    setClosingDay(a.closing_day ?? 10);
    setDueDay(a.due_day ?? (a.payment_due_days ? (a.closing_day ?? 10) + a.payment_due_days : 20));
    setCreditLimit(a.credit_limit ?? 0);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: AccountInput = {
      name,
      type,
      bank_name: institution?.name || undefined,
      institution_code: institution?.code ?? null,
      institution_name: institution?.name ?? null,
      institution_ispb: institution?.ispb ?? null,
      initial_balance: initialBalance,
      color,
      ...(type === 'cartao' ? {
        closing_day: closingDay,
        due_day: dueDay,
        payment_due_days: dueDay > closingDay ? dueDay - closingDay : (30 - closingDay + dueDay),
        credit_limit: creditLimit > 0 ? creditLimit : null,
      } : {
        closing_day: null,
        due_day: null,
        payment_due_days: null,
        credit_limit: null,
      }),
    };
    if (editing) {
      await updateAccount.mutateAsync({ ...input, id: editing.id });
    } else {
      await createAccount.mutateAsync(input);
    }
    setFormOpen(false);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteAccount.mutateAsync(deletingId);
    setDeletingId(null);
  };

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setInitialBalance(parseInt(raw || '0', 10) / 100);
  };

  const handleCreditLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setCreditLimit(parseInt(raw || '0', 10) / 100);
  };

  const balanceDisplay = initialBalance
    ? initialBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const creditLimitDisplay = creditLimit
    ? creditLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  if (selectedCard) {
    return (
      <div className="space-y-5">
        <BillPanel
          account={selectedCard}
          accounts={accounts}
          onClose={() => setSelectedCard(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Seção 1: Caixas e Contas Bancárias ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Caixas e Contas Bancárias</h3>
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Botão "Categorias" — gestão deixou de ser aba em v1.9.22 e mora
                aqui agora. Ícone Tags semântico, label curto pra caber junto
                com Transferir/Nova Conta no mesmo header. No mobile,
                "Categorias" some o label e fica só o ícone pra não estourar
                a linha. */}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setCategoriesOpen(true)}>
              <Tags className="h-4 w-4" />
              <span className="hidden sm:inline">Categorias</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setTransferOpen(true)} disabled={cashBankAccounts.length < 2}>
              <ArrowLeftRight className="h-4 w-4" />
              <span className="hidden sm:inline">Transferir</span>
            </Button>
            <Button size="sm" className="gap-2" onClick={() => openNew('banco')}>
              <Plus className="h-4 w-4" /> Nova Conta
            </Button>
          </div>
        </div>

        <Card className="bg-primary border-0">
          <CardContent className="p-4 sm:p-5">
            <p className="text-xs font-medium text-primary-foreground/80 uppercase tracking-wider">Saldo Total</p>
            <p className="text-2xl font-bold text-primary-foreground mt-1">{formatBRL(totalCashBalance)}</p>
          </CardContent>
        </Card>

        {cashBankAccounts.length === 0 && !isLoading ? (
          isMobile ? (
            <EmptyState
              icon={<Landmark className="h-10 w-10" />}
              title="Nenhuma conta bancária cadastrada"
              description="Toque em + para cadastrar"
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <Landmark className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Nenhuma conta bancária cadastrada</p>
            </div>
          )
        ) : isMobile ? (
          <div className="rounded-xl border bg-card overflow-hidden">
            {cashBankAccounts.map((a) => {
              const Icon = getTypeIcon(a.type);
              const balance = balances[a.id] ?? a.initial_balance;
              const hasInst = !!(a.institution_name || a.bank_name);
              const itemActions: ItemAction[] = [
                {
                  key: 'view',
                  label: 'Ver movimentações',
                  icon: <ArrowRight className="h-4 w-4" />,
                  onClick: () => navigate(`/financeiro/movimentacoes?account=${a.id}`),
                },
                {
                  key: 'edit',
                  label: 'Editar',
                  icon: <Pencil className="h-4 w-4" />,
                  variant: 'edit' as const,
                  onClick: () => openEdit(a),
                },
                {
                  key: 'delete',
                  label: 'Excluir',
                  icon: <Trash2 className="h-4 w-4" />,
                  variant: 'destructive' as const,
                  onClick: () => setDeletingId(a.id),
                },
              ];
              return (
                <MobileListItem
                  key={a.id}
                  onClick={() => navigate(`/financeiro/movimentacoes?account=${a.id}`)}
                  actions={itemActions}
                  leading={
                    hasInst ? (
                      <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: a.color }}>
                        <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={32} />
                      </div>
                    ) : (
                      <div className="rounded-full p-2.5 shrink-0" style={{ backgroundColor: a.color }}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                    )
                  }
                  title={a.name}
                  subtitle={
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {ACCOUNT_TYPES.find(t => t.value === a.type)?.label || a.type}
                      </Badge>
                      {(a.institution_name || a.bank_name) && (
                        <span className="truncate">{a.institution_name || a.bank_name}</span>
                      )}
                    </div>
                  }
                  trailing={
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo</span>
                      <span className={cn('font-semibold text-sm whitespace-nowrap', balance >= 0 ? 'text-success' : 'text-destructive')}>
                        {formatBRL(balance)}
                      </span>
                    </div>
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {cashBankAccounts.map(a => {
              const Icon = getTypeIcon(a.type);
              const balance = balances[a.id] ?? a.initial_balance;
              const hasInst = !!(a.institution_name || a.bank_name);
              return (
                <Card key={a.id} className="relative group overflow-hidden">
                  <div className="h-1.5 w-full" style={{ backgroundColor: a.color }} />
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {hasInst ? (
                          <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: a.color }}>
                            <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={32} />
                          </div>
                        ) : (
                          <div className="rounded-full p-2.5 shrink-0" style={{ backgroundColor: a.color }}>
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{a.name}</p>
                          {(a.institution_name || a.bank_name) && (
                            <p className="text-xs text-muted-foreground truncate">{a.institution_name || a.bank_name}</p>
                          )}
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {ACCOUNT_TYPES.find(t => t.value === a.type)?.label || a.type}
                          </Badge>
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <RowActionsMenu
                          triggerClassName="h-7 w-7"
                          actions={[
                            { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => openEdit(a) },
                            { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setDeletingId(a.id) },
                          ]}
                        />
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground">Saldo atual</p>
                      <p className={`text-lg font-bold ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {formatBRL(balance)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3 gap-2 text-xs h-8"
                      onClick={() => navigate(`/financeiro/movimentacoes?account=${a.id}`)}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Ver movimentações
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Seção 2: Cartões de Crédito ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Cartões de Crédito</h3>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => openNew('cartao')}>
            <Plus className="h-4 w-4" /> Novo Cartão
          </Button>
        </div>

        {cardAccounts.length > 0 && (
          <Card className="bg-violet-600 border-0">
            <CardContent className="p-4 sm:p-5">
              <p className="text-xs font-medium text-white/80 uppercase tracking-wider">Total de Faturas Abertas</p>
              <p className="text-2xl font-bold text-white mt-1">{formatBRL(totalOpenBills)}</p>
            </CardContent>
          </Card>
        )}

        {cardAccounts.length === 0 && !isLoading ? (
          isMobile ? (
            <EmptyState
              icon={<CreditCard className="h-10 w-10" />}
              title="Nenhum cartão cadastrado"
              description='Toque em "Novo Cartão" no botão acima'
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">Nenhum cartão cadastrado</p>
              <p className="text-xs mt-1">Clique em "Novo Cartão" para cadastrar</p>
            </div>
          )
        ) : isMobile ? (
          <div className="rounded-xl border bg-card overflow-hidden">
            {cardAccounts.map((a) => {
              const billTotal = cardBillTotals[a.id] ?? 0;
              const availableLimit = a.credit_limit ? a.credit_limit - billTotal : null;
              const hasInst = !!(a.institution_name || a.bank_name);
              const itemActions: ItemAction[] = [
                {
                  key: 'bills',
                  label: 'Ver faturas',
                  icon: <Receipt className="h-4 w-4" />,
                  onClick: () => setSelectedCard(a),
                },
                {
                  key: 'recalc',
                  label: 'Recalcular faturas',
                  icon: <Calculator className="h-4 w-4" />,
                  onClick: () => setRecalcCard(a),
                },
                {
                  key: 'edit',
                  label: 'Editar',
                  icon: <Pencil className="h-4 w-4" />,
                  variant: 'edit' as const,
                  onClick: () => openEdit(a),
                },
                {
                  key: 'delete',
                  label: 'Excluir',
                  icon: <Trash2 className="h-4 w-4" />,
                  variant: 'destructive' as const,
                  onClick: () => setDeletingId(a.id),
                },
              ];
              return (
                <MobileListItem
                  key={a.id}
                  onClick={() => setSelectedCard(a)}
                  actions={itemActions}
                  leading={
                    hasInst ? (
                      <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: a.color }}>
                        <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={32} />
                      </div>
                    ) : (
                      <div className="rounded-full p-2.5 shrink-0" style={{ backgroundColor: a.color }}>
                        <CreditCard className="h-4 w-4 text-white" />
                      </div>
                    )
                  }
                  title={a.name}
                  subtitle={
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-violet-600 border-violet-300">
                        Cartão
                      </Badge>
                      {a.closing_day && <span>Fecha dia {a.closing_day}</span>}
                      {availableLimit !== null && (
                        <span className={cn(availableLimit >= 0 ? 'text-success' : 'text-destructive')}>
                          Disp.: {formatBRL(availableLimit)}
                        </span>
                      )}
                    </div>
                  }
                  trailing={
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Fatura</span>
                      <span className={cn('font-semibold text-sm whitespace-nowrap', billTotal > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                        {formatBRL(billTotal)}
                      </span>
                    </div>
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {cardAccounts.map(a => {
              const billTotal = cardBillTotals[a.id] ?? 0;
              const availableLimit = a.credit_limit ? a.credit_limit - billTotal : null;
              const hasInst = !!(a.institution_name || a.bank_name);

              return (
                <Card key={a.id} className="relative group overflow-hidden">
                  <div className="h-1.5 w-full" style={{ backgroundColor: a.color }} />
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {hasInst ? (
                          <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: a.color }}>
                            <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={32} />
                          </div>
                        ) : (
                          <div className="rounded-full p-2.5 shrink-0" style={{ backgroundColor: a.color }}>
                            <CreditCard className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{a.name}</p>
                          {(a.institution_name || a.bank_name) && (
                            <p className="text-xs text-muted-foreground truncate">{a.institution_name || a.bank_name}</p>
                          )}
                          <Badge variant="outline" className="text-[10px] mt-1 text-violet-600 border-violet-300">
                            Cartão de Crédito
                          </Badge>
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <RowActionsMenu
                          triggerClassName="h-7 w-7"
                          actions={[
                            { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => openEdit(a) },
                            { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setDeletingId(a.id) },
                          ]}
                        />
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Fatura aberta</p>
                        <p className={`text-lg font-bold ${billTotal > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {formatBRL(billTotal)}
                        </p>
                      </div>
                      {availableLimit !== null && (
                        <div>
                          <p className="text-xs text-muted-foreground">Limite disponível</p>
                          <p className={`text-sm font-medium ${availableLimit >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {formatBRL(availableLimit)}
                          </p>
                        </div>
                      )}
                      {a.closing_day && (
                        <p className="text-xs text-muted-foreground">Fecha dia {a.closing_day}</p>
                      )}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2 text-xs h-8"
                        onClick={() => setSelectedCard(a)}
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        Ver Faturas
                      </Button>
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => setRecalcCard(a)}
                              aria-label="Recalcular faturas"
                            >
                              <Calculator className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[220px] text-xs">
                            Recalcula a fatura correta de todas as despesas deste cartão. Útil após mudanças de configuração de fechamento/vencimento.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Account form modal */}
      <ResponsiveModal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? (editing.type === 'cartao' ? 'Editar Cartão' : 'Editar Conta') : (type === 'cartao' ? 'Novo Cartão' : 'Nova Conta')}
        className="sm:max-w-[480px]"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da Conta *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Nubank Crédito" required />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(type === 'banco' || type === 'cartao') && (
            <div className="space-y-1.5">
              <Label>Instituição</Label>
              <BankInstitutionCombobox value={institution} onChange={setInstitution} />
            </div>
          )}

          {type === 'cartao' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Dia de fechamento *</Label>
                  <Select value={String(closingDay)} onValueChange={v => setClosingDay(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLOSING_DAYS.map(d => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Dia de vencimento *</Label>
                  <Select value={String(dueDay)} onValueChange={v => setDueDay(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DUE_DAYS.map(d => <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {dueDay <= closingDay && (
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Vencimento no mês seguinte ao fechamento
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Limite de crédito (R$) <span className="text-muted-foreground font-normal">opcional</span></Label>
                <Input
                  placeholder="0,00"
                  value={creditLimitDisplay}
                  onChange={handleCreditLimitChange}
                  inputMode="numeric"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>Saldo Inicial (R$)</Label>
              <Input placeholder="0,00" value={balanceDisplay} onChange={handleCurrencyChange} inputMode="numeric" />
              {editing && (
                <p className="text-xs text-muted-foreground">⚠️ Editar o saldo inicial recalcula o saldo atual da conta.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex gap-1.5 flex-wrap items-center">
              {ACCOUNT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-all',
                    color === c ? 'border-foreground scale-110 ring-2 ring-foreground/20' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }} aria-label={`Cor ${c}`} />
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center text-muted-foreground hover:border-foreground hover:text-foreground transition-all"
                    aria-label="Cor personalizada"
                  >
                    +
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Cor personalizada</Label>
                    <input
                      type="color"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      className="h-10 w-full cursor-pointer rounded border"
                    />
                    <Input value={color} onChange={e => setColor(e.target.value)} className="h-8 text-xs" />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Pré-visualização */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pré-visualização</Label>
            <Card className="overflow-hidden">
              <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
              <CardContent className="p-3 flex items-center gap-3">
                {institution ? (
                  <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: color }}>
                    <BankLogo code={institution.code} name={institution.name} size={32} />
                  </div>
                ) : (
                  <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: color }}>
                    {(() => { const I = getTypeIcon(type); return <I className="h-4 w-4 text-white" />; })()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{name || 'Nome da conta'}</p>
                  {institution?.name && <p className="text-xs text-muted-foreground truncate">{institution.name}</p>}
                  {type === 'cartao' && closingDay && (
                    <p className="text-xs text-muted-foreground">
                      Fecha dia {closingDay} · Vence dia {dueDay}{dueDay <= closingDay ? ' (mês seguinte)' : ''}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={!name || createAccount.isPending || updateAccount.isPending}>
              {editing ? 'Salvar' : type === 'cartao' ? 'Criar Cartão' : 'Criar Conta'}
            </Button>
          </div>
        </form>
      </ResponsiveModal>

      <TransferFormDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={cashBankAccounts}
        onSubmit={async (d) => { await transfer.mutateAsync(d); }}
        isLoading={transfer.isPending}
      />

      {/* Modal "Gerenciar Categorias" — desktop grande (sm:max-w-4xl) pra
          caber o grid 2-col (receitas | despesas) do FinanceCategorias sem
          espremer. No mobile, o ResponsiveModal vira Drawer e a lista vertical
          do FinanceCategorias mobile (pills + FAB) já é otimizada pra isso. */}
      <ResponsiveModal
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        title="Categorias do Financeiro"
        className="sm:max-w-4xl"
      >
        <FinanceCategorias />
      </ResponsiveModal>

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Transações vinculadas perderão a referência à conta.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar recálculo de faturas */}
      <AlertDialog open={!!recalcCard} onOpenChange={(o) => { if (!o && !recalculateBills.isPending) setRecalcCard(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular faturas</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Isso vai recalcular a fatura de todas as despesas deste cartão{recalcCard ? ` "${recalcCard.name}"` : ''}.
              As suas despesas e valores não serão alterados, só a fatura em que cada uma aparece.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recalculateBills.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={recalculateBills.isPending}
              onClick={async (e) => {
                e.preventDefault();
                if (!recalcCard) return;
                try {
                  await recalculateBills.mutateAsync(recalcCard.id);
                } finally {
                  setRecalcCard(null);
                }
              }}
            >
              {recalculateBills.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Recalculando...
                </>
              ) : (
                'Recalcular'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
