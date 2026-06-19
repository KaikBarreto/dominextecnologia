import { useEffect, useMemo, useState } from 'react';
import {
  Plus, FileSpreadsheet, Check, X, PackagePlus, Trash2, Trophy, CheckCircle2,
} from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { unitLabel } from '@/lib/inventoryUnits';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useCompras, type CompraListRow, type CompraMaterial } from '@/hooks/useCompras';
import { useCompraCotacoes, type CotacaoRow } from '@/hooks/useCompraCotacoes';
import { SupplierFormDialog } from './SupplierFormDialog';
import { CotacaoPriceSheet } from './CotacaoPriceSheet';

interface CompraDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compra: CompraListRow;
}

const COTACAO_STATUS: Record<string, { label: string; variant: 'muted' | 'success' | 'destructive' }> = {
  pendente: { label: 'Pendente', variant: 'muted' },
  aceita: { label: 'Aceita', variant: 'success' },
  recusada: { label: 'Recusada', variant: 'destructive' },
};

export function CompraDetailDialog({ open, onOpenChange, compra }: CompraDetailDialogProps) {
  const { suppliers } = useSuppliers();
  const { loadCompra } = useCompras();
  const {
    cotacoes, isLoading, createCotacao, decideCotacao, deleteCotacao, registerStockEntry,
  } = useCompraCotacoes(open ? compra.id : null);

  const [materials, setMaterials] = useState<CompraMaterial[]>([]);
  const [addSupplierId, setAddSupplierId] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [sheetFor, setSheetFor] = useState<CotacaoRow | null>(null);
  const [toRefuse, setToRefuse] = useState<CotacaoRow | null>(null);
  const [toDelete, setToDelete] = useState<CotacaoRow | null>(null);
  const [toRegister, setToRegister] = useState<CotacaoRow | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadCompra(compra.id)
      .then((d) => { if (!cancelled) setMaterials(d.materials); })
      .catch(() => { if (!cancelled) setMaterials([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, compra.id]);

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

  const handleAddCotacao = async () => {
    if (!addSupplierId) return;
    await createCotacao.mutateAsync(addSupplierId);
    setAddSupplierId('');
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={compra.title}
        className="sm:max-w-[760px]"
      >
        <div className="space-y-6">
          {/* Materiais da compra */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Materiais</h3>
            {materials.length === 0 ? (
              <p className="text-sm text-muted-foreground">Carregando materiais...</p>
            ) : (
              <div className="space-y-1.5">
                {materials.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <span className="min-w-0 truncate">
                      {m.material_name || 'Material'}
                      {!m.inventory_id && (
                        <span className="ml-2 text-xs text-warning">fora do estoque</span>
                      )}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {m.quantity} {unitLabel(m.unit)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Cotações por fornecedor */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Cotações</h3>
            </div>

            {/* Adicionar cotação */}
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2 sm:flex-row sm:items-center">
              <div className="flex-1">
                <SearchableSelect
                  options={availableSuppliers}
                  value={addSupplierId}
                  onValueChange={setAddSupplierId}
                  placeholder="Escolher fornecedor..."
                  searchPlaceholder="Buscar fornecedor..."
                  emptyMessage="Todos os fornecedores já têm cotação."
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-1.5" onClick={() => setQuickOpen(true)}>
                  <Plus className="h-4 w-4" /> Novo
                </Button>
                <Button
                  className="gap-1.5"
                  onClick={handleAddCotacao}
                  disabled={!addSupplierId || createCotacao.isPending}
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </div>

            {isLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Carregando cotações...</p>
            ) : cotacoes.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nenhuma cotação ainda. Escolha um fornecedor acima para começar a comparar preços.
              </p>
            ) : (
              <div className="space-y-2">
                {cotacoes.map((c) => {
                  const meta = COTACAO_STATUS[c.status] ?? COTACAO_STATUS.pendente;
                  const isAccepted = c.status === 'aceita';
                  const isCheapest = c.id === cheapestId;
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'space-y-2 rounded-lg border p-3',
                        isAccepted && 'border-success ring-1 ring-success',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{c.supplier_name}</span>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                            {isCheapest && (
                              <Badge variant="success" className="gap-1">
                                <Trophy className="h-3 w-3" /> Mais barata
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {c.priced_count}/{materials.length} materiais com preço
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="font-semibold">R$ {formatBRL(c.total)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setSheetFor(c)}
                        >
                          <FileSpreadsheet className="h-4 w-4" />
                          {c.status === 'recusada' ? 'Ver preços' : 'Editar preços'}
                        </Button>

                        {c.status !== 'aceita' && (
                          <Button
                            size="sm"
                            className="gap-1.5 bg-success text-white hover:bg-success/90"
                            onClick={() => decideCotacao.mutate({ cotacaoId: c.id, status: 'aceita' })}
                            disabled={c.total <= 0 || decideCotacao.isPending}
                          >
                            <Check className="h-4 w-4" /> Aceitar
                          </Button>
                        )}
                        {c.status === 'aceita' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => decideCotacao.mutate({ cotacaoId: c.id, status: 'pendente' })}
                            disabled={decideCotacao.isPending}
                          >
                            <X className="h-4 w-4" /> Desfazer aceite
                          </Button>
                        )}
                        {c.status !== 'recusada' && c.status !== 'aceita' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => setToRefuse(c)}
                          >
                            <X className="h-4 w-4" /> Recusar
                          </Button>
                        )}

                        {isAccepted && (
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setToRegister(c)}
                          >
                            <PackagePlus className="h-4 w-4" /> Registrar entrada
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => setToDelete(c)}
                        >
                          <Trash2 className="h-4 w-4" /> Excluir
                        </Button>
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
        </div>
      </ResponsiveModal>

      {/* Planilha de preços */}
      {sheetFor && (
        <CotacaoPriceSheet
          open={!!sheetFor}
          onOpenChange={(o) => !o && setSheetFor(null)}
          compraId={compra.id}
          cotacao={sheetFor}
          materials={materials}
        />
      )}

      {/* Quick fornecedor */}
      <SupplierFormDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={(s) => setAddSupplierId(s.id)}
      />

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
    </>
  );
}
