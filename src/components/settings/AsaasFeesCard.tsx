import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TenantFees } from '@/hooks/useTenantCardFees';
import { formatBRL, formatPercent } from '@/lib/asaasFeeSimulator';

// ─────────────────────────────────────────────────────────────────────────────
// Card "Taxas da Asaas" — mostra as taxas REAIS da conta do tenant.
//
// Antes desta versão os valores eram STRING FIXA de i18n (e o Pix aparecia como
// "R$ 0,00", o que é falso: a Asaas cobra tarifa fixa por Pix recebido, com as
// N primeiras do mês isentas). Agora vêm de `useTenantFees` → edge
// `tenant-asaas-card-fees` → GET /v3/myAccount/fees da conta do tenant.
//
// REGRA DE HONESTIDADE: quando a Asaas não devolve um bloco, o valor vem `null`
// e a linha mostra a FAIXA DE REFERÊNCIA explicitamente rotulada como tal (ou
// "não informado pela Asaas"). Nunca um zero inventado.
// ─────────────────────────────────────────────────────────────────────────────

interface AsaasFeesCardProps {
  /** Taxas resolvidas (null enquanto carrega ou quando não há conta). */
  data: Pick<
    TenantFees,
    'card' | 'pix' | 'bankSlip' | 'anticipation' | 'settlementDays' | 'source' | 'extrasSource'
  > | null;
  syncedAt: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  onSync: () => void;
}

