import { useState, useMemo, useEffect } from 'react';
import { Loader2, Wallet, CreditCard } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { BalanceSummary } from '@/utils/employeeCalculations';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { calculatePayrollDeductions, type PayrollResult } from '@/utils/payrollDeductions';
import { calculateEmployeeCost, defaultCostInput } from '@/utils/employeeCostProvisions';
import type { HoleriteSnapshot } from '@/utils/holeriteHtmlGenerator';

export interface PaymentPayload {
  valeDiscount: number;
  accountId: string;
  description?: string;
  // NOVOS (aditivos — não quebra callers existentes):
  mode: 'informal' | 'clt';
  holeriteSnapshot?: HoleriteSnapshot; // preenchido só no CLT
  amount: number; // valor efetivamente pago (toPay informal | liquido CLT) — source of truth
}

interface EmployeePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  salary: number;
  balance: BalanceSummary;
  onSubmit: (payload: PaymentPayload) => void;
  isPending?: boolean;
  /**
   * Quando preenchido, o pagamento quita uma `financial_transactions` de folha
   * já existente (caminho via Contas a Pagar). Quando ausente, gera nova
   * transação (caminho via tela de Funcionários).
   */
  financialTransactionId?: string;
  payrollPeriodLabel?: string;
  // NOVOS (CLT) — todos OPCIONAIS, caller atualizado na próxima task:
  employeeRegime?: 'informal' | 'clt';
  dependentsCount?: number;
  vtEnabled?: boolean;
  vtMonthlyValue?: number;
  paymentDate?: string; // ISO; default hoje. Competência sai daqui.
}

