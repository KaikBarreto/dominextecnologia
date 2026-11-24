import { useEffect, useRef, useState } from 'react';
import { BadgePercent, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
  /** Gatilho compacto usado na linha do pedido, sem consumir uma linha textual. */
  iconOnly?: boolean;
  presentation?: 'default' | 'preview';
  open?: boolean;
  hideTrigger?: boolean;
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
  iconOnly = false,
  presentation = 'default',
  open: controlledOpen,
  hideTrigger = false,
}: PdvInlineDiscountEditorProps) {
  const editorRef = useRef<HTMLFormElement>(null);
  const [internalEditing, setEditing] = useState(false);
  const editing = controlledOpen ?? internalEditing;
  const reduceMotion = useReducedMotion();
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
    if (!controlledOpen) return;
    setMode('value');
    setDraft(formatNumber(normalizedApplied, locale, { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: currencyFractionDigits }));
  }, [controlledOpen, normalizedApplied, locale, currencyFractionDigits]);

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

  if (presentation === 'preview') return <>
    {!hideTrigger && <button type="button" className={variant === 'order' ? 'benefitbtn' : 'itemdiscount'} disabled={baseAmount <= 0} aria-expanded={editing} aria-label={`${editing ? texts.close : texts.add}: ${label}`} onClick={toggleEditor}><span className="row"><BadgePercent />{label}</span><span className="row">{normalizedApplied > 0 ? '− ' + formatCurrency(normalizedApplied) : 'Adicionar'}<ChevronDown /></span></button>}
    <AnimatePresence initial={false}>{editing && <motion.form ref={editorRef} className="itemeditor" initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.34 }} onAnimationComplete={() => { if (editing) { const target = editorRef.current?.closest('[data-cart-item]') ?? editorRef.current; target?.scrollIntoView?.({ block: 'nearest' }); } }} onSubmit={event => { event.preventDefault(); applyDiscount(); }}>
      <label className="eyebrow">{variant === 'line' ? 'DESCONTO NESTE MATERIAL' : 'DESCONTO NO PEDIDO'}</label>
      <div className="discountline"><div className="segmented unbacked"><button type="button" aria-pressed={mode === 'percentage'} className={mode === 'percentage' ? 'selected' : ''} onClick={() => changeMode('percentage')}>%</button><button type="button" aria-pressed={mode === 'value'} className={mode === 'value' ? 'selected' : ''} onClick={() => changeMode('value')}>{currencySymbol}</button></div><Input aria-label={mode === 'percentage' ? texts.percentageLabel : texts.valueLabel} inputMode="decimal" autoComplete="off" value={draft} onChange={event => setDraft(event.target.value)} placeholder="0,00" /><button type="submit" className="btn primary" disabled={!canApply}>{texts.apply}</button></div>
      {exceedsLimit && <small className="text-destructive">{mode === 'percentage' ? texts.percentageLimit : texts.valueLimit}</small>}
      {normalizedApplied > 0 && <button type="button" className="textremove" onClick={() => { onApply(0); changeEditing(false); }}>{texts.remove}</button>}
    </motion.form>}</AnimatePresence>
  </>;

  return (
    <div className={cn(
      variant === 'order' ? 'rounded-sm' : iconOnly ? 'relative' : 'mt-1',
    )}>
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
      ) : iconOnly ? (
        <button
          type="button"
          disabled={baseAmount <= 0}
          aria-expanded={editing}
          aria-label={`${editing ? texts.close : normalizedApplied > 0 ? texts.edit : texts.add}: ${label}`}
          title={normalizedApplied > 0
            ? `${texts.edit}: − ${formatCurrency(normalizedApplied)}`
            : texts.add}
          onClick={toggleEditor}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            normalizedApplied > 0
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <BadgePercent className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          disabled={baseAmount <= 0}
          aria-expanded={editing}
          aria-label={`${editing ? texts.close : normalizedApplied > 0 ? texts.edit : texts.add}: ${label}`}
          onClick={toggleEditor}
          className={cn(
            'text-[11px] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
            normalizedApplied > 0
              ? 'font-semibold text-primary'
              : 'font-medium text-muted-foreground hover:text-foreground',
          )}
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
            variant === 'line' && !iconOnly && 'min-w-[14rem]',
            iconOnly && 'absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg',
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
