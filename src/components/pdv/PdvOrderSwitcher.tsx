import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, ListFilter, Plus, ShoppingCart, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import './PdvOrderSwitcher.css';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export interface PdvOrderSwitcherItem {
  id: string;
  code: string;
  customer: string;
  total: number;
  itemCount: number;
  hasContent: boolean;
  editing?: boolean;
}
interface PdvOrderSwitcherTexts {
  number: string; value: string; customer: string; newOrder: string;
  unnamedCustomer: string; editBadge: string; deleteLabel: string;
  deleteTitle: string; deleteDescription: string; keepOrder: string;
  confirmDelete: string; productsShort?: string;
}
interface PdvOrderSwitcherProps {
  orders: PdvOrderSwitcherItem[];
  activeId: string;
  formatCurrency: (value: number) => string;
  texts: PdvOrderSwitcherTexts;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  /** Reorganiza os mesmos rascunhos; nunca troca conteúdo ou identidade. */
  onReorder?: (ids: string[]) => void;
  /** Preferência visual, escopada pelo chamador a empresa/usuário/caixa. */
  orderPreferenceKey?: string;
  disabled?: boolean;
  operationLabel?: string;
  embedded?: boolean;
  header?: boolean;
}

export function PdvOrderSwitcher({
  orders, activeId, formatCurrency, texts, onSelect, onCreate, onDelete,
  onReorder, orderPreferenceKey, disabled, operationLabel = 'Venda', embedded = false, header = false,
}: PdvOrderSwitcherProps) {
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);
  const [pendingDelete, setPendingDelete] = useState<PdvOrderSwitcherItem | null>(null);
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const previousOrders = useRef({ scope: orderPreferenceKey, ids: new Set(orders.map(order => order.id)) });
  const orderIdentity = JSON.stringify(orders.map(order => order.id));
  useLayoutEffect(() => {
    const ids = JSON.parse(orderIdentity) as string[];
    const previous = previousOrders.current;
    const added = previous.scope === orderPreferenceKey ? ids.filter(id => !previous.ids.has(id)) : [];
    previousOrders.current = { scope: orderPreferenceKey, ids: new Set(ids) };
    if (added.length !== 1) {
      setEnteringIds(current => current.size ? new Set() : current);
      return;
    }
    setEnteringIds(new Set(added));
    const timer = window.setTimeout(() => setEnteringIds(new Set()), 180);
    return () => window.clearTimeout(timer);
  }, [orderIdentity, orderPreferenceKey]);
  const storedOrder = useMemo(() => {
    if (!orderPreferenceKey || typeof window === 'undefined') return [] as string[];
    try { const value: unknown = JSON.parse(localStorage.getItem(orderPreferenceKey) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return [] as string[]; }
  }, [orderPreferenceKey]);
  const [localOrder, setLocalOrder] = useState<{ key: string | undefined; ids: string[] }>({ key: orderPreferenceKey, ids: storedOrder });
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [overflow, setOverflow] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedFromList = useRef(false);
  const draggedId = useRef<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const ordered = useMemo(() => {
    const ids = localOrder.key === orderPreferenceKey ? localOrder.ids : storedOrder;
    const positions = new Map(ids.map((id, index) => [id, index]));
    return orders.map((order, index) => ({ order, position: positions.get(order.id) ?? ids.length + index }))
      .sort((a, b) => a.position - b.position).map(({ order }) => order);
  }, [localOrder, orderPreferenceKey, orders, storedOrder]);


  const selectedId = orders.some(order => order.id === activeId) ? activeId : ordered[0]?.id;
  const tabSignature = ordered.map(order => `${order.id}:${order.customer}:${order.code}:${order.total}`).join('|');
  const moveStrip = useCallback((left: number) => {
    const strip = stripRef.current;
    if (!strip) return;
    const next = Math.max(0, Math.min(left, strip.scrollWidth - strip.clientWidth));
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (typeof strip.scrollTo === 'function') strip.scrollTo({ left: next, behavior: reduced ? 'auto' : 'smooth' });
    else strip.scrollLeft = next;
  }, []);
  const reveal = useCallback((id: string | undefined) => {
    const strip = stripRef.current;
    const tab = id ? tabRefs.current.get(id)?.parentElement : null;
    if (!strip || !tab || !strip.clientWidth) return;
    const bounds = strip.getBoundingClientRect(), item = tab.getBoundingClientRect();
    if (item.left < bounds.left) moveStrip(strip.scrollLeft + item.left - bounds.left);
    else if (item.right > bounds.right) moveStrip(strip.scrollLeft + item.right - bounds.right);
  }, [moveStrip]);
  const updateEdges = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const next = { start: strip.scrollLeft <= 1, end: strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1 };
    setEdges(current => current.start === next.start && current.end === next.end ? current : next);
  }, []);
  useLayoutEffect(() => {
    const root = rootRef.current, strip = stripRef.current;
    if (!root || !strip) return;
    const measure = () => {
      const style = getComputedStyle(root);
      const available = root.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
        - (newRef.current?.offsetWidth || 36) - 8;
      // Measure against the space available WITHOUT overflow-only controls, avoiding a sticky overflow state.
      const next = root.clientWidth > 0 && strip.scrollWidth > available + 1;
      setOverflow(next);
      if (!next && strip.scrollLeft) strip.scrollLeft = 0;
      updateEdges();
      reveal(selectedId);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root); observer?.observe(strip);
    tabRefs.current.forEach(tab => observer?.observe(tab));
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [tabSignature, selectedId, orderPreferenceKey, reveal, updateEdges]);
  useLayoutEffect(() => { reveal(selectedId); updateEdges(); }, [overflow, selectedId, reveal, updateEdges]);
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const filteredOrders = ordered.filter(order => normalize(`${order.customer || texts.unnamedCustomer} ${order.code}`).includes(normalize(query.trim())));

  function reorder(source: string, target: string) {
    if (disabled || source === target) return;
    const ids = ordered.map(order => order.id);
    const from = ids.indexOf(source), to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1); ids.splice(to, 0, source);
    setLocalOrder({ key: orderPreferenceKey, ids });
    if (orderPreferenceKey) { try { localStorage.setItem(orderPreferenceKey, JSON.stringify(ids)); } catch { /* Preferência opcional; o atendimento continua em memória. */ } }
    onReorder?.(ids);
  }
  function requestDelete(order: PdvOrderSwitcherItem) {
    if (disabled) return;
    if (order.hasContent) setPendingDelete(order);
    else onDelete(order.id);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (disabled || event.nativeEvent.isComposing || event.repeat || event.ctrlKey || event.metaKey || (event.altKey && !event.shiftKey)) return;
    const index = ordered.findIndex(order => order.id === id);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % ordered.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + ordered.length) % ordered.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ordered.length - 1;
    else return;
    event.preventDefault(); event.stopPropagation();
    if (event.altKey && event.shiftKey) reorder(id, ordered[next].id);
    else { onSelect(ordered[next].id); tabRefs.current.get(ordered[next].id)?.focus({ preventScroll: true }); reveal(ordered[next].id); }
  }

  return <>
    <div ref={rootRef} className="pdv-order-switcher" data-overflow={overflow || undefined} data-embedded={embedded || undefined} data-header={header || undefined}>
      {overflow && <button type="button" className="pdv-order-scroll" disabled={disabled || edges.start} aria-label="Ver atendimentos anteriores" aria-controls={listId}
        onClick={() => moveStrip((stripRef.current?.scrollLeft || 0) - (stripRef.current?.clientWidth || 0) * .8)}><ChevronLeft /></button>}
      <div ref={stripRef} id={listId} className="pdv-order-strip" role="tablist" aria-label="Pedidos em atendimento" onScroll={updateEdges}>
        {ordered.map(order => {
          const active = order.id === selectedId;
          const person = order.customer || texts.unnamedCustomer;
          return <div key={order.id} draggable={!disabled} data-order-id={order.id} data-selected={active || undefined} data-entering={enteringIds.has(order.id) || undefined}
            onDragStart={event => { draggedId.current = order.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', order.id); }}
            onDragOver={event => { if (!disabled) event.preventDefault(); }}
            onDragEnd={() => { draggedId.current = null; }}
            onDrop={event => { event.preventDefault(); const source = draggedId.current; if (source) reorder(source, order.id); draggedId.current = null; }}
            className="pdv-order-tabwrap">
            <button ref={node => { if (node) tabRefs.current.set(order.id, node); else tabRefs.current.delete(order.id); }}
              type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} disabled={disabled}
              aria-label={person + ', ' + order.code + ', ' + formatCurrency(order.total)}
              onClick={() => onSelect(order.id)} onKeyDown={event => navigate(event, order.id)}
              className={cn('pdv-order-tab', active && 'is-selected')}>
              <ShoppingCart />
              <span className="pdv-order-identity"><strong>{person}</strong><small>{order.code} · {order.editing ? texts.editBadge : operationLabel}</small></span>
              <strong className="pdv-order-amount">{formatCurrency(order.total)}</strong>
            </button>
            <Tooltip delayDuration={100}><TooltipTrigger asChild><button type="button" disabled={disabled} onClick={() => requestDelete(order)} aria-label={texts.deleteLabel + ': ' + order.code}
              className="pdv-order-close"><X /></button></TooltipTrigger><TooltipContent>Fechar atendimento</TooltipContent></Tooltip>
          </div>;
        })}
      </div>
      <div className="pdv-order-tools">
        {overflow && <button type="button" className="pdv-order-scroll" disabled={disabled || edges.end} aria-label="Ver próximos atendimentos" aria-controls={listId}
          onClick={() => moveStrip((stripRef.current?.scrollLeft || 0) + (stripRef.current?.clientWidth || 0) * .8)}><ChevronRight /></button>}
        <Tooltip delayDuration={100}><TooltipTrigger asChild><button ref={newRef} type="button" disabled={disabled} className="pdv-order-new" onClick={onCreate} aria-label={texts.newOrder}><Plus /></button></TooltipTrigger><TooltipContent>{texts.newOrder}</TooltipContent></Tooltip>
        {overflow && <Popover open={listOpen} onOpenChange={open => { setListOpen(open); if (open) { setQuery(''); selectedFromList.current = false; } }}>
          <Tooltip delayDuration={100}><TooltipTrigger asChild><PopoverTrigger asChild><button type="button" disabled={disabled} className="pdv-order-list-trigger" aria-label={`Ver ${ordered.length} atendimentos abertos`}><ListFilter /><span>{ordered.length}</span></button></PopoverTrigger></TooltipTrigger><TooltipContent>Buscar atendimento aberto</TooltipContent></Tooltip>
          <PopoverContent align="end" className="pdv-order-popover" onCloseAutoFocus={event => { if (selectedFromList.current) { event.preventDefault(); selectedFromList.current = false; } }}>
            <Command shouldFilter={false} label="Buscar atendimento por cliente ou código">
              <CommandInput aria-label="Buscar atendimento por cliente ou código" placeholder="Buscar cliente ou código…" value={query} onValueChange={setQuery} />
              <CommandList label="Atendimentos abertos">
                {!filteredOrders.length && <p className="pdv-order-list-empty">Nenhum atendimento encontrado.</p>}
                {filteredOrders.map(order => <CommandItem key={order.id} value={order.id} className="pdv-order-list-item" disabled={disabled} onSelect={() => {
                  if (disabled) return;
                  selectedFromList.current = true; onSelect(order.id); reveal(order.id); setListOpen(false);
                }}>
                  <span className="pdv-order-list-person"><strong>{order.customer || texts.unnamedCustomer}</strong><small>{order.code}{order.editing ? ` · ${texts.editBadge}` : ''}</small></span>
                  <strong className="pdv-order-list-amount">{formatCurrency(order.total)}</strong>
                  {order.id === selectedId && <Check aria-label="Atendimento atual" className="pdv-order-list-check" />}
                </CommandItem>)}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>}
      </div>
    </div>
    <AlertDialog open={!!pendingDelete} onOpenChange={next => { if (!next) setPendingDelete(null); }}>
      <AlertDialogContent onOpenAutoFocus={event => { event.preventDefault(); confirmDeleteRef.current?.focus(); }}><AlertDialogHeader><AlertDialogTitle>{texts.deleteTitle}</AlertDialogTitle><AlertDialogDescription>{texts.deleteDescription}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{texts.keepOrder}</AlertDialogCancel><AlertDialogAction ref={confirmDeleteRef} disabled={disabled} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (pendingDelete) onDelete(pendingDelete.id); setPendingDelete(null); }}>{texts.confirmDelete}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
