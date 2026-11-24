import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PdvOrderCancelDialogProps {
  open: boolean;
  orderNumber: number | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string | null) => void;
}

export function PdvOrderCancelDialog({
  open,
  orderNumber,
  isPending,
  onOpenChange,
  onConfirm,
}: PdvOrderCancelDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open, orderNumber]);

  return <AlertDialog open={open} onOpenChange={next => { if (!isPending) onOpenChange(next); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive">
          <AlertTriangle className="h-5 w-5 text-white" />
        </span>
        <AlertDialogTitle>Cancelar o pedido #{orderNumber ?? ''}?</AlertDialogTitle>
        <AlertDialogDescription>
          O pedido continuará no histórico como cancelado. O estoque, o financeiro e o saldo do cliente serão estornados com segurança.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="pdv-order-cancel-reason">Motivo do cancelamento (opcional)</Label>
        <Input
          id="pdv-order-cancel-reason"
          value={reason}
          onChange={event => setReason(event.target.value)}
          placeholder="Ex.: pedido lançado em duplicidade"
          maxLength={200}
          autoComplete="off"
        />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>Manter pedido</AlertDialogCancel>
        <AlertDialogAction
          className="bg-destructive text-white hover:bg-destructive/90"
          disabled={isPending}
          onClick={event => {
            event.preventDefault();
            onConfirm(reason.trim() || null);
          }}
        >
          {isPending ? 'Cancelando…' : 'Cancelar pedido'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
