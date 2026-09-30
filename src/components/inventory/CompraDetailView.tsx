import { useEffect, useMemo, useState } from 'react';
import {
  Plus, FileSpreadsheet, Eye, Check, X, PackagePlus, Trash2, Trophy, CheckCircle2,
  ArrowLeft, Pencil, CheckCheck, XCircle, RotateCcw, FileText, ClipboardList, Send, FileDown,
} from 'lucide-react';
import { EmptyState } from '@/components/mobile/EmptyState';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { cn } from '@/lib/utils';
import { useLocaleFormatters } from '@/lib/format/hooks';
import { unitLabel } from '@/lib/inventoryUnits';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useCompras, type CompraListRow, type CompraMaterial } from '@/hooks/useCompras';
import { useCompraCotacoes, type CotacaoRow } from '@/hooks/useCompraCotacoes';
import { useCompraOrdens, type CompraOrdemRow } from '@/hooks/useCompraOrdens';
import { generateOrdemCompraPdf } from '@/utils/ordemCompraPdfGenerator';
import { CotacaoDialog } from './CotacaoDialog';
import { OrdemCompraReceiveDialog } from './OrdemCompraReceiveDialog';

/** Sentinela pro Select de "fornecedor escolhido": Radix crasha com SelectItem value="". */
const NO_SUPPLIER = '__none__';

interface CompraDetailViewProps {
  compra: CompraListRow;
  onBack: () => void;
  onEdit: (compra: CompraListRow) => void;
}

