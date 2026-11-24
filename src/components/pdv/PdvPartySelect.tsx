import { useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { Check, ChevronDown, Plus, UserRound } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { SearchableSelectOption } from '@/components/ui/SearchableSelect';
import { searchableSelectFilter } from '@/components/ui/searchableSelectFilter';
import { cn } from '@/lib/utils';
import './PdvPartySelect.css';

export interface PdvPartySelectOption extends SearchableSelectOption {
  detail?: string;
}

export interface PdvPartySelectProps {
  id?: string;
  value?: string;
  options: readonly PdvPartySelectOption[];
  label: string;
  placeholder: string;
  searchLabel: string;
  searchPlaceholder: string;
  listLabel: string;
  emptyMessage: string;
  createLabel: string;
  onValueChange: (value: string) => void;
  /** O dono da entidade decide qual cadastro abrir; este controle não persiste dados. */
  onCreate: (query: string) => void;
  disabled?: boolean;
  className?: string;
  triggerRef?: Ref<HTMLButtonElement>;
}

/** O mesmo seletor inline do balcão para cliente e fornecedor. */
export function PdvPartySelect({ id, value, options, label, placeholder, searchLabel, searchPlaceholder, listLabel, emptyMessage, createLabel, onValueChange, onCreate, disabled = false, className, triggerRef }: PdvPartySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const localTriggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useImperativeHandle(triggerRef, () => localTriggerRef.current);
  const reduceMotion = useReducedMotion();
  const filtered = options.filter(option => searchableSelectFilter(option.label, query, [option.sublabel ?? '', option.detail ?? '', ...(option.keywords ?? [])]) > 0);

  useEffect(() => {
    if (!open) return;
    if (disabled) { setOpen(false); return; }
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open, disabled]);

  function close() {
    setOpen(false);
    setQuery('');
    localTriggerRef.current?.focus();
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)) return;
    const buttons = Array.from(optionsRef.current?.querySelectorAll<HTMLButtonElement>('[data-party-option]') ?? []);
    const targetIndex = buttons.indexOf(event.target as HTMLButtonElement);
    if (targetIndex < 0 && ['Home', 'End'].includes(event.key)) return;
    if (event.key === 'Enter') {
      if (event.target === searchRef.current && buttons[0]) { event.preventDefault(); buttons[0].click(); }
      return;
    }
    if (!buttons.length) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : targetIndex < 0 ? (event.key === 'ArrowUp' ? buttons.length - 1 : 0)
      : (targetIndex + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
    buttons[index]?.scrollIntoView?.({ block: 'nearest' });
  }
  return <div className={cn('pdv-party-select min-w-0 flex-1', className)}>
    <button ref={localTriggerRef} id={id} type="button" role="combobox" className="clientselect clienttrigger w-full" aria-expanded={open} aria-haspopup="listbox" aria-controls={listId} disabled={disabled} onClick={() => { if (open) close(); else { setQuery(''); setOpen(true); } }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
      <UserRound aria-hidden="true" /><span className="grow"><small>{label}</small><strong>{options.find(option => option.value === value)?.label || placeholder}</strong></span><ChevronDown aria-hidden="true" />
    </button>
    <AnimatePresence initial={false}>{open && !disabled && <motion.div className="clientoptions" initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.34 }} style={{ overflow: 'hidden' }} onKeyDown={keyDown}>
      <input ref={searchRef} type="search" aria-label={searchLabel} placeholder={searchPlaceholder} value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" name={'pdv-busca-pessoa-' + (id || listId)} data-1p-ignore data-lpignore="true" />
      <div className="client-results" ref={optionsRef}><div id={listId} role="listbox" aria-label={listLabel}>{filtered.map(option => <button type="button" key={option.value} className="optionrow" role="option" aria-selected={option.value === value} data-party-option onClick={() => { onValueChange(option.value); close(); }}><div className="grow"><strong>{option.label}</strong>{option.sublabel && <small>{option.sublabel}</small>}{option.detail && <small>{option.detail}</small>}{option.suffix}</div>{option.value === value && <Check aria-hidden="true" />}</button>)}{!filtered.length && <small>{emptyMessage}</small>}</div></div>
      <button type="button" className="optionrow" onClick={() => { setOpen(false); onCreate(query); }}><Plus aria-hidden="true" /><span>{createLabel}</span></button>
    </motion.div>}</AnimatePresence>
  </div>;
}
