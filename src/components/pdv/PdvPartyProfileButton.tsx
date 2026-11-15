import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Fica fora do seletor e preserva seu espaço mesmo sem pessoa selecionada. */
export function PdvPartyProfileButton({ label, disabled = false, onClick }: { label: string; disabled?: boolean; onClick?: () => void }) {
  return <Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick} className="mt-0.5 shrink-0"><Info className="h-4 w-4" /></Button>;
}
