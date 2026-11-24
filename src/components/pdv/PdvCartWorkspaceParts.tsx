import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Venda, compra e orçamento compartilham a mesma composição do atendimento. */
export function PdvCartWorkspaceHeader({ title, personSelector, onClose, closeLabel, disabled = false }: {
  title: string; personSelector: ReactNode; onClose: () => void; closeLabel: string; disabled?: boolean;
}) {
  return <div className="carthead"><div className="row between"><h3>{title}</h3><button type="button" className="iconbtn negative" disabled={disabled} aria-label={closeLabel} onClick={onClose}><X /></button></div><div className="clientrow">{personSelector}</div></div>;
}

export function PdvCartWorkspaceTotals({ subtotalLabel, subtotal, totalLabel, total, amountLabel, amount, beforeTotal, afterTotal, className }: {
  subtotalLabel: string; subtotal: ReactNode; totalLabel: string; total: ReactNode;
  amountLabel: string; amount: ReactNode; beforeTotal?: ReactNode; afterTotal?: ReactNode; className?: string;
}) {
  return <div className={cn('cartsummary', className)}>
    <div className="sumline"><span>{subtotalLabel}</span><strong>{subtotal}</strong></div>
    {beforeTotal}
    <div className="sumline" style={{ marginTop: 13 }}><strong>{totalLabel}</strong><div className="flex min-w-0 flex-1 justify-end">{total}</div></div>
    {afterTotal}
    <div className="total"><span style={{ fontSize: 12 }}>{amountLabel}</span><strong className="amount">{amount}</strong></div>
  </div>;
}

export function PdvCartWorkspaceFooter({ children }: { children: ReactNode }) {
  return <div className="cartfooter">{children}</div>;
}
