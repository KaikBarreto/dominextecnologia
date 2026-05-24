// Linha sintética "fatura de cartão" usada em Contas a Pagar pra agrupar despesas
// de cartão no lugar de listar uma por uma. Click abre detalhe; botão "Pagar Fatura"
// abre modal de pagamento (bloqueado até o fechamento).
//
// Visual destacado a pedido do CEO: ícone grande, badge contando despesas, border
// colorido. Diferencia da linha "despesa comum" pra dar a sensação de agregação.
// v1.9.15.

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CreditCard, CheckCircle2, AlertCircle, Clock, Receipt, Lock } from 'lucide-react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/utils/currency';
import { BankLogo } from '@/components/financial/BankInstitutionCombobox';
import { useCreditCardBills, type CreditCardBillWithTransactions } from '@/hooks/useCreditCardBills';
import type { FinancialAccount } from '@/hooks/useFinancialAccounts';

const BILL_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  open: { label: 'Aberta', color: 'text-blue-600', icon: Clock },
  closed: { label: 'Fechada', color: 'text-orange-600', icon: AlertCircle },
  partial: { label: 'Parcial', color: 'text-yellow-600', icon: AlertCircle },
  paid: { label: 'Paga', color: 'text-green-600', icon: CheckCircle2 },
};

function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

function formatMonth(dateStr: string) {
  return format(parseLocalDate(dateStr), 'MMMM yyyy', { locale: ptBR });
}

interface Props {
  invoice: CreditCardBillWithTransactions;
  account: FinancialAccount;
  cashBankAccounts: FinancialAccount[];
  isMobile: boolean;
}

