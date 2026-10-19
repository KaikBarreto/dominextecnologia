import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { cn } from '@/lib/utils';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { computeCashDifference, computeExpectedCash, willPostCashBreak } from '@/lib/pdv/cash';
import { pdvCashErrorMessage } from '@/lib/pdv/cash-errors';
import { PdvMoneyInput } from './PdvMoneyInput';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type CloseTexts = (typeof pdv)['pt-br']['cashPanel']['closeDialog'];

interface PdvCloseCashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  texts: CloseTexts;
  /** Composição da gaveta, nas MESMAS parcelas que a RPC usa pra conferir. */
  breakdown: {
    openingAmount: number;
    cashSales: number;
    supplies: number;
    bleeds: number;
  };
  cofreAccountName: string | null;
  onConfirm: (args: { countedAmount: number; notes: string | null }) => Promise<void>;
}

/**
 * Fechar caixa: mostra o que VAI acontecer antes de confirmar.
 *
 * O esperado é previsto no cliente pela MESMA fórmula da RPC
 * (`src/lib/pdv/cash.ts`, testada), mas quem fecha é sempre o servidor: ele
 * recalcula, grava a sessão e lança a quebra de caixa. A tela nunca é a
 * autoridade do número.
 */
export function PdvCloseCashDialog({
  open,
  onOpenChange,
  texts,
  breakdown,
  cofreAccountName,
  onConfirm,
}: PdvCloseCashDialogProps) {
  const { money } = useLocaleFormatters();
  const [counted, setCounted] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const submitGuard = useRef(false);

  const expected = computeExpectedCash(breakdown);
  const difference = computeCashDifference(counted, expected);
  const willPost = willPostCashBreak({
    difference,
    expectedAmount: expected,
    hasCashAccount: !!cofreAccountName,
  });

  useEffect(() => {
    if (!open) return;
    // Pré-preenche com o esperado: na maioria dos fechamentos a gaveta bate, e
    // o operador só confirma. Quem contou diferente digita o valor real.
    setCounted(expected > 0 ? expected : 0);
    setNotes('');
    setServerError(null);
    setSubmitting(false);
    submitGuard.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleConfirm() {
    if (submitGuard.current) return;
    submitGuard.current = true;
    setSubmitting(true);
    setServerError(null);
    try {
      await onConfirm({ countedAmount: counted, notes: notes.trim() || null });
      onOpenChange(false);
    } catch (error) {
      setServerError(pdvCashErrorMessage(error));
    } finally {
      setSubmitting(false);
      submitGuard.current = false;
    }
  }

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
        {texts.cancel}
      </Button>
      <Button type="button" disabled={submitting} onClick={handleConfirm}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {texts.confirm}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => {
        if (!v && !submitting) onOpenChange(false);
      }}
      title={texts.title}
      className="sm:max-w-[480px]"
      footer={footer}
    >
      <div className="space-y-4">
        <dl className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
          <Line label={texts.opening} value={money(breakdown.openingAmount)} />
          <Line label={texts.cashSales} value={money(breakdown.cashSales)} />
          <Line label={texts.supplies} value={money(breakdown.supplies)} />
          <Line label={texts.bleeds} value={`− ${money(breakdown.bleeds)}`} />
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2">
            <dt className="font-bold">{texts.expected}</dt>
            <dd className="text-lg font-extrabold tabular-nums">{money(expected)}</dd>
          </div>
        </dl>

        <div className="space-y-1.5">
          <Label htmlFor="pdv-close-counted">{texts.counted}</Label>
          <PdvMoneyInput id="pdv-close-counted" value={counted} onChange={setCounted} autoFocus />
          <p className="text-xs text-muted-foreground">{texts.countedHint}</p>
        </div>

        {/* A diferença em destaque: é o número que o operador precisa ver. */}
        <div
          className={cn(
            'flex items-baseline justify-between gap-3 rounded-lg px-3 py-2.5',
            difference === 0
              ? 'bg-success text-success-foreground'
              : difference > 0
                ? 'bg-info text-info-foreground'
                : 'bg-destructive text-destructive-foreground',
          )}
        >
          <span className="text-sm font-semibold">{texts.difference}</span>
          <span
            className={cn(
              'font-extrabold tabular-nums',
              difference === 0 ? 'text-sm' : 'text-lg',
            )}
          >
            {difference === 0
              ? texts.exact
              : difference > 0
                ? texts.surplus.replace('{value}', money(difference))
                : texts.shortage.replace('{value}', money(Math.abs(difference)))}
          </span>
        </div>

        {difference !== 0 && willPost && (
          <NoticeBanner variant="warning">
            {texts.breakNotice.replace('{account}', cofreAccountName ?? '')}
          </NoticeBanner>
        )}
        {difference !== 0 && !willPost && expected < 0 && (
          <NoticeBanner variant="destructive">{texts.noBreakNegative}</NoticeBanner>
        )}
        {difference !== 0 && !willPost && expected >= 0 && !cofreAccountName && (
          <NoticeBanner variant="warning">{texts.noBreakNoAccount}</NoticeBanner>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="pdv-close-notes">{texts.notes}</Label>
          <Textarea
            id="pdv-close-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={texts.notesPlaceholder}
            rows={2}
          />
        </div>

        {serverError && <NoticeBanner variant="destructive">{serverError}</NoticeBanner>}
      </div>
    </ResponsiveModal>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
