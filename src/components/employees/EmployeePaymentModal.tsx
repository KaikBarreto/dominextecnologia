import { useState, useMemo, useEffect, useRef } from 'react';
import { Loader2, Wallet, CreditCard } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { BalanceSummary } from '@/utils/employeeCalculations';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { currencyMask, parseCurrency } from '@/utils/employeeCalculations';
import { centsFromPastedAmount } from '@/lib/money-paste-mask';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { calculatePayrollDeductions, type PayrollResult } from '@/utils/payrollDeductions';
import type { HoleriteSnapshot } from '@/utils/holeriteHtmlGenerator';
import { CostCenterSelect } from '@/components/financial/CostCenterSelect';
import { useCostCenters } from '@/hooks/useCostCenters';
import { CategorySelectField } from '@/components/financial/CategorySelectField';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { formatMoney } from '@/lib/format';
import { hasPayrollTables } from '@/utils/payrollTables';
import {
  PayrollAdjustmentsEditor,
  type PayrollAdjustmentDraft,
} from '@/components/employees/PayrollAdjustmentsEditor';
import { clampAdvanceDiscount } from '@/utils/payrollPayment';

export interface PaymentPayload {
  valeDiscount: number;
  accountId: string;
  description?: string;
  // NOVOS (aditivos — não quebra callers existentes):
  mode: 'informal' | 'clt' | 'pj';
  holeriteSnapshot?: HoleriteSnapshot; // preenchido só no CLT
  amount: number; // valor efetivamente pago (toPay informal | liquido CLT | valor combinado PJ) — source of truth
  /** Centro de custo (obra/projeto/setor) escolhido na hora do pagamento. Sempre opcional. */
  costCenterId?: string | null;
  /** Nº da nota fiscal (opcional, só no modo PJ). */
  invoiceNumber?: string;
  /**
   * Categoria financeira do lançamento — só preenchido no modo PJ (CLT/informal
   * continuam gravando `'Funcionários'` direto no caller, sem passar por aqui).
   * SEMPRE o `name` de uma linha real de `financial_categories` da empresa —
   * nunca um literal inventado (ver `resolveDefaultPjCategoryName` abaixo).
   */
  category?: string;
}

/**
 * Nome de SEMENTE da categoria de sistema "mão de obra avulsa" (CSP, saída,
 * grupo `cmv`) — criada pelo gatilho de empresa nova
 * (`supabase/migrations/20260919190000_dedup_categorias_financeiras_e_trava.sql`).
 * É aditivo-only aqui: NÃO está mapeada em `SYSTEM_CATEGORY_ROLES`
 * (`finance-system-categories.ts`) porque o trio (is_system+saida+cmv) SOZINHO
 * é ambíguo com "CSP - Materiais" — por isso a resolução abaixo também exige
 * bater o NOME, em vez de usar o motor de papel único daquele arquivo.
 */
const PJ_LABOR_CATEGORY_SEED_NAME = 'CSP - Mão de Obra Avulsa';

const EMPTY_PAYROLL_RESULT: PayrollResult = {
  inss: 0, irrf: 0, vt: 0, baseINSS: 0, baseIRRF: 0,
  inssEffectiveRate: 0, inssMarginalRate: 0, irrfBeforeReduction: 0,
  irrfReduction: 0, irrfDeductionType: 'legal', irrfDeductionAmount: 0,
  totalDescontosLegais: 0,
};

const normalizeCategoryName = (value: string | null | undefined): string =>
  (value ?? '').trim().toLocaleLowerCase('pt-BR');

/**
 * Resolve a categoria-padrão do pagamento PJ/MEI PELA LINHA (is_system + saída
 * + dre_group='cmv' + nome ainda igual à semente), nunca por nome cru solto —
 * `financial_transactions.category` é cópia de texto, não FK, então gravar um
 * nome que não existe em `financial_categories` cria lançamento órfão (sem
 * cor/ícone, fora do DRE). Empresa que RENOMEOU essa categoria ou nunca teve
 * (empresa muito antiga) devolve `''`: o campo nasce vazio e o
 * `CategorySelectField` cobre com seu próprio `fallbackNames` quando a lista
 * estiver inteiramente vazia; nos outros casos o usuário escolhe na hora.
 */
