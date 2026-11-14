import { Badge } from '@/components/ui/badge';
import type { PdvPreorderStatus } from '@/hooks/usePdvPreorders';

const STATUS: Record<
  PdvPreorderStatus,
  { label: string; variant: 'muted' | 'info' | 'success' | 'destructive' }
> = {
  edicao: { label: 'Em edição', variant: 'muted' },
  encaminhado: { label: 'No caixa', variant: 'info' },
  convertido: { label: 'Pedido criado', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
};

export function PdvPreorderStatusBadge({ status }: { status: PdvPreorderStatus }) {
  const current = STATUS[status];
  return <Badge variant={current.variant}>{current.label}</Badge>;
}
