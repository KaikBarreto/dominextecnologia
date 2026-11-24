import { useEffect, useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PdvCheckoutDisclosure({ label, value, children, forceOpen = false, className }: {
  label: string; value?: ReactNode; children: ReactNode; forceOpen?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(forceOpen);
  const reduceMotion = useReducedMotion();
  const id = useId();
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  return <section className={className}>
    <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-controls={id}
      className="grid w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-2 rounded-sm text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span>{label}</span><strong className="whitespace-nowrap text-right tabular-nums">{value}</strong><ChevronDown className={cn('h-4 w-4 transition-transform duration-300 motion-reduce:transition-none', open && 'rotate-180')} />
    </button>
    <AnimatePresence initial={false}>
      {open && <motion.div id={id} initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduceMotion ? undefined : { height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.34, ease: [0.25, 0.65, 0.25, 1] }} className="overflow-hidden">
        <div className="pt-3">{children}</div>
      </motion.div>}
    </AnimatePresence>
  </section>;
}
