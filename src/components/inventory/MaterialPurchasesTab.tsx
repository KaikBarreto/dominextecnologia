import { useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart, Plus, Search, Users, Pencil, Trash2, CheckCheck, XCircle, RotateCcw,
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
import { fuzzyIncludes } from '@/lib/utils';
import { formatBRL } from '@/utils/currency';
import { useCompras, type CompraListRow } from '@/hooks/useCompras';
import { SuppliersDialog } from './SuppliersDialog';
import { CompraEditorDialog } from './CompraEditorDialog';
import { CompraDetailView } from './CompraDetailView';

const STATUS_META: Record<string, { label: string; variant: 'info' | 'success' | 'destructive' }> = {
  aberta: { label: 'Aberta', variant: 'info' },
  concluida: { label: 'Concluída', variant: 'success' },
  cancelada: { label: 'Cancelada', variant: 'destructive' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function MaterialPurchasesTab() {
  const { compras, isLoading, setStatus, deleteCompra } = useCompras();

  const [search, setSearch] = useState('');
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CompraListRow | null>(null);
  const [selectedCompraId, setSelectedCompraId] = useState<string | null>(null);
  const [toCancel, setToCancel] = useState<CompraListRow | null>(null);
  const [toDelete, setToDelete] = useState<CompraListRow | null>(null);

  // Compra selecionada para a tela de detalhe (sub-view dentro da própria aba).
  // Resolvida da lista por id para refletir refetches (status, menor cotação etc.).
  const selectedCompra = useMemo(
    () => compras.find((c) => c.id === selectedCompraId) ?? null,
    [compras, selectedCompraId],
  );

  // Se a compra selecionada sumiu (ex.: excluída), volta para a lista.
  useEffect(() => {
    if (selectedCompraId && !isLoading && !selectedCompra) setSelectedCompraId(null);
  }, [selectedCompraId, isLoading, selectedCompra]);

  const filtered = useMemo(() => {
    if (!search.trim()) return compras;
    return compras.filter((c) =>
      fuzzyIncludes(c.title, search) ||
      fuzzyIncludes(STATUS_META[c.status]?.label ?? '', search) ||
      fuzzyIncludes(c.notes ?? '', search),
    );
  }, [compras, search]);

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (c: CompraListRow) => { setEditing(c); setEditorOpen(true); };

  // Sub-view de detalhe: ocupa o lugar da lista dentro da própria aba.
  if (selectedCompra) {
    return (
      <>
        <CompraDetailView
          compra={selectedCompra}
          onBack={() => setSelectedCompraId(null)}
          onEdit={openEdit}
        />
        <CompraEditorDialog open={editorOpen} onOpenChange={setEditorOpen} compra={editing} />
      </>
    );
  }

  const rowActions = (c: CompraListRow): RowAction[] => [
    { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => openEdit(c) },
    {
      label: 'Concluir compra',
      icon: CheckCheck,
      onClick: () => setStatus.mutate({ id: c.id, status: 'concluida' }),
      hidden: c.status !== 'aberta',
    },
    {
      label: 'Reabrir compra',
      icon: RotateCcw,
      onClick: () => setStatus.mutate({ id: c.id, status: 'aberta' }),
      hidden: c.status === 'aberta',
    },
    {
      label: 'Cancelar compra',
      icon: XCircle,
      onClick: () => setToCancel(c),
      hidden: c.status === 'cancelada',
    },
    { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setToDelete(c) },
  ];

  return (
    <div className="space-y-4">
      {/* Cabeçalho de ações */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar compra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setSuppliersOpen(true)}>
            <Users className="h-4 w-4" /> Fornecedores
          </Button>
          <Button className="gap-1.5" onClick={openNew}>
            <Plus className="h-4 w-4" /> Nova compra
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
              title={search ? 'Nenhuma compra encontrada' : 'Nenhuma compra ainda'}
              description={
                search
                  ? 'Tente outro termo de busca.'
                  : 'Crie uma compra, liste os materiais e compare cotações de fornecedores.'
              }
              action={search ? undefined : { label: 'Nova compra', onClick: openNew }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const meta = STATUS_META[c.status] ?? STATUS_META.aberta;
            return (
              <Card key={c.id} className="overflow-hidden">
                <CardContent className="flex items-center justify-between gap-3 p-3 sm:p-4">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setSelectedCompraId(c.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{c.title}</span>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(c.created_at)} • {c.cotacao_count} {c.cotacao_count === 1 ? 'cotação' : 'cotações'}
                    </p>
                    {c.lowest_total != null && (
                      <p className="mt-1 text-sm">
                        <span className="text-muted-foreground">Menor cotação: </span>
                        <span className="font-semibold text-success">R$ {formatBRL(c.lowest_total)}</span>
                      </p>
                    )}
                  </button>
                  <RowActionsMenu actions={rowActions(c)} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <SuppliersDialog open={suppliersOpen} onOpenChange={setSuppliersOpen} />
      <CompraEditorDialog open={editorOpen} onOpenChange={setEditorOpen} compra={editing} />

      {/* Cancelar compra */}
      <AlertDialog open={!!toCancel} onOpenChange={(o) => !o && setToCancel(null)}>
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
                if (toCancel) await setStatus.mutateAsync({ id: toCancel.id, status: 'cancelada' });
                setToCancel(null);
              }}
            >
              Cancelar compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir compra */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir compra?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `"${toDelete.title}" e suas cotações serão removidas. ` : ''}
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await deleteCompra.mutateAsync(toDelete.id);
                setToDelete(null);
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
