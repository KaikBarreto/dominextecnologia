import { useEffect, useMemo, useState } from 'react';
import {
  Plus, FileSpreadsheet, Eye, Check, X, PackagePlus, Trash2, Trophy, CheckCircle2,
  ArrowLeft, Pencil, CheckCheck, XCircle, RotateCcw,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { unitLabel } from '@/lib/inventoryUnits';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useCompras, type CompraListRow, type CompraMaterial } from '@/hooks/useCompras';
import { useCompraCotacoes, type CotacaoRow } from '@/hooks/useCompraCotacoes';
import { CotacaoDialog } from './CotacaoDialog';

interface CompraDetailViewProps {
  compra: CompraListRow;
  onBack: () => void;
  onEdit: (compra: CompraListRow) => void;
}

const COMPRA_STATUS: Record<string, { label: string; variant: 'info' | 'success' | 'destructive' }> = {
  aberta: { label: 'Aberta', variant: 'info' },
  concluida: { label: 'Concluída', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
};

const COTACAO_STATUS: Record<string, { label: string; variant: 'muted' | 'success' | 'destructive' }> = {
  pendente: { label: 'Pendente', variant: 'muted' },
  aceita: { label: 'Aceita', variant: 'success' },
  recusada: { label: 'Recusada', variant: 'destructive' },
};

export function CompraDetailView({ compra, onBack, onEdit }: CompraDetailViewProps) {
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

  const meta = COMPRA_STATUS[compra.status] ?? COMPRA_STATUS.aberta;

  const compraActions: RowAction[] = [
    { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => onEdit(compra) },
    {
      label: 'Concluir compra',
      icon: CheckCheck,
      onClick: () => setStatus.mutate({ id: compra.id, status: 'concluida' }),
      hidden: compra.status !== 'aberta',
    },
    {
      label: 'Reabrir compra',
      icon: RotateCcw,
      onClick: () => setStatus.mutate({ id: compra.id, status: 'aberta' }),
      hidden: compra.status === 'aberta',
    },
    {
      label: 'Cancelar compra',
      icon: XCircle,
      onClick: () => setToCancelCompra(true),
      hidden: compra.status === 'cancelada',
    },
    { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setToDeleteCompra(true) },
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
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para compras
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
            <RowActionsMenu actions={compraActions} label="Ações" />
          </div>
        </div>
      </div>

      {/* Materiais da compra */}
      <section className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Materiais
        </h2>
        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">Carregando materiais...</p>
        ) : (
          <div className="space-y-1.5">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <span className="truncate max-w-[70%]">
                  {m.material_name || 'Material'}
                  {!m.inventory_id && (
                    <span className="ml-2 text-xs text-warning">fora do estoque</span>
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
            Cotações
          </h2>
          <Button size="sm" className="gap-1.5" onClick={() => setNewCotacaoOpen(true)}>
            <Plus className="h-4 w-4" /> Nova cotação
          </Button>
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Carregando cotações...</p>
        ) : cotacoes.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nenhuma cotação ainda. Toque em "Nova cotação" para começar a comparar preços.
          </p>
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
                  label: isRefused ? 'Ver preços' : 'Editar preços',
                  icon: isRefused ? Eye : FileSpreadsheet,
                  onClick: () => setSheetFor(c),
                },
                {
                  label: 'Aceitar',
                  icon: Check,
                  variant: 'default',
                  onClick: () => decideCotacao.mutate({ cotacaoId: c.id, status: 'aceita' }),
                  disabled: c.total <= 0 || decideCotacao.isPending,
                  hidden: !isPending,
                },
                {
                  label: 'Registrar entrada no estoque',
                  icon: PackagePlus,
                  onClick: () => setToRegister(c),
                  hidden: !isAccepted,
                },
                {
                  label: 'Desfazer aceite',
                  icon: RotateCcw,
                  onClick: () => decideCotacao.mutate({ cotacaoId: c.id, status: 'pendente' }),
                  disabled: decideCotacao.isPending,
                  hidden: !isAccepted,
                },
                {
                  label: 'Reabrir',
                  icon: RotateCcw,
                  onClick: () => decideCotacao.mutate({ cotacaoId: c.id, status: 'pendente' }),
                  disabled: decideCotacao.isPending,
                  hidden: !isRefused,
                },
                {
                  label: 'Recusar',
                  icon: X,
                  variant: 'delete',
                  onClick: () => setToRefuse(c),
                  hidden: !isPending,
                },
                {
                  label: 'Excluir',
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
                            <Trophy className="h-3 w-3" /> Mais barata
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.priced_count}/{materials.length} materiais com preço
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <div className="text-right">
                        <span className="text-base font-bold">R$ {formatBRL(c.total)}</span>
                      </div>
                      <RowActionsMenu actions={cotacaoActions} label="Ações" />
                    </div>
                  </div>

                  {isAccepted && (
                    <p className="flex items-center gap-1 text-xs text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Aceitar não mexe no estoque. Use "Registrar entrada" quando o material chegar.
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
            <AlertDialogTitle>Recusar cotação?</AlertDialogTitle>
            <AlertDialogDescription>
              {toRefuse ? `A cotação de "${toRefuse.supplier_name}" será marcada como recusada. ` : ''}
              Os preços ficam guardados, só não entram na comparação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toRefuse) await decideCotacao.mutateAsync({ cotacaoId: toRefuse.id, status: 'recusada' });
                setToRefuse(null);
              }}
            >
              Recusar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir cotação */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cotação?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `A cotação de "${toDelete.supplier_name}" e seus preços serão removidos. ` : ''}
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await deleteCotacao.mutateAsync(toDelete.id);
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Registrar entrada no estoque */}
      <AlertDialog open={!!toRegister} onOpenChange={(o) => !o && setToRegister(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar entrada no estoque?</AlertDialogTitle>
            <AlertDialogDescription>
              Os materiais desta compra serão dados de entrada com o fornecedor
              {toRegister ? ` "${toRegister.supplier_name}"` : ''} e os preços desta cotação.
              Materiais fora do estoque serão criados automaticamente. O movimento aparece no histórico (Kardex).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto py-1 text-sm">
            {materials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <span className="min-w-0 truncate">
                  {m.material_name || 'Material'}
                  <span className="text-muted-foreground"> • {m.quantity} {unitLabel(m.unit)}</span>
                </span>
                {!m.inventory_id && (
                  <Badge variant="warning" className="shrink-0 text-[10px]">Criar no estoque</Badge>
                )}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
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
              {registerStockEntry.isPending ? 'Registrando...' : 'Registrar entrada'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancelar compra */}
      <AlertDialog open={toCancelCompra} onOpenChange={setToCancelCompra}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar compra?</AlertDialogTitle>
            <AlertDialogDescription>
              A compra ficará marcada como cancelada. Você pode reabri-la ou excluí-la depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                await setStatus.mutateAsync({ id: compra.id, status: 'cancelada' });
                setToCancelCompra(false);
              }}
            >
              Cancelar compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir compra */}
      <AlertDialog open={toDeleteCompra} onOpenChange={setToDeleteCompra}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir compra?</AlertDialogTitle>
            <AlertDialogDescription>
              "{compra.title}" e suas cotações serão removidas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                await deleteCompra.mutateAsync(compra.id);
                setToDeleteCompra(false);
                onBack();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
