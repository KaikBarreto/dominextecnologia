import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FileText, Receipt } from 'lucide-react';
import type { FinancialTransaction } from '@/types/database';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface RelatedTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The transaction the user clicked to delete */
  transaction: FinancialTransaction | null;
  /** All related transactions (parent OR siblings/children) */
  related: FinancialTransaction[];
  /** Optional linked quote info */
  linkedQuote?: { id: string; quote_number: number } | null;
  /** mode: delete or unmark */
  mode: 'delete' | 'unmark';
  /** Confirmed: true = delete/unmark all related ; false = only this one */
  onConfirm: (deleteAllRelated: boolean) => void | Promise<void>;
  isProcessing?: boolean;
}

export function RelatedTransactionsDialog({
  open, onOpenChange, transaction, related, linkedQuote, mode, onConfirm, isProcessing,
}: RelatedTransactionsDialogProps) {
  if (!transaction) return null;
  const hasRelated = related.length > 0 || !!linkedQuote;

  if (!hasRelated) {
    // No related — simple confirmation
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === 'delete' ? 'Excluir movimentação?' : 'Desmarcar como pago?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === 'delete'
                ? 'Esta ação não pode ser desfeita.'
                : 'A movimentação voltará ao status pendente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onConfirm(false)}
              disabled={isProcessing}
              className={mode === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {mode === 'delete' ? 'Excluir' : 'Desmarcar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const verb = mode === 'delete' ? 'excluir' : 'reverter';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Movimentação vinculada
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Esta movimentação faz parte de um conjunto de lançamentos relacionados
                {linkedQuote ? ` ao Orçamento #${linkedQuote.quote_number}` : ''}.
                Encontramos <strong>{related.length}</strong> outro(s) lançamento(s) vinculado(s):
              </p>
              <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-2 space-y-1.5">
                {related.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Receipt className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{r.description}</span>
                      {r.category && <Badge variant="outline" className="text-[9px] shrink-0">{r.category}</Badge>}
                    </div>
                    <span className={`font-medium shrink-0 ${r.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'}`}>
                      {r.transaction_type === 'entrada' ? '+' : '-'} {formatCurrency(r.amount)}
                    </span>
                  </div>
                ))}
              </div>
              {linkedQuote && mode === 'delete' && (
                <p className="text-xs text-warning bg-warning/10 rounded p-2 flex gap-2">
                  <FileText className="h-4 w-4 shrink-0" />
                  Ao {verb} todos os lançamentos, o Orçamento #{linkedQuote.quote_number} ficará desvinculado e poderá ser aprovado novamente.
                </p>
              )}
              <p className="text-sm font-medium pt-1">O que você quer {verb}?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-col sm:space-x-0 gap-2">
          <Button
            variant="destructive"
            onClick={() => onConfirm(true)}
            disabled={isProcessing}
            className="w-full"
          >
            {mode === 'delete'
              ? `Excluir todos os ${related.length + 1} lançamentos`
              : `Reverter todos os ${related.length + 1} lançamentos`}
          </Button>
          <Button
            variant="outline"
            onClick={() => onConfirm(false)}
            disabled={isProcessing}
            className="w-full"
          >
            {mode === 'delete'
              ? 'Excluir somente este lançamento'
              : 'Reverter somente este lançamento'}
          </Button>
          <AlertDialogCancel className="w-full mt-0" disabled={isProcessing}>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
