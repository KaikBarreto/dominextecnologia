import { useMemo, useState } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/mobile/EmptyState';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lock, Loader2, Info, AlertTriangle, Calculator, Zap } from 'lucide-react';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { useTenantFees } from '@/hooks/useTenantCardFees';
import {
  simulateNetAmount,
  formatBRL,
  formatPercent,
  REFERENCE_CARD_FEES,
  MAX_INSTALLMENTS,
  type PaymentMethod,
  type FeePayer,
  type SimulatorFees,
} from '@/lib/asaasFeeSimulator';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Subaba "Simulador de venda" das Integrações.
//
// Equivalente ao Simulador de Vendas do painel da Asaas, dentro do Dominex:
// o usuário digita o valor, escolhe o meio de pagamento e vê quanto sobra,
// quando cai e quanto custa antecipar.
//
// A conta é feita 100% pelo helper PURO `src/lib/asaasFeeSimulator.ts` — o mesmo
// que o modal de Nova cobrança consome. Aqui só entra UI.
//
// A aba NÃO é escondida quando a Asaas não está conectada: ela é argumento de
// venda. Sem conta conectada o simulador roda com a tabela de REFERÊNCIA e
// avisa isso na tela.
// ─────────────────────────────────────────────────────────────────────────────

/** Converte "1.234,56" / "1234.56" em número. Vazio → 0. */
function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;
  // Último separador manda: se houver vírgula, ela é o decimal (padrão BR).
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function SettingsAsaasSimulator() {
  const { locale, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.integrations.simulator;

  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  const { isActive, isLoading: accountLoading } = useTenantPaymentAccount();
  const { card, pix, bankSlip, anticipation, settlementDays, source, isLoading: feesLoading } =
    useTenantFees();

  const [amountInput, setAmountInput] = useState('1000');
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [installments, setInstallments] = useState(10);
  const [feePayer, setFeePayer] = useState<FeePayer>('company');
  const [anticipate, setAnticipate] = useState(false);

  const amount = parseMoney(amountInput);

  const fees: SimulatorFees = useMemo(
    () => ({
      card: card ?? REFERENCE_CARD_FEES,
      pix,
      bankSlip,
      anticipation,
      settlementDays,
    }),
    [card, pix, bankSlip, anticipation, settlementDays],
  );

  const result = useMemo(
    () =>
      simulateNetAmount({
        amount,
        method,
        installments,
        feePayer,
        fees,
        anticipate,
      }),
    [amount, method, installments, feePayer, fees, anticipate],
  );

  // Mesma conta sem antecipar — usada na comparação lado a lado.
  const resultPlain = useMemo(
    () =>
      simulateNetAmount({ amount, method, installments, feePayer, fees, anticipate: false }),
    [amount, method, installments, feePayer, fees],
  );

  if (modulesLoading || accountLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">{MESSAGES[locale].app.settings.integrations.asaas.loading}</span>
      </div>
    );
  }

  // Add-on não contratado: mesmo estado dedicado da subaba de Recebimentos.
  if (!hasModule('cobrancas')) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<Lock className="h-full w-full" />}
            title={t.notContractedTitle}
            description={t.notContractedDesc}
          />
        </CardContent>
      </Card>
    );
  }

  const usingReference = !isActive || source === 'fallback' || result.usedReferenceFees;
  const isCard = method === 'card';
  const showSchedule = result.schedule.length > 1 || isCard;

  // Formata a data de crédito no padrão "seg, 14/09" (dia da semana curto + dia/mês,
  // sem ano) respeitando o idioma/fuso da empresa.
  const shortCreditDate = (iso: string): string =>
    formatDate(iso, locale, timezone, { weekday: 'short', year: undefined });

  const dayLabel = (n: number, settlementDate: string): string => {
    if (n <= 0) return t.settlementSameDay;
    if (n === 1) return t.settlementInDay.replace('{date}', shortCreditDate(settlementDate));
    return t.settlementInDays
      .replace('{count}', String(n))
      .replace('{date}', shortCreditDate(settlementDate));
  };

  const methodOptions: { value: PaymentMethod; label: string }[] = [
    { value: 'pix', label: t.methodPix },
    { value: 'boleto', label: t.methodBoleto },
    { value: 'card', label: t.methodCard },
  ];

  return (
    <div className="space-y-4">
      {/* Aviso de conta não conectada: a aba é argumento de venda, não some. */}
      {!isActive && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">{t.notConnectedTitle}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t.notConnectedDesc}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary shrink-0">
              <Calculator className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">{t.title}</CardTitle>
              <CardDescription className="text-sm">{t.description}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* ── Entradas ───────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="sim-amount" className="text-xs font-medium">
              {t.amountLabel}
            </Label>
            <div className="relative max-w-[220px]">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                R$
              </span>
              <input
                id="sim-amount"
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="1.000,00"
                className={cn(
                  'flex h-11 w-full rounded-md border border-input bg-transparent pl-10 pr-3 py-1',
                  'text-base font-semibold tabular-nums shadow-sm transition-colors',
                  'placeholder:font-normal placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">{t.methodLabel}</p>
            <div className="grid grid-cols-3 gap-2">
              {methodOptions.map((opt) => {
                const active = method === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMethod(opt.value)}
                    className={cn(
                      'h-10 rounded-md border text-sm font-semibold transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent border-input text-muted-foreground hover:text-foreground hover:bg-muted/60',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isCard && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t.installmentsLabel}</Label>
              <Select
                value={String(installments)}
                onValueChange={(v) => setInstallments(Number(v) || 1)}
              >
                <SelectTrigger className="h-10 text-sm max-w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: MAX_INSTALLMENTS }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t.installmentsOption.replace('{n}', String(n))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium">{t.feePayerLabel}</p>
            <LabeledSwitch<FeePayer>
              value={feePayer}
              onChange={setFeePayer}
              off={{ value: 'company', label: t.feePayerCompany }}
              on={{ value: 'customer', label: t.feePayerCustomer }}
              size="default"
              className="text-sm"
              aria-label={t.feePayerLabel}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5 flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                {t.anticipateLabel}
              </p>
              <p className="text-xs text-muted-foreground">{t.anticipateDesc}</p>
            </div>
            <Switch
              checked={anticipate}
              onCheckedChange={setAnticipate}
              aria-label={t.anticipateLabel}
              className="shrink-0 mt-0.5"
            />
          </div>

          {anticipate && !anticipation && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {t.anticipateUnavailable}
            </p>
          )}

          <Separator />

          {/* ── Resultado ──────────────────────────────────────────────────── */}
          {amount <= 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t.emptyAmount}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold">{t.resultTitle}</p>

              <div className="rounded-lg border divide-y text-sm">
                <ResultRow label={t.resultGross} value={formatBRL(result.gross)} />
                {feePayer === 'customer' && (
                  <ResultRow
                    label={t.resultCustomerPays}
                    value={formatBRL(result.gross)}
                    hint={
                      result.installmentValue != null
                        ? `${result.installments}x ${formatBRL(result.installmentValue)}`
                        : undefined
                    }
                  />
                )}
                <ResultRow
                  label={t.resultFee}
                  value={`- ${formatBRL(result.feeTotal)}`}
                  hint={[
                    result.feeBreakdown.percent > 0
                      ? `${formatPercent(result.feeBreakdown.percent)} = ${formatBRL(result.feeBreakdown.percentAmount)}`
                      : null,
                    result.feeBreakdown.fixed > 0 ? `+ ${formatBRL(result.feeBreakdown.fixed)}` : null,
                  ].filter(Boolean).join(' ')}
                  tone="negative"
                />
                {result.anticipationCost != null && result.anticipationCost > 0 && (
                  <ResultRow
                    label={t.resultAnticipationCost}
                    value={`- ${formatBRL(result.anticipationCost)}`}
                    tone="negative"
                  />
                )}
                <ResultRow
                  label={anticipate ? t.resultNetAnticipated : t.resultNet}
                  value={formatBRL(result.netAfterAnticipation)}
                  hint={dayLabel(result.settlementDays, result.settlementDate)}
                  tone="positive"
                  strong
                />
                {feePayer === 'company' && result.installmentValue != null && (
                  <ResultRow
                    label={t.resultInstallment}
                    value={formatBRL(result.installmentValue)}
                    hint={`${result.installments}x`}
                  />
                )}
                <ResultRow
                  label={t.resultEffectiveCost}
                  value={formatPercent(result.effectiveCostPercent)}
                />
              </div>

              {/* Regra do dia útil: fixa sempre que há prazo (a Asaas só credita em
                  dia de expediente bancário — fim de semana/feriado empurra a data). */}
              {result.settlementDays > 0 && (
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="h-3 w-3 shrink-0 mt-0.5" />
                  {t.settlementBusinessDayNote}
                </p>
              )}

              {/* Comparação lado a lado: só faz sentido com antecipação ligada. */}
              {anticipate && result.anticipationCost != null && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{t.compareTitle}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <CompareBox
                      label={t.compareWithout}
                      value={formatBRL(resultPlain.netAfterAnticipation)}
                      when={`${t.compareWhen}: ${dayLabel(resultPlain.settlementDays, resultPlain.settlementDate)}`}
                    />
                    <CompareBox
                      label={t.compareWith}
                      value={formatBRL(result.netAfterAnticipation)}
                      when={`${t.compareWhen}: ${dayLabel(result.settlementDays, result.settlementDate)}`}
                      highlight
                    />
                  </div>
                </div>
              )}

              {/* Cronograma: quando cada parcela cai PARA A EMPRESA. */}
              {showSchedule && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{t.scheduleTitle}</p>
                  <div className="rounded-lg border divide-y text-sm">
                    {result.scheduleDetailed.map((item) => (
                      <div
                        key={`${item.installmentNumber}-${item.date}`}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="text-muted-foreground">
                          {result.installments > 1
                            ? t.scheduleInstallment.replace('{n}', String(item.installmentNumber))
                            : t.scheduleSingle}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatDate(item.date, locale, timezone, { weekday: 'short' })}
                          </span>
                          <span className="font-medium tabular-nums">{formatBRL(item.amount)}</span>
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40">
                      <span className="font-semibold">{t.scheduleTotal}</span>
                      <span className="font-semibold tabular-nums">
                        {formatBRL(result.netAfterAnticipation)}
                      </span>
                    </div>
                  </div>
                  {!result.settlementDaysFromAsaas && (
                    <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <Info className="h-3 w-3 shrink-0 mt-0.5" />
                      {t.settlementFallbackNote}
                    </p>
                  )}
                </div>
              )}

              {method === 'pix' && pix?.freeCount ? (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {t.pixFreeNote.replace('{count}', String(pix.freeCount))}
                </p>
              ) : null}

              {usingReference && (
                <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {t.referenceWarning}
                </p>
              )}

              {/* Estimativa: o número contratual sai do servidor na hora da cobrança. */}
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground italic border-t border-border/60 pt-3">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {t.disclaimer}
              </p>
            </div>
          )}

          {feesLoading && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {MESSAGES[locale].app.settings.integrations.asaas.loading}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultRow({
  label,
  value,
  hint,
  tone,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'positive' | 'negative';
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2.5">
      <span className={cn('text-muted-foreground', strong && 'text-foreground font-medium')}>
        {label}
      </span>
      <div className="text-right min-w-0">
        <span
          className={cn(
            'tabular-nums font-medium',
            strong && 'text-base font-bold',
            tone === 'positive' && 'text-emerald-600 dark:text-emerald-500',
            tone === 'negative' && 'text-destructive',
          )}
        >
          {value}
        </span>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function CompareBox({
  label,
  value,
  when,
  highlight,
}: {
  label: string;
  value: string;
  when: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-0.5',
        highlight ? 'border-primary bg-primary/5' : 'border-border',
      )}
    >
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-base font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{when}</p>
    </div>
  );
}
