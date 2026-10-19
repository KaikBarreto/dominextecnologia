import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatNumber, parseMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { cn } from '@/lib/utils';

type DiscountMode = 'value' | 'percentage';

export interface PdvInlineDiscountEditorTexts {
  add: string;
  edit: string;
  close: string;
  valueMode: string;
  percentageMode: string;
  valueLabel: string;
  percentageLabel: string;
  invalidNumber: string;
  percentageLimit: string;
  valueLimit: string;
  itemTotal: string;
  afterDiscount: string;
  cancel: string;
  apply: string;
  remove: string;
}

interface PdvInlineDiscountEditorProps {
  variant: 'line' | 'order';
  label: string;
  baseAmount: number;
  discountAmount: number;
  formatCurrency: (value: number) => string;
  currencySymbol: string;
  locale: LocaleCode;
  currencyFractionDigits: number;
  texts: PdvInlineDiscountEditorTexts;
  onApply: (discountAmount: number) => void;
  onEditingChange?: (editing: boolean) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function PdvInlineDiscountEditor({
  variant,
  label,
  baseAmount,
  discountAmount,
  formatCurrency,
  currencySymbol,
  locale,
  currencyFractionDigits,
  texts,
  onApply,
  onEditingChange,
}: PdvInlineDiscountEditorProps) {
  const editorRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<DiscountMode>('value');
  const [draft, setDraft] = useState('');
  const normalizedApplied = clamp(Number(discountAmount) || 0, 0, Math.max(0, baseAmount));
  const parsed = parseMoney(draft, locale);
  const isValidNumber = parsed != null && Number.isFinite(parsed) && parsed >= 0;
  const exceedsLimit = isValidNumber
    && (mode === 'percentage' ? parsed > 100 : parsed > baseAmount);
  const calculatedDiscount = isValidNumber
    ? mode === 'percentage'
      ? (baseAmount * parsed) / 100
      : parsed
    : 0;
  const canApply = baseAmount > 0 && isValidNumber && !exceedsLimit;

  const formatEditable = (value: number, fractionDigits = currencyFractionDigits) =>
    formatNumber(value, locale, {
      useGrouping: false,
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    });

  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      if (typeof editorRef.current?.scrollIntoView === 'function') {
        editorRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

  const changeEditing = (next: boolean) => {
    setEditing(next);
    onEditingChange?.(next);
  };

  const toggleEditor = () => {
    if (!editing) {
      setMode('value');
      setDraft(formatEditable(normalizedApplied));
    }
    changeEditing(!editing);
  };

  const changeMode = (nextMode: DiscountMode) => {
    if (nextMode === mode) return;
    const currentAmount = isValidNumber && !exceedsLimit
      ? calculatedDiscount
      : normalizedApplied;
    setMode(nextMode);
    setDraft(
      formatEditable(
        nextMode === 'percentage' && baseAmount > 0
          ? (currentAmount / baseAmount) * 100
          : currentAmount,
        nextMode === 'percentage' ? 2 : currencyFractionDigits,
      ),
    );
  };

  const applyDiscount = () => {
    if (!canApply) return;
    const scale = 10 ** currencyFractionDigits;
    const amount = Math.round(clamp(calculatedDiscount, 0, baseAmount) * scale) / scale;
    onApply(amount);
    changeEditing(false);
  };

  return (
    <div className={variant === 'order' ? 'rounded-sm' : 'mt-1'}>
      {variant === 'order' ? (
        <button
          type="button"
          disabled={baseAmount <= 0}
          aria-expanded={editing}
          aria-label={`${editing ? texts.close : normalizedApplied > 0 ? texts.edit : texts.add}: ${label}`}
          onClick={toggleEditor}
          className="flex w-full items-center justify-between gap-3 rounded-sm py-0.5 text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <span>{label}</span>
          <span className="inline-flex shrink-0 items-center gap-2">
            <span className="text-[11px] font-bold text-primary">
              {editing ? texts.close : normalizedApplied > 0 ? texts.edit : texts.add}
            </span>
            <span className="tabular-nums">− {formatCurrency(normalizedApplied)}</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          disabled={baseAmount <= 0}
          aria-expanded={editing}
          aria-label={`${editing ? texts.close : normalizedApplied > 0 ? texts.edit : texts.add}: ${label}`}
          onClick={toggleEditor}
          className="text-[11px] font-bold text-primary underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {editing
            ? `${texts.close} ${label.toLocaleLowerCase()}`
            : normalizedApplied > 0
              ? `${texts.edit} · − ${formatCurrency(normalizedApplied)}`
              : texts.add}
        </button>
      )}

      {editing && (
        <form
          ref={editorRef}
          className={cn(
            'mt-2.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-end gap-x-2 gap-y-1.5 pb-0.5',
            variant === 'line' && 'min-w-[14rem]',
          )}
          onSubmit={(event) => {
            event.preventDefault();
            applyDiscount();
          }}
        >
          <div className="grid h-9 grid-cols-2 gap-1 rounded bg-muted p-1" aria-label={label}>
            <button
              type="button"
              aria-pressed={mode === 'value'}
              onClick={() => changeMode('value')}
              className={cn(
                'rounded px-1 py-1 text-[11px] font-semibold transition-colors',
                mode === 'value'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {texts.valueMode}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'percentage'}
              aria-label={texts.percentageMode}
              onClick={() => changeMode('percentage')}
              className={cn(
                'rounded px-1 py-1 text-[11px] font-semibold transition-colors',
                mode === 'percentage'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              %
            </button>
          </div>

          <label className="block">
            <span className="sr-only">{mode === 'value' ? texts.valueLabel : texts.percentageLabel}</span>
            <div className="relative">
              {mode === 'value' && (
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencySymbol}
                </span>
              )}
              <Input
                autoFocus
                inputMode="decimal"
                aria-label={mode === 'value' ? texts.valueLabel : texts.percentageLabel}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-invalid={!isValidNumber || exceedsLimit}
                className={cn('h-9 text-sm tabular-nums', mode === 'value' ? 'pl-11' : 'pr-9')}
              />
              {mode === 'percentage' && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              )}
            </div>
          </label>

          {(!isValidNumber || exceedsLimit) && (
            <span className="col-span-2 text-xs font-medium text-destructive">
              {!isValidNumber
                ? texts.invalidNumber
                : mode === 'percentage'
                  ? texts.percentageLimit
                  : texts.valueLimit.replace('{value}', formatCurrency(baseAmount))}
            </span>
          )}

          <div className="flex min-h-8 items-center justify-between gap-1 text-[10px]">
            <span className="text-muted-foreground">
              {variant === 'line' ? texts.itemTotal : texts.afterDiscount}
            </span>
            <span className="font-bold tabular-nums">
              {formatCurrency(Math.max(0, baseAmount - (canApply ? calculatedDiscount : 0)))}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            <Button type="button" variant="outline" size="sm" className="h-8 px-1 text-[11px]" onClick={() => changeEditing(false)}>
              {texts.cancel}
            </Button>
            <Button type="submit" size="sm" className="h-8 px-1 text-[11px]" disabled={!canApply}>
              {texts.apply}
            </Button>
          </div>

          {normalizedApplied > 0 && (
            <Button
              type="button"
              variant="destructive-ghost"
              size="sm"
              className="col-span-2 h-7 w-full text-xs"
              onClick={() => {
                onApply(0);
                changeEditing(false);
              }}
            >
              {texts.remove}
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
