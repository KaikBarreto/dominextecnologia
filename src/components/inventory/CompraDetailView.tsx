import { useEffect, useMemo, useState } from 'react';
import {
  Plus, FileSpreadsheet, Eye, Check, X, PackagePlus, Trash2, Trophy, CheckCircle2,
  ArrowLeft, Pencil, CheckCheck, XCircle, RotateCcw, FileText,
} from 'lucide-react';
import { EmptyState } from '@/components/mobile/EmptyState';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { cn } from '@/lib/utils';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { unitLabel } from '@/lib/inventoryUnits';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useCompras, type CompraListRow, type CompraMaterial } from '@/hooks/useCompras';
import { useCompraCotacoes, type CotacaoRow } from '@/hooks/useCompraCotacoes';
import { CotacaoDialog } from './CotacaoDialog';

interface CompraDetailViewProps {
  compra: CompraListRow;
  onBack: () => void;
  onEdit: (compra: CompraListRow) => void;
}

export function CompraDetailView({ compra, onBack, onEdit }: CompraDetailViewProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.purchaseDetail;
  const { money } = useLocaleFormatters();
  const { suppliers } = useSuppliers();
  const { loadCompra, setStatus, deleteCompra } = useCompras();
  const {
    cotacoes, isLoading, decideCotacao, deleteCotacao, registerStockEntry,
  } = useCompraCotacoes(compra.id);

  const [materials, setMaterials] = useState<CompraMaterial[]>([]);
  const [newCotacaoOpen, setNewCotacaoOpen] = useState(false);
  const [sheetFor, setSheetFor] = useState<CotacaoRow | null>(null);
  const [toRefuse, setToRefuse] = useState<CotacaoRow | null>(null);
  const [toDelete, setToDelete] = useState<CotacaoRow | null>(null);
  const [toRegister, setToRegister] = useState<CotacaoRow | null>(null);
  const [toCancelCompra, setToCancelCompra] = useState(false);
  const [toDeleteCompra, setToDeleteCompra] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadCompra(compra.id)
      .then((d) => { if (!cancelled) setMaterials(d.materials); })
      .catch(() => { if (!cancelled) setMaterials([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compra.id]);

  // Fornecedores que ainda não têm cotação nesta compra (UNIQUE compra+supplier).
  const availableSuppliers = useMemo(() => {
    const used = new Set(cotacoes.map((c) => c.supplier_id));
    return suppliers
      .filter((s) => !used.has(s.id))
      .map((s) => ({ value: s.id, label: s.name }));
  }, [suppliers, cotacoes]);

  // Cotação mais barata (entre as que têm total > 0).
  const cheapestId = useMemo(() => {
    let best: string | null = null;
    let bestVal = Infinity;
    for (const c of cotacoes) {
      if (c.total > 0 && c.total < bestVal) { bestVal = c.total; best = c.id; }
    }
    return best;
  }, [cotacoes]);

  // Status da compra (canônico → traduzido)
  type CompraVariant = 'info' | 'success' | 'destructive';
  const COMPRA_STATUS: Record<string, { label: string; variant: CompraVariant }> = {
    aberta: { label: t.status.aberta, variant: 'info' },
    concluida: { label: t.status.concluida, variant: 'success' },
    cancelada: { label: t.status.cancelada, variant: 'destructive' },
  };

  // Status da cotação (canônico → traduzido)
  type CotacaoVariant = 'muted' | 'success' | 'destructive';
  const COTACAO_STATUS: Record<string, { label: string; variant: CotacaoVariant }> = {
    pendente: { label: t.quoteStatus.pendente, variant: 'muted' },
    aceita: { label: t.quoteStatus.aceita, variant: 'success' },
    recusada: { label: t.quoteStatus.recusada, variant: 'destructive' },
  };

  const meta = COMPRA_STATUS[compra.status] ?? COMPRA_STATUS.aberta;

  const compraActions: RowAction[] = [
    { label: t.compraActions.edit, icon: Pencil, variant: 'edit', onClick: () => onEdit(compra) },
    {
      label: t.compraActions.complete,
      icon: CheckCheck,
      onClick: () => setStatus.mutate({ id: compra.id, status: 'concluida' }),
      hidden: compra.status !== 'aberta',
    },
    {
      label: t.compraActions.reopen,
      icon: RotateCcw,
      onClick: () => setStatus.mutate({ id: compra.id, status: 'aberta' }),
      hidden: compra.status === 'aberta',
    },
    {
      label: t.compraActions.cancel,
      icon: XCircle,
      onClick: () => setToCancelCompra(true),
      hidden: compra.status === 'cancelada',
    },
    { label: t.compraActions.delete, icon: Trash2, variant: 'delete', onClick: () => setToDeleteCompra(true) },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho da compra */}
      <div className="space-y-2">
        {/* Breadcrumb discreto acima do título */}
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t.backLabel}
        </button>

        {/* Título principal da tela: nome da compra + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-medium text-muted-foreground sm:text-lg">#{compra.numero}</span>
              <h1 className="text-xl font-bold leading-tight sm:text-2xl">{compra.title}</h1>
              <Badge variant={meta.variant}>{meta.label}</Badge>
            </div>
            {compra.notes && (
              <p className="mt-1.5 text-sm text-muted-foreground">{compra.notes}</p>
            )}
          </div>
          <div className="shrink-0">
            <RowActionsMenu actions={compraActions} label={t.actionsLabel} />
          </div>
        </div>
      </div>

      {/* Materiais da compra */}
      <section className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t.sectionMaterials}
        </h2>
        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.loadingMaterials}</p>
        ) : (
          <div className="space-y-1.5">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <span className="truncate max-w-[70%]">
                  {m.material_name || t.materialFallback}
                  {!m.inventory_id && (
                    <span className="ml-2 text-xs text-warning">{t.outOfStock}</span>
                  )}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  • {m.quantity} {unitLabel(m.unit)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Cotações por fornecedor */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.sectionQuotes}
          </h2>
          <Button size="sm" className="gap-1.5" onClick={() => setNewCotacaoOpen(true)}>
            <Plus className="h-4 w-4" /> {t.newQuoteButton}
          </Button>
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t.loadingQuotes}</p>
        ) : cotacoes.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<FileText className="h-10 w-10" />}
            title={t.emptyQuotes.title}
            description={t.emptyQuotes.description}
            action={{ label: t.emptyQuotes.action, onClick: () => setNewCotacaoOpen(true) }}
          />
        ) : (
          <div className="space-y-2">
            {cotacoes.map((c) => {
              const cmeta = COTACAO_STATUS[c.status] ?? COTACAO_STATUS.pendente;
              const isAccepted = c.status === 'aceita';
              const isRefused = c.status === 'recusada';
              const isPending = c.status === 'pendente';
              const isCheapest = c.id === cheapestId;

              const cotacaoActions: RowAction[] = [
                {
                  label: isRefused ? t.quoteActions.viewPrices : t.quoteActions.editPrices,
                  icon: isRefused ? Eye : FileSpreadsheet,
                  onClick: () => setSheetFor(c),
                },
                {
                  label: t.quoteActions.accept,
                  icon: Check,
                  variant: 'default',
                  onClick: () => decideCotacao.mutate({ cotacaoId: c.id, status: 'aceita' }),
                  disabled: c.total <= 0 || decideCotacao.isPending,
                  hidden: !isPending,
                },
                {
                  label: t.quoteActions.registerEntry,
                  icon: PackagePlus,
                  onClick: () => setToRegister(c),
                  hidden: !isAccepted,
                },
                {
                  label: t.quoteActions.undoAccept,
                  icon: RotateCcw,
                  onClick: () => decideCotacao.mutate({ cotacaoId: c.id, status: 'pendente' }),
                  disabled: decideCotacao.isPending,
                  hidden: !isAccepted,
                },
                {
                  label: t.quoteActions.reopenRefused,
                  icon: RotateCcw,
                  onClick: () => decideCotacao.mutate({ cotacaoId: c.id, status: 'pendente' }),
                  disabled: decideCotacao.isPending,
                  hidden: !isRefused,
                },
                {
                  label: t.quoteActions.refuse,
                  icon: X,
                  variant: 'delete',
                  onClick: () => setToRefuse(c),
                  hidden: !isPending,
                },
                {
                  label: t.quoteActions.delete,
                  icon: Trash2,
                  variant: 'delete',
                  onClick: () => setToDelete(c),
                },
              ];

              return (
                <div
                  key={c.id}
                  className={cn(
                    'space-y-2 rounded-lg border p-3 transition-colors',
                    isAccepted && 'border-success ring-1 ring-success',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold leading-tight">
                          {c.supplier_name}
                        </span>
                        <Badge variant={cmeta.variant} className="text-[10px]">{cmeta.label}</Badge>
                        {isCheapest && (
                          <Badge variant="success" className="gap-1 text-[10px]">
                            <Trophy className="h-3 w-3" /> {t.badgeCheapest}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t.pricedCount
                          .replace('{priced}', String(c.priced_count))
                          .replace('{total}', String(materials.length))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <div className="text-right">
                        <span className="text-base font-bold">{money(c.total)}</span>
                      </div>
                      <RowActionsMenu actions={cotacaoActions} label={t.actionsLabel} />
                    </div>
                  </div>

                  {isAccepted && (
                    <p className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {t.acceptNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Nova cotação (fornecedor + preços num fluxo só) */}
      <CotacaoDialog
        open={newCotacaoOpen}
        onOpenChange={setNewCotacaoOpen}
        compraId={compra.id}
        materials={materials}
        availableSuppliers={availableSuppliers}
      />

      {/* Editar/ver preços de cotação existente (fornecedor fixo) */}
      {sheetFor && (
        <CotacaoDialog
          open={!!sheetFor}
          onOpenChange={(o) => !o && setSheetFor(null)}
          compraId={compra.id}
          cotacao={sheetFor}
          materials={materials}
        />
      )}

      {/* Recusar cotação */}
      <AlertDialog open={!!toRefuse} onOpenChange={(o) => !o && setToRefuse(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.refuseDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {toRefuse
                ? t.refuseDialog.description.replace('{name}', toRefuse.supplier_name)
                : t.refuseDialog.descriptionGeneric}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.refuseDialog.back}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toRefuse) await decideCotacao.mutateAsync({ cotacaoId: toRefuse.id, status: 'recusada' });
                setToRefuse(null);
              }}
            >
              {t.refuseDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir cotação */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteQuoteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete
                ? t.deleteQuoteDialog.description.replace('{name}', toDelete.supplier_name)
                : t.deleteQuoteDialog.descriptionGeneric}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteQuoteDialog.back}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await deleteCotacao.mutateAsync(toDelete.id);
                setToDelete(null);
              }}
            >
              {t.deleteQuoteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Registrar entrada no estoque */}
      <AlertDialog open={!!toRegister} onOpenChange={(o) => !o && setToRegister(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.registerEntryDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {toRegister
                ? t.registerEntryDialog.description.replace('{name}', toRegister.supplier_name)
                : t.registerEntryDialog.descriptionNoName}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto py-1 text-sm">
            {materials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="min-w-0 truncate">
                  {m.material_name || t.materialFallback}
                  <span className="text-muted-foreground"> • {m.quantity} {unitLabel(m.unit)}</span>
                </span>
                {!m.inventory_id && (
                  <Badge variant="warning" className="shrink-0 text-[10px]">{t.registerEntryDialog.badgeCreateInStock}</Badge>
                )}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.registerEntryDialog.back}</AlertDialogCancel>
            <AlertDialogAction
              disabled={registerStockEntry.isPending}
              onClick={async () => {
                if (toRegister) {
                  await registerStockEntry.mutateAsync({
                    cotacaoId: toRegister.id,
                    supplierId: toRegister.supplier_id,
                    compraTitle: compra.title,
                  });
                }
                setToRegister(null);
              }}
            >
              {registerStockEntry.isPending ? t.registerEntryDialog.confirming : t.registerEntryDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancelar compra */}
      <AlertDialog open={toCancelCompra} onOpenChange={setToCancelCompra}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.cancelCompraDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.cancelCompraDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelCompraDialog.back}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                await setStatus.mutateAsync({ id: compra.id, status: 'cancelada' });
                setToCancelCompra(false);
              }}
            >
              {t.cancelCompraDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir compra */}
      <AlertDialog open={toDeleteCompra} onOpenChange={setToDeleteCompra}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteCompraDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteCompraDialog.description.replace('{title}', compra.title)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteCompraDialog.back}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                await deleteCompra.mutateAsync(compra.id);
                setToDeleteCompra(false);
                onBack();
              }}
            >
              {t.deleteCompraDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
