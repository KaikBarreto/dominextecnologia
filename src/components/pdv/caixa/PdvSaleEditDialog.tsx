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
import type { PdvLedgerEntry } from '@/lib/pdv/cash';
import type { pdv } from '@/lib/i18n/messages/app/pdv';

type HistoryTexts = (typeof pdv)['pt-br']['cashPanel']['history'];

interface PdvSaleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  texts: HistoryTexts;
  entry: PdvLedgerEntry | null;
  isPending: boolean;
  onConfirm: () => void;
}

/** Confirma o estorno necessário antes de abrir a venda preenchida no PDV. */
export function PdvSaleEditDialog({
  open,
  onOpenChange,
  texts,
  entry,
  isPending,
  onConfirm,
}: PdvSaleEditDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex justify-center sm:justify-start">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-warning">
              <AlertTriangle className="h-5 w-5 text-warning-foreground" />
            </span>
          </div>
          <AlertDialogTitle>
            {texts.editSaleTitle.replace('{reference}', entry?.reference ?? '')}
          </AlertDialogTitle>
          <AlertDialogDescription>{texts.editSaleDescription}</AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="space-y-1.5 text-sm">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            <span>{texts.editSaleEffectReversal}</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            <span>{texts.editSaleEffectDraft}</span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
            <span>{texts.editSaleEffectPayment}</span>
          </li>
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{texts.editSaleCancel}</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={(event) => {
            event.preventDefault();
            onConfirm();
          }}>
            {isPending ? texts.editSalePreparing : texts.editSaleConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
