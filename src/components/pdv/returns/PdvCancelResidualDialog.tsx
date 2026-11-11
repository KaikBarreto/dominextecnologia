import { useRef, useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { stablePdvReturnAttempt, usePdvCancelResidual, type PdvStableAttempt } from '@/hooks/usePdvReturns';
import { useToast } from '@/hooks/use-toast';

export function PdvCancelResidualDialog({ open, onOpenChange, orderId, orderNumber, remainingQuantity, onCompleted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: number;
  remainingQuantity: number;
  onCompleted?: () => void;
}) {
  const { toast } = useToast();
  const mutation = usePdvCancelResidual();
  const [reason, setReason] = useState('');
  const attempt = useRef<PdvStableAttempt | null>(null);

  async function submit() {
    const signature = JSON.stringify({ orderId, reason: reason.trim() });
    attempt.current = stablePdvReturnAttempt(attempt.current, signature, () => crypto.randomUUID());
    try {
      await mutation.mutateAsync({ orderId, reason, attemptId: attempt.current.id });
      toast({ title: 'Saldo não entregue cancelado', description: 'As reservas restantes foram liberadas. Itens já entregues foram preservados.' });
      onOpenChange(false);
      onCompleted?.();
    } catch (error) {
      toast({ title: 'Saldo não cancelado', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    }
  }

  return <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Cancelar saldo não entregue" description={`Pedido #${orderNumber} · ${remainingQuantity} unidade(s) ainda não entregue(s).`} footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button><Button variant="destructive" onClick={() => void submit()} disabled={!reason.trim() || mutation.isPending}>{mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}Cancelar somente o saldo</Button></div>}>
    <div className="space-y-4 py-3"><NoticeBanner variant="warning">Itens já entregues não serão alterados. Esta ação também não estorna pagamentos.</NoticeBanner><label className="space-y-1 text-sm font-medium">Motivo<Textarea aria-label="Motivo do cancelamento do saldo" maxLength={500} value={reason} onChange={(event) => { setReason(event.target.value); attempt.current = null; }} placeholder="Ex.: cliente desistiu do restante" /></label></div>
  </ResponsiveDialog>;
}