function resolveDefaultPjCategoryName(categories: { name: string; type: string; dre_group?: string | null; is_system?: boolean | null; is_active?: boolean | null }[]): string {
  const seed = normalizeCategoryName(PJ_LABOR_CATEGORY_SEED_NAME);
  const match = categories.find(
    (c) =>
      c.is_system === true &&
      c.is_active !== false &&
      c.type === 'saida' &&
      normalizeCategoryName(c.dre_group) === 'cmv' &&
      normalizeCategoryName(c.name) === seed,
  );
  return match?.name ?? '';
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
  employeeRegime?: 'informal' | 'clt' | 'pj';
  dependentsCount?: number;
  vtEnabled?: boolean;
  vtMonthlyValue?: number;
  paymentDate?: string; // ISO; default hoje. Competência sai daqui.
  /**
   * Contrato PJ vigente (quando o funcionário é PJ/MEI). Só usado pra
   * pré-preencher o valor combinado quando `billing_type === 'monthly'` —
   * cobrança por OS/hora/diária varia a cada pagamento, não dá pra adivinhar.
   */
  pjActiveContract?: { amount: number; billing_type: 'monthly' | 'per_order' | 'hourly' | 'daily' } | null;
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
  pjActiveContract,
}: EmployeePaymentModalProps) {
  const { accounts, balances } = useFinancialAccounts();
  const { locale, currency } = useAppLocaleContext();
  const fmt = (value: number) => formatMoney(value, currency, locale);
  const maskCurrency = (value: string) => currencyMask(value, currency, locale);
  const t = MESSAGES[locale].app.employees.paymentModal;
  const fin = MESSAGES[locale].app.finance;
  const { activeCostCenters } = useCostCenters();
  const { categories: financialCategories } = useFinancialCategories();
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
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [extraEarnings, setExtraEarnings] = useState<PayrollAdjustmentDraft[]>([]);
  const [extraDeductions, setExtraDeductions] = useState<PayrollAdjustmentDraft[]>([]);
  const [inssOverrideEnabled, setInssOverrideEnabled] = useState(false);
  const [inssOverrideStr, setInssOverrideStr] = useState('');
  const [inssOverrideReason, setInssOverrideReason] = useState('');
  const [payMode, setPayMode] = useState<'informal' | 'clt' | 'pj'>('informal');
  const [pjAmountStr, setPjAmountStr] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [pjCategoryName, setPjCategoryName] = useState('');
  // `true` só quando o usuário ESCOLHEU a categoria à mão nesta sessão do
  // modal — protege a escolha manual de ser sobrescrita pelo efeito de
  // resolução automática (abaixo) quando as categorias chegam depois.
  const pjCategoryTouchedRef = useRef(false);

  // Modo default = regime do funcionário, resetado sempre que o modal abre.
  // PJ/MEI é travado em 'pj' — não faz sentido pagar prestador em modo
  // informal/CLT (folha/encargos não existem pra esse regime).
  useEffect(() => {
    if (open) {
      setPayMode(employeeRegime ?? 'informal');
      setExtraEarnings([]);
      setExtraDeductions([]);
      setInssOverrideEnabled(false);
      setInssOverrideStr('');
      setInssOverrideReason('');
    }
  }, [open, employeeRegime]);

  // Valor combinado PJ: pré-preenchido pelo contrato vigente quando a
  // cobrança é mensal (por OS/hora/diária varia a cada pagamento). Reseta a
  // cada entrada no modo PJ (abrir o modal ou trocar pra PJ) — a categoria
  // em si é resolvida no efeito seguinte, que também cobre carregamento
  // assíncrono.
  useEffect(() => {
    if (open && payMode === 'pj') {
      const prefill = pjActiveContract?.billing_type === 'monthly' ? pjActiveContract.amount : 0;
      setPjAmountStr(prefill > 0 ? maskCurrency(String(Math.round(prefill * 100))) : '');
      setInvoiceNumber('');
      pjCategoryTouchedRef.current = false;
      setPjCategoryName('');
    }
  }, [open, payMode]);

  // Categoria default: "CSP - Mão de Obra Avulsa" resolvida pela LINHA (não
  // pelo nome cru), pra sobreviver a rename e nunca mandar pro banco um nome
  // que não existe em `financial_categories` da empresa. Depende de
  // `financialCategories` DE PROPÓSITO: na primeira abertura do modal depois
  // de carregar a página, a lista ainda está vazia (`[]`, react-query em
  // voo) — sem essa dependência o campo nascia vazio pra sempre (achado em
  // QA). Roda de novo quando a lista chega, mas só enquanto o usuário não
  // tiver tocado no campo (`pjCategoryTouchedRef`), pra nunca substituir uma
  // escolha manual.
  useEffect(() => {
    if (open && payMode === 'pj' && !pjCategoryTouchedRef.current) {
      const resolved = resolveDefaultPjCategoryName(financialCategories);
      if (resolved) setPjCategoryName(resolved);
    }
  }, [open, payMode, financialCategories]);

  // Competência = mês/ano da DATA DO PAGAMENTO (nunca new Date() na geração).
  const { competencia, competenceYear, competenceMonth } = useMemo(() => {
    const payDate = paymentDate ? new Date(paymentDate) : new Date();
    return {
      competencia: `${String(payDate.getMonth() + 1).padStart(2, '0')}/${payDate.getFullYear()}`,
      competenceYear: payDate.getFullYear(),
      competenceMonth: payDate.getMonth() + 1,
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
      setValeDiscountStr(balance.totalVales > 0 ? maskCurrency(String(Math.round(balance.totalVales * 100))) : '');
      setAccountId(defaultAccountId);
      setCostCenterId(null);
      setDescription('');
    }
    onOpenChange(o);
  };

  // Colar um valor pronto (ex. "4.550" de planilha) NÃO pode passar pela
  // regra de centavos comum: daria R$ 45,50 (100x menor). Ver
  // `money-paste-mask.ts`. `currencyMask(String(cents))` reaproveita a
  // MESMA formatação que a digitação já usa.
  const handleValeDiscountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    const cents = centsFromPastedAmount(text);
    if (cents == null) return;
    e.preventDefault();
    setValeDiscountStr(maskCurrency(String(cents)));
  };

  const valeDiscount = useMemo(() => {
    if (!valeDiscountStr) return balance.totalVales;
    const parsed = parseCurrency(valeDiscountStr);
    return clampAdvanceDiscount(parsed, balance.totalVales);
  }, [valeDiscountStr, balance.totalVales]);

  // --- Cálculo INFORMAL (comportamento atual, byte-a-byte) ---
  const subtotal = salary + balance.totalBonus - balance.totalVales - balance.totalFaltas;
  const toPay = subtotal + (balance.totalVales - valeDiscount);
  const remainingVales = balance.totalVales - valeDiscount;
  const isClt = payMode === 'clt';
  const isPj = payMode === 'pj';

  // --- Cálculo CLT (delegado aos motores puros) ---
  const proventosExtras = extraEarnings
    .map((item) => ({
      label: item.label.trim(),
      valor: Math.max(0, parseCurrency(item.amountInput)),
      incideEncargos: Boolean(item.incideEncargos),
    }))
    .filter((item) => item.label && item.valor > 0);
  const descontosExtras = extraDeductions
    .map((item) => ({ label: item.label.trim(), valor: Math.max(0, parseCurrency(item.amountInput)) }))
    .filter((item) => item.label && item.valor > 0);
  const totalProventosExtras = proventosExtras.reduce((total, item) => total + item.valor, 0);
  const proventosExtrasTributaveis = proventosExtras.reduce(
    (total, item) => total + (item.incideEncargos ? item.valor : 0),
    0,
  );
  const totalDescontosExtras = descontosExtras.reduce((total, item) => total + item.valor, 0);
  const rubricaPendente = [...extraEarnings, ...extraDeductions].some(
    (item) => parseCurrency(item.amountInput) > 0 && !item.label.trim(),
  );
  const grossBase = salary + balance.totalBonus + proventosExtrasTributaveis;
  const totalProventos = salary + balance.totalBonus + totalProventosExtras;
  const tableAvailable = hasPayrollTables(competenceYear, competenceMonth);
  const ded: PayrollResult = useMemo(
    () => tableAvailable ? calculatePayrollDeductions({
      grossBase,
      salary,
      dependentsCount: dependentsCount ?? 0,
      vtEnabled: vtEnabled ?? false,
      vtMonthlyValue: vtMonthlyValue ?? 0,
      competenceYear,
      competenceMonth,
    }) : EMPTY_PAYROLL_RESULT,
    [grossBase, salary, dependentsCount, vtEnabled, vtMonthlyValue, competenceYear, competenceMonth, tableAvailable],
  );

  useEffect(() => {
    if (!open || inssOverrideEnabled || !tableAvailable) return;
    setInssOverrideStr(currencyMask(String(Math.round(ded.inss * 100)), currency, locale));
  }, [open, inssOverrideEnabled, tableAvailable, ded.inss, currency, locale]);

  const inssCalculado = ded.inss;
  const inssFinal = inssOverrideEnabled ? Math.max(0, parseCurrency(inssOverrideStr)) : inssCalculado;
  const dedAjustado: PayrollResult = {
    ...ded,
    inss: inssFinal,
    totalDescontosLegais: inssFinal + ded.irrf + ded.vt,
  };

  const baseFGTS = grossBase;
  const fgtsMes = Math.round(baseFGTS * 0.08 * 100) / 100;

  // Líquido CLT = bruto − descontos legais − faltas − vales, arredondado.
  const cltLiquido = useMemo(
    () => tableAvailable
      ? Math.round((totalProventos - dedAjustado.totalDescontosLegais - balance.totalFaltas - valeDiscount - totalDescontosExtras) * 100) / 100
      : Number.NaN,
    [tableAvailable, totalProventos, dedAjustado.totalDescontosLegais, balance.totalFaltas, valeDiscount, totalDescontosExtras],
  );

  // PJ: valor combinado digitado (sem balance/vale/falta — não existe pra PJ).
  const pjAmount = useMemo(() => parseCurrency(pjAmountStr), [pjAmountStr]);

  // Colar valor pronto no campo PJ (mesma régua dos demais campos de dinheiro).
  const handlePjAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData?.getData('text');
    if (!text) return;
    const cents = centsFromPastedAmount(text);
    if (cents == null) return;
    e.preventDefault();
    setPjAmountStr(maskCurrency(String(cents)));
  };

  // Valor efetivamente pago (source of truth único).
  const amountToPay = payMode === 'clt' ? cltLiquido : payMode === 'pj' ? pjAmount : toPay;
  const negativo = amountToPay < 0;
  // PJ exige categoria escolhida (nunca grava lançamento sem nome de categoria
  // real da empresa) — mesma régua do `accountId`, que já bloqueia sem conta.
  const ajusteInssPendente = isClt && inssOverrideEnabled && !inssOverrideReason.trim();
  const canSubmit = Number.isFinite(amountToPay) && !negativo && amountToPay > 0 && !!accountId
    && !isPending && !rubricaPendente && !ajusteInssPendente
    && (payMode !== 'pj' || !!pjCategoryName);

  const handleConfirm = () => {
    if (!canSubmit) return;
    const snapshot: HoleriteSnapshot | undefined = payMode === 'clt' ? {
      mode: 'clt',
      competencia,
      proventos: { salary, adicional: 0, bonus: balance.totalBonus },
      descontos: { inss: dedAjustado.inss, irrf: dedAjustado.irrf, vt: dedAjustado.vt, faltas: balance.totalFaltas, vales: valeDiscount },
      bases: { inss: dedAjustado.baseINSS, irrf: dedAjustado.baseIRRF, fgts: baseFGTS, fgtsValor: fgtsMes },
      proventosExtras,
      descontosExtras,
      inssCalculado,
      motivoAjusteInss: inssOverrideEnabled ? inssOverrideReason.trim() : null,
      liquido: cltLiquido,
    } : undefined;
    onSubmit({
      valeDiscount: payMode === 'pj' ? 0 : valeDiscount,
      accountId,
      description: description || undefined,
      mode: payMode,
      holeriteSnapshot: snapshot,
      amount: amountToPay, // MESMO número que será gravado
      costCenterId,
      category: payMode === 'pj' ? pjCategoryName : undefined,
      invoiceNumber: payMode === 'pj' ? (invoiceNumber.trim() || undefined) : undefined,
    });
  };

  const footer = (
    <div className="flex flex-col items-end gap-2">
      {negativo && (
        <p className="text-xs text-destructive font-medium text-right">
          {t.negativeNet}
        </p>
      )}
      {isClt && !tableAvailable && (
        <p className="text-xs text-destructive font-medium text-right">
          Não há tabela oficial cadastrada para {competencia}.
        </p>
      )}
      {rubricaPendente && (
        <p className="text-xs text-destructive font-medium text-right">{t.adjustments.missingName}</p>
      )}
      {ajusteInssPendente && (
        <p className="text-xs text-destructive font-medium text-right">{t.adjustments.missingInssReason}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>{t.cancelLabel}</Button>
        <Button
          onClick={handleConfirm}
          disabled={!canSubmit}
          className="bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t.confirmLabel}
        </Button>
      </div>
    </div>
  );

  // PJ/MEI é travado no modo 'pj' — folha/encargos CLT não fazem sentido pra
  // um contrato de prestação de serviço.
  const availableModes = employeeRegime === 'pj' ? (['pj'] as const) : (['informal', 'clt'] as const);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={`${t.titlePrefix} ${employeeName}`}
      footer={footer}
      className="sm:max-w-6xl"
    >
      <div className="p-1">
        {financialTransactionId && (
          <NoticeBanner variant="info" className="mb-4">
            {t.payrollPendingPrefix}{payrollPeriodLabel ? `${t.payrollPendingPeriodInfix} ${payrollPeriodLabel}` : ''}
          </NoticeBanner>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ===================== FORM (esquerda) ===================== */}
          <div className="space-y-4">
            {/* Seletor de modo (Informal/CLT, ou travado em PJ/MEI) */}
            <div className="space-y-1">
              <Label className="text-xs">{t.modeLabel}</Label>
              <div className="flex rounded-md border overflow-hidden text-sm">
                {availableModes.map((m) => (
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
                    {m === 'informal' ? t.modeInformal : m === 'clt' ? t.modeClt : t.modePj}
                  </button>
                ))}
              </div>
            </div>

            {!isPj && balance.totalVales > 0 && (
              <section className="space-y-3 rounded-lg bg-amber-50 px-4 py-4 dark:bg-amber-950/20">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Label htmlFor="dominex-advance-discount" className="text-base font-semibold normal-case tracking-normal text-foreground">
                      {t.advanceDiscount.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t.advanceDiscount.info.replace('{total}', fmt(balance.totalVales))}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">
                    {fmt(balance.totalVales)}
                  </span>
                </div>
                <Input
                  id="dominex-advance-discount"
                  value={valeDiscountStr}
                  onChange={e => setValeDiscountStr(maskCurrency(e.target.value))}
                  onPaste={handleValeDiscountPaste}
                  onBlur={() => {
                    const parsed = parseCurrency(valeDiscountStr);
                    const capped = clampAdvanceDiscount(parsed, balance.totalVales);
                    if (parsed !== capped) {
                      setValeDiscountStr(maskCurrency(String(Math.round(capped * 100))));
                    }
                  }}
                  placeholder={fmt(balance.totalVales)}
                  className="h-12 text-lg font-semibold"
                />
                {remainingVales > 0 && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {t.advanceDiscount.remaining.replace('{value}', fmt(remainingVales))}
                  </p>
                )}
              </section>
            )}

            {isClt && (
              <>
                <PayrollAdjustmentsEditor
                  earnings={extraEarnings}
                  deductions={extraDeductions}
                  onEarningsChange={setExtraEarnings}
                  onDeductionsChange={setExtraDeductions}
                  onAmountChange={maskCurrency}
                  copy={t.adjustments}
                />
                <section className="space-y-4 border-b pb-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label htmlFor="dominex-override-inss" className="text-base font-semibold normal-case tracking-normal text-foreground">
                        {t.adjustments.inssOverride}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t.adjustments.calculatedInss.replace('{value}', fmt(inssCalculado))}
                      </p>
                    </div>
                    <Switch
                      id="dominex-override-inss"
                      checked={inssOverrideEnabled}
                      onCheckedChange={setInssOverrideEnabled}
                    />
                  </div>
                  {inssOverrideEnabled && (
                    <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                      <Input
                        value={inssOverrideStr}
                        onChange={(event) => setInssOverrideStr(maskCurrency(event.target.value))}
                        inputMode="decimal"
                        placeholder={t.adjustments.amountPlaceholder}
                      />
                      <div className="space-y-1.5">
                        <Label htmlFor="dominex-inss-reason">{t.adjustments.inssReason}</Label>
                        <Input
                          id="dominex-inss-reason"
                          value={inssOverrideReason}
                          onChange={(event) => setInssOverrideReason(event.target.value)}
                          placeholder={t.adjustments.inssReasonPlaceholder}
                          maxLength={120}
                        />
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Valor combinado + nota fiscal — só no modo PJ/MEI */}
            {isPj && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t.pj.amountLabel}</Label>
                  <Input
                    value={pjAmountStr}
                    onChange={e => setPjAmountStr(maskCurrency(e.target.value))}
                    onPaste={handlePjAmountPaste}
                    placeholder={maskCurrency('0')}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {pjActiveContract?.billing_type === 'monthly' ? t.pj.amountFromContractHint : t.pj.noContractWarning}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t.pj.invoiceNumberLabel}</Label>
                  <Input
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    placeholder={t.pj.invoiceNumberPlaceholder}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t.pj.categoryLabel}</Label>
                  <CategorySelectField
                    value={pjCategoryName}
                    onValueChange={(name) => { pjCategoryTouchedRef.current = true; setPjCategoryName(name); }}
                    type="saida"
                    fallbackNames={[PJ_LABOR_CATEGORY_SEED_NAME]}
                  />
                  <p className="text-[11px] text-muted-foreground">{t.pj.categoryHint}</p>
                </div>
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

            {/* Centro de custo — mesma régua do resto do domínio: sempre
                opcional, some da tela pra quem não usa (zero centros ativos
                cadastrados). */}
            {activeCostCenters.length > 0 && (
              <div className="space-y-2">
                <Label>{fin.costCenters.fieldLabel}</Label>
                <CostCenterSelect value={costCenterId} onValueChange={setCostCenterId} />
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
          <aside className="order-first space-y-4 self-start rounded-xl border bg-muted/50 p-5 shadow-sm lg:order-last lg:sticky lg:top-0">
            {isPj ? (
              <>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-1">{t.amountToPay.label}</p>
                  <p className={`text-2xl font-bold ${amountToPay >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {fmt(amountToPay)}
                  </p>
                </div>
                {invoiceNumber.trim() && (
                  <div className="border-t pt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t.pj.invoiceNumberLabel}</span>
                      <span className="font-medium">{invoiceNumber.trim()}</span>
                    </div>
                  </div>
                )}
              </>
            ) : isClt ? (
              <>
                {/* PROVENTOS */}
                <div className="space-y-2 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.cltSummary.proventos}</p>
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
                  {proventosExtras.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex justify-between text-green-600">
                      <span>{item.label}</span><span>{fmt(item.valor)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 flex justify-between font-medium">
                    <span>{t.cltSummary.totalProventos}</span>
                    <span>{fmt(totalProventos)}</span>
                  </div>
                </div>

                {/* DESCONTOS */}
                <div className="border-t pt-4 space-y-2 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.cltSummary.descontos}</p>
                  <div className="flex justify-between text-destructive">
                    <span>INSS</span>
                    <span>{fmt(dedAjustado.inss)}</span>
                  </div>
                  <div className="flex justify-between text-destructive">
                    <span>IRRF</span>
                    <span>{fmt(dedAjustado.irrf)}</span>
                  </div>
                  {dedAjustado.vt > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>{t.cltSummary.vt}</span>
                      <span>{fmt(dedAjustado.vt)}</span>
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
                  {descontosExtras.map((item, index) => (
                    <div key={`${item.label}-${index}`} className="flex justify-between text-destructive">
                      <span>{item.label}</span><span>{fmt(item.valor)}</span>
                    </div>
                  ))}
                </div>

                {/* LÍQUIDO (destaque) */}
                <div className="border-t pt-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">{t.cltSummary.liquido}</p>
                  <p className={`text-2xl font-bold ${cltLiquido >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {fmt(cltLiquido)}
                  </p>
                </div>

                {/* BASES (informativo) */}
                <div className="border-t pt-4 space-y-1.5 text-xs text-muted-foreground">
                  <p className="font-semibold uppercase tracking-wide">{t.cltSummary.bases}</p>
                  <div className="flex justify-between">
                    <span>Base INSS</span>
                    <span>{fmt(dedAjustado.baseINSS)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base IRRF</span>
                    <span>{fmt(dedAjustado.baseIRRF)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base FGTS</span>
                    <span>{fmt(baseFGTS)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.cltSummary.fgtsMes}</span>
                    <span>{fmt(fgtsMes)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Resumo INFORMAL (mantém o atual) */}
                <div className="space-y-2 text-sm">
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
                <div className="border-t pt-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">{t.amountToPay.label}</p>
                  <p className={`text-2xl font-bold ${toPay >= 0 ? 'text-success' : 'text-destructive'}`}>
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

            {/* Disclaimer — só no modo CLT (INSS/IRRF não se aplicam ao pagamento informal) */}
            {isClt && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                {t.disclaimer}
              </p>
            )}
            {/* PJ/MEI: reforça que não há desconto de imposto nesse modo. */}
            {isPj && (
              <p className="text-[11px] leading-snug text-muted-foreground">
                {t.pj.noTaxDisclaimer}
              </p>
            )}
          </aside>
        </div>
      </div>
    </ResponsiveModal>
  );
}