export function EmployeePaymentModal({
  open,
  onOpenChange,
  employeeName,
  salary,
  balance,
  onSubmit,
  isPending,
  financialTransactionId,
  payrollPeriodLabel,
  employeeRegime,
  dependentsCount,
  vtEnabled,
  vtMonthlyValue,
  paymentDate,
}: EmployeePaymentModalProps) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const { accounts, balances } = useFinancialAccounts();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.paymentModal;
  const activeAccounts = useMemo(() => {
    const active = accounts.filter(a => a.is_active);
    // Sort: "Conta Principal" or "Caixa" first, then by sort_order
    return active.sort((a, b) => {
      const priority = (acc: typeof a) => {
        if (acc.name.toLowerCase().includes('principal')) return 0;
        if (acc.name.toLowerCase() === 'caixa') return 1;
        return 2;
      };
      const diff = priority(a) - priority(b);
      if (diff !== 0) return diff;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [accounts]);

  const [valeDiscountStr, setValeDiscountStr] = useState('');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [payMode, setPayMode] = useState<'informal' | 'clt'>('informal');

  // Modo default = regime do funcionário, resetado sempre que o modal abre.
  useEffect(() => {
    if (open) setPayMode(employeeRegime ?? 'informal');
  }, [open, employeeRegime]);

  // Competência = mês/ano da DATA DO PAGAMENTO (nunca new Date() na geração).
  const { competencia, competenceYear } = useMemo(() => {
    const payDate = paymentDate ? new Date(paymentDate) : new Date();
    return {
      competencia: `${String(payDate.getMonth() + 1).padStart(2, '0')}/${payDate.getFullYear()}`,
      competenceYear: payDate.getFullYear(),
    };
  }, [paymentDate]);

  // Find default account (Conta Principal first, then first active)
  const defaultAccountId = useMemo(() => {
    const principal = activeAccounts.find(a => a.name.toLowerCase().includes('principal'));
    return principal?.id || (activeAccounts.length > 0 ? activeAccounts[0].id : '');
  }, [activeAccounts]);

  // Auto-select default account when accounts load or modal opens
  useEffect(() => {
    if (open && defaultAccountId && !accountId) {
      setAccountId(defaultAccountId);
    }
  }, [open, defaultAccountId]);

  // Reset state when modal opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setValeDiscountStr(balance.totalVales > 0 ? currencyMask(String(Math.round(balance.totalVales * 100))) : '');
      setAccountId(defaultAccountId);
      setDescription('');
    }
    onOpenChange(o);
  };

  const valeDiscount = useMemo(() => {
    if (!valeDiscountStr) return balance.totalVales;
    const parsed = parseCurrency(valeDiscountStr);
    return Math.min(parsed, balance.totalVales);
  }, [valeDiscountStr, balance.totalVales]);

  // --- Cálculo INFORMAL (comportamento atual, byte-a-byte) ---
  const subtotal = salary + balance.totalBonus - balance.totalVales - balance.totalFaltas;
  const toPay = subtotal + (balance.totalVales - valeDiscount);
  const remainingVales = balance.totalVales - valeDiscount;

  // --- Cálculo CLT (delegado aos motores puros) ---
  const grossBase = salary + balance.totalBonus;
  const ded: PayrollResult = useMemo(
    () => calculatePayrollDeductions({
      grossBase,
      salary,
      dependentsCount: dependentsCount ?? 0,
      vtEnabled: vtEnabled ?? false,
      vtMonthlyValue: vtMonthlyValue ?? 0,
      competenceYear,
    }),
    [grossBase, salary, dependentsCount, vtEnabled, vtMonthlyValue, competenceYear],
  );

  // Base FGTS e valor FGTS (informativo) via motor de custo. ATENÇÃO: aqui só
  // consumimos `baseEncargos` e `fgts` — ambos INDEPENDEM do regime tributário
  // (FGTS é 8% da base para qualquer regime). Por isso o `regime: 'simples'`
  // fixo do defaultCostInput é irrelevante. Se um dia ler outro campo de `custo`
  // (ex.: inssPatronal), revisar o regime passado aqui.
  const custo = useMemo(
    () => calculateEmployeeCost({ ...defaultCostInput, baseSalary: salary }),
    [salary],
  );
  const baseFGTS = custo.baseEncargos;
  const fgtsMes = custo.fgts;

  // Líquido CLT = bruto − descontos legais − faltas − vales, arredondado.
  const cltLiquido = useMemo(
    () => Math.round((grossBase - ded.totalDescontosLegais - balance.totalFaltas - valeDiscount) * 100) / 100,
    [grossBase, ded.totalDescontosLegais, balance.totalFaltas, valeDiscount],
  );

  // Valor efetivamente pago (source of truth único).
  const amountToPay = payMode === 'clt' ? cltLiquido : toPay;
  const negativo = amountToPay < 0;
  const canSubmit = !negativo && amountToPay > 0 && !!accountId && !isPending;

  const handleConfirm = () => {
    if (negativo) return; // guard também no submit, não só no disabled
    const snapshot: HoleriteSnapshot | undefined = payMode === 'clt' ? {
      mode: 'clt',
      competencia,
      proventos: { salary, adicional: 0, bonus: balance.totalBonus },
      descontos: { inss: ded.inss, irrf: ded.irrf, vt: ded.vt, faltas: balance.totalFaltas, vales: valeDiscount },
      bases: { inss: ded.baseINSS, irrf: ded.baseIRRF, fgts: baseFGTS, fgtsValor: fgtsMes },
      liquido: cltLiquido,
    } : undefined;
    onSubmit({
      valeDiscount,
      accountId,
      description: description || undefined,
      mode: payMode,
      holeriteSnapshot: snapshot,
      amount: amountToPay, // MESMO número que será gravado
    });
  };

  const footer = (
    <div className="flex flex-col items-end gap-2">
      {negativo && (
        <p className="text-xs text-destructive font-medium text-right">
          {/* TODO i18n: employees.paymentModal.negativeNet */}
          Descontos maiores que os proventos, líquido negativo. Ajuste os vales ou faltas antes de pagar.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t.cancelLabel}</Button>
        <Button onClick={handleConfirm} disabled={!canSubmit}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t.confirmLabel}
        </Button>
      </div>
    </div>
  );

  const isClt = payMode === 'clt';

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={`${t.titlePrefix} ${employeeName}`}
      footer={footer}
      className="sm:max-w-4xl"
    >
      <div className="p-1">
        {financialTransactionId && (
          <div className="mb-4 rounded-lg border-2 border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            {t.payrollPendingPrefix}{payrollPeriodLabel ? `${t.payrollPendingPeriodInfix} ${payrollPeriodLabel}` : ''}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          {/* ===================== FORM (esquerda) ===================== */}
          <div className="space-y-4">
            {/* Seletor de modo Informal x CLT */}
            <div className="space-y-1">
              {/* TODO i18n: employees.paymentModal.modeLabel */}
              <Label className="text-xs">Tipo de pagamento</Label>
              <div className="flex rounded-md border overflow-hidden text-sm">
                {(['informal', 'clt'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`flex-1 px-3 py-1.5 transition-colors ${
                      payMode === m
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                    onClick={() => setPayMode(m)}
                  >
                    {/* TODO i18n: employees.paymentModal.modeInformal / modeClt */}
                    {m === 'informal' ? 'Normal / Informal' : 'CLT'}
                  </button>
                ))}
              </div>
            </div>

            {/* Vale Discount */}
            {balance.totalVales > 0 && (
              <div className="space-y-2">
                <Label>{t.advanceDiscount.label}</Label>
                <Input
                  value={valeDiscountStr}
                  onChange={e => setValeDiscountStr(currencyMask(e.target.value))}
                  placeholder={fmt(balance.totalVales)}
                />
                <p className="text-xs text-muted-foreground">
                  {t.advanceDiscount.info.replace('{total}', fmt(balance.totalVales))}
                  {remainingVales > 0 && (
                    <span className="text-amber-600 font-medium"> • {t.advanceDiscount.remaining.replace('{value}', fmt(remainingVales))}</span>
                  )}
                </p>
              </div>
            )}

            {/* Account Selection */}
            {activeAccounts.length > 0 && (
              <div className="space-y-2">
                <Label>{t.accountSelection.label}</Label>
                <RadioGroup value={accountId} onValueChange={setAccountId} className="space-y-2">
                  {activeAccounts.map(acc => {
                    const accBalance = balances[acc.id] ?? acc.initial_balance;
                    return (
                      <label
                        key={acc.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          accountId === acc.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                      >
                        <RadioGroupItem value={acc.id} />
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: acc.color + '20', color: acc.color }}
                        >
                          {acc.type === 'caixa' ? <Wallet className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{acc.name}</p>
                          {acc.bank_name && <p className="text-xs text-muted-foreground truncate">{acc.bank_name}</p>}
                        </div>
                        <span className={`text-sm font-medium ${accBalance >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {fmt(accBalance)}
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label>{t.notes.label}</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t.notes.placeholder}
                rows={2}
              />
            </div>
          </div>

          {/* ===================== RESUMO (direita / aside) ===================== */}
          <aside className="space-y-3 md:border-l md:pl-4">
            {isClt ? (
              <>
                {/* PROVENTOS */}
                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  {/* TODO i18n: employees.paymentModal.cltSummary.proventos */}
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proventos</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.summary.salary}</span>
                    <span className="font-medium">{fmt(salary)}</span>
                  </div>
                  {balance.totalBonus > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>{t.summary.totalBonus}</span>
                      <span>{fmt(balance.totalBonus)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between font-medium">
                    {/* TODO i18n: employees.paymentModal.cltSummary.totalProventos */}
                    <span>Total de proventos</span>
                    <span>{fmt(grossBase)}</span>
                  </div>
                </div>

                {/* DESCONTOS */}
                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  {/* TODO i18n: employees.paymentModal.cltSummary.descontos */}
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descontos</p>
                  <div className="flex justify-between text-destructive">
                    <span>INSS</span>
                    <span>{fmt(ded.inss)}</span>
                  </div>
                  <div className="flex justify-between text-destructive">
                    <span>IRRF</span>
                    <span>{fmt(ded.irrf)}</span>
                  </div>
                  {ded.vt > 0 && (
                    <div className="flex justify-between text-destructive">
                      {/* TODO i18n: employees.paymentModal.cltSummary.vt */}
                      <span>Vale-transporte</span>
                      <span>{fmt(ded.vt)}</span>
                    </div>
                  )}
                  {balance.totalFaltas > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>{t.summary.absences}</span>
                      <span>{fmt(balance.totalFaltas)}</span>
                    </div>
                  )}
                  {valeDiscount > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>{t.summary.advances}</span>
                      <span>{fmt(valeDiscount)}</span>
                    </div>
                  )}
                </div>

                {/* LÍQUIDO (destaque) */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
                  {/* TODO i18n: employees.paymentModal.cltSummary.liquido */}
                  <p className="text-sm text-muted-foreground mb-1">Líquido a pagar</p>
                  <p className={`text-2xl font-bold ${cltLiquido >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {fmt(cltLiquido)}
                  </p>
                </div>

                {/* BASES (informativo) */}
                <div className="rounded-lg border p-4 space-y-1.5 text-xs text-muted-foreground">
                  {/* TODO i18n: employees.paymentModal.cltSummary.bases */}
                  <p className="font-semibold uppercase tracking-wide">Bases de cálculo</p>
                  <div className="flex justify-between">
                    <span>Base INSS</span>
                    <span>{fmt(ded.baseINSS)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base IRRF</span>
                    <span>{fmt(ded.baseIRRF)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base FGTS</span>
                    <span>{fmt(baseFGTS)}</span>
                  </div>
                  <div className="flex justify-between">
                    {/* TODO i18n: employees.paymentModal.cltSummary.fgtsMes */}
                    <span>FGTS do mês (recolhido)</span>
                    <span>{fmt(fgtsMes)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Resumo INFORMAL (mantém o atual) */}
                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.summary.salary}</span>
                    <span className="font-medium">{fmt(salary)}</span>
                  </div>
                  {balance.totalBonus > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>{t.summary.totalBonus}</span>
                      <span>{fmt(balance.totalBonus)}</span>
                    </div>
                  )}
                  {(balance.totalVales > 0 || balance.totalFaltas > 0) && (
                    <>
                      <div className="flex justify-between text-destructive font-medium">
                        <span>{t.summary.discounts}</span>
                        <span>{fmt(balance.totalVales + balance.totalFaltas)}</span>
                      </div>
                      {balance.totalVales > 0 && (
                        <div className="flex justify-between text-muted-foreground pl-4">
                          <span>{t.summary.advances}</span>
                          <span>{fmt(balance.totalVales)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-muted-foreground pl-4">
                        <span>{t.summary.absences}</span>
                        <span>{fmt(balance.totalFaltas)}</span>
                      </div>
                    </>
                  )}
                  <div className="border-t pt-2 flex justify-between font-medium">
                    <span>{t.summary.subtotal}</span>
                    <span>{fmt(subtotal)}</span>
                  </div>
                </div>

                {/* Amount to Pay */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">{t.amountToPay.label}</p>
                  <p className={`text-2xl font-bold ${toPay >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {fmt(toPay)}
                  </p>
                  {valeDiscount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t.amountToPay.formulaLabel.replace('{subtotal}', fmt(subtotal)).replace('{discount}', fmt(valeDiscount))}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Disclaimer */}
            <p className="text-[11px] leading-snug text-muted-foreground">
              {/* TODO i18n: employees.paymentModal.disclaimer */}
              Valores calculados com base nas tabelas vigentes de INSS, IRRF e FGTS. São estimativas, confirme com o seu contador antes de fechar a folha.
            </p>
          </aside>
        </div>
      </div>
    </ResponsiveModal>
  );
}
