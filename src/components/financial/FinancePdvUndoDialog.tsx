import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  pdvUndoErrorMessage,
  useFinancePdvUndo,
  usePdvUndoPlan,
} from '@/hooks/useFinancePdvUndo';

interface FinancePdvUndoDialogProps {
  /** Lançamento do PDV a desfazer. `null` fecha o diálogo. */
  transactionId: string | null;
  onClose: () => void;
}

/**
 * Confirmação de excluir, pelo Financeiro, um lançamento que veio do PDV.
 *
 * Igual ao "desfazer" do histórico do caixa: não pergunta "tem certeza?", ela
 * LISTA o que vai ser desfeito (estoque volta, gaveta, recebimentos), com o
 * plano calculado pelo servidor. Quando o servidor recusa (sem permissão,
 * fechamento de caixa, pós-venda), mostra o motivo dele e só deixa fechar.
 */
export function FinancePdvUndoDialog({ transactionId, onClose }: FinancePdvUndoDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.pdvUndo;
  const { toast } = useToast();
  const plan = usePdvUndoPlan(transactionId);
  const undo = useFinancePdvUndo();
  const [reason, setReason] = useState('');

  // Motivo não vaza de uma exclusão pra outra.
  useEffect(() => {
    setReason('');
  }, [transactionId]);

  const data = plan.data;
  const isSale = data?.path === 'cancel_order';
  const numberLabel = data?.orderNumber != null ? String(data.orderNumber) : '';
  const title = isSale && numberLabel
    ? t.titleSale.replace('{number}', numberLabel)
    : t.titleOther;
  const blocked = !!data && (!data.allowed || data.alreadyDone);
  const blockedMessage = data?.alreadyDone ? t.alreadyDone : data?.message;
  const trimmedReason = reason.trim();

  async function handleConfirm() {
    if (!transactionId || !trimmedReason) return;
    try {
      const result = await undo.mutateAsync({ transactionId, reason: trimmedReason });
      const doneTitle = result.action === 'order_cancelled'
        ? t.successSale.replace('{number}', result.orderNumber != null ? String(result.orderNumber) : numberLabel)
        : result.action === 'cash_event_reversed'
          ? t.successCash
          : t.successDeleted;
      toast({ title: doneTitle });
      onClose();
    } catch (error) {
      toast({ variant: 'destructive', title: t.errorTitle, description: pdvUndoErrorMessage(error) });
    }
  }

  return (
    <AlertDialog open={!!transactionId} onOpenChange={(open) => { if (!open && !undo.isPending) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{blocked ? t.blockedTitle : title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {plan.isLoading && (
                <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t.loading}</p>
              )}
              {plan.isError && <p>{pdvUndoErrorMessage(plan.error)}</p>}
              {data && blocked && <p>{blockedMessage}</p>}
              {data && !blocked && (
                <>
                  <p>{isSale ? t.introSale : t.introOther}</p>
                  <ul className="space-y-1.5">
                    {data.effects.map((effect) => (
                      <li key={effect} className="flex items-start gap-2 text-foreground">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <span>{t.effects[effect] ?? effect}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {data && !blocked && (
          <div className="space-y-1.5">
            <Label htmlFor="finance-pdv-undo-reason">{t.reasonLabel}</Label>
            <Input
              id="finance-pdv-undo-reason"
              value={reason}
              maxLength={500}
              placeholder={t.reasonPlaceholder}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={undo.isPending}>{blocked || !data ? t.close : t.back}</AlertDialogCancel>
          {data && !blocked && (
            <Button
              variant="destructive"
              disabled={!trimmedReason || undo.isPending}
              onClick={handleConfirm}
            >
              {undo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSale ? t.confirmSale : t.confirmOther}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
