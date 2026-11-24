import { usePdvReturnPending } from '@/hooks/usePdvReturnIntent';
import { useEffect, useState } from 'react';
import { Ban, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PdvReturnDialog } from './PdvReturnDialog';
import { PdvCancelResidualDialog } from './PdvCancelResidualDialog';
import { PdvReturnHistory } from './PdvReturnHistory';
import { usePdvReturnWorkspace } from '@/hooks/usePdvReturns';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

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
  const [returnSessionKey, setReturnSessionKey] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const pendingReturn = usePdvReturnPending(orderId, access.enabled && access.canReturn);
  const scope = usePdvAuthorizedQueryScope();
  const returnScopeKey = JSON.stringify([scope.key, orderId]);
  const workspace = usePdvReturnWorkspace(orderId, access.enabled && (access.canReturn || access.canReverse || access.canCancelResidual));
  const returnContextAvailable = scope.ready && access.enabled && access.canReturn && !workspace.isLoading && !workspace.isError && workspace.data?.orderId === orderId;
  const returnOpen = returnContextAvailable && returnSessionKey === returnScopeKey;

  useEffect(() => {
    setReturnSessionKey(current => returnContextAvailable && current === returnScopeKey ? current : null);
  }, [returnContextAvailable, returnScopeKey]);

  if (!scope.ready || !access.enabled || (!access.canReturn && !access.canReverse && !access.canCancelResidual)) return null;
  if (workspace.isLoading) return <div className="flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando devoluções…</div>;
  if (workspace.isError || !workspace.data || workspace.data.orderId !== orderId) return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><span className="text-sm font-semibold">Não foi possível carregar as devoluções deste pedido.</span><Button size="sm" variant="outline" onClick={() => void workspace.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></div>;

  const returnable = workspace.data.items.some((item) => item.returnableQuantity > 0);
  const completed = () => { void workspace.refetch(); onReload(); };
  return <div className="space-y-5 border-t pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Pós-venda do pedido</h3><p className="text-sm text-muted-foreground">Ações comerciais separadas de pagamento, reembolso e troca.</p></div><div className="flex flex-wrap gap-2">{access.canReturn && (returnable || pendingReturn.pending) && <Button variant="outline" onClick={() => setReturnSessionKey(returnScopeKey)}><RotateCcw className="mr-2 h-4 w-4" />{pendingReturn.pending ? 'Conferir devolução pendente' : 'Devolver itens'}</Button>}{access.canCancelResidual && remainingQuantity > 0 && <Button variant="outline" onClick={() => setCancelOpen(true)}><Ban className="mr-2 h-4 w-4" />Cancelar saldo não entregue</Button>}</div></div>
    <PdvReturnHistory orderId={orderId} entries={workspace.data.history} canReverse={access.canReverse} onCompleted={completed} />
    {access.canReturn && (returnable || returnOpen || pendingReturn.pending) && <PdvReturnDialog key={returnScopeKey} open={returnOpen} onOpenChange={next => setReturnSessionKey(next ? returnScopeKey : null)} workspace={workspace.data} canBackdate={access.canBackdate} onCompleted={completed} />}
    {access.canCancelResidual && remainingQuantity > 0 && <PdvCancelResidualDialog open={cancelOpen} onOpenChange={setCancelOpen} orderId={orderId} orderNumber={orderNumber} remainingQuantity={remainingQuantity} onCompleted={completed} />}
  </div>;
}
