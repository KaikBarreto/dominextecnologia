import { useState } from 'react';
import {
  Trash2, Download, FileText,
  Award, HandCoins, TrendingDown, AlertTriangle, Wallet, TrendingUp,
  Printer, ReceiptText,
} from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatDateTime } from '@/lib/format';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useDataPagination } from '@/hooks/useDataPagination';
import {
  BalanceSummary, formatMovementType, EmployeeMovement,
  signFor, colorClassFor, badgeClassFor, iconChipClassFor, iconNameFor,
} from '@/utils/employeeCalculations';
import {
  generateExtractHTMLWithHeader, generateReceiptHTML,
  type PaymentBreakdown, type ValeBreakdown,
} from '@/utils/receiptGenerator';
import {
  generateEmployeeThermalReceipt,
  type ThermalPaymentBreakdown, type ThermalValeData,
} from '@/utils/employeeReceiptThermalGenerator';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useAuth } from '@/contexts/AuthContext';

interface EmployeeExtractProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  employeeSalary: number;
  movements: EmployeeMovement[];
  balance: BalanceSummary;
  onDeleteMovement: (id: string) => void;
}

const ICONS = { Award, HandCoins, TrendingDown, AlertTriangle, Wallet, TrendingUp } as const;

function MovementIcon({ type }: { type: string }) {
  const Icon = ICONS[iconNameFor(type)];
  return <Icon className="h-4 w-4 text-white" />;
}

function openHTMLInNewTab(html: string) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) win.onload = () => URL.revokeObjectURL(url);
}

// Alvo do recibo (movimento + tipo). Quando preenchido abre o modal de formato.
type ReceiptTarget = { movement: EmployeeMovement; kind: 'pagamento' | 'vale' };

