import { useMemo, useState } from 'react';
import {
  ShoppingCart, Plus, Search, Users, Pencil, Trash2, PackagePlus, XCircle, FileText,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmptyState } from '@/components/mobile/EmptyState';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import {
  useMaterialPurchases, shortId, type PurchaseListRow,
} from '@/hooks/useMaterialPurchases';
import { SuppliersDialog } from './SuppliersDialog';
import { PurchaseEditorDialog } from './PurchaseEditorDialog';

const STATUS_META: Record<string, { label: string; variant: 'muted' | 'success' | 'destructive' }> = {
  rascunho: { label: 'Rascunho', variant: 'muted' },
  aprovada: { label: 'Aprovada', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function MaterialPurchasesTab() {
  const {
    purchases, isLoading,
    cancelPurchase, deletePurchase, registerStockEntry,
  } = useMaterialPurchases();

  const [search, setSearch] = useState('');
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseListRow | null>(null);
  const [toCancel, setToCancel] = useState<PurchaseListRow | null>(null);
  const [toDelete, setToDelete] = useState<PurchaseListRow | null>(null);
  const [toRegister, setToRegister] = useState<PurchaseListRow | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return purchases;
    return purchases.filter((p) =>
      fuzzyIncludes(shortId(p.id), search) ||
      fuzzyIncludes(p.approved_supplier_name ?? '', search) ||
      fuzzyIncludes(STATUS_META[p.status]?.label ?? '', search) ||
      fuzzyIncludes(p.notes ?? '', search),
    );
  }, [purchases, search]);

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (p: PurchaseListRow) => { setEditing(p); setEditorOpen(true); };

  const rowActions = (p: PurchaseListRow): RowAction[] => [
    {
      label: p.status === 'rascunho' ? 'Editar' : 'Ver detalhes',
      icon: p.status === 'rascunho' ? Pencil : FileText,
      variant: p.status === 'rascunho' ? 'edit' : 'default',
      onClick: () => openEdit(p),
    },
    {
      label: 'Registrar entrada no estoque',
      icon: PackagePlus,
      onClick: () => setToRegister(p),
      hidden: p.status !== 'aprovada',
    },
    {
      label: 'Cancelar cotação',
      icon: XCircle,
      onClick: () => setToCancel(p),
      hidden: p.status !== 'rascunho',
    },
    {
      label: 'Excluir',
      icon: Trash2,
      variant: 'delete',
      onClick: () => setToDelete(p),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Cabeçalho de ações */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar cotação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setSuppliersOpen(true)}>
            <Users className="h-4 w-4" /> Fornecedores
          </Button>
          <Button className="gap-1.5" onClick={openNew}>
            <Plus className="h-4 w-4" /> Nova cotação
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Carregando...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<ShoppingCart className="h-8 w-8" />}
              title={search ? 'Nenhuma cotação encontrada' : 'Nenhuma cotação ainda'}
              description={
                search
                  ? 'Tente outro termo de busca.'
                  : 'Crie uma cotação para comparar preços de fornecedores antes de comprar.'
              }
              action={search ? undefined : { label: 'Nova cotação', onClick: openNew }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const meta = STATUS_META[p.status] ?? STATUS_META.rascunho;
            return (
              <Card key={p.id} className="overflow-hidden">
                <CardContent className="flex items-center justify-between gap-3 p-3 sm:p-4">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openEdit(p)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Cotação #{shortId(p.id)}</span>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(p.created_at)} • {p.item_count} {p.item_count === 1 ? 'material' : 'materiais'}
                    </p>
                    {p.approved_supplier_name && (
                      <p className="mt-1 text-sm">
                        <span className="text-muted-foreground">Fornecedor: </span>
                        <span className="font-medium">{p.approved_supplier_name}</span>
                        {p.approved_total != null && (
                          <span className={cn('ml-2 font-semibold text-success')}>
                            R$ {formatBRL(p.approved_total)}
                          </span>
                        )}
                      </p>
                    )}
                  </button>
                  <RowActionsMenu actions={rowActions(p)} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <SuppliersDialog open={suppliersOpen} onOpenChange={setSuppliersOpen} />
      <PurchaseEditorDialog open={editorOpen} onOpenChange={setEditorOpen} purchase={editing} />

      {/* Cancelar cotação */}
      <AlertDialog open={!!toCancel} onOpenChange={(o) => !o && setToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar cotação?</AlertDialogTitle>
            <AlertDialogDescription>
              A cotação ficará marcada como cancelada. Você pode excluí-la depois se quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toCancel) await cancelPurchase.mutateAsync(toCancel.id);
                setToCancel(null);
              }}
            >
              Cancelar cotação
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
              A cotação e seus dados serão removidos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await deletePurchase.mutateAsync(toDelete.id);
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
              Os {toRegister?.item_count ?? 0} {toRegister?.item_count === 1 ? 'material' : 'materiais'} desta
              cotação serão dados de entrada no estoque com o fornecedor aprovado
              {toRegister?.approved_supplier_name ? ` (${toRegister.approved_supplier_name})` : ''}.
              O movimento aparece no histórico (Kardex).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={registerStockEntry.isPending}
              onClick={async () => {
                if (toRegister) await registerStockEntry.mutateAsync(toRegister.id);
                setToRegister(null);
              }}
            >
              {registerStockEntry.isPending ? 'Registrando...' : 'Registrar entrada'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
