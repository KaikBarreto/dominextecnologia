import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronDown, History, CheckCircle2, Undo2, Loader2, AlertTriangle } from 'lucide-react';
import { formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { MESSAGES } from '@/lib/i18n/messages';
import { useToast } from '@/hooks/use-toast';
import {
  useFinancialImportHistory,
  type FinancialImportHistoryItem,
  type FinancialImportRevertResult,
} from '@/hooks/useFinancialImport';
import type { UseMutationResult } from '@tanstack/react-query';

/** `2026-10-18T...` → `18/10/2026`. Nunca `new Date(iso)` (UTC voltaria um dia). */
function formatDateBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

interface ImportHistorySectionProps {
  /** Mesma instância de `revert` do `useFinancialImport()` usada pelo resto do diálogo. */
  revert: UseMutationResult<FinancialImportRevertResult, Error, { importId: string }>;
  locale: LocaleCode;
  currency: string;
}

/**
 * "Importações anteriores" — recolhível, mesmo espírito do "Conciliações
 * anteriores" do `ReconciliationTab`. Sem esta seção, o "Desfazer importação"
 * só existe por 3 segundos (enquanto o painel de resultado está na tela): se
 * o cliente fecha o diálogo pra conferir em Movimentações, perde o caminho de
 * volta e fica com lançamentos errados sem saída.
 */
export function ImportHistorySection({ revert, locale, currency }: ImportHistorySectionProps) {
  const t = MESSAGES[locale].app.finance.spreadsheetImport.history;
  const toastsT = MESSAGES[locale].app.finance.spreadsheetImport.toasts;
  const { toast } = useToast();
  const { data: history = [], isLoading } = useFinancialImportHistory();

  const [open, setOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<FinancialImportHistoryItem | null>(null);
  const [revertResults, setRevertResults] = useState<Record<string, FinancialImportRevertResult>>({});

  // Enquanto carrega a primeira vez não sabemos se há algo pra mostrar — não
  // pisca uma seção vazia. Sem itens, a seção simplesmente não existe.
  if (isLoading || history.length === 0) return null;

  const handleConfirmRevert = () => {
    if (!confirmTarget) return;
    const importId = confirmTarget.id;
    setConfirmTarget(null);
    revert.mutate(
      { importId },
      {
        onSuccess: (res) => {
          setRevertResults((prev) => ({ ...prev, [importId]: res }));
          // Reversão total some de vista (o item vira "Desfeita" sem mais
          // detalhe na linha) — o toast é o único feedback explícito nesse
          // caso. A parcial já se explica sozinha no painel inline abaixo.
          if (res.kept_count === 0) {
            toast({ title: t.revertedFull.replace('{count}', String(res.deleted_count)) });
          }
        },
        // `42501` (sem permissão de excluir no Financeiro) já chega em PT-BR
        // formatado por `getFinancialImportErrorMessage` — nunca genérico.
        onError: (err) => toast({ variant: 'destructive', title: toastsT.revertErrorTitle, description: err.message }),
      },
    );
  };

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="flex w-full items-center justify-between px-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <History className="h-4 w-4" />
              {t.toggle.replace('{count}', String(history.length))}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {history.map((item) => (
            <HistoryItemRow
              key={item.id}
              item={item}
              t={t}
              locale={locale}
              currency={currency}
              isReverting={revert.isPending && revert.variables?.importId === item.id}
              revertResult={revertResults[item.id] ?? null}
              onRequestRevert={() => setConfirmTarget(item)}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget
                ? t.confirmDescription
                    .replace('{count}', String(confirmTarget.created_count))
                    .replace('{fileName}', confirmTarget.file_name ?? '')
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelCta}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRevert}>{t.confirmCta}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface HistoryItemRowProps {
  item: FinancialImportHistoryItem;
  t: typeof MESSAGES['pt-br']['app']['finance']['spreadsheetImport']['history'];
  locale: LocaleCode;
  currency: string;
  isReverting: boolean;
  revertResult: FinancialImportRevertResult | null;
  onRequestRevert: () => void;
}

function HistoryItemRow({ item, t, locale, currency, isReverting, revertResult, onRequestRevert }: HistoryItemRowProps) {
  const fmt = (v: number) => formatMoney(v, currency, locale);
  // `status` pode mudar pra 'reverted' só depois do refetch (invalidação) —
  // até lá, `revertResult` (resposta direta da mutation) já reflete o que
  // aconteceu, então ele manda no estado visual.
  const isReverted = revertResult ? revertResult.status === 'reverted' : item.status === 'reverted';

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 rounded-md border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.file_name || '—'}</p>
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {formatDateBR(item.created_at)} · {t.createdLabel.replace('{count}', String(item.created_count))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isReverted ? (
            <Badge variant="muted" className="gap-1 whitespace-nowrap">
              <Undo2 className="h-3 w-3" />
              {t.revertedBadge}
            </Badge>
          ) : (
            <>
              <Badge variant="success" className="gap-1 whitespace-nowrap">
                <CheckCircle2 className="h-3 w-3" />
                {t.appliedBadge}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 hover:bg-destructive hover:text-white hover:border-destructive"
                onClick={onRequestRevert}
                disabled={isReverting}
              >
                {isReverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                {isReverting ? t.reverting : t.revertButton}
              </Button>
            </>
          )}
        </div>
      </div>

      {revertResult && revertResult.kept_count > 0 && (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            {t.revertedPartialTitle.replace('{count}', String(revertResult.kept_count))}
          </p>
          <p className="text-sm text-muted-foreground">{t.revertedPartialDescription}</p>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {revertResult.kept.map((k) => (
              <div key={k.financial_transaction_id} className="rounded border bg-background p-2 text-xs">
                <p className="font-medium tabular-nums">
                  {formatDateBR(k.transaction_date)} · {fmt(k.amount)} · {k.description}
                </p>
                <p className="text-muted-foreground">{t.keptReasonLabel}: {k.reason_label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
