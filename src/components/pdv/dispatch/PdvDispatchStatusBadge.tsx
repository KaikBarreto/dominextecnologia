import { Badge } from '@/components/ui/badge';
import type { PdvDispatchStatus } from '@/hooks/usePdvDispatch';

const META: Record<PdvDispatchStatus, { label: string; className: string }> = {
  liberado_retirada: { label: 'Liberado', className: 'bg-blue-600 text-white hover:bg-blue-600' },
  retirada_parcial: { label: 'Parcial', className: 'bg-amber-600 text-white hover:bg-amber-600' },
  entregue: { label: 'Entregue', className: 'bg-emerald-600 text-white hover:bg-emerald-600' },
};

export function PdvDispatchStatusBadge({ status }: { status: PdvDispatchStatus }) {
  const meta = META[status];
  return <Badge className={meta.className}>{meta.label}</Badge>;
}