export function CompraDetailView({ compra, onBack, onEdit }: CompraDetailViewProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.purchaseDetail;
  const tCompras = MESSAGES[locale].app.inventory.compras;
  const tOrdens = tCompras.ordens;
  const { money } = useLocaleFormatters();
  const { suppliers } = useSuppliers();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: whiteLabelEnabled } = useWhiteLabel();
  const { loadCompra, setStatus, deleteCompra, setChosenCotacao } = useCompras();
  const {
    cotacoes, isLoading, decideCotacao, deleteCotacao, loadPrices,
  } = useCompraCotacoes(compra.id);
  // `receber` não é usado aqui: o recebimento é feito dentro de
  // OrdemCompraReceiveDialog, que instancia seu próprio useCompraOrdens(compraId).
  const {
    ordens, isLoading: ordensLoading, gerarOrdens, setOrdemStatus, deleteOrdem,
  } = useCompraOrdens(compra.id);

  const [materials, setMaterials] = useState<CompraMaterial[]>([]);
  // Preços informados por cotação, agrupados por material — alimenta o select
  // de "fornecedor escolhido" de cada item. Só cotações não recusadas contam.
  const [pricesByMaterial, setPricesByMaterial] = useState<
    Record<string, { cotacaoId: string; supplierName: string; unitPrice: number }[]>
  >({});
  const [newCotacaoOpen, setNewCotacaoOpen] = useState(false);
  const [sheetFor, setSheetFor] = useState<CotacaoRow | null>(null);
  const [toRefuse, setToRefuse] = useState<CotacaoRow | null>(null);
  const [toDelete, setToDelete] = useState<CotacaoRow | null>(null);
  const [toCancelCompra, setToCancelCompra] = useState(false);
  const [toDeleteCompra, setToDeleteCompra] = useState(false);
  const [ordemToCancel, setOrdemToCancel] = useState<CompraOrdemRow | null>(null);
  const [ordemToDelete, setOrdemToDelete] = useState<CompraOrdemRow | null>(null);
  const [ordemToReceive, setOrdemToReceive] = useState<CompraOrdemRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCompra(compra.id)
      .then((d) => { if (!cancelled) setMaterials(d.materials); })
      .catch(() => { if (!cancelled) setMaterials([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compra.id]);

  // Preços por material através das cotações (exceto recusadas), pra montar o
  // seletor de fornecedor por item. `loadPrices` é exposto pelo hook — nenhuma
  // chamada a supabase acontece aqui no componente.
  useEffect(() => {
    let cancelled = false;
    const eligible = cotacoes.filter((c) => c.status !== 'recusada');
    if (eligible.length === 0) {
      setPricesByMaterial({});
      return;
    }
    Promise.all(eligible.map((c) => loadPrices(c.id).then((rows) => ({ cotacao: c, rows }))))
      .then((results) => {
        if (cancelled) return;
        const map: Record<string, { cotacaoId: string; supplierName: string; unitPrice: number }[]> = {};
        for (const { cotacao, rows } of results) {
          for (const r of rows) {
            if (!(r.unit_price > 0)) continue;
            const list = map[r.compra_material_id] ?? (map[r.compra_material_id] = []);
            list.push({ cotacaoId: cotacao.id, supplierName: cotacao.supplier_name, unitPrice: r.unit_price });
          }
        }
        for (const list of Object.values(map)) list.sort((a, b) => a.unitPrice - b.unitPrice);
        setPricesByMaterial(map);
      })
      .catch(() => { if (!cancelled) setPricesByMaterial({}); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotacoes]);

  /** Grava o fornecedor escolhido do item (otimista; reverte se a mutação falhar). */
  const handleChooseSupplier = async (materialId: string, cotacaoId: string | null) => {
    const previous = materials.find((m) => m.id === materialId)?.chosen_cotacao_id ?? null;
    setMaterials((prev) => prev.map((m) => (m.id === materialId ? { ...m, chosen_cotacao_id: cotacaoId } : m)));
    try {
      await setChosenCotacao.mutateAsync({ compraMaterialId: materialId, cotacaoId });
    } catch {
      setMaterials((prev) => prev.map((m) => (m.id === materialId ? { ...m, chosen_cotacao_id: previous } : m)));
    }
  };

  const canGenerateOrdens = materials.some((m) => m.chosen_cotacao_id);

  // Sucesso/erro (incluindo singular-plural de "criadas"/"puladas" e o caso só
  // pulou) já viram toast dentro do próprio hook (onSuccess/onError de
  // gerarOrdens) — não duplicar aqui.
  const handleGenerateOrdens = () => {
    gerarOrdens.mutate({ compraId: compra.id });
  };

  const handleDownloadOrdemPdf = async (ordem: CompraOrdemRow) => {
    await generateOrdemCompraPdf({
      company: companySettings,
      whiteLabel: whiteLabelEnabled,
      ordem,
      compraTitle: compra.title,
      locale,
      currency,
      timezone,
    });
  };

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

  // Status da ordem de compra (canônico → traduzido)
  type OrdemVariant = 'muted' | 'info' | 'warning' | 'success' | 'destructive';
  const ORDEM_STATUS: Record<string, { label: string; variant: OrdemVariant }> = {
    rascunho: { label: tOrdens.statusLabels.rascunho, variant: 'muted' },
    enviada: { label: tOrdens.statusLabels.enviada, variant: 'info' },
    recebida_parcial: { label: tOrdens.statusLabels.recebida_parcial, variant: 'warning' },
    recebida: { label: tOrdens.statusLabels.recebida, variant: 'success' },
    cancelada: { label: tOrdens.statusLabels.cancelada, variant: 'destructive' },
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
            {materials.map((m) => {
              const options = pricesByMaterial[m.id] ?? [];
              return (
                <div key={m.id} className="space-y-1.5 rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
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
                  {/* Fornecedor escolhido pro item — só aparece quando alguma cotação já precificou o material. */}
                  {options.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tCompras.chosenSupplier}</Label>
                      <Select
                        value={m.chosen_cotacao_id ?? NO_SUPPLIER}
                        onValueChange={(v) => handleChooseSupplier(m.id, v === NO_SUPPLIER ? null : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={tCompras.chooseSupplierPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_SUPPLIER}>{tCompras.chooseSupplierPlaceholder}</SelectItem>
                          {options.map((opt) => (
                            <SelectItem key={opt.cotacaoId} value={opt.cotacaoId}>
                              {opt.supplierName} ({money(opt.unitPrice)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })}
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

      {/* Ordens de Compra (uma por fornecedor, geradas a partir da escolha por item) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tOrdens.title}
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!canGenerateOrdens || gerarOrdens.isPending}
            onClick={handleGenerateOrdens}
          >
            <ClipboardList className="h-4 w-4" /> {tOrdens.generate}
          </Button>
        </div>

        {ordensLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t.loadingQuotes}</p>
        ) : ordens.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<ClipboardList className="h-10 w-10" />}
            title={tOrdens.empty}
          />
        ) : (
          <div className="space-y-2">
            {ordens.map((o) => {
              const ometa = ORDEM_STATUS[o.status] ?? ORDEM_STATUS.rascunho;
              const canMarkSent = o.status === 'rascunho';
              const canReceive = o.status === 'enviada' || o.status === 'recebida_parcial';
              const canCancel = o.status === 'rascunho' || o.status === 'enviada';
              const canReopen = o.status === 'cancelada';

              const ordemActions: RowAction[] = [
                {
                  label: tOrdens.markSent,
                  icon: Send,
                  onClick: () => setOrdemStatus.mutate({ ordemId: o.id, status: 'enviada' }),
                  hidden: !canMarkSent,
                },
                {
                  label: tOrdens.downloadPdf,
                  icon: FileDown,
                  onClick: () => { void handleDownloadOrdemPdf(o); },
                },
                {
                  label: tOrdens.receiveTitle,
                  icon: PackagePlus,
                  onClick: () => setOrdemToReceive(o),
                  hidden: !canReceive,
                },
                {
                  label: tOrdens.reopen,
                  icon: RotateCcw,
                  onClick: () => setOrdemStatus.mutate({ ordemId: o.id, status: 'rascunho' }),
                  hidden: !canReopen,
                },
                {
                  label: tOrdens.cancelOrder,
                  icon: XCircle,
                  variant: 'delete',
                  onClick: () => setOrdemToCancel(o),
                  hidden: !canCancel,
                },
                {
                  label: tOrdens.deleteOrder,
                  icon: Trash2,
                  variant: 'delete',
                  onClick: () => setOrdemToDelete(o),
                },
              ];

              return (
                <div key={o.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{o.numero}</span>
                        <span className="text-base font-semibold leading-tight">{o.supplier_name}</span>
                        <Badge variant={ometa.variant} className="text-[10px]">{ometa.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {tOrdens.itemsCount.replace('{count}', String(o.items.length))}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-base font-bold">{money(o.total)}</span>
                      <RowActionsMenu actions={ordemActions} label={t.actionsLabel} />
                    </div>
                  </div>
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

      {/* Recebimento (parcial permitido) de uma ordem de compra */}
      <OrdemCompraReceiveDialog
        open={!!ordemToReceive}
        onOpenChange={(o) => !o && setOrdemToReceive(null)}
        compraId={compra.id}
        ordem={ordemToReceive}
      />

      {/* Cancelar ordem de compra */}
      <AlertDialog open={!!ordemToCancel} onOpenChange={(o) => !o && setOrdemToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tOrdens.cancelTitle}</AlertDialogTitle>
            <AlertDialogDescription>{tOrdens.cancelConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.refuseDialog.back}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (ordemToCancel) await setOrdemStatus.mutateAsync({ ordemId: ordemToCancel.id, status: 'cancelada' });
                setOrdemToCancel(null);
              }}
            >
              {tOrdens.cancelOrder}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir ordem de compra */}
      <AlertDialog open={!!ordemToDelete} onOpenChange={(o) => !o && setOrdemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tOrdens.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{tOrdens.deleteConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteQuoteDialog.back}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (ordemToDelete) await deleteOrdem.mutateAsync(ordemToDelete.id);
                setOrdemToDelete(null);
              }}
            >
              {tOrdens.deleteOrder}
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