export function EmployeeExtract({ open, onOpenChange, employeeName, employeeSalary, movements, balance, onDeleteMovement }: EmployeeExtractProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const sorted = [...movements].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const pagination = useDataPagination(sorted, 10);
  const { settings: companySettings } = useCompanySettings();
  const { enabled: wlEnabled } = useWhiteLabel();
  const { accounts } = useFinancialAccounts();
  const { profile } = useAuth();
  const [receiptTarget, setReceiptTarget] = useState<ReceiptTarget | null>(null);

  const accountName = (accountId?: string | null) => {
    if (!accountId) return '';
    const acc = accounts?.find(a => a.id === accountId);
    return acc?.name || t.extract.fallbacks.bankAccount;
  };

  // O movimento de pagamento no banco NÃO carrega payment_details — eles vivem
  // no 'ajuste' (Reset para salário base) lançado logo em seguida. Procura esse
  // ajuste e monta o breakdown a partir dele (com fallback pro próprio movimento).
  const buildPaymentDetails = (movement: EmployeeMovement): Record<string, any> => {
    if (movement.payment_details && Object.keys(movement.payment_details).length > 0) {
      return movement.payment_details;
    }
    // Movimentos em ordem cronológica crescente.
    const chrono = [...movements].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const idx = chrono.findIndex(m => m.id === movement.id);
    for (let i = idx + 1; i < chrono.length; i++) {
      const m = chrono[i];
      if (m.type === 'ajuste' && m.payment_details && Object.keys(m.payment_details).length > 0) {
        return m.payment_details;
      }
      // só olha os movimentos imediatamente após o pagamento (ajuste/vale residual)
      if (m.type !== 'ajuste' && m.type !== 'vale') break;
    }
    return {};
  };

  const buildBreakdown = (movement: EmployeeMovement) => {
    const d = buildPaymentDetails(movement);
    const salary = Number(d.salary) || employeeSalary || 0;
    const totalBonus = Number(d.bonus) || 0;
    const totalFaltas = Number(d.faltas) || 0;
    const valesDescontados = Number(d.valeDiscount) || 0;
    const valesRestantes = Number(d.remainingVales) || 0;
    const totalVales = valesDescontados + valesRestantes;
    const valorPago = Number(d.amountPaid) || Math.abs(movement.amount);
    return { salary, totalBonus, totalFaltas, totalVales, valesDescontados, valesRestantes, valorPago };
  };

  const handleExport = () => {
    openHTMLInNewTab(generateExtractHTMLWithHeader(employeeName, movements, balance, companySettings, wlEnabled, locale));
  };

  const generateReceipt = (target: ReceiptTarget, outputFormat: 'a4' | 'thermal') => {
    const { movement, kind } = target;
    const responsibleName = profile?.full_name || undefined;
    const employee = { name: employeeName, position: undefined as string | undefined, cpf: undefined as string | undefined };

    if (kind === 'pagamento') {
      const b = buildBreakdown(movement);
      const method = accountName(movement.payment_method) || t.extract.fallbacks.bankAccount;
      if (outputFormat === 'a4') {
        const payment: PaymentBreakdown = { ...b, paymentMethod: method };
        openHTMLInNewTab(generateReceiptHTML({
          employeeName, kind: 'pagamento', salary: employeeSalary, movement,
          companySettings, whiteLabel: wlEnabled, generatedByName: responsibleName, payment, locale,
        }));
      } else {
        const payment: ThermalPaymentBreakdown = { ...b, paymentMethod: method, description: movement.description || undefined };
        void generateEmployeeThermalReceipt({
          company: companySettings, whiteLabel: wlEnabled, employee,
          responsibleName, kind: 'pagamento', payment, locale,
        });
      }
      return;
    }

    // kind === 'vale'
    const dateStr = formatDateTime(movement.created_at, locale, timezone);
    const method = accountName(movement.payment_method) || (movement.payment_method ? t.extract.fallbacks.bankAccount : t.extract.fallbacks.notProvided);
    if (outputFormat === 'a4') {
      const vale: ValeBreakdown = { amount: Math.abs(movement.amount), paymentMethod: method, date: dateStr, description: movement.description || undefined };
      openHTMLInNewTab(generateReceiptHTML({
        employeeName, kind: 'vale', salary: employeeSalary, movement,
        companySettings, whiteLabel: wlEnabled, generatedByName: responsibleName, vale, locale,
      }));
    } else {
      const vale: ThermalValeData = { amount: Math.abs(movement.amount), paymentMethod: method, date: dateStr, description: movement.description || undefined };
      void generateEmployeeThermalReceipt({
        company: companySettings, whiteLabel: wlEnabled, employee,
        responsibleName, kind: 'vale', vale, locale,
      });
    }
  };

  const renderCard = (m: EmployeeMovement) => {
    const isPayment = m.type === 'pagamento';
    const isVale = m.type === 'vale';
    const sign = signFor(m.type);
    const b = isPayment ? buildBreakdown(m) : null;

    return (
      <div key={m.id} className="rounded-lg border p-3 space-y-2">
        {/* Header: ícone + badge + data + excluir */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${iconChipClassFor(m.type)}`}>
              <MovementIcon type={m.type} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <Badge className={`w-fit text-[10px] ${badgeClassFor(m.type)}`}>{formatMovementType(m.type)}</Badge>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDateTime(m.created_at, locale, timezone)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className={`text-sm font-semibold ${colorClassFor(m.type)}`}>
                {sign}{fmt(Math.abs(m.amount))}
              </div>
              <div className="text-[10px] text-muted-foreground">{t.extract.movement.balanceAfter}: {fmt(m.balance_after)}</div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive group">
                  <Trash2 className="h-3.5 w-3.5 text-destructive group-hover:text-white transition-colors" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t.extract.deleteMovement.title}</AlertDialogTitle>
                  <AlertDialogDescription>{t.extract.deleteMovement.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t.extract.deleteMovement.cancel}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDeleteMovement(m.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t.extract.deleteMovement.confirm}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Descrição */}
        {m.description && <p className="text-xs text-muted-foreground pl-1">{m.description}</p>}

        {/* Forma de pagamento (não-pagamento) */}
        {!isPayment && m.payment_method && (
          <p className="text-xs text-muted-foreground pl-1">{t.extract.movement.viaAccount} {accountName(m.payment_method)}</p>
        )}

        {/* Breakdown do pagamento */}
        {isPayment && b && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.extract.movement.breakdown.baseSalary}</span>
              <span className="font-medium">{fmt(b.salary)}</span>
            </div>
            {b.totalBonus > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.extract.movement.breakdown.bonus}</span>
                <span className="font-medium text-green-600">+{fmt(b.totalBonus)}</span>
              </div>
            )}
            {b.totalFaltas > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.extract.movement.breakdown.absences}</span>
                <span className="font-medium text-orange-600">-{fmt(b.totalFaltas)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-muted-foreground">{t.extract.movement.breakdown.subtotal}</span>
              <span className="font-medium">{fmt(b.salary + b.totalBonus - b.totalFaltas)}</span>
            </div>
            {b.totalVales > 0 && (
              <>
                <div className="flex justify-between border-t pt-1.5">
                  <span className="text-muted-foreground">{t.extract.movement.breakdown.totalAdvances}</span>
                  <span className="font-medium text-destructive">{fmt(b.totalVales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.extract.movement.breakdown.discountedAdvances}</span>
                  <span className="font-medium text-destructive">-{fmt(b.valesDescontados)}</span>
                </div>
                {b.valesRestantes > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.extract.movement.breakdown.remainingAdvances}</span>
                    <span className="font-medium text-orange-600">{fmt(b.valesRestantes)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.extract.movement.breakdown.paymentMethod}</span>
              <span className="font-medium">{accountName(m.payment_method) || t.extract.movement.breakdown.paymentMethod}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 items-center">
              <span className="font-semibold">{t.extract.movement.breakdown.netAmount}</span>
              <span className="font-bold text-base text-green-600">{fmt(b.valorPago)}</span>
            </div>
          </div>
        )}

        {/* Botão de recibo (pagamento e vale) */}
        {(isPayment || isVale) && (
          <Button
            size="sm"
            className="w-full h-7 gap-1.5 text-xs bg-gradient-to-r from-slate-900 to-slate-700 hover:from-slate-800 hover:to-slate-600 text-white"
            onClick={() => setReceiptTarget({ movement: m, kind: isVale ? 'vale' : 'pagamento' })}
          >
            <FileText className="h-3.5 w-3.5" />
            {t.extract.movement.receiptButton}
          </Button>
        )}
      </div>
    );
  };

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`${t.extract.modalTitlePrefix} ${employeeName}`} className="sm:max-w-[900px]">
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
              <Download className="h-4 w-4" />
              {t.extract.exportButton}
            </Button>
          </div>

          {/* Cards de resumo — saturados, texto branco */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg bg-green-600 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-white" />
                <span className="text-xs text-white/80">{t.extract.summary.bonus}</span>
              </div>
              <p className="text-base font-semibold text-white">{fmt(balance.totalBonus)}</p>
            </div>
            <div className="rounded-lg bg-red-600 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-white" />
                <span className="text-xs text-white/80">{t.extract.summary.advances}</span>
              </div>
              <p className="text-base font-semibold text-white">{fmt(balance.totalVales)}</p>
            </div>
            <div className="rounded-lg bg-orange-500 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-white" />
                <span className="text-xs text-white/80">{t.extract.summary.absences}</span>
              </div>
              <p className="text-base font-semibold text-white">{fmt(balance.totalFaltas)}</p>
            </div>
            <div className={`rounded-lg p-3 ${balance.currentBalance >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>
              <div className="mb-1 flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-white" />
                <span className="text-xs text-white/80">{t.extract.summary.balance}</span>
              </div>
              <p className="text-base font-bold text-white">{fmt(balance.currentBalance)}</p>
            </div>
          </div>

          {/* Lista de movimentos em cards */}
          <div className="space-y-2">
            {pagination.paginatedItems.length === 0 ? (
              <div className="rounded-lg border py-8 text-center text-muted-foreground">{t.empty.noMovements}</div>
            ) : (
              pagination.paginatedItems.map(renderCard)
            )}
          </div>

          {movements.length > 0 && (
            <DataTablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              from={pagination.from}
              to={pagination.to}
              pageSize={pagination.pageSize}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          )}
        </div>
      </ResponsiveModal>

      {/* Modal de escolha de formato do recibo */}
      <ResponsiveModal
        open={!!receiptTarget}
        onOpenChange={(o) => !o && setReceiptTarget(null)}
        title={receiptTarget?.kind === 'vale' ? t.extract.receiptFormat.titleAdvance : t.extract.receiptFormat.titlePayment}
        className="sm:max-w-[420px]"
      >
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">{t.extract.receiptFormat.prompt}</p>
          <Button
            variant="outline"
            className="w-full h-auto justify-start gap-3 py-3"
            onClick={() => { if (receiptTarget) generateReceipt(receiptTarget, 'a4'); setReceiptTarget(null); }}
          >
            <Printer className="h-5 w-5 shrink-0" />
            <span className="flex flex-col items-start">
              <span className="font-medium">{t.extract.receiptFormat.a4Label}</span>
              <span className="text-xs text-muted-foreground">{t.extract.receiptFormat.a4Description}</span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="w-full h-auto justify-start gap-3 py-3"
            onClick={() => { if (receiptTarget) generateReceipt(receiptTarget, 'thermal'); setReceiptTarget(null); }}
          >
            <ReceiptText className="h-5 w-5 shrink-0" />
            <span className="flex flex-col items-start">
              <span className="font-medium">{t.extract.receiptFormat.thermalLabel}</span>
              <span className="text-xs text-muted-foreground">{t.extract.receiptFormat.thermalDescription}</span>
            </span>
          </Button>
        </div>
      </ResponsiveModal>
    </>
  );
}
