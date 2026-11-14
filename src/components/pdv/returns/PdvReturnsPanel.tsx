import { useState } from 'react';
import { Ban, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PdvReturnDialog } from './PdvReturnDialog';
import { PdvCancelResidualDialog } from './PdvCancelResidualDialog';
import { PdvReturnHistory } from './PdvReturnHistory';
import { usePdvReturnWorkspace } from '@/hooks/usePdvReturns';

export interface PdvReturnsAccess {
  enabled: boolean;
  canReturn: boolean;
  canReverse: boolean;
  canCancelResidual: boolean;
  canBackdate: boolean;
}

export function PdvReturnsPanel({ orderId, orderNumber, remainingQuantity, access, onReload }: {
  orderId: string;
  orderNumber: number;
  remainingQuantity: number;
  access: PdvReturnsAccess;
  onReload: () => void;
}) {
  const [returnOpen, setReturnOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const workspace = usePdvReturnWorkspace(orderId, access.enabled && (access.canReturn || access.canReverse || access.canCancelResidual));

  if (!access.enabled || (!access.canReturn && !access.canReverse && !access.canCancelResidual)) return null;
  if (workspace.isLoading) return <div className="flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando devoluções…</div>;
  if (workspace.isError || !workspace.data) return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><span className="text-sm font-semibold">Não foi possível carregar as devoluções deste pedido.</span><Button size="sm" variant="outline" onClick={() => void workspace.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></div>;

  const returnable = workspace.data.items.some((item) => item.returnableQuantity > 0);
  const completed = () => { void workspace.refetch(); onReload(); };
  return <div className="space-y-5 border-t pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Pós-venda do pedido</h3><p className="text-sm text-muted-foreground">Ações comerciais separadas de pagamento, reembolso e troca.</p></div><div className="flex flex-wrap gap-2">{access.canReturn && returnable && <Button variant="outline" onClick={() => setReturnOpen(true)}><RotateCcw className="mr-2 h-4 w-4" />Devolver itens</Button>}{access.canCancelResidual && remainingQuantity > 0 && <Button variant="outline" onClick={() => setCancelOpen(true)}><Ban className="mr-2 h-4 w-4" />Cancelar saldo não entregue</Button>}</div></div>
    <PdvReturnHistory orderId={orderId} entries={workspace.data.history} canReverse={access.canReverse} onCompleted={completed} />
    {access.canReturn && returnable && <PdvReturnDialog open={returnOpen} onOpenChange={setReturnOpen} workspace={workspace.data} canBackdate={access.canBackdate} onCompleted={completed} />}
    {access.canCancelResidual && remainingQuantity > 0 && <PdvCancelResidualDialog open={cancelOpen} onOpenChange={setCancelOpen} orderId={orderId} orderNumber={orderNumber} remainingQuantity={remainingQuantity} onCompleted={completed} />}
  </div>;
}
