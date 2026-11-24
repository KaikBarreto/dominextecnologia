import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Venda, compra e orçamento compartilham a mesma composição do atendimento. */
export function PdvCartWorkspaceHeader({ title, personSelector, onClose, closeLabel, disabled = false }: {
  title: string; personSelector: ReactNode; onClose: () => void; closeLabel: string; disabled?: boolean;
}) {
  return <div className="carthead"><div className="row between"><h3>{title}</h3><button type="button" className="iconbtn negative" disabled={disabled} aria-label={closeLabel} onClick={onClose}><X /></button></div><div className="clientrow">{personSelector}</div></div>;
}

export function PdvCartWorkspaceTotals({ subtotalLabel, subtotal, totalLabel, total, amountLabel, amount, beforeTotal, afterTotal, className, compact = false }: {
  subtotalLabel: string; subtotal: ReactNode; totalLabel: string; total: ReactNode;
  amountLabel?: string; amount?: ReactNode; beforeTotal?: ReactNode; afterTotal?: ReactNode; className?: string; compact?: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  return <div className={cn('cartsummary', className)} data-compact={compact || undefined}>
    {compact && <button type="button" className="cartsummarytoggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(open => !open)}><span>Conferir valores, descontos e créditos</span><ChevronDown className={expanded ? 'rotate-180' : undefined} /></button>}
    <div id={id} className="cartsummarydetails" hidden={compact && !expanded} onFocusCapture={() => setExpanded(true)}>
    <div className="sumline"><span>{subtotalLabel}</span><strong>{subtotal}</strong></div>
    {beforeTotal}
    <div className="sumline" style={{ marginTop: 13 }}><strong>{totalLabel}</strong><div className="flex min-w-0 flex-1 justify-end">{total}</div></div>
    {afterTotal}
    </div>
    {amount != null && <div className="total"><span style={{ fontSize: 12 }}>{amountLabel}</span><strong className="amount">{amount}</strong></div>}
  </div>;
}

export function PdvCartWorkspaceFooter({ amountLabel, amount, compact = false, children }: { amountLabel?: string; amount?: ReactNode; compact?: boolean; children: ReactNode }) {
  if (amount == null) return <div className="cartfooter">{children}</div>;
  return <div className="cartfooter" data-compact={compact || undefined}><div className="total"><span>{amountLabel}</span><strong className="amount">{amount}</strong></div><div className="cartactions">{children}</div></div>;
}
