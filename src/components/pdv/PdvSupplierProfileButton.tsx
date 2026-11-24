import { useState } from 'react';
import type { Supplier } from '@/hooks/useSuppliers';
import { SupplierDetailDialog } from '@/components/customers/SupplierDetailDialog';
import { PdvPartyProfileButton } from './PdvPartyProfileButton';

export function PdvSupplierProfileButton({ supplier, disabled = false, onOpenChange }: { supplier?: Supplier; disabled?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  function changeOpen(next: boolean) { setOpen(next); onOpenChange?.(next); }
  return <>
    <PdvPartyProfileButton label="Ver ficha do fornecedor" disabled={disabled || !supplier} onClick={() => changeOpen(true)} />
    {open && supplier && <SupplierDetailDialog supplier={supplier} open={open} onOpenChange={changeOpen} />}
  </>;
}
