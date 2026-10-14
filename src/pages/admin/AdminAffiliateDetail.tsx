import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowLeft, Pencil, Link2, Wallet, Users, Receipt, HandCoins,
  Calendar, CheckCircle, FileDown, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { AffiliateFormDialog } from '@/components/admin/affiliate/AffiliateFormDialog';
import { AffiliateAccessCard } from '@/components/admin/affiliate/AffiliateAccessCard';
import {
  useAffiliate,
  useAffiliateCommissions,
  useAffiliatePortfolio,
  useAffiliateClientHistory,
  useAffiliatePayments,
  usePayAffiliateMonth,
  usePayAffiliateBalance,
  sumPendingBalance,
  commissionKindLabel,
  recurringDurationLabel,
  type AffiliateCommission,
  type AffiliatePortfolioCompany,
  type AffiliateWithMetrics,
} from '@/hooks/useAffiliateData';
import { generateAffiliateCommissionMonthPdf } from '@/utils/affiliateCommissionPdfGenerator';

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

const fmtPct = (v: number | null | undefined) =>
  `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/**
 * Data BR sem off-by-one: datas de calendário puras (YYYY-MM-DD, ou o
 * carimbo meia-noite UTC que a RPC grava pra pagamento manual) são lidas
 * direto da string, nunca convertidas de fuso (recuaria 1 dia em BRT).
 * Mesma convenção de `CompanyPaymentsTab.tsx`.
 */
function formatDateBR(value: string | null | undefined): string {
  if (!value) return '—';
  const isDateOnly =
    /^\d{4}-\d{2}-\d{2}$/.test(value) || /T00:00:00(\.0+)?(\+00(:00)?|Z)$/.test(value);
  if (isDateOnly) {
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Rótulo do tipo cru de `company_payments.type` — mesmo mapa de `CompanyPaymentsTab`. */
function paymentTypeLabel(raw: string | null | undefined): string {
  switch (raw) {
    case 'primeira_venda':
      return 'Venda';
    case 'renewal':
    case 'renovacao':
      return 'Renovação';
    default:
      return 'Pagamento';
  }
}

/** Sufixo do ciclo de cobrança pro valor da assinatura ("/ano" vs "/mês"). */
function billingCycleSuffix(cycle: string | null | undefined): string {
  const v = (cycle || '').toLowerCase();
  return v === 'yearly' || v === 'anual' || v === 'annual' ? '/ano' : '/mês';
}

/**
 * Badge saturado de status de assinatura. As classes são as MESMAS de
 * `CompanyTable.tsx` (linhas ~125-127) de propósito: a mesma empresa não pode
 * aparecer "Desativado" em vermelho na tela de Empresas e em cinza aqui.
 * Mudou a cor de um status lá, muda aqui.
 *
 * Só os 4 valores que `companies.subscription_status` realmente assume
 * (`active`, `testing`, `pending_payment`, `inactive` — levantados do SQL e das
 * edges). Status inventado não entra: virava código morto que ninguém sabe se
 * ainda vale.
 */
const SUBSCRIPTION_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-green-500 hover:bg-green-600 text-white' },
  testing: { label: 'Testando', className: 'bg-orange-500 hover:bg-orange-600 text-white' },
  pending_payment: { label: 'Pagamento Pendente', className: 'bg-amber-500 hover:bg-amber-600 text-white' },
  inactive: { label: 'Desativado', className: 'bg-red-500 hover:bg-red-600 text-white' },
};

function subscriptionStatusBadge(status: string | null | undefined) {
  if (!status) return <Badge variant="muted">{'—'}</Badge>;
  // Valor novo que apareça no banco antes de passar por aqui: mostra o texto cru
  // em badge saturado neutro, em vez de sumir com a informação.
  const v = SUBSCRIPTION_STATUS_BADGE[status] ?? {
    label: status,
    className: 'bg-slate-500 hover:bg-slate-600 text-white',
  };
  return <Badge className={v.className}>{v.label}</Badge>;
}

function commissionStatusBadge(status: AffiliateCommission['status']) {
  if (status === 'paid') return <Badge variant="success">Pago</Badge>;
  if (status === 'voided') return <Badge variant="destructive">Estornado</Badge>;
  return <Badge variant="warning">Pendente</Badge>;
}

// ---- Fechamento mensal: helpers à prova de fuso -------------------------------

/** 'YYYY-MM-DD' (ou prefixo) -> Date LOCAL no dia 1. Nunca `new Date(string)` direto. */
function refMonthToLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function monthGroupKey(d: Date): string {
  return format(d, 'yyyy-MM');
}

function monthYearLabel(d: Date): string {
  return format(d, 'MMMM/yyyy', { locale: ptBR });
}

interface MonthData {
  month: Date;
  groupKey: string;
  monthCommissions: AffiliateCommission[];
  /** String crua 'YYYY-MM-01' de uma comissão deste mês — é o que vai pra RPC
   *  (nunca reconstruída via `new Date`, pra bater exatamente com o que o
   *  banco já gravou). */
  rawReferenceMonth: string | null;
  total: number;
  count: number;
  isPaid: boolean;
}

function getMonthData(
  month: Date,
  commissions: AffiliateCommission[],
  payments: { reference_month: string | null }[],
): MonthData {
  const groupKey = monthGroupKey(month);
  const monthCommissions = commissions.filter(
    (c) => c.reference_month && monthGroupKey(refMonthToLocalDate(c.reference_month)) === groupKey,
  );
  const pending = monthCommissions.filter((c) => c.status === 'pending');
  const total = pending.reduce((acc, c) => acc + (Number(c.commission_amount) || 0), 0);
  const isPaid = payments.some(
    (p) => p.reference_month && monthGroupKey(refMonthToLocalDate(p.reference_month)) === groupKey,
  );
  return {
    month,
    groupKey,
    monthCommissions,
    rawReferenceMonth: monthCommissions[0]?.reference_month ?? null,
    total,
    count: pending.length,
    isPaid,
  };
}

// ---- Carteira de clientes --------------------------------------------------

function PortfolioCard({
  company,
  affiliateId,
  onOpenHistory,
}: {
  company: AffiliatePortfolioCompany;
  affiliateId: string;
  onOpenHistory: (company: AffiliatePortfolioCompany) => void;
}) {
  // Dominex não tem `company_payments.voided` (estorno é DELETE da linha) —
  // o histórico já vem ordenado por data desc, então o "último pagamento" é
  // simplesmente o primeiro item.
  const { data: history = [] } = useAffiliateClientHistory(affiliateId, company.id);
  const lastPayment = history[0] ?? null;

  return (
    <Card className="flex flex-col">
      <CardContent className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <p className="font-medium truncate">{company.name || '—'}</p>
            <p className="text-xs text-muted-foreground truncate">{company.subscription_plan || '—'}</p>
          </div>
          {subscriptionStatusBadge(company.subscription_status)}
        </div>

        <div className="flex items-baseline gap-1 min-w-0">
          <span className="text-2xl font-bold text-emerald-600 truncate">
            {brl(company.subscription_value ?? 0)}
          </span>
          <span className="text-sm text-muted-foreground shrink-0">
            {billingCycleSuffix(company.billing_cycle)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs text-muted-foreground">Último pagamento</p>
            {lastPayment ? (
              <p className="font-medium truncate">
                {formatDateBR(lastPayment.payment_date)}
                <span className="block text-emerald-600">{brl(lastPayment.amount ?? 0)}</span>
              </p>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs text-muted-foreground">Próximo vencimento</p>
            <p className="font-medium truncate">{formatDateBR(company.subscription_expires_at)}</p>
          </div>
        </div>

        <Button variant="outline" size="sm" className="mt-auto gap-2" onClick={() => onOpenHistory(company)}>
          <History className="h-4 w-4" />
          Ver pagamentos e comissões
        </Button>
      </CardContent>
    </Card>
  );
}

function PortfolioTableRow({
  company,
  affiliateId,
  onOpenHistory,
}: {
  company: AffiliatePortfolioCompany;
  affiliateId: string;
  onOpenHistory: (company: AffiliatePortfolioCompany) => void;
}) {
  const { data: history = [] } = useAffiliateClientHistory(affiliateId, company.id);
  const lastPayment = history[0] ?? null;

  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => onOpenHistory(company)}>
      <TableCell className="font-medium">{company.name || '—'}</TableCell>
      <TableCell className="text-muted-foreground">{company.subscription_plan || '—'}</TableCell>
      <TableCell>{subscriptionStatusBadge(company.subscription_status)}</TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <span className="font-medium text-emerald-600">{brl(company.subscription_value ?? 0)}</span>{' '}
        <span className="text-xs text-muted-foreground">{billingCycleSuffix(company.billing_cycle)}</span>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {lastPayment ? (
          <>
            <span className="block">{formatDateBR(lastPayment.payment_date)}</span>
            <span className="block text-emerald-600">{brl(lastPayment.amount ?? 0)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {formatDateBR(company.subscription_expires_at)}
      </TableCell>
    </TableRow>
  );
}

function PortfolioTable({
  portfolio,
  affiliateId,
  onOpenHistory,
}: {
  portfolio: AffiliatePortfolioCompany[];
  affiliateId: string;
  onOpenHistory: (company: AffiliatePortfolioCompany) => void;
}) {
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">Último pagamento</TableHead>
            <TableHead className="text-right">Próximo vencimento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {portfolio.map((c) => (
            <PortfolioTableRow key={c.id} company={c} affiliateId={affiliateId} onOpenHistory={onOpenHistory} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ClientHistoryDialog({
  affiliateId,
  company,
  isMobile,
  onOpenChange,
}: {
  affiliateId: string;
  company: AffiliatePortfolioCompany | null;
  isMobile: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: history = [], isLoading } = useAffiliateClientHistory(affiliateId, company?.id);

  return (
    <ResponsiveModal
      open={!!company}
      onOpenChange={onOpenChange}
      title={company?.name || 'Histórico do cliente'}
      description="Pagamentos do cliente e a comissão gerada em cada um."
      className="sm:max-w-3xl"
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando histórico...</p>
      ) : history.length === 0 ? (
        <EmptyState icon={<Receipt className="h-12 w-12" />} title="Nenhum pagamento registrado ainda" size="compact" />
      ) : (
        <div className="space-y-3">
          {isMobile ? (
            <div className="space-y-3">
              {history.map((p) => (
                <div key={p.id} className="rounded-lg border p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium shrink-0">{formatDateBR(p.payment_date)}</span>
                      <Badge variant="info" className="text-xs shrink-0">{paymentTypeLabel(p.type)}</Badge>
                    </div>
                    <span className="font-semibold shrink-0">{brl(p.amount ?? 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground gap-2">
                    <span className="truncate">{p.payment_method || '—'}</span>
                    <span className="text-right shrink-0">
                      Comissão:{' '}
                      {p.commission_amount != null ? (
                        <span className="font-medium text-emerald-600">
                          {brl(p.commission_amount)} ({fmtPct(p.commission_pct)})
                        </span>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor pago</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{formatDateBR(p.payment_date)}</TableCell>
                      <TableCell>
                        <Badge variant="info">{paymentTypeLabel(p.type)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{brl(p.amount ?? 0)}</TableCell>
                      <TableCell>{p.payment_method || '—'}</TableCell>
                      <TableCell className="text-right">
                        {p.commission_amount != null ? (
                          <span className="font-semibold text-emerald-600">
                            {brl(p.commission_amount)}{' '}
                            <span className="text-xs text-muted-foreground">({fmtPct(p.commission_pct)})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            — na coluna Comissão = pagamento que não gerou comissão pra este afiliado (anterior ao
            vínculo com a empresa, ou a cota de recorrência já esgotou).
          </p>
        </div>
      )}
    </ResponsiveModal>
  );
}

function PortfolioSection({ affiliateId, isMobile }: { affiliateId: string; isMobile: boolean }) {
  const { data: portfolio = [], isLoading } = useAffiliatePortfolio(affiliateId);
  const [historyCompany, setHistoryCompany] = useState<AffiliatePortfolioCompany | null>(null);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando carteira...</p>;
  }

  if (portfolio.length === 0) {
    return <EmptyState icon={<Users className="h-12 w-12" />} title="Nenhum cliente na carteira ainda" />;
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {portfolio.length} {portfolio.length === 1 ? 'cliente' : 'clientes'}
      </p>

      {isMobile ? (
        <div className="grid grid-cols-1 gap-4">
          {portfolio.map((c) => (
            <PortfolioCard key={c.id} company={c} affiliateId={affiliateId} onOpenHistory={setHistoryCompany} />
          ))}
        </div>
      ) : (
        <PortfolioTable portfolio={portfolio} affiliateId={affiliateId} onOpenHistory={setHistoryCompany} />
      )}

      <ClientHistoryDialog
        affiliateId={affiliateId}
        company={historyCompany}
        isMobile={isMobile}
        onOpenChange={(open) => {
          if (!open) setHistoryCompany(null);
        }}
      />
    </>
  );
}

// ---- Pagamento (fechamento mensal) ------------------------------------------

function MonthClosingCard({
  data,
  variant,
  onPay,
  onExport,
  isPaying,
  readOnly,
}: {
  data: MonthData;
  variant: 'previous' | 'current';
  onPay: () => void;
  onExport: () => void;
  isPaying: boolean;
  readOnly: boolean;
}) {
  const nextMonthLabel = monthYearLabel(subMonths(data.month, -1));

  return (
    <Card className={data.isPaid ? 'border-emerald-500' : variant === 'current' ? 'border-amber-500' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 capitalize min-w-0">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="truncate">{monthYearLabel(data.month)}</span>
            {variant === 'current' && (
              <span className="text-xs font-normal text-muted-foreground normal-case shrink-0">(atual)</span>
            )}
          </div>
          {data.isPaid && <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground min-w-0 truncate">
            {variant === 'current' ? 'Acumulado' : 'Comissões pendentes'} ({data.count})
          </span>
          <span className="text-2xl font-bold text-emerald-600 shrink-0">{brl(data.total)}</span>
        </div>

        {variant === 'current' && !data.isPaid && (
          <Badge variant="warning" className="text-xs font-normal capitalize">
            acumula, paga em {nextMonthLabel}
          </Badge>
        )}
        {data.isPaid && <Badge variant="success">Pago</Badge>}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          {!readOnly && !data.isPaid && (
            <Button
              className="flex-1"
              variant={variant === 'current' ? 'outline' : 'default'}
              onClick={onPay}
              disabled={data.total <= 0 || isPaying}
            >
              {isPaying ? 'Pagando...' : variant === 'current' ? 'Pagar Antecipado' : 'Marcar como Pago'}
            </Button>
          )}
          <Button variant="outline" className="flex-1 gap-2" onClick={onExport}>
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyClosingSection({
  affiliateId,
  affiliateName,
  readOnly,
}: {
  affiliateId: string;
  affiliateName: string;
  readOnly: boolean;
}) {
  const { data: commissions = [] } = useAffiliateCommissions(affiliateId);
  const { data: payments = [] } = useAffiliatePayments(affiliateId);
  const payMonth = usePayAffiliateMonth();

  const now = new Date();
  const previousMonth = subMonths(now, 1);

  const previousData = useMemo(
    () => getMonthData(previousMonth, commissions, payments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commissions, payments],
  );
  const currentData = useMemo(
    () => getMonthData(now, commissions, payments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commissions, payments],
  );

  const [confirmData, setConfirmData] = useState<MonthData | null>(null);
  const [method, setMethod] = useState<'pix' | 'dinheiro'>('pix');

  const currentYear = now.getFullYear();
  const [selMonth, setSelMonth] = useState<string>(String(previousMonth.getMonth()));
  const [selYear, setSelYear] = useState<string>(String(previousMonth.getFullYear()));

  const exportMonth = (data: MonthData, forPay: boolean) => {
    const rows = data.monthCommissions.filter((c) => c.status !== 'voided');
    const total = rows.reduce((acc, c) => acc + (Number(c.commission_amount) || 0), 0);
    const payLabel = forPay ? `a pagar em ${monthYearLabel(subMonths(data.month, -1))}` : undefined;
    generateAffiliateCommissionMonthPdf({
      affiliateName,
      referenceMonth: data.month,
      commissions: rows.map((c) => ({
        kind: c.kind,
        company_name: c.company_name,
        base_amount: Number(c.base_amount) || 0,
        pct_applied: Number(c.pct_applied) || 0,
        commission_amount: Number(c.commission_amount) || 0,
        status: c.status,
      })),
      total,
      payMonthLabel: payLabel,
    });
  };

  const handleConfirmPay = async () => {
    if (!confirmData) return;
    const referenceMonth = confirmData.rawReferenceMonth ?? format(confirmData.month, 'yyyy-MM-01');
    try {
      await payMonth.mutateAsync({ affiliateId, referenceMonth, paymentMethod: method });
      setConfirmData(null);
    } catch {
      // toast de erro já disparado pelo onError do hook
    }
  };

  const handleExportSelected = () => {
    const selected = getMonthData(new Date(Number(selYear), Number(selMonth), 1), commissions, payments);
    if (selected.monthCommissions.filter((c) => c.status !== 'voided').length === 0) {
      toast.error('Nenhuma comissão nesse mês');
      return;
    }
    exportMonth(selected, false);
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i),
    label: format(new Date(2000, i, 1), 'MMMM', { locale: ptBR }),
  }));
  const yearOptions = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <MonthClosingCard
          data={previousData}
          variant="previous"
          readOnly={readOnly}
          isPaying={payMonth.isPending}
          onPay={() => {
            if (previousData.total <= 0) {
              toast.error('Não há valor a pagar nesse mês');
              return;
            }
            setMethod('pix');
            setConfirmData(previousData);
          }}
          onExport={() => exportMonth(previousData, true)}
        />
        <MonthClosingCard
          data={currentData}
          variant="current"
          readOnly={readOnly}
          isPaying={payMonth.isPending}
          onPay={() => {
            if (currentData.total <= 0) {
              toast.error('Não há valor a pagar nesse mês');
              return;
            }
            setMethod('pix');
            setConfirmData(currentData);
          }}
          onExport={() => exportMonth(currentData, false)}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileDown className="h-4 w-4" />
            Exportar fechamento de outro mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1 flex-1">
              <Label htmlFor="closing-month">Mês</Label>
              <Select value={selMonth} onValueChange={setSelMonth}>
                <SelectTrigger id="closing-month" className="capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value} className="capitalize">
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1">
              <Label htmlFor="closing-year">Ano</Label>
              <Select value={selYear} onValueChange={setSelYear}>
                <SelectTrigger id="closing-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="gap-2" onClick={handleExportSelected}>
              <FileDown className="h-4 w-4" />
              Exportar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmData} onOpenChange={(o) => { if (!o) setConfirmData(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar pagamento do mês</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmData && (
                <>
                  Pagar as comissões pendentes de{' '}
                  <span className="font-medium capitalize">{monthYearLabel(confirmData.month)}</span>{' '}
                  para {affiliateName}? Total:{' '}
                  <span className="font-semibold text-emerald-600">{brl(confirmData.total)}</span>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="month-pay-method">Forma de pagamento *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as 'pix' | 'dinheiro')}>
              <SelectTrigger id="month-pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={payMonth.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmPay();
              }}
              disabled={payMonth.isPending}
            >
              {payMonth.isPending ? 'Pagando...' : 'Confirmar pagamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Extrato de comissões ----------------------------------------------------

function CommissionsSection({ affiliateId, isMobile }: { affiliateId: string; isMobile: boolean }) {
  const { data: allCommissions = [], isLoading } = useAffiliateCommissions(affiliateId);

  // Estornado não aparece no extrato (preferência já registrada no projeto
  // pro extrato de comissão) — não afeta somas: `sumPendingBalance` já filtra
  // por `status='pending'`.
  const commissions = useMemo(() => allCommissions.filter((c) => c.status !== 'voided'), [allCommissions]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando extrato...</p>;
  }

  if (commissions.length === 0) {
    return <EmptyState icon={<Receipt className="h-12 w-12" />} title="Nenhuma comissão registrada" />;
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {commissions.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="font-medium truncate">{c.company_name || '—'}</span>
                {commissionStatusBadge(c.status)}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="info">{commissionKindLabel(c.kind)}</Badge>
                <span>{formatDateBR(c.reference_month)}</span>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-muted-foreground min-w-0 truncate">
                  Base {brl(c.base_amount)} · {fmtPct(c.pct_applied)}
                </span>
                <span className="font-semibold text-emerald-600 shrink-0">{brl(c.commission_amount)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="text-right">Base</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="text-right">Comissão</TableHead>
            <TableHead>Mês</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {commissions.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Badge variant="info">{commissionKindLabel(c.kind)}</Badge>
              </TableCell>
              <TableCell className="font-medium">{c.company_name || '—'}</TableCell>
              <TableCell className="text-right">{brl(c.base_amount)}</TableCell>
              <TableCell className="text-right">{fmtPct(c.pct_applied)}</TableCell>
              <TableCell className="text-right font-semibold text-emerald-600">{brl(c.commission_amount)}</TableCell>
              <TableCell>{formatDateBR(c.reference_month)}</TableCell>
              <TableCell>{commissionStatusBadge(c.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Repasses -----------------------------------------------------------------

function PaymentsSection({ affiliateId, isMobile }: { affiliateId: string; isMobile: boolean }) {
  const { data: payments = [], isLoading } = useAffiliatePayments(affiliateId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando repasses...</p>;
  }

  if (payments.length === 0) {
    return <EmptyState icon={<HandCoins className="h-12 w-12" />} title="Nenhum repasse realizado ainda" />;
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {payments.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{formatDateBR(p.paid_at)}</span>
                <span className="font-semibold text-emerald-600">{brl(p.total_amount)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {p.payment_method && <Badge variant="info">{p.payment_method}</Badge>}
                {p.reference_month && <span>{formatDateBR(p.reference_month)}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Mês referência</TableHead>
            <TableHead>Método</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{formatDateBR(p.paid_at)}</TableCell>
              <TableCell>{p.reference_month ? formatDateBR(p.reference_month) : '—'}</TableCell>
              <TableCell>{p.payment_method ? <Badge variant="info">{p.payment_method}</Badge> : '—'}</TableCell>
              <TableCell className="text-right font-semibold text-emerald-600">{brl(p.total_amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Pagar saldo ---------------------------------------------------------------

function PayBalanceDialog({
  open,
  onOpenChange,
  affiliateId,
  pendingBalance,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  affiliateId: string;
  pendingBalance: number;
}) {
  const [method, setMethod] = useState<'pix' | 'dinheiro'>('pix');
  const payBalance = usePayAffiliateBalance();

  const handlePay = async () => {
    try {
      await payBalance.mutateAsync({ affiliateId, paymentMethod: method });
      onOpenChange(false);
    } catch {
      // toast de erro já disparado pelo onError do hook
    }
  };

  const footer = (
    <div className="flex gap-2 pt-2">
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={() => onOpenChange(false)}
        disabled={payBalance.isPending}
      >
        Cancelar
      </Button>
      <Button type="button" className="flex-1" onClick={handlePay} disabled={payBalance.isPending}>
        {payBalance.isPending ? 'Pagando...' : `Pagar ${brl(pendingBalance)}`}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Pagar saldo do afiliado"
      description="Todas as comissões pendentes serão marcadas como pagas."
      footer={footer}
    >
      <div className="space-y-4">
        <div className="rounded-lg border p-4 text-center">
          <p className="text-sm text-muted-foreground">Total a pagar</p>
          <p className="text-3xl font-bold text-emerald-600">{brl(pendingBalance)}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pay-method">Forma de pagamento *</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as 'pix' | 'dinheiro')}>
            <SelectTrigger id="pay-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="dinheiro">Dinheiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </ResponsiveModal>
  );
}

// ---- Página ---------------------------------------------------------------

export default function AdminAffiliateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isAffiliateOnly, linkedAffiliateId, isLoading: permsLoading } = useAdminPermissions();

  const [activeTab, setActiveTab] = useState('portfolio');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);

  // O :id da rota pode ser SLUG ou UUID — `useAffiliate` resolve os dois.
  const { data: affiliate, isLoading: affLoading } = useAffiliate(id);
  const effectiveId = affiliate?.id ?? null;

  const isReadOnly = isAffiliateOnly;

  // Afiliado-only só pode ver a PRÓPRIA ficha. Comparamos o UUID RESOLVIDO
  // (nunca o `id` cru da rota, que pode ser slug de QUALQUER afiliado) contra
  // `linkedAffiliateId`. Espelha o guard do AdminSalespersonDetail — defesa em
  // profundidade; a RLS de self-scope já restringe os DADOS, isto é só UX.
  useEffect(() => {
    if (permsLoading || affLoading) return;
    if (isAffiliateOnly && linkedAffiliateId && (!affiliate || affiliate.id !== linkedAffiliateId)) {
      navigate(`/admin/afiliados/${linkedAffiliateId}`, { replace: true });
    }
  }, [permsLoading, affLoading, isAffiliateOnly, linkedAffiliateId, affiliate, navigate]);

  const { data: commissions = [] } = useAffiliateCommissions(effectiveId ?? undefined);
  const { data: portfolio = [] } = useAffiliatePortfolio(effectiveId ?? undefined);
  const pendingBalance = useMemo(() => sumPendingBalance(commissions), [commissions]);

  const handleCopyLink = async () => {
    if (!effectiveId || !affiliate) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    // Slug quando existe (`?afiliado=paulo-silva`), id como fallback. O slug é
    // ESTÁVEL no banco: renomear o afiliado não invalida link já distribuído.
    const afiliadoParam = affiliate.slug?.trim() || effectiveId;
    // `origem=Afiliado` literal é seguro AQUI de propósito, e não vale puxar o
    // catálogo de origens só pra montar este link: quem decide a origem gravada
    // é o servidor. A edge `self-register` resolve o nome canônico por
    // `utm_key='affiliate'` e SOBRESCREVE a origem quando o affiliate_id bate
    // (ver supabase/functions/_shared/affiliate-resolver.ts). Mesmo que o CEO
    // renomeie a origem no painel, o link antigo continua atribuindo certo.
    const url = `${origin}/cadastro?origem=Afiliado&afiliado=${afiliadoParam}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  if (permsLoading || affLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!affiliate || !effectiveId) {
    return (
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Afiliado não encontrado.</p>
          {!isReadOnly && (
            <Button variant="outline" onClick={() => navigate('/admin/afiliados')} className="mt-4">
              Voltar
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Afiliado-only cujo :id ainda não bate com o próprio: o useEffect acima já
  // disparou o redirect — evita desenhar a ficha de outro afiliado por 1 frame.
  if (isAffiliateOnly && linkedAffiliateId && effectiveId !== linkedAffiliateId) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Shape esperado pelo AffiliateFormDialog (AffiliateWithMetrics).
  const editingAffiliate: AffiliateWithMetrics = {
    ...affiliate,
    client_count: portfolio.length,
    pending_balance: pendingBalance,
  };

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-6 min-w-0 w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {!isReadOnly && (
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/afiliados')} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground truncate">
                {affiliate.name}
              </h1>
              <Badge variant={affiliate.is_active ? 'success' : 'muted'}>
                {affiliate.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              1ª venda: {fmtPct(affiliate.first_payment_pct)} · Recorrente: {fmtPct(affiliate.recurring_pct)} ·{' '}
              {recurringDurationLabel(affiliate.recurring_months)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size={isMobile ? 'sm' : 'default'}
            onClick={handleCopyLink}
            className="gap-2"
          >
            <Link2 className="h-4 w-4" />
            Gerar link de afiliado
          </Button>
          {!isReadOnly && (
            <Button
              variant="outline"
              size={isMobile ? 'sm' : 'default'}
              onClick={() => setIsEditOpen(true)}
              className="gap-2"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Saldo a receber
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-3xl font-bold text-emerald-600 truncate">{brl(pendingBalance)}</span>
            {!isReadOnly && (
              <Button onClick={() => setIsPayOpen(true)} disabled={pendingBalance <= 0} className="w-full sm:w-auto">
                Pagar saldo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Acesso do afiliado (login próprio). O card se esconde sozinho quando
          `readOnly` — o próprio afiliado não administra o próprio acesso. */}
      <AffiliateAccessCard affiliate={affiliate} readOnly={isReadOnly} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {isMobile ? (
          <MobilePillTabs
            variant="underline"
            tabs={[
              { value: 'portfolio', label: 'Carteira' },
              { value: 'closing', label: 'Pagamento' },
              { value: 'commissions', label: 'Extrato' },
              { value: 'payments', label: 'Repasses' },
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        ) : (
          <TabsList variant="underline" className="grid w-full max-w-[640px] grid-cols-4">
            <TabsTrigger variant="underline" value="portfolio">Carteira de clientes</TabsTrigger>
            <TabsTrigger variant="underline" value="closing">Pagamento</TabsTrigger>
            <TabsTrigger variant="underline" value="commissions">Extrato de comissões</TabsTrigger>
            <TabsTrigger variant="underline" value="payments">Repasses</TabsTrigger>
          </TabsList>
        )}

        <TabsContent value="portfolio" className="space-y-4 mt-0">
          <PortfolioSection affiliateId={effectiveId} isMobile={isMobile} />
        </TabsContent>

        <TabsContent value="closing" className="space-y-4 mt-0">
          <MonthlyClosingSection affiliateId={effectiveId} affiliateName={affiliate.name} readOnly={isReadOnly} />
        </TabsContent>

        <TabsContent value="commissions" className="space-y-4 mt-0">
          <CommissionsSection affiliateId={effectiveId} isMobile={isMobile} />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4 mt-0">
          <PaymentsSection affiliateId={effectiveId} isMobile={isMobile} />
        </TabsContent>
      </Tabs>

      {!isReadOnly && (
        <AffiliateFormDialog open={isEditOpen} onOpenChange={setIsEditOpen} editingAffiliate={editingAffiliate} />
      )}

      {!isReadOnly && (
        <PayBalanceDialog
          open={isPayOpen}
          onOpenChange={setIsPayOpen}
          affiliateId={effectiveId}
          pendingBalance={pendingBalance}
        />
      )}
    </div>
  );
}