export function AsaasFeesCard({ data, syncedAt, isLoading, isSyncing, onSync }: AsaasFeesCardProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.integrations.asaas.activeState;

  const card = data?.card ?? null;
  const pix = data?.pix ?? null;
  const bankSlip = data?.bankSlip ?? null;
  const anticipation = data?.anticipation ?? null;
  const days = data?.settlementDays ?? { pix: null, bankSlip: null, card: null };

  // Procedência: 'asaas'/'cache' = taxa da conta do tenant; 'fallback' = referência.
  const cardIsReal = data?.source === 'asaas' || data?.source === 'cache';
  const cardIsOverride = data?.source === 'override';
  const extrasAreReal = data?.extrasSource === 'asaas' || data?.extrasSource === 'cache';

  const syncedLabel = (() => {
    if (!syncedAt) return null;
    const d = new Date(syncedAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  })();

  const provenance = (() => {
    if (cardIsOverride) return { text: t.feesFromOverride, real: true };
    if (cardIsReal || extrasAreReal) {
      return {
        text: syncedLabel ? `${t.feesFromAccount} ${syncedLabel}.` : t.feesFromAccountNoDate,
        real: true,
      };
    }
    return { text: t.feesFromReference, real: false };
  })();

  /** "na hora" / "em 1 dia" / "em N dias". */
  const dayLabel = (n: number | null, fallback: number): string => {
    const v = n ?? fallback;
    if (v <= 0) return t.settlementSameDay;
    if (v === 1) return t.settlementInDay;
    return t.settlementInDays.replace('{count}', String(v));
  };

  // ── Linha do Pix ───────────────────────────────────────────────────────────
  const pixValue = pix
    ? [
        pix.percent > 0 ? formatPercent(pix.percent) : null,
        pix.fixed > 0 ? formatBRL(pix.fixed) : null,
      ].filter(Boolean).join(' + ') || t.feeNotInformed
    : t.feePixValue;
  const pixNote = pix && pix.freeCount && pix.freeCount > 0
    ? t.feePixFreeNote.replace('{count}', String(pix.freeCount))
    : null;

  // ── Linha do boleto ────────────────────────────────────────────────────────
  const slipValue = bankSlip ? formatBRL(bankSlip.fixed) : t.feeBoletoValue;

  // ── Linha da antecipação ───────────────────────────────────────────────────
  const anticipationValue = anticipation
    ? [
        anticipation.cardInstallmentMonthlyPercent != null
          ? `${formatPercent(anticipation.cardInstallmentMonthlyPercent)} ${t.feeMonthly} (${t.feeInstallments})`
          : null,
        anticipation.cardDetachedMonthlyPercent != null
          ? `${formatPercent(anticipation.cardDetachedMonthlyPercent)} ${t.feeMonthly} (${t.feeOneShot})`
          : null,
        anticipation.bankSlipMonthlyPercent != null
          ? `${formatPercent(anticipation.bankSlipMonthlyPercent)} ${t.feeMonthly} (Pix/${t.feeBoleto})`
          : null,
      ].filter(Boolean).join(' · ') || formatPercent(anticipation.monthlyPercent)
    : t.feeAnticipationValue;

  // ── Linha de prazos ────────────────────────────────────────────────────────
  // SETTLEMENT: a Asaas não expõe daysToReceive de Pix — cai no valor de referência.
  const settlementValue = `${t.feePix} ${dayLabel(days.pix, 0)} · ${t.feeBoleto} ${dayLabel(days.bankSlip, 1)} · ${t.feeCard} ${dayLabel(days.card, 32)}`;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold">{t.feesTitle}</p>
        <div className="rounded-lg border p-6 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm">{MESSAGES[locale].app.settings.integrations.asaas.loading}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold">{t.feesTitle}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onSync}
          disabled={isSyncing}
          className="h-8"
        >
          {isSyncing ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t.feesRefreshing}
            </>
          ) : (
            <>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t.feesRefresh}
            </>
          )}
        </Button>
      </div>

      <div className="space-y-2 text-sm">
        <FeeRow
          label={t.feePix}
          value={pixValue}
          note={pixNote}
          isReference={!pix}
          referenceTag={t.feeReferenceTag}
        />
        <FeeRow
          label={t.feeBoleto}
          value={slipValue}
          isReference={!bankSlip}
          referenceTag={t.feeReferenceTag}
        />
        {card ? (
          <div className="space-y-3 rounded-2xl bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{t.feeCard}</span>
              {!cardIsReal && !cardIsOverride && (
                <span className="inline-flex items-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {t.feeReferenceTag}
                </span>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CardFeeRate label={t.feeCardOneInstallment} value={formatPercent(card.oneInstallment)} />
              <CardFeeRate label={t.feeCardTwoToSix} value={formatPercent(card.upToSix)} />
              <CardFeeRate label={t.feeCardSevenToTwelve} value={formatPercent(card.upToTwelve)} />
              <CardFeeRate label={t.feeCardThirteenToTwentyOne} value={formatPercent(card.upToTwentyOne)} />
            </dl>

            <p className="text-xs text-muted-foreground">
              + <span className="font-semibold tabular-nums text-foreground">{formatBRL(card.operationValue)}</span>{' '}
              {t.feePerCharge}
            </p>
          </div>
        ) : (
          <FeeRow
            label={t.feeCard}
            value={t.feeCardValue}
            isReference
            referenceTag={t.feeReferenceTag}
          />
        )}
        <FeeRow
          label={t.feeAnticipation}
          value={anticipationValue}
          isReference={!anticipation}
          referenceTag={t.feeReferenceTag}
        />
        <FeeRow
          label={t.feeSettlement}
          value={settlementValue}
          isReference={days.card == null}
          referenceTag={t.feeReferenceTag}
        />
      </div>

      {/* Procedência em PT-BR leigo: taxa da conta vs. taxa de referência. */}
      <p
        className={cn(
          'flex items-start gap-1.5 text-xs',
          provenance.real ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-500',
        )}
      >
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        {provenance.text}
      </p>

      <p className="text-xs text-muted-foreground">{t.feesNote}</p>
    </div>
  );
}

function CardFeeRate({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background px-3 py-2.5 shadow-sm">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function FeeRow({
  label,
  value,
  note,
  isReference,
  referenceTag,
}: {
  label: string;
  value: string;
  note?: string | null;
  isReference?: boolean;
  referenceTag: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted/30 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <div className="min-w-0 text-left sm:text-right">
        <span className="font-medium tabular-nums break-words">{value}</span>
        {isReference && (
          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none bg-amber-500 text-white align-middle">
            {referenceTag}
          </span>
        )}
        {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
      </div>
    </div>
  );
}
