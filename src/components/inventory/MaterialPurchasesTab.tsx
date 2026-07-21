import { useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart, Plus, Search, Users, Pencil, Trash2, CheckCheck, XCircle, RotateCcw, AlertTriangle,
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
import { FilterButton } from '@/components/ui/FilterButton';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { useIsMobile } from '@/hooks/use-mobile';
import { fuzzyIncludes } from '@/lib/utils';
import { useCompras, type CompraListRow, type CompraStatus } from '@/hooks/useCompras';
import { useLowStock } from '@/hooks/useLowStock';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { SuppliersDialog } from './SuppliersDialog';
import { CompraEditorDialog } from './CompraEditorDialog';
import { CompraDetailView } from './CompraDetailView';

const STATUS_VARIANT: Record<string, 'info' | 'success' | 'destructive'> = {
  aberta: 'info',
  concluida: 'success',
  cancelada: 'destructive',
};

// Ordem fixa para o filtro de status.
const STATUS_FILTER_KEYS: CompraStatus[] = ['aberta', 'concluida', 'cancelada'];

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === 'pt-br' ? 'pt-BR' : locale, { timeZone: 'America/Sao_Paulo' });
}

export function MaterialPurchasesTab() {
  const isMobile = useIsMobile();
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.purchases;
  const formatCurrency = (v: number) =>
    new Intl.NumberFormat(locale === 'pt-br' ? 'pt-BR' : locale, { style: 'currency', currency: currency || 'BRL' }).format(v);
  const { compras, isLoading, setStatus, deleteCompra } = useCompras();
  const { lowStockRows } = useLowStock();

  const [search, setSearch] = useState('');
  // Filtro de status multi-seleção. Vazio = mostra todas (régua do projeto).
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
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

  // Mapeamento canônico (banco) → label traduzido.
  const statusLabelMap: Record<string, string> = {
    aberta: t.status.open,
    concluida: t.status.completed,
    cancelada: t.status.cancelled,
  };

  const statusFilterOptions = STATUS_FILTER_KEYS.map((k) => ({
    value: k,
    label: statusLabelMap[k] ?? k,
  }));

  const filtered = useMemo(() => {
    const term = search.trim();
    return compras.filter((c) => {
      // Status: vazio = todas; senão precisa estar na seleção.
      const matchesStatus =
        statusFilter.length === 0 || statusFilter.includes(c.status);
      if (!matchesStatus) return false;

      if (!term) return true;
      // Busca por código (#3 ou 3), título, status e observações.
      const codeStr = `#${c.numero}`;
      const matchesSearch =
        fuzzyIncludes(codeStr, term) ||
        fuzzyIncludes(String(c.numero), term) ||
        fuzzyIncludes(c.title, term) ||
        fuzzyIncludes(statusLabelMap[c.status] ?? '', term) ||
        fuzzyIncludes(c.notes ?? '', term);
      return matchesSearch;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compras, search, statusFilter, statusLabelMap.aberta]);

  // Conteúdo do filtro de status (compartilhado por FilterButton/FilterSheet).
  const statusFilterContent = (
    <FilterCheckboxGroup
      label={t.filters.status}
      options={statusFilterOptions}
      selected={statusFilter}
      onChange={setStatusFilter}
      emptyLabel={t.filters.statusEmpty}
    />
  );

  // Há algum filtro aplicado? (usado pro estado vazio amigável)
  const hasActiveFilter = search.trim().length > 0 || statusFilter.length > 0;

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
    { label: t.rowActions.edit, icon: Pencil, variant: 'edit', onClick: () => openEdit(c) },
    {
      label: t.rowActions.complete,
      icon: CheckCheck,
      onClick: () => setStatus.mutate({ id: c.id, status: 'concluida' }),
      hidden: c.status !== 'aberta',
    },
    {
      label: t.rowActions.reopen,
      icon: RotateCcw,
      onClick: () => setStatus.mutate({ id: c.id, status: 'aberta' }),
      hidden: c.status === 'aberta',
    },
    {
      label: t.rowActions.cancel,
      icon: XCircle,
      onClick: () => setToCancel(c),
      hidden: c.status === 'cancelada',
    },
    { label: t.rowActions.delete, icon: Trash2, variant: 'delete', onClick: () => setToDelete(c) },
  ];

  return (
    <div className="space-y-4">
      {/* Título da aba (só na lista; o detalhe usa o nome da requisição). Mesmo
          estilo dos títulos das outras abas do Estoque. */}
      <h2 className="text-lg sm:text-xl font-semibold text-foreground">
        {t.title}
      </h2>

      {/* Alerta de materiais abaixo do mínimo */}
      {lowStockRows.length > 0 && (
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-left transition-colors hover:bg-destructive/15"
          onClick={openNew}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="flex-1 text-sm text-destructive">
            {lowStockRows.length === 1
              ? t.lowStockAlert.singular.replace('{count}', String(lowStockRows.length))
              : t.lowStockAlert.plural.replace('{count}', String(lowStockRows.length))}
          </span>
          <span className="shrink-0 text-xs font-medium text-destructive underline-offset-2 hover:underline">
            {t.lowStockAlert.action}
          </span>
        </button>
      )}

      {/* Cabeçalho de ações */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Busca + filtro de status (mobile = FilterSheet; desktop = FilterButton). */}
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t.search.placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isMobile ? (
            <FilterSheet
              triggerLabel={MESSAGES[locale].app.inventory.filters.button}
              activeCount={statusFilter.length > 0 ? 1 : 0}
              onClear={() => setStatusFilter([])}
            >
              {statusFilterContent}
            </FilterSheet>
          ) : (
            <FilterButton
              activeCount={statusFilter.length > 0 ? 1 : 0}
              onClear={() => setStatusFilter([])}
            >
              {statusFilterContent}
            </FilterButton>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setSuppliersOpen(true)}>
            <Users className="h-4 w-4" /> {t.actions.suppliers}
          </Button>
          <Button className="gap-1.5" onClick={openNew}>
            <Plus className="h-4 w-4" /> {t.actions.newPurchase}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{t.loading}</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              size="compact"
              icon={<ShoppingCart className="h-10 w-10" />}
              title={hasActiveFilter ? t.empty.noneFoundTitle : t.empty.noneTitle}
              description={
                hasActiveFilter
                  ? t.empty.noneFoundDescription
                  : t.empty.noneDescription
              }
              action={hasActiveFilter ? undefined : { label: t.empty.newPurchase, onClick: openNew }}
            />
          </CardContent>
        </Card>
      ) : (
        // Apresentação responsiva fixa: 1 coluna no mobile (vira lista
        // empilhada) e grade a partir do desktop (2 em lg, 3 em xl).
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const variant = STATUS_VARIANT[c.status] ?? STATUS_VARIANT.aberta;
            const statusLabel = statusLabelMap[c.status] ?? c.status;
            return (
              <Card
                key={c.id}
                className="overflow-hidden transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <CardContent className="flex items-start justify-between gap-3 p-3 sm:p-4">
                  <button
                    type="button"
                    className="min-w-0 flex-1 space-y-1.5 text-left"
                    onClick={() => setSelectedCompraId(c.id)}
                  >
                    {/* Código + título da compra em destaque + status */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate text-base font-semibold leading-tight">
                        <span className="mr-1.5 font-mono text-sm font-medium text-muted-foreground">#{c.numero}</span>
                        {c.title}
                      </span>
                      <Badge variant={variant} className="text-[10px]">{statusLabel}</Badge>
                    </div>

                    {/* Linha secundária: data + nº de cotações + fornecedor aceito */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-xs text-muted-foreground">
                        {formatDate(c.created_at, locale)} • {c.cotacao_count === 1
                          ? t.card.quotes.replace('{count}', String(c.cotacao_count))
                          : t.card.quotesPlural.replace('{count}', String(c.cotacao_count))}
                      </p>
                      {c.accepted_supplier_name && (
                        <Badge variant="success" className="max-w-full truncate text-[10px]">
                          {t.card.accepted.replace('{name}', c.accepted_supplier_name)}
                        </Badge>
                      )}
                    </div>

                    {/* Menor cotação em destaque, quando houver */}
                    {c.lowest_total != null && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">{t.card.lowestQuote}</span>
                        <span className="font-semibold text-success">{formatCurrency(c.lowest_total)}</span>
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
            <AlertDialogTitle>{t.cancelDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.cancelDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancelDialog.back}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toCancel) await setStatus.mutateAsync({ id: toCancel.id, status: 'cancelada' });
                setToCancel(null);
              }}
            >
              {t.cancelDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir compra */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete
                ? t.deleteDialog.description.replace('{title}', toDelete.title)
                : t.deleteDialog.descriptionNoTitle}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteDialog.back}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await deleteCompra.mutateAsync(toDelete.id);
                setToDelete(null);
              }}
            >
              {t.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
