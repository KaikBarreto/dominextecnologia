import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { Ban, Loader2, RotateCcw, X, RefreshCw } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface ReconciliationBulkBarProps {
  selectedCount: number;
  ignoreCount: number;
  unignoreCount: number;
  flipCount: number;
  isIgnoring: boolean;
  isUnignoring: boolean;
  isFlipping: boolean;
  onIgnore: () => void;
  onUnignore: () => void;
  onFlipSign: () => void;
  onClear: () => void;
}

/**
 * Barra de ação em lote (estilo caixa de e-mail), sticky no topo da lista
 * quando há seleção. "Ignorar" age só nas PENDING selecionadas; "Restaurar"
 * só nas IGNORED; "Inverter sinal" só nas PENDING (regra: disponível enquanto
 * a linha está pendente).
 */
export function ReconciliationBulkBar({
  selectedCount,
  ignoreCount,
  unignoreCount,
  flipCount,
  isIgnoring,
  isUnignoring,
  isFlipping,
  onIgnore,
  onUnignore,
  onFlipSign,
  onClear,
}: ReconciliationBulkBarProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.bulkBar;
  const [confirmIgnore, setConfirmIgnore] = useState(false);
  const busy = isIgnoring || isUnignoring || isFlipping;

  return (
    <div className="sticky top-0 z-20 mb-1 flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-sm">
      <span className="text-sm font-medium tabular-nums">{t.selectedCount.replace('{count}', String(selectedCount))}</span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 hover:bg-warning hover:text-white hover:border-warning"
          disabled={flipCount === 0 || busy}
          onClick={onFlipSign}
        >
          {isFlipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t.flipSign.replace('{count}', String(flipCount))}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={unignoreCount === 0 || busy}
          onClick={onUnignore}
        >
          {isUnignoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {t.unignore.replace('{count}', String(unignoreCount))}
        </Button>

        <Button
          variant="destructive-ghost"
          size="sm"
          className="gap-1.5"
          disabled={ignoreCount === 0 || busy}
          onClick={() => setConfirmIgnore(true)}
        >
          {isIgnoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          {t.ignore.replace('{count}', String(ignoreCount))}
        </Button>

        <Button variant="ghost" size="sm" disabled={busy} onClick={onClear} className="text-muted-foreground">
          <X className="mr-1.5 h-3.5 w-3.5" />
          {t.clear}
        </Button>
      </div>

      <AlertDialog open={confirmIgnore} onOpenChange={setConfirmIgnore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmIgnoreTitle.replace('{count}', String(ignoreCount))}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmIgnoreDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelButton}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmIgnore(false);
                onIgnore();
              }}
            >
              {t.confirmButton}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