export function CreditCardInvoiceRow({ invoice, account, cashBankAccounts, isMobile }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payAmount, setPayAmount] = useState(0);
  const [payNotes, setPayNotes] = useState('');

  // Carrega o hook pra ter acesso ao payBill — escopo da conta deste card.
  const { payBill } = useCreditCardBills(account.id);

  const today = startOfDay(new Date());
  const closingDate = parseLocalDate(invoice.closing_date);
  // Após o fechamento (inclusive o próprio dia) pode pagar. Antes não.
  const canPay = !isBefore(today, closingDate);
  const billTotal = invoice.total_amount ?? 0;
  const alreadyPaid = Number(invoice.amount_paid ?? 0);
  const remaining = billTotal - alreadyPaid;
  const txnCount = invoice.transactions?.length ?? 0;
  const statusCfg = BILL_STATUS_CONFIG[invoice.status] ?? BILL_STATUS_CONFIG.open;
  const StatusIcon = statusCfg.icon;
  const isPaid = invoice.status === 'paid';

  const openPay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPayAmount(remaining);
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayAccountId(cashBankAccounts[0]?.id ?? '');
    setPayNotes('');
    setPayOpen(true);
  };

  const handlePayAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setPayAmount(parseInt(raw || '0', 10) / 100);
  };

  const handleConfirmPay = async () => {
    if (!payAccountId || payAmount <= 0) return;
    await payBill.mutateAsync({
      bill: invoice,
      paymentAccountId: payAccountId,
      paymentDate: payDate,
      amountToPay: payAmount,
      notes: payNotes || undefined,
    });
    setPayOpen(false);
    setDetailOpen(false);
  };

  const afterPayment = remaining - payAmount;
  const isFullPayment = afterPayment <= 0.01;

  // Botão "Pagar Fatura" com lock antes do fechamento. Mostra tooltip.
  const PayButton = () => {
    if (isPaid) return null;
    const buttonNode = (
      <Button
        size="sm"
        variant={canPay ? 'default' : 'outline'}
        className={cn('gap-1.5 text-xs h-8', !canPay && 'opacity-60')}
        onClick={openPay}
        disabled={!canPay}
      >
        {canPay ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        Pagar Fatura
      </Button>
    );
    if (canPay) return buttonNode;
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Wrapper span é necessário porque o Button está disabled. */}
            <span>{buttonNode}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-xs">
            Pagamento liberado após o fechamento em {format(closingDate, 'dd/MM/yyyy')}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <>
      {isMobile ? (
        // Mobile: MobileListItem com leading destacado (círculo violeta + ícone cartão)
        // e borda esquerda colorida pela cor da conta.
        <div className="border-l-4" style={{ borderLeftColor: account.color }}>
          <MobileListItem
            onClick={() => setDetailOpen(true)}
            leading={
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
            }
            title={
              <div className="flex items-center gap-1.5">
                <span className="capitalize truncate">Fatura {formatMonth(invoice.reference_month)}</span>
              </div>
            }
            subtitle={
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="truncate">{account.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {txnCount} {txnCount === 1 ? 'despesa' : 'despesas'}
                  </Badge>
                </div>
                <span className="text-[11px]">
                  Vence {format(parseLocalDate(invoice.due_date), 'dd/MM')} · Fecha {format(closingDate, 'dd/MM')}
                </span>
              </div>
            }
            trailing={
              <div className="flex flex-col items-end gap-1">
                <span className={cn('font-semibold text-sm whitespace-nowrap', isPaid ? 'text-muted-foreground' : 'text-destructive')}>
                  {formatBRL(billTotal)}
                </span>
                <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 gap-1', statusCfg.color)}>
                  <StatusIcon className="h-2.5 w-2.5" />
                  {statusCfg.label}
                </Badge>
              </div>
            }
          />
        </div>
      ) : (
        // Desktop: card destacado com borda colorida, ícone grande, info inline.
        <div
          className={cn(
            'flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40 transition-colors border-l-4',
            'border-b last:border-b-0'
          )}
          style={{ borderLeftColor: account.color }}
          onClick={() => setDetailOpen(true)}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 shrink-0">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium capitalize text-sm">
                Fatura {formatMonth(invoice.reference_month)} — {account.name}
              </p>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {txnCount} {txnCount === 1 ? 'despesa' : 'despesas'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Vence {format(parseLocalDate(invoice.due_date), 'dd/MM/yyyy')} · Fecha {format(closingDate, 'dd/MM/yyyy')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={cn('font-semibold whitespace-nowrap', isPaid ? 'text-muted-foreground' : 'text-destructive')}>
              {formatBRL(billTotal)}
            </span>
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 gap-1', statusCfg.color)}>
              <StatusIcon className="h-2.5 w-2.5" />
              {statusCfg.label}
            </Badge>
          </div>
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <PayButton />
          </div>
        </div>
      )}

      {/* Modal: detalhes da fatura — lista de despesas + botão Pagar */}
      <ResponsiveModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={`Fatura ${formatMonth(invoice.reference_month).replace(/^./, (c) => c.toUpperCase())}`}
        className="sm:max-w-[480px]"
      >
        <div className="space-y-4">
          {/* Header do cartão */}
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            {(account.institution_name || account.bank_name) ? (
              <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: account.color }}>
                <BankLogo code={account.institution_code} name={account.institution_name || account.bank_name} size={28} />
              </div>
            ) : (
              <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: account.color }}>
                <CreditCard className="h-4 w-4 text-white" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{account.name}</p>
              <p className="text-xs text-muted-foreground">
                Fecha {format(closingDate, 'dd/MM/yyyy')} · Vence {format(parseLocalDate(invoice.due_date), 'dd/MM/yyyy')}
              </p>
            </div>
            <Badge variant="outline" className={cn('text-[10px] gap-1', statusCfg.color)}>
              <StatusIcon className="h-3 w-3" />
              {statusCfg.label}
            </Badge>
          </div>

          {/* Resumo financeiro */}
          <div className="border rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between">
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

          {/* Lista de despesas */}
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Despesas ({txnCount})
            </p>
            {txnCount === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center border rounded-lg">
                Sem despesas nesta fatura
              </p>
            ) : (
              <div className="rounded-lg border bg-card overflow-hidden max-h-[40vh] overflow-y-auto">
                {(invoice.transactions ?? []).map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 p-3 border-b last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{t.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseLocalDate(t.transaction_date), 'dd/MM/yyyy')}
                        {t.category && ` · ${t.category}`}
                      </p>
                    </div>
                    <span className="font-medium text-destructive text-sm whitespace-nowrap">
                      {formatBRL(Number(t.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isPaid && (
            canPay ? (
              <Button className="w-full gap-2" onClick={() => openPay()}>
                <CheckCircle2 className="h-4 w-4" />
                Pagar fatura
              </Button>
            ) : (
              <div className="rounded-lg border border-muted bg-muted/30 p-3 flex items-start gap-2 text-xs text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Pagamento liberado após o fechamento em <strong>{format(closingDate, 'dd/MM/yyyy')}</strong>.
                </span>
              </div>
            )
          )}
        </div>
      </ResponsiveModal>

      {/* Modal: pagar fatura — clone simplificado do PayBillDialog de FinanceBanks */}
      <ResponsiveModal
        open={payOpen}
        onOpenChange={setPayOpen}
        title="Pagar Fatura"
        className="sm:max-w-[440px]"
      >
        <div className="space-y-4">
          <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1">
            <p className="font-semibold capitalize mb-2">
              Fatura {formatMonth(invoice.reference_month)} — {account.name}
            </p>
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
                {cashBankAccounts.map((a) => (
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
            {cashBankAccounts.length === 0 && (
              <p className="text-xs text-destructive">Cadastre um caixa ou conta primeiro.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Data do pagamento *</Label>
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
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
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="Opcional"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleConfirmPay}
              disabled={!payAccountId || payAmount <= 0 || payBill.isPending}
            >
              {payBill.isPending ? 'Registrando...' : 'Confirmar Pagamento'}
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}
