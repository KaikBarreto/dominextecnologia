import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useFinancialSmartFill, type FinancialPattern, type SmartFillValues } from '@/hooks/useFinancialSmartFill';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

type Props = {
  value: string; onChange: (value: string) => void; id?: string; placeholder?: string; multiline?: boolean;
  enabled: boolean; disabled?: boolean; scope?: 'tenant' | 'admin'; context: 'bill' | 'movement'; direction: 'entrada' | 'saida';
  values: SmartFillValues; onPatch: (patch: SmartFillValues) => void; onApplied: () => void;
  replaceableKeys?: string[]; allowedValues?: Record<string, string[]>;
};
export function FinancialSmartDescription(props: Props) {
  const { locale } = useAppLocaleContext();
  const copy = MESSAGES[locale].app.finance.smartFill;
  const generatedId = useId(); const listId = `${generatedId}-patterns`;
  const input = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const { patterns, loading } = useFinancialSmartFill({ ...props, prefix: props.value });
  const [focused, setFocused] = useState(false); const [closed, setClosed] = useState(false); const [active, setActive] = useState(0);
  const [applied, setApplied] = useState<{ before: SmartFillValues; after: SmartFillValues } | null>(null);
  const previous = useRef(props.values); const manual = useRef(new Set<string>()); const automatic = useRef<SmartFillValues>({});
  const valuesKey = JSON.stringify(props.values);
  useEffect(() => {
    for (const key of Object.keys(props.values)) {
      if (previous.current[key] !== props.values[key] && automatic.current[key] !== props.values[key]) manual.current.add(key);
    }
    previous.current = props.values; automatic.current = {};
    if (applied && Object.keys(applied.after).some(key => props.values[key] !== applied.after[key])) setApplied(null);
  }, [valuesKey]); // The form owns its values; this observes edits without changing them.
  useEffect(() => { setClosed(false); setActive(0); }, [props.value, props.direction]);
  useEffect(() => { if (props.enabled) { const timer = setTimeout(() => input.current?.focus(), 30); return () => clearTimeout(timer); } }, [props.enabled]);
  const visible = props.enabled && focused && !closed && patterns.length > 0 && !applied;
  const selected = Math.min(active, patterns.length - 1);
  function apply(pattern: FinancialPattern) {
    const before: SmartFillValues = {}, after: SmartFillValues = {};
    const accountIsAllowed = !pattern.account_id || !props.allowedValues?.account_id || props.allowedValues.account_id.includes(pattern.account_id);
    for (const key of Object.keys(props.values)) {
      const value = pattern[key as keyof FinancialPattern];
      const replaceable = props.replaceableKeys?.includes(key) && !manual.current.has(key);
      const allowed = !props.allowedValues?.[key] || (typeof value === 'string' && props.allowedValues[key].includes(value));
      const coupledPaymentAllowed = key !== 'payment_method' || accountIsAllowed;
      if ((!props.values[key] || replaceable) && !manual.current.has(key) && allowed && coupledPaymentAllowed && typeof value === 'string' && value) {
        before[key] = props.values[key]; after[key] = value;
      }
    }
    if (Object.keys(after).length) { automatic.current = after; props.onPatch(after); setApplied({ before, after }); }
    setClosed(true); props.onApplied();
  }
  function keyDown(event: React.KeyboardEvent) {
    if (!visible || event.shiftKey) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setActive((selected + (event.key === 'ArrowDown' ? 1 : patterns.length - 1)) % patterns.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault(); apply(patterns[selected]);
    } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setClosed(true); }
  }
  const inputProps = {
    id: props.id, value: props.value, placeholder: props.placeholder, disabled: props.disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => props.onChange(event.target.value),
    onFocus: () => setFocused(true), onBlur: () => setFocused(false), onKeyDown: keyDown,
    'aria-label': props.placeholder, role: 'combobox', 'aria-autocomplete': 'list' as const, 'aria-expanded': visible,
    'aria-controls': visible ? listId : undefined, 'aria-activedescendant': visible ? `${listId}-${selected}` : undefined,
  };
  return <div className="space-y-2">
    {props.multiline ? <Textarea {...inputProps} rows={2} ref={node => { input.current = node; }} /> : <Input {...inputProps} ref={node => { input.current = node; }} />}
    {loading && <span role="status" className="sr-only">{copy.loading}</span>}
    {visible && <ul id={listId} role="listbox" aria-label={copy.patterns} className="space-y-1 rounded-md border p-2">
      {patterns.map((pattern, index) => <li id={`${listId}-${index}`} key={`${pattern.description}-${index}`} role="option" aria-selected={selected === index}
        className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-1.5 ${selected === index ? 'bg-muted' : ''}`}>
        <div className="min-w-0 text-sm"><p className="break-words font-medium">{pattern.description}</p>
          <p className="break-words text-xs text-muted-foreground">{[
            pattern.party_label || pattern.counterparty,
            pattern.category_label,
            pattern.cost_center_label,
            pattern.account_label,
            pattern.payment_method === 'pix' ? 'Pix' : pattern.payment_method === 'transferencia' ? 'Transferência' : pattern.payment_method === 'boleto' ? 'Boleto' : pattern.payment_method === 'cheque' ? 'Cheque' : pattern.payment_method === 'dinheiro' ? 'Dinheiro' : pattern.payment_method === 'cartao_debito' ? 'Cartão de débito' : pattern.payment_method === 'cartao_credito' ? 'Cartão de crédito' : null,
          ].filter(Boolean).join(' · ')}</p>
          <p className="text-xs text-muted-foreground">{copy.used.replace('{count}', String(pattern.uses))} · {new Date(pattern.last_used).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onMouseDown={event => event.preventDefault()} onClick={() => apply(pattern)}>{copy.apply}</Button>
      </li>)}
    </ul>}
    {applied && <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{copy.applied}
      <button type="button" className="underline" onClick={() => { automatic.current = applied.before; props.onPatch(applied.before); setApplied(null); }}>{copy.undo}</button>
    </div>}
    <span className="sr-only" aria-live="polite">{visible ? copy.available.replace('{count}', String(patterns.length)) : ''}</span>
  </div>;
}
